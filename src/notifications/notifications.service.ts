import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationSetting } from './entities/notification-setting.entity';
import { IncidentNotificationGroupMember } from './entities/incident-notification-group-member.entity';
import { User } from '../users/entities/user.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Subcontractor } from '../subcontractor/entities/subcontractor.entity';
import { Department } from '../department/entities/department.entity';
import { RequestEntity } from '../requests/entities/request.entity';
import { RedisCacheService } from '../redis/redid-cache.service';

import { EmailService } from './services/email.service';
import { SmsService } from './services/sms.service';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(NotificationSetting)
    private readonly settingRepo: Repository<NotificationSetting>,
    @InjectRepository(IncidentNotificationGroupMember)
    private readonly incidentGroupRepo: Repository<IncidentNotificationGroupMember>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(Subcontractor)
    private readonly subcontractorRepo: Repository<Subcontractor>,
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    @InjectRepository(RequestEntity)
    private readonly requestRepo: Repository<RequestEntity>,
    private readonly redisCacheService: RedisCacheService,
    private readonly emailService: EmailService,
    private readonly smsService: SmsService,
  ) {}

  /**
   * Auto-create incident_notification_group_members table if not exists upon startup.
   */
  async onModuleInit() {
    try {
      await this.notificationRepo.query(`
        CREATE TABLE IF NOT EXISTS \`incident_notification_group_members\` (
          \`id\` INT AUTO_INCREMENT PRIMARY KEY,
          \`userId\` INT NULL,
          \`employeeId\` INT NULL,
          \`name\` VARCHAR(150) NULL,
          \`email\` VARCHAR(150) NULL,
          \`phoneNumber\` VARCHAR(50) NULL,
          \`userType\` VARCHAR(100) NULL,
          \`departmentName\` VARCHAR(150) NULL,
          \`isEmailEnabled\` TINYINT(1) NOT NULL DEFAULT 1,
          \`isSmsEnabled\` TINYINT(1) NOT NULL DEFAULT 1,
          \`isInAppEnabled\` TINYINT(1) NOT NULL DEFAULT 1,
          \`addedByUserId\` INT NULL,
          \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX \`IDX_incident_group_userId\` (\`userId\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
      console.log('[Notification] Checked/Created table: incident_notification_group_members');
    } catch (err) {
      console.error('[Notification] Error creating incident_notification_group_members table:', err);
    }
  }

  /**
   * Centralized method to trigger notifications for permit request status changes.
   */
  async triggerNotification(
    permitId: number,
    previousStatus: string | null | undefined,
    newStatus: string | undefined,
    actorUserId: number,
  ): Promise<void> {
    try {
      // 1. Fetch permit request
      const request = await this.requestRepo.findOne({ where: { id: permitId } });
      if (!request) {
        console.error(`[Notification] Permit request not found for ID: ${permitId}`);
        return;
      }

      // Normalize statuses
      const normPrev = previousStatus ? previousStatus.toLowerCase().trim() : null;
      let normNew = newStatus ? newStatus.toLowerCase().trim() : 'pending';
      if (normNew === 'auto cancelled') {
        normNew = 'auto-cancelled';
      }

      // If status hasn't changed, skip
      if (normPrev === normNew) {
        return;
      }

      // 2. Fetch actor display name
      const actorName = await this.getUserDisplayName(actorUserId);

      // Determine recipients and construct message
      let message = '';
      let title = 'Permit Status Update';
      let recipientRole: 'department' | 'all_company' = 'all_company';

      const subcontractorId = request.subContractorId;

      // Fetch Subcontractor and resolve department
      let departId: number | null = null;
      if (subcontractorId) {
        const sub = await this.subcontractorRepo.findOne({ where: { id: subcontractorId } });
        if (sub) {
          departId = sub.departId ?? null;
        }
      }

      // SCENARIO 1: Raised in Hold status or changed from Draft -> Hold
      const isCreatedAsHold = !previousStatus && normNew === 'hold';
      const isDraftToHold = normPrev === 'draft' && normNew === 'hold';
      
      if (isCreatedAsHold || isDraftToHold) {
        title = 'New Permit Request Raised';
        message = `A new work permit request has been raised by ${actorName}.`;
        recipientRole = 'department'; // Notify only responsible Department Users (and Admins as system level)
      } 
      // SCENARIO 2 & 3: Approved status or other general transitions
      else if (normNew === 'approved') {
        title = 'Permit Request Approved';
        message = `Work permit request approved by ${actorName}.`;
        recipientRole = 'all_company'; // Notify Company Admins, Contractors, and Department Users
      } else if (normNew === 'pre-approved') {
        title = 'Permit Request Pre-Approved';
        message = `Work permit request pre-approved by ${actorName}.`;
        recipientRole = 'all_company';
      } else if (normNew === 'opened') {
        title = 'Permit Request Opened';
        message = `Work permit request opened by ${actorName}.`;
        recipientRole = 'all_company';
      } else if (normNew === 'closed') {
        title = 'Permit Request Closed';
        message = `Work permit request closed by ${actorName}.`;
        recipientRole = 'all_company';
      } else if (normNew === 'cancelled') {
        title = 'Permit Request Cancelled';
        message = `Work permit request cancelled by ${actorName}.`;
        recipientRole = 'all_company';
      } else if (normNew === 'auto-cancelled') {
        title = 'Permit Automatically Cancelled';
        message = `Work permit request was automatically cancelled by the system because it was not opened in time.`;
        recipientRole = 'all_company';
      } else if (normNew === 'rejected') {
        title = 'Permit Request Rejected';
        message = `Work permit request rejected by ${actorName}.`;
        recipientRole = 'all_company';
      } else {
        title = 'Permit Status Changed';
        message = `Work permit request status changed to ${newStatus} by ${actorName}.`;
        recipientRole = 'all_company';
      }

      // Resolve candidate recipient users
      const recipients: User[] = [];

      // 1. Always notify Admins (system wide supervision)
      const admins = await this.userRepo.createQueryBuilder('user')
        .where('user.userType LIKE :admin OR user.userType LIKE :super', {
          admin: '%Admin%',
          super: '%SuperAdmin%',
        })
        .getMany();
      recipients.push(...admins);

      // 2. Fetch Department Users for this department
      if (departId) {
        const deptUsers = await this.userRepo.createQueryBuilder('user')
          .leftJoin('employees', 'emp', 'user.empId = emp.id')
          .where('(user.userType = :dept OR user.userType = :dept1 OR user.userType LIKE :deptLike)', {
            dept: 'Department',
            dept1: 'Department1',
            deptLike: '%Department%',
          })
          .andWhere('(user.typeId = :departId OR emp.departId = :departId)', { departId })
          .getMany();
        recipients.push(...deptUsers);
      }

      // 3. Fetch Company Contractors (if recipientRole is 'all_company')
      if (recipientRole === 'all_company' && subcontractorId) {
        const contractors = await this.userRepo.createQueryBuilder('user')
          .leftJoin('employees', 'emp', 'user.empId = emp.id')
          .where('user.userType = :subcon', { subcon: 'Subcontractor' })
          .andWhere('(user.typeId = :subconId OR emp.subContId = :subconId)', { subconId: subcontractorId })
          .getMany();
        recipients.push(...contractors);
      }

      // De-duplicate recipients by User ID
      const uniqueRecipients = Array.from(new Map(recipients.map(u => [u.id, u])).values());

      // Iterate through recipients, check user preferences, and save notifications
      for (const rx of uniqueRecipients) {
        // Skip sender to avoid self-notification
        if (rx.id === actorUserId) {
          continue;
        }

        // Verify if user enabled notification for this status
        const isEnabled = await this.isNotificationEnabled(rx.id, newStatus || 'Pending');
        if (isEnabled) {
          await this.notificationRepo.save(
            this.notificationRepo.create({
              receiverUserId: rx.id,
              senderUserId: actorUserId,
              permitRequestId: permitId,
              companyId: subcontractorId || undefined,
              notificationType: 'status_change',
              permitStatus: newStatus,
              title,
              message,
              isRead: 0,
              metadata: JSON.stringify({
                permitNo: request.permitNo,
                previousStatus,
                newStatus,
              }),
            }),
          );
        }
      }
    } catch (error) {
      console.error('[Notification] Error in triggerNotification:', error);
    }
  }

  /**
   * Checks if notification for a specific status is enabled for a user, using Redis cache.
   */
  async isNotificationEnabled(userId: number, status: string): Promise<boolean> {
    try {
      const cacheKey = `notifications:settings:${userId}`;
      const settingsMap = await this.redisCacheService.getOrSet(
        cacheKey,
        async () => {
          const rows = await this.settingRepo.find({ where: { userId } });
          const map: Record<string, boolean> = {};
          for (const row of rows) {
            map[row.permitStatus.toLowerCase().trim()] = row.enabled === 1;
          }
          return map;
        },
        1000 * 60 * 60, // 1 hour TTL
      );

      const normStatus = status.toLowerCase().trim();
      // If setting exists, return its value; default to true (ON) otherwise
      return settingsMap[normStatus] !== false;
    } catch (error) {
      console.error(`[Notification] Error checking preferences for user ${userId}:`, error);
      return true; // Fallback to true on error
    }
  }

  /**
   * Centralized method to trigger in-app notifications for Safety Observations across all lifecycle events.
   */
  async triggerObservationNotification(
    observation: {
      id: number;
      observationNumber: string;
      subject: string;
      safetyCategory?: string;
      riskLevel?: string;
      assignedContractorId?: number | null;
      assignedContractorName?: string | null;
      buildingName?: string | null;
      createdByUserId?: number | null;
      createdByUserName?: string | null;
    },
    actionType: 'CREATED' | 'REASSIGNED' | 'CONTRACTOR_ACCEPTED' | 'CONTRACTOR_REJECTED' | 'RESOLVED' | 'CLOSED' | 'ESCALATED',
    actorUserId?: number,
    actorName?: string,
    actorRole?: string,
    extraRemarks?: string,
    extraData?: {
      escalatedIncidentId?: number;
      incidentCaseNumber?: string;
    },
  ): Promise<void> {
    try {
      const contractorId = observation.assignedContractorId;
      const contractorName = (observation.assignedContractorName || '').trim();

      const actorDisplayName = actorName || (actorUserId ? await this.getUserDisplayName(actorUserId) : 'User');
      const recipients: User[] = [];

      let title = 'Safety Observation Update';
      let message = '';
      let notifType = `OBSERVATION_${actionType}`;

      // SCENARIO 1: Observation Created, Reassigned, Closed, or Escalated -> Notify Contractor Users
      if (actionType === 'CREATED' || actionType === 'REASSIGNED' || actionType === 'CLOSED' || actionType === 'ESCALATED') {
        let resolvedSubId: number | null = contractorId ?? null;
        let matchedContractorName = contractorName;

        if (contractorId) {
          const sub = await this.subcontractorRepo.findOne({ where: { id: contractorId } });
          if (sub) {
            matchedContractorName = sub.subContractorName || contractorName;
          } else {
            const userRec = await this.userRepo.findOne({ where: { id: contractorId } });
            if (userRec) {
              if (userRec.typeId) resolvedSubId = userRec.typeId;
              matchedContractorName = userRec.username || contractorName;
            }
          }
        } else if (contractorName) {
          const sub = await this.subcontractorRepo.createQueryBuilder('sub')
            .where('sub.subContractorName LIKE :name', { name: `%${contractorName}%` })
            .getOne();
          if (sub) {
            resolvedSubId = sub.id;
            matchedContractorName = sub.subContractorName || contractorName;
          }
        }

        const contractorUsersQuery = this.userRepo.createQueryBuilder('user')
          .leftJoin('employees', 'emp', 'user.empId = emp.id')
          .where('(user.userType = :subcon OR user.userType LIKE :subconLike)', {
            subcon: 'Subcontractor',
            subconLike: '%Subcontractor%',
          });

        const conditions: string[] = [];
        const params: Record<string, any> = {};

        if (resolvedSubId) {
          conditions.push('user.typeId = :subId', 'emp.subContId = :subId', 'user.id = :subId');
          params.subId = resolvedSubId;
        }
        if (contractorId && contractorId !== resolvedSubId) {
          conditions.push('user.typeId = :contractorId', 'user.id = :contractorId');
          params.contractorId = contractorId;
        }
        if (matchedContractorName) {
          conditions.push('user.username LIKE :cName');
          params.cName = `%${matchedContractorName}%`;
        }

        if (conditions.length > 0) {
          contractorUsersQuery.andWhere(`(${conditions.join(' OR ')})`, params);
        }

        const foundContractors = await contractorUsersQuery.getMany();
        recipients.push(...foundContractors);

        if (recipients.length === 0 && contractorId) {
          const directUser = await this.userRepo.findOne({ where: { id: contractorId } });
          if (directUser) recipients.push(directUser);
        }

        if (actionType === 'CREATED') {
          title = 'New Safety Observation Assigned';
          message = `Safety Observation ${observation.observationNumber} (${observation.subject || observation.safetyCategory || 'New Finding'}) has been assigned to ${matchedContractorName || 'your company'} by ${actorDisplayName}.`;
        } else if (actionType === 'REASSIGNED') {
          title = 'Safety Observation Reassigned';
          message = `Safety Observation ${observation.observationNumber} (${observation.subject || observation.safetyCategory || 'Finding'}) has been reassigned to ${matchedContractorName || 'your company'} by ${actorDisplayName}.`;
        } else if (actionType === 'CLOSED') {
          title = 'Safety Observation Closed';
          const notes = extraRemarks ? ` Remarks: "${extraRemarks}"` : '';
          message = `Safety Observation ${observation.observationNumber} (${observation.subject || observation.safetyCategory || 'Finding'}) has been verified and closed by ${actorDisplayName}.${notes}`;

          // Also notify creator if not the actor
          if (observation.createdByUserId) {
            const creator = await this.userRepo.findOne({ where: { id: observation.createdByUserId } });
            if (creator) recipients.push(creator);
          }
        } else if (actionType === 'ESCALATED') {
          title = 'Safety Observation Escalated to Incident';
          const incCase = extraData?.incidentCaseNumber ? ` to Incident ${extraData.incidentCaseNumber}` : ' to an official Incident';
          const reasonText = extraRemarks ? ` Reason: "${extraRemarks}"` : '';
          message = `Safety Observation ${observation.observationNumber} (${observation.subject || observation.safetyCategory || 'Finding'}) assigned to ${matchedContractorName || 'your company'} has been escalated${incCase} by ${actorDisplayName}.${reasonText}`;
        }
      } 
      // SCENARIO 2: Contractor Accepts, Rejects, or Submits Resolution -> Notify Department & Admin Users
      else {
        // 1. Fetch Department Users
        const deptUsers = await this.userRepo.createQueryBuilder('user')
          .where('(user.userType = :dept OR user.userType = :dept1 OR user.userType LIKE :deptLike)', {
            dept: 'Department',
            dept1: 'Department1',
            deptLike: '%Department%',
          })
          .getMany();
        recipients.push(...deptUsers);

        // 2. Fetch Admins
        const admins = await this.userRepo.createQueryBuilder('user')
          .where('user.userType LIKE :admin OR user.userType LIKE :super', {
            admin: '%Admin%',
            super: '%SuperAdmin%',
          })
          .getMany();
        recipients.push(...admins);

        // 3. Creator user if not already in list
        if (observation.createdByUserId) {
          const creator = await this.userRepo.findOne({ where: { id: observation.createdByUserId } });
          if (creator) recipients.push(creator);
        }

        if (actionType === 'CONTRACTOR_ACCEPTED') {
          title = 'Observation Accepted by Contractor';
          message = `Safety Observation ${observation.observationNumber} (${observation.subject}) has been accepted by contractor ${actorDisplayName || contractorName}.`;
        } else if (actionType === 'CONTRACTOR_REJECTED') {
          title = 'Observation Rejected by Contractor';
          const reason = extraRemarks ? ` Reason: "${extraRemarks}"` : '';
          message = `Safety Observation ${observation.observationNumber} (${observation.subject}) was rejected by contractor ${actorDisplayName || contractorName}.${reason} Please review and reassign.`;
        } else if (actionType === 'RESOLVED') {
          title = 'Observation Resolution Submitted';
          message = `Contractor ${actorDisplayName || contractorName} submitted resolution for Safety Observation ${observation.observationNumber} (${observation.subject}). Awaiting review and closeout.`;
        }
      }

      // Deduplicate recipients
      const uniqueRecipients = Array.from(new Map(recipients.map(u => [u.id, u])).values());

      // Fetch live contacts (email & phone) for recipients
      const contactsMap = await this.resolveLiveUserContacts(uniqueRecipients.map(u => u.id));

      for (const rx of uniqueRecipients) {
        if (actorUserId && rx.id === actorUserId) {
          continue;
        }

        const contact = contactsMap.get(rx.id);

        // 1. In-App Notification
        await this.notificationRepo.save(
          this.notificationRepo.create({
            receiverUserId: rx.id,
            senderUserId: actorUserId || undefined,
            companyId: contractorId || undefined,
            notificationType: notifType,
            permitStatus: actionType,
            title,
            message,
            isRead: 0,
            metadata: JSON.stringify({
              module: 'OBSERVATIONS',
              observationId: observation.id,
              observationNumber: observation.observationNumber,
              subject: observation.subject,
              safetyCategory: observation.safetyCategory,
              riskLevel: observation.riskLevel,
              contractorName: contractorName,
              actionType,
              remarks: extraRemarks,
              escalatedIncidentId: extraData?.escalatedIncidentId,
              incidentCaseNumber: extraData?.incidentCaseNumber,
            }),
          }),
        );

        // 2. Dispatch Email & SMS when observation is ESCALATED
        // NOTE: Temporarily disabled for observation escalations (in-app notifications only). Code preserved for future re-enablement.
        /*
        if (actionType === 'ESCALATED') {
          // SMS Dispatch
          if (contact?.phone) {
            await this.smsService.sendSms(contact.phone, message).catch((smsErr) => {
              console.error(`[Notification] SMS error to ${contact.phone} for escalated observation ${observation.observationNumber}:`, smsErr);
            });
          }

          // Email Dispatch
          if (contact?.email) {
            const incCaseStr = extraData?.incidentCaseNumber || 'Incident';
            const emailSubject = `Safety Alert: Observation ${observation.observationNumber} Escalated to ${incCaseStr}`;
            const emailHtml = `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                <div style="background-color: #E32B50; color: #ffffff; padding: 14px 18px; border-radius: 6px 6px 0 0; font-weight: bold; font-size: 16px;">
                  ⚠️ Safety Observation Escalated to Incident
                </div>
                <div style="padding: 18px 0;">
                  <p style="font-size: 15px; line-height: 1.6; color: #334155; margin-top: 0;">
                    ${message}
                  </p>
                  <div style="margin-top: 16px; padding: 14px 18px; background-color: #fff1f2; border-left: 4px solid #E32B50; border-radius: 4px; font-size: 14px; color: #1e293b;">
                    <div style="margin-bottom: 8px;"><strong>Observation Ref:</strong> ${observation.observationNumber}</div>
                    <div style="margin-bottom: 8px;"><strong>Subject:</strong> ${observation.subject || 'N/A'}</div>
                    <div style="margin-bottom: 8px;"><strong>Category:</strong> ${observation.safetyCategory || 'N/A'}</div>
                    <div style="margin-bottom: 8px;"><strong>Risk Level:</strong> <span style="color: #E32B50; font-weight: bold;">${observation.riskLevel || 'HIGH'}</span></div>
                    <div style="margin-bottom: 8px;"><strong>Assigned Contractor:</strong> ${contractorName || 'N/A'}</div>
                    <div style="margin-bottom: 8px;"><strong>Escalated Incident:</strong> <strong>${extraData?.incidentCaseNumber || 'Generated Incident'}</strong></div>
                    <div style="margin-bottom: 8px;"><strong>Escalated By:</strong> ${actorDisplayName}</div>
                    ${extraRemarks ? `<div style="margin-bottom: 4px;"><strong>Escalation Remarks:</strong> ${extraRemarks}</div>` : ''}
                  </div>
                </div>
                <div style="font-size: 12px; color: #64748b; margin-top: 16px; border-top: 1px solid #e2e8f0; padding-top: 12px;">
                  This is an automated high-priority safety notification from the BEAM System.
                </div>
              </div>
            `;

            await this.emailService.sendEmail({
              to: contact.email,
              subject: emailSubject,
              text: message,
              html: emailHtml,
            }).catch((emailErr) => {
              console.error(`[Notification] Email error to ${contact.email} for escalated observation ${observation.observationNumber}:`, emailErr);
            });
          }
        }
        */
      }
    } catch (error) {
      console.error('[Notification] Error in triggerObservationNotification:', error);
    }
  }

  /**
   * Helper to resolve original live contact details from users & employees tables for given userIds.
   */
  async resolveLiveUserContacts(userIds: number[]): Promise<Map<number, { email?: string; phone?: string; name?: string; username?: string; userType?: string; departmentName?: string }>> {
    const contactMap = new Map<number, { email?: string; phone?: string; name?: string; username?: string; userType?: string; departmentName?: string }>();
    const validIds = (userIds || []).filter(id => id !== null && id !== undefined && !isNaN(Number(id))).map(id => Number(id));
    if (validIds.length === 0) return contactMap;

    try {
      const rawUsers = await this.userRepo.createQueryBuilder('user')
        .leftJoin('employees', 'emp', '(user.empId = emp.id OR (user.typeId = emp.id AND user.userType IN (:...empTypes)))', {
          empTypes: ['Employee', 'Site Manager', 'Admin', 'Safety Officer', 'Supervisor', 'Department', 'Department1', 'Subcontractor'],
        })
        .leftJoin('departments', 'dept', '(emp.departId = dept.id OR (user.userType IN (:...deptTypes) AND user.typeId = dept.id))', {
          deptTypes: ['Department', 'Department1'],
        })
        .leftJoin('subcontractors', 'sub', '(emp.subContId = sub.id OR (user.userType = :subType AND user.typeId = sub.id))', {
          subType: 'Subcontractor',
        })
        .select([
          'user.id AS id',
          'user.username AS username',
          'user.userType AS userType',
          'emp.email AS empEmail',
          'emp.phonenumber AS empPhone',
          'emp.employeeName AS employeeName',
          'dept.departmentName AS deptName',
          'sub.subContractorName AS subName',
        ])
        .where('user.id IN (:...validIds)', { validIds })
        .getRawMany();

      for (const u of rawUsers) {
        if (u && (u.id !== null && u.id !== undefined)) {
          const uId = Number(u.id);
          const email = u.empEmail || (u.username && u.username.includes('@') ? u.username : undefined);
          const phone = u.empPhone || undefined;
          const name = u.employeeName || u.deptName || u.subName || u.username;
          contactMap.set(uId, {
            email,
            phone,
            name,
            username: u.username,
            userType: u.userType,
            departmentName: u.deptName || u.subName || '',
          });
        }
      }
    } catch (err) {
      console.error('[Notification] Error resolving live user contacts from users table:', err);
    }
    return contactMap;
  }

  /**
   * Get all configured members from incident_notification_group_members table.
   * Dynamically hydrates live email, phone, and name from the users & employees table for all linked user accounts.
   */
  async getIncidentNotificationGroupMembers(): Promise<IncidentNotificationGroupMember[]> {
    try {
      const members = await this.incidentGroupRepo.find({
        order: { createdAt: 'DESC' },
      });

      // Extract userIds to fetch live contact details from users and employees tables
      const userIds = members
        .filter(m => m.userId !== null && m.userId !== undefined)
        .map(m => Number(m.userId));

      if (userIds.length > 0) {
        const liveContacts = await this.resolveLiveUserContacts(userIds);
        for (const m of members) {
          if (m.userId !== null && m.userId !== undefined) {
            const live = liveContacts.get(Number(m.userId));
            if (live) {
              if (live.email) m.email = live.email;
              if (live.phone) m.phoneNumber = live.phone;
              if (live.name) m.name = live.name;
              if (live.departmentName) m.departmentName = live.departmentName;
              if (live.userType) m.userType = live.userType;
            }
          }
        }
      }

      return members;
    } catch (err) {
      console.error('[Notification] Error fetching Incident Notification Group members:', err);
      return [];
    }
  }

  /**
   * Get all active system users (candidates) directly from the users table.
   * Includes employee, department, and subcontractor details, along with isAdded status.
   */
  async getAvailableUsersForIncidentGroup(): Promise<any[]> {
    try {
      const users = await this.userRepo.createQueryBuilder('user')
        .leftJoin('employees', 'emp', '(user.empId = emp.id OR (user.typeId = emp.id AND user.userType IN (:...empTypes)))', {
          empTypes: ['Employee', 'Site Manager', 'Admin', 'Safety Officer', 'Supervisor'],
        })
        .leftJoin('departments', 'dept', '(emp.departId = dept.id OR (user.userType IN (:...deptTypes) AND user.typeId = dept.id))', {
          deptTypes: ['Department', 'Department1'],
        })
        .leftJoin('subcontractors', 'sub', '(emp.subContId = sub.id OR (user.userType = :subType AND user.typeId = sub.id))', {
          subType: 'Subcontractor',
        })
        .select([
          'user.id AS userId',
          'user.username AS username',
          'user.userType AS userType',
          'user.typeId AS typeId',
          'user.empId AS empId',
          'emp.id AS employeeId',
          'emp.employeeName AS employeeName',
          'emp.email AS empEmail',
          'emp.phonenumber AS empPhone',
          'dept.departmentName AS deptName',
          'sub.subContractorName AS subName',
        ])
        .orderBy('user.id', 'ASC')
        .getRawMany();

      const existingMembers = await this.incidentGroupRepo.find();
      const existingUserIds = new Set(existingMembers.filter(m => m.userId !== null && m.userId !== undefined).map(m => Number(m.userId)));

      return users.map(u => {
        const uEmail = u.empEmail || (u.username && u.username.includes('@') ? u.username : '');
        const displayName = u.employeeName || u.deptName || u.subName || u.username;
        const deptOrCompany = u.deptName || u.subName || '';
        const isAdded = u.userId !== null && u.userId !== undefined ? existingUserIds.has(Number(u.userId)) : false;

        return {
          userId: Number(u.userId),
          employeeId: u.employeeId ? Number(u.employeeId) : null,
          username: u.username,
          name: displayName,
          email: uEmail,
          phoneNumber: u.empPhone || '',
          userType: u.userType || 'User',
          departmentName: deptOrCompany,
          isAdded: Boolean(isAdded),
        };
      });
    } catch (err) {
      console.error('[Notification] Error fetching available users from users table:', err);
      return [];
    }
  }

  /**
   * Add members to the incident_notification_group_members table.
   * Auto-resolves original contact details from users & employees tables when userId is provided.
   */
  async addIncidentNotificationGroupMembers(
    members: Array<{
      userId?: number;
      employeeId?: number;
      name?: string;
      email?: string;
      phoneNumber?: string;
      userType?: string;
      departmentName?: string;
      isEmailEnabled?: boolean;
      isSmsEnabled?: boolean;
      isInAppEnabled?: boolean;
    }>,
    actorUserId?: number,
  ): Promise<IncidentNotificationGroupMember[]> {
    const saved: IncidentNotificationGroupMember[] = [];
    const userIds = members.filter(m => m.userId !== null && m.userId !== undefined).map(m => Number(m.userId));
    const liveContacts = userIds.length > 0 ? await this.resolveLiveUserContacts(userIds) : new Map();

    for (const m of members) {
      const uIdNum = m.userId !== null && m.userId !== undefined ? Number(m.userId) : undefined;
      const live = uIdNum !== undefined ? liveContacts.get(uIdNum) : null;

      const finalEmail = live?.email || m.email || '';
      const finalPhone = live?.phone || m.phoneNumber || '';
      const finalName = live?.name || m.name || m.email || 'User';
      const finalDept = live?.departmentName || m.departmentName || '';
      const finalUserType = live?.userType || m.userType || 'Department';

      // Check if already exists by userId (or by email only if no userId)
      let existing: IncidentNotificationGroupMember | null = null;
      if (uIdNum !== undefined) {
        existing = await this.incidentGroupRepo.findOne({ where: { userId: uIdNum } });
      } else if (m.email) {
        existing = await this.incidentGroupRepo.findOne({ where: { email: m.email.trim() } });
      }

      if (existing) {
        // Update flags and live info
        existing.name = finalName;
        existing.email = finalEmail;
        existing.phoneNumber = finalPhone;
        existing.userType = finalUserType;
        existing.departmentName = finalDept;
        if (typeof m.isEmailEnabled === 'boolean') existing.isEmailEnabled = m.isEmailEnabled;
        if (typeof m.isSmsEnabled === 'boolean') existing.isSmsEnabled = m.isSmsEnabled;
        if (typeof m.isInAppEnabled === 'boolean') existing.isInAppEnabled = m.isInAppEnabled;
        saved.push(await this.incidentGroupRepo.save(existing));
      } else {
        const entity = this.incidentGroupRepo.create({
          userId: uIdNum,
          employeeId: m.employeeId || undefined,
          name: finalName,
          email: finalEmail,
          phoneNumber: finalPhone,
          userType: finalUserType,
          departmentName: finalDept,
          isEmailEnabled: m.isEmailEnabled !== false,
          isSmsEnabled: m.isSmsEnabled !== false,
          isInAppEnabled: m.isInAppEnabled !== false,
          addedByUserId: actorUserId || undefined,
        });
        saved.push(await this.incidentGroupRepo.save(entity));
      }
    }
    return saved;
  }

  /**
   * Update notification channel preferences for a group member.
   */
  async updateIncidentNotificationGroupMember(
    id: number,
    data: {
      name?: string;
      email?: string;
      phoneNumber?: string;
      isEmailEnabled?: boolean;
      isSmsEnabled?: boolean;
      isInAppEnabled?: boolean;
    },
  ): Promise<IncidentNotificationGroupMember | null> {
    const member = await this.incidentGroupRepo.findOne({ where: { id } });
    if (!member) return null;

    if (data.name !== undefined) member.name = data.name;
    if (data.email !== undefined) member.email = data.email;
    if (data.phoneNumber !== undefined) member.phoneNumber = data.phoneNumber;
    if (typeof data.isEmailEnabled === 'boolean') member.isEmailEnabled = data.isEmailEnabled;
    if (typeof data.isSmsEnabled === 'boolean') member.isSmsEnabled = data.isSmsEnabled;
    if (typeof data.isInAppEnabled === 'boolean') member.isInAppEnabled = data.isInAppEnabled;

    return this.incidentGroupRepo.save(member);
  }

  /**
   * Remove a member from the group.
   */
  async removeIncidentNotificationGroupMember(id: number): Promise<boolean> {
    const res = await this.incidentGroupRepo.delete(id);
    return (res.affected || 0) > 0;
  }

  /**
   * Seed default Department & Department1 users from users table into the Incident Notification Group.
   */
  async seedDefaultDepartmentUsers(actorUserId?: number): Promise<IncidentNotificationGroupMember[]> {
    try {
      const deptUsers = await this.userRepo.createQueryBuilder('user')
        .leftJoin('employees', 'emp', '(user.empId = emp.id OR (user.typeId = emp.id AND user.userType IN (:...empTypes)))', {
          empTypes: ['Employee', 'Site Manager', 'Admin'],
        })
        .leftJoin('departments', 'dept', '(emp.departId = dept.id OR (user.userType IN (:...deptTypes) AND user.typeId = dept.id))', {
          deptTypes: ['Department', 'Department1'],
        })
        .select([
          'user.id AS userId',
          'user.username AS username',
          'user.userType AS userType',
          'emp.id AS employeeId',
          'emp.employeeName AS employeeName',
          'emp.email AS empEmail',
          'emp.phonenumber AS empPhone',
          'dept.departmentName AS deptName',
        ])
        .where('(user.userType = :dept OR user.userType = :dept1 OR user.userType LIKE :deptLike)', {
          dept: 'Department',
          dept1: 'Department1',
          deptLike: '%Department%',
        })
        .getRawMany();

      const memberDtos = deptUsers.map(u => ({
        userId: Number(u.userId),
        employeeId: u.employeeId ? Number(u.employeeId) : undefined,
        name: u.employeeName || u.deptName || u.username,
        email: u.empEmail || (u.username && u.username.includes('@') ? u.username : ''),
        phoneNumber: u.empPhone || '',
        userType: u.userType || 'Department',
        departmentName: u.deptName || '',
        isEmailEnabled: true,
        isSmsEnabled: true,
        isInAppEnabled: true,
      }));

      return this.addIncidentNotificationGroupMembers(memberDtos, actorUserId);
    } catch (err) {
      console.error('[Notification] Error seeding default department users from users table:', err);
      return [];
    }
  }

  /**
   * Get all active users belonging to the Incident Notification Group.
   * Always hydrates live email and phone directly from the users & employees table.
   */
  async getIncidentNotificationGroupUsers(): Promise<{
    id: number;
    userId?: number;
    username: string;
    email?: string;
    phone?: string;
    userType: string;
    isEmailEnabled: boolean;
    isSmsEnabled: boolean;
    isInAppEnabled: boolean;
  }[]> {
    try {
      let members = await this.incidentGroupRepo.find();
      if (members.length === 0) {
        console.log('[Notification] Incident Notification Group is empty. Auto-seeding default Department/Department1 users.');
        members = await this.seedDefaultDepartmentUsers();
      }

      const userIds = members
        .filter(m => m.userId !== null && m.userId !== undefined)
        .map(m => Number(m.userId));

      const liveContacts = userIds.length > 0 ? await this.resolveLiveUserContacts(userIds) : new Map();

      return members.map(m => {
        const uId = m.userId !== null && m.userId !== undefined ? Number(m.userId) : undefined;
        const live = uId !== undefined ? liveContacts.get(uId) : null;

        const email = live?.email || m.email || undefined;
        const phone = live?.phone || m.phoneNumber || undefined;
        const username = live?.name || m.name || m.email || 'User';

        return {
          id: uId !== undefined ? uId : m.id,
          userId: uId,
          username,
          email,
          phone,
          userType: live?.userType || m.userType || 'Department',
          isEmailEnabled: m.isEmailEnabled !== false,
          isSmsEnabled: m.isSmsEnabled !== false,
          isInAppEnabled: m.isInAppEnabled !== false,
        };
      });
    } catch (err) {
      console.error('[Notification] Error fetching Incident Notification Group users:', err);
      return [];
    }
  }

  /**
   * Helper to match submitter identifier (user ID, employeeName, username, email) to a User account with live contacts.
   */
  async findUsersBySubmitterIdentifier(identifier: string): Promise<Array<{ id: number; username?: string; email?: string; phone?: string; name?: string }>> {
    const trimmed = (identifier || '').trim();
    if (!trimmed) return [];

    const uIdNum = Number(trimmed);
    const isNum = !isNaN(uIdNum) && trimmed !== '';

    try {
      const qb = this.userRepo.createQueryBuilder('user')
        .leftJoin('employees', 'emp', '(user.empId = emp.id OR (user.typeId = emp.id AND user.userType IN (:...empTypes)))', {
          empTypes: ['Employee', 'Site Manager', 'Admin', 'Safety Officer', 'Supervisor', 'Department', 'Department1', 'Subcontractor'],
        })
        .select([
          'user.id AS id',
          'user.username AS username',
          'emp.email AS email',
          'emp.phonenumber AS phone',
          'emp.employeeName AS employeeName',
        ]);

      if (isNum) {
        qb.where('user.id = :id OR emp.id = :id', { id: uIdNum });
      } else {
        qb.where('user.username = :sub OR emp.employeeName = :sub OR emp.email = :sub OR emp.username = :sub', { sub: trimmed });
      }

      const matched = await qb.getRawMany();
      return matched.filter(m => m && m.id !== null && m.id !== undefined).map(m => ({
        id: Number(m.id),
        username: m.username,
        email: m.email || (m.username && m.username.includes('@') ? m.username : undefined),
        phone: m.phone,
        name: m.employeeName || m.username,
      }));
    } catch (err) {
      console.error('[Notification] Error finding user by submitter identifier:', err);
      return [];
    }
  }

  /**
   * Resolve ONLY the specific contractor user(s) who actually submitted the incident / step.
   * Checks stage submitters (Heads-Up, Initial Report, Investigation) and direct incident creator.
   */
  async getContractorUsersForIncident(incident: any, stepName?: string): Promise<Array<{ id: number; username?: string; email?: string; phone?: string; name?: string }>> {
    const userMap = new Map<number, { id: number; username?: string; email?: string; phone?: string; name?: string }>();
    try {
      const incidentId = incident.id;
      const submitterIdentifiers: string[] = [];

      // 1. Direct creator ID / username on incident
      const creatorId = incident.createdByUserId || incident.createdById || incident.userId;
      if (creatorId) {
        submitterIdentifiers.push(String(creatorId));
      }

      // 2. Query stage-specific submitters from incident tables
      if (incidentId) {
        try {
          const headsupRows = await this.userRepo.query(
            `SELECT submitted_by FROM incident_headsup WHERE incident_id = ? AND submitted_by IS NOT NULL`,
            [incidentId],
          );
          headsupRows.forEach((r: any) => r.submitted_by && submitterIdentifiers.push(String(r.submitted_by).trim()));

          const initialRows = await this.userRepo.query(
            `SELECT submitted_by FROM incident_initial_reports WHERE incident_id = ? AND submitted_by IS NOT NULL`,
            [incidentId],
          ).catch(() => this.userRepo.query(
            `SELECT submitted_by FROM incident_initial_report WHERE incident_id = ? AND submitted_by IS NOT NULL`,
            [incidentId],
          ).catch(() => []));
          initialRows.forEach((r: any) => r.submitted_by && submitterIdentifiers.push(String(r.submitted_by).trim()));

          const invRows = await this.userRepo.query(
            `SELECT signatures, team FROM incident_investigations WHERE incident_id = ?`,
            [incidentId],
          ).catch(() => this.userRepo.query(
            `SELECT signatures, team FROM incident_investigation WHERE incident_id = ?`,
            [incidentId],
          ).catch(() => []));

          for (const row of invRows) {
            if (row.signatures) {
              try {
                const sigs = typeof row.signatures === 'string' ? JSON.parse(row.signatures) : row.signatures;
                if (Array.isArray(sigs)) {
                  sigs.forEach(s => s && s.name && submitterIdentifiers.push(String(s.name).trim()));
                }
              } catch (_) {}
            }
            if (row.team) {
              try {
                const team = typeof row.team === 'string' ? JSON.parse(row.team) : row.team;
                if (Array.isArray(team)) {
                  team.forEach(t => {
                    if (typeof t === 'string' && t.trim()) submitterIdentifiers.push(t.trim());
                    else if (t && t.name) submitterIdentifiers.push(String(t.name).trim());
                    else if (t && t.email) submitterIdentifiers.push(String(t.email).trim());
                  });
                }
              } catch (_) {}
            }
          }
        } catch (stepErr) {
          console.warn('[Notification] Could not query step submitters:', stepErr);
        }
      }

      // Resolve user accounts for all found submitter identifiers
      const uniqueIdentifiers = Array.from(new Set(submitterIdentifiers.filter(Boolean)));
      for (const ident of uniqueIdentifiers) {
        const matchedUsers = await this.findUsersBySubmitterIdentifier(ident);
        for (const u of matchedUsers) {
          if (!userMap.has(u.id)) {
            userMap.set(u.id, u);
          }
        }
      }

      if (userMap.size > 0) {
        console.log(`[Notification] Resolved ${userMap.size} exact submitter user(s) for incident ${incident.caseNumber || incident.id}:`, Array.from(userMap.values()).map(u => `${u.name} (ID: ${u.id}, Email: ${u.email || 'none'}, Phone: ${u.phone || 'none'})`));
        return Array.from(userMap.values());
      }

      console.warn(`[Notification] No exact submitter found for incident ${incident.caseNumber || incident.id}.`);
    } catch (err) {
      console.error('[Notification] Error resolving contractor submitter users for incident:', err);
    }
    return Array.from(userMap.values());
  }

  /**
   * Resolve single contractor submitter user (for backwards-compatibility).
   */
  async getContractorUserForIncident(incident: any, stepName?: string): Promise<{ id?: number; username?: string; email?: string; phone?: string; name?: string } | null> {
    const list = await this.getContractorUsersForIncident(incident, stepName);
    return list.length > 0 ? list[0] : null;
  }

  /**
   * Trigger notifications when a contractor submits an incident step report.
   * Sends:
   * 1. In-App Notification to all Department/Department1 Notification Group users AND all Admin/SuperAdmin users.
   * 2. SMS to group users with isSmsEnabled = true.
   * 3. Email to group users with isEmailEnabled = true.
   * Text: "{contractor_name} has submitted the {Step of incident} report for {incident type category} with {incident number}."
   */
  async triggerIncidentSubmissionNotification(
    incident: any,
    stepName: string,
    contractorName?: string,
    actorUserId?: number,
  ): Promise<void> {
    try {
      const cName = contractorName || incident.contractorsInvolved || incident.contractorName || 'Contractor';
      const categoryName = Array.isArray(incident.categories) && incident.categories.length > 0
        ? incident.categories.join(', ')
        : (incident.category || incident.type || 'Incident');
      const caseNumber = incident.caseNumber || `INC-${incident.id}`;

      const message = `${cName} has submitted the ${stepName} report for ${categoryName} with ${caseNumber}.`;
      const title = `New ${stepName} Submitted`;

      // 1. Fetch all system users with live contacts to ensure all Admin, SuperAdmin, Department, and Department1 accounts receive alerts
      const allSystemUsers = await this.userRepo.createQueryBuilder('user')
        .leftJoin('employees', 'emp', '(user.empId = emp.id OR (user.typeId = emp.id AND user.userType IN (:...empTypes)))', {
          empTypes: ['Employee', 'Site Manager', 'Admin', 'Safety Officer', 'Supervisor', 'Department', 'Department1', 'Subcontractor'],
        })
        .select([
          'user.id AS id',
          'user.username AS username',
          'user.userType AS userType',
          'user.typeId AS typeId',
          'emp.email AS email',
          'emp.phonenumber AS phone',
          'emp.employeeName AS employeeName',
        ])
        .getRawMany();

      // 2. Fetch configured group members (hydrated with live users table contacts)
      const groupUsers = await this.getIncidentNotificationGroupUsers();

      // 3. Build unified recipient map keyed by userId
      const recipientMap = new Map<number, {
        userId: number;
        username: string;
        email?: string;
        phone?: string;
        name?: string;
        userType?: string;
        isInAppEnabled: boolean;
        isSmsEnabled: boolean;
        isEmailEnabled: boolean;
      }>();

      // Match and add all Department, Department1, Admin, and SuperAdmin users (in-app enabled by default)
      for (const u of allSystemUsers) {
        const uId = (u.id !== null && u.id !== undefined) ? Number(u.id) : NaN;
        if (isNaN(uId)) continue;

        const uType = (u.userType || '').toLowerCase();
        const uName = (u.username || '').toLowerCase();
        const typeId = Number(u.typeId);

        const isTarget =
          uType.includes('admin') ||
          uType.includes('superadmin') ||
          uType.includes('department') ||
          uType.includes('department1') ||
          uType.includes('site manager') ||
          uType.includes('hse') ||
          uName.includes('admin') ||
          uName.includes('superadmin') ||
          uName === 'south_admin' ||
          uId === 0 ||
          uId === 1 ||
          uId === 785 ||
          typeId === 0 ||
          typeId === 1;

        if (isTarget) {
          recipientMap.set(uId, {
            userId: uId,
            username: u.username || `User-${uId}`,
            email: u.email || (u.username && u.username.includes('@') ? u.username : undefined),
            phone: u.phone,
            name: u.employeeName || u.username,
            userType: u.userType || 'User',
            isInAppEnabled: true,
            isSmsEnabled: false,
            isEmailEnabled: false,
          });
        }
      }

      // Explicitly guarantee all known admin/superadmin accounts (IDs: 0, 1, 785) are in recipientMap
      for (const adminId of [0, 1, 785]) {
        if (!recipientMap.has(adminId)) {
          recipientMap.set(adminId, {
            userId: adminId,
            username: adminId === 0 ? 'Superadmin' : adminId === 1 ? 'Admin-South' : 'superadmin@gmail.com',
            email: adminId === 785 ? 'superadmin@gmail.com' : undefined,
            isInAppEnabled: true,
            isSmsEnabled: false,
            isEmailEnabled: false,
          });
        }
      }

      // 4. Overlay configured group members (using live contacts from users table + configured channel preferences)
      for (const rx of groupUsers) {
        if (rx.userId !== null && rx.userId !== undefined) {
          const uId = Number(rx.userId);
          if (!isNaN(uId)) {
            const existing = recipientMap.get(uId);
            recipientMap.set(uId, {
              userId: uId,
              username: rx.username || existing?.username || `User-${uId}`,
              email: rx.email || existing?.email,
              phone: rx.phone || existing?.phone,
              name: rx.username || existing?.name,
              userType: rx.userType || existing?.userType || 'Group Member',
              isInAppEnabled: rx.isInAppEnabled !== false,
              isSmsEnabled: rx.isSmsEnabled === true,
              isEmailEnabled: rx.isEmailEnabled === true,
            });
          }
        }
      }

      const recipientSummary = Array.from(recipientMap.values()).map(r => `[ID:${r.userId} (${r.username}/${r.userType}) InApp:${r.isInAppEnabled}]`).join(', ');
      console.log(`[Notification] Dispatching Incident submission alert to ${recipientMap.size} recipients: ${recipientSummary}`);

      for (const rx of recipientMap.values()) {
        if (actorUserId !== undefined && actorUserId !== null && rx.userId === actorUserId) {
          continue;
        }

        // 1. In-App Notification
        if (rx.isInAppEnabled !== false && rx.userId !== null && rx.userId !== undefined && !isNaN(Number(rx.userId))) {
          await this.notificationRepo.save(
            this.notificationRepo.create({
              receiverUserId: Number(rx.userId),
              senderUserId: actorUserId || undefined,
              notificationType: 'INCIDENT_SUBMISSION',
              permitStatus: stepName,
              title,
              message,
              isRead: 0,
              metadata: JSON.stringify({
                module: 'INCIDENTS',
                incidentId: incident.id,
                caseNumber,
                stepName,
                contractorName: cName,
                category: categoryName,
              }),
            }),
          );
        }

        // SMS & Email Dispatch for incident submission
        // NOTE: Temporarily disabled for Incident Module (in-app notifications only). Code preserved for future re-enablement.
        /*
        // 2. SMS Dispatch (if enabled)
        if (rx.isSmsEnabled && rx.phone) {
          await this.smsService.sendSms(rx.phone, message);
        }

        // 3. Email Dispatch (if enabled)
        if (rx.isEmailEnabled && rx.email) {
          await this.emailService.sendEmail({
            to: rx.email,
            subject: `Incident Alert: ${caseNumber} - ${stepName} Submitted`,
            text: message,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                <h3 style="color: #0f172a; margin-top: 0;">Incident Report Submitted</h3>
                <p style="font-size: 15px; line-height: 1.6; color: #334155;">
                  <strong>${cName}</strong> has submitted the <strong>${stepName}</strong> report for <strong>${categoryName}</strong> with <strong>${caseNumber}</strong>.
                </p>
                <div style="margin-top: 16px; padding: 12px 16px; background-color: #f8fafc; border-left: 4px solid #3b82f6; border-radius: 4px; font-size: 14px;">
                  <div><strong>Case Number:</strong> ${caseNumber}</div>
                  <div><strong>Incident Type / Category:</strong> ${categoryName}</div>
                  <div><strong>Submitted Step:</strong> ${stepName}</div>
                  <div><strong>Contractor:</strong> ${cName}</div>
                </div>
              </div>
            `,
          });
        }
        */
      }
    } catch (err) {
      console.error('[Notification] Error in triggerIncidentSubmissionNotification:', err);
    }
  }

  /**
   * Trigger notifications when Department / Department1 / Admin reviews & approves an incident step, returns it for revision, or closes the incident.
   * Sends In-App Notification, Email, and SMS back to the contractor user(s) who submitted the incident.
   * Text (Approval): "{approver_name} has reviewed and approved the {Step of incident} report for {incident type category} with {incident number}."
   * Text (Closure): "{approver_name} has approved and closed incident {incident number} ({incident type category})."
   * Text (Revision): "{approver_name} has returned the {Step of incident} report for revision on {incident number}. Reason: {returnReason}"
   */
  async triggerIncidentApprovalNotification(
    incident: any,
    stepName: string,
    approverName: string,
    actorUserId?: number,
    isClosed: boolean = false,
    isReturned: boolean = false,
    returnReason?: string,
  ): Promise<void> {
    try {
      const categoryName = Array.isArray(incident.categories) && incident.categories.length > 0
        ? incident.categories.join(', ')
        : (incident.category || incident.type || 'Incident');
      const caseNumber = incident.caseNumber || `INC-${incident.id}`;

      let message = '';
      let title = '';
      let notifType = 'INCIDENT_APPROVED';

      if (isReturned) {
        message = `${approverName} has returned the ${stepName} report for revision on ${caseNumber}.${returnReason ? ` Reason: ${returnReason}` : ''}`;
        title = `${stepName} Returned for Revision`;
        notifType = 'INCIDENT_REVISION';
      } else if (isClosed) {
        message = `${approverName} has approved and closed incident ${caseNumber} (${categoryName}).`;
        title = 'Incident Approved & Closed';
        notifType = 'INCIDENT_CLOSED';
      } else {
        message = `${approverName} has reviewed and approved the ${stepName} report for ${categoryName} with ${caseNumber}.`;
        title = `${stepName} Approved`;
        notifType = 'INCIDENT_APPROVED';
      }

      const contractorUsers = await this.getContractorUsersForIncident(incident, stepName);
      if (!contractorUsers || contractorUsers.length === 0) {
        console.warn(`[Notification] Could not find contractor submitter user to notify for incident ${caseNumber}`);
        return;
      }

      console.log(`[Notification] Dispatching Incident status update (${notifType}) to ${contractorUsers.length} contractor user(s).`);

      for (const contractorUser of contractorUsers) {
        if (actorUserId && contractorUser.id === actorUserId) {
          continue;
        }

        // 1. In-App Notification
        if (contractorUser.id) {
          await this.notificationRepo.save(
            this.notificationRepo.create({
              receiverUserId: contractorUser.id,
              senderUserId: actorUserId || undefined,
              notificationType: notifType,
              permitStatus: stepName,
              title,
              message,
              isRead: 0,
              metadata: JSON.stringify({
                module: 'INCIDENTS',
                incidentId: incident.id,
                caseNumber,
                stepName,
                approverName,
                isClosed,
                isReturned,
                returnReason,
              }),
            }),
          );
        }

        // SMS & Email Dispatch for incident approval / revision / closure
        // NOTE: Temporarily disabled for Incident Module (in-app notifications only). Code preserved for future re-enablement.
        /*
        // 2. SMS Dispatch
        if (contractorUser.phone) {
          await this.smsService.sendSms(contractorUser.phone, message);
        }

        // 3. Email Dispatch
        if (contractorUser.email) {
          const emailSubject = isReturned
            ? `Incident Revision Required: ${caseNumber} - ${stepName}`
            : isClosed
            ? `Incident Closed: ${caseNumber}`
            : `Incident Report Approved: ${caseNumber} - ${stepName}`;

          await this.emailService.sendEmail({
            to: contractorUser.email,
            subject: emailSubject,
            text: message,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                <h3 style="color: ${isReturned ? '#b91c1c' : '#065f46'}; margin-top: 0;">${title}</h3>
                <p style="font-size: 15px; line-height: 1.6; color: #334155;">
                  ${message}
                </p>
                <div style="margin-top: 16px; padding: 12px 16px; background-color: ${isReturned ? '#fef2f2' : '#f0fdf4'}; border-left: 4px solid ${isReturned ? '#ef4444' : '#10b981'}; border-radius: 4px; font-size: 14px;">
                  <div><strong>Case Number:</strong> ${caseNumber}</div>
                  <div><strong>Step:</strong> ${stepName}</div>
                  <div><strong>Reviewed By:</strong> ${approverName}</div>
                  ${isReturned && returnReason ? `<div><strong>Reason:</strong> ${returnReason}</div>` : ''}
                </div>
              </div>
            `,
          });
        }
        */
      }
    } catch (err) {
      console.error('[Notification] Error in triggerIncidentApprovalNotification:', err);
    }
  }

  /**
   * Get paginated notifications list for a user with optional module filter.
   */
  async getNotificationsForUser(
    userId: number,
    page: number = 1,
    limit: number = 10,
    module?: string,
  ): Promise<{ data: Notification[]; total: number; page: number; limit: number; totalPages: number }> {
    const qb = this.notificationRepo.createQueryBuilder('n');

    const uIdNum = Number(userId);
    const isSuperOrAdmin = uIdNum === 0 || uIdNum === 1 || uIdNum === 785;

    if (isSuperOrAdmin) {
      qb.where('(n.receiverUserId = :userId OR n.receiverUserId IN (0, 1, 785))', { userId: uIdNum });
    } else {
      qb.where('n.receiverUserId = :userId', { userId: uIdNum });
    }

    qb.orderBy('n.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (module === 'observations') {
      qb.andWhere("(n.notificationType LIKE 'OBSERVATION%' OR n.metadata LIKE '%\"module\":\"OBSERVATIONS\"%')");
    } else if (module === 'incidents') {
      qb.andWhere("(n.notificationType LIKE 'INCIDENT%' OR n.metadata LIKE '%\"module\":\"INCIDENTS\"%')");
    } else if (module === 'permits') {
      qb.andWhere("(n.notificationType NOT LIKE 'OBSERVATION%' AND n.notificationType NOT LIKE 'INCIDENT%' AND (n.metadata IS NULL OR (n.metadata NOT LIKE '%\"module\":\"OBSERVATIONS\"%' AND n.metadata NOT LIKE '%\"module\":\"INCIDENTS\"%')))");
    }

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get total count of unread notifications for a user with optional module filter.
   */
  async getUnreadCount(userId: number, module?: string): Promise<number> {
    const qb = this.notificationRepo.createQueryBuilder('n');

    const uIdNum = Number(userId);
    const isSuperOrAdmin = uIdNum === 0 || uIdNum === 1 || uIdNum === 785;

    if (isSuperOrAdmin) {
      qb.where('(n.receiverUserId = :userId OR n.receiverUserId IN (0, 1, 785))', { userId: uIdNum });
    } else {
      qb.where('n.receiverUserId = :userId', { userId: uIdNum });
    }

    qb.andWhere('n.isRead = 0');

    if (module === 'observations') {
      qb.andWhere("(n.notificationType LIKE 'OBSERVATION%' OR n.metadata LIKE '%\"module\":\"OBSERVATIONS\"%')");
    } else if (module === 'incidents') {
      qb.andWhere("(n.notificationType LIKE 'INCIDENT%' OR n.metadata LIKE '%\"module\":\"INCIDENTS\"%')");
    } else if (module === 'permits') {
      qb.andWhere("(n.notificationType NOT LIKE 'OBSERVATION%' AND n.notificationType NOT LIKE 'INCIDENT%' AND (n.metadata IS NULL OR (n.metadata NOT LIKE '%\"module\":\"OBSERVATIONS\"%' AND n.metadata NOT LIKE '%\"module\":\"INCIDENTS\"%')))");
    }

    return qb.getCount();
  }

  /**
   * Mark a single notification as read.
   */
  async markAsRead(notificationId: number, userId: number): Promise<boolean> {
    const uIdNum = Number(userId);
    const isSuperOrAdmin = uIdNum === 0 || uIdNum === 1 || uIdNum === 785;

    if (isSuperOrAdmin) {
      const result = await this.notificationRepo.createQueryBuilder()
        .update(Notification)
        .set({ isRead: 1 })
        .where('id = :id AND (receiverUserId = :userId OR receiverUserId IN (0, 1, 785))', { id: notificationId, userId: uIdNum })
        .execute();
      return (result.affected ?? 0) > 0;
    }

    const result = await this.notificationRepo.update(
      { id: notificationId, receiverUserId: uIdNum },
      { isRead: 1 },
    );
    return (result.affected ?? 0) > 0;
  }

  /**
   * Mark all notifications as read for a user.
   */
  async markAllAsRead(userId: number): Promise<boolean> {
    const uIdNum = Number(userId);
    const isSuperOrAdmin = uIdNum === 0 || uIdNum === 1 || uIdNum === 785;

    if (isSuperOrAdmin) {
      const result = await this.notificationRepo.createQueryBuilder()
        .update(Notification)
        .set({ isRead: 1 })
        .where('isRead = 0 AND (receiverUserId = :userId OR receiverUserId IN (0, 1, 785))', { userId: uIdNum })
        .execute();
      return (result.affected ?? 0) > 0;
    }

    const result = await this.notificationRepo.update(
      { receiverUserId: uIdNum, isRead: 0 },
      { isRead: 1 },
    );
    return (result.affected ?? 0) > 0;
  }

  /**
   * Fetch all user notification preferences.
   */
  async getNotificationSettings(userId: number): Promise<Record<string, boolean>> {
    const cacheKey = `notifications:settings:${userId}`;
    return this.redisCacheService.getOrSet(
      cacheKey,
      async () => {
        const rows = await this.settingRepo.find({ where: { userId } });
        const map: Record<string, boolean> = {};
        for (const row of rows) {
          map[row.permitStatus.toLowerCase().trim()] = row.enabled === 1;
        }
        return map;
      },
      1000 * 60 * 60,
    );
  }

  /**
   * Update user notification preferences and invalidate settings cache.
   */
  async updateNotificationSettings(userId: number, settings: Record<string, boolean>): Promise<void> {
    // Save to database
    for (const [status, enabled] of Object.entries(settings)) {
      const dbStatus = status.trim();
      let setting = await this.settingRepo.findOne({
        where: { userId, permitStatus: dbStatus },
      });

      if (setting) {
        setting.enabled = enabled ? 1 : 0;
        await this.settingRepo.save(setting);
      } else {
        await this.settingRepo.save(
          this.settingRepo.create({
            userId,
            permitStatus: dbStatus,
            enabled: enabled ? 1 : 0,
          }),
        );
      }
    }

    // Invalidate Redis cache
    const cacheKey = `notifications:settings:${userId}`;
    await this.redisCacheService.delete(cacheKey);
  }

  /**
   * Fetch actor display name helper.
   */
  private async getUserDisplayName(userId: number): Promise<string> {
    if (!userId) return 'System';
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) return `User #${userId}`;
    if (user.empId) {
      const emp = await this.employeeRepo.findOne({ where: { id: user.empId } });
      if (emp && emp.employeeName) {
        return emp.employeeName;
      }
    }
    return user.username || `User #${userId}`;
  }
}
