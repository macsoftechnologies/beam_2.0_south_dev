import { Injectable, Inject, forwardRef, Optional } from '@nestjs/common';
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
import { IncidentPdfService } from '../incidents/services/incident-pdf.service';
import { IncidentsService } from '../incidents/services/incidents.service';

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
    @Inject(forwardRef(() => IncidentPdfService))
    @Optional()
    private readonly incidentPdfService?: IncidentPdfService,
    @Inject(forwardRef(() => IncidentsService))
    @Optional()
    private readonly incidentsService?: IncidentsService,
  ) { }

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
          \`groupKey\` VARCHAR(50) NOT NULL DEFAULT 'GROUP_1',
          \`isEmailEnabled\` TINYINT(1) NOT NULL DEFAULT 1,
          \`isSmsEnabled\` TINYINT(1) NOT NULL DEFAULT 1,
          \`isInAppEnabled\` TINYINT(1) NOT NULL DEFAULT 1,
          \`addedByUserId\` INT NULL,
          \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX \`IDX_incident_group_userId\` (\`userId\`),
          INDEX \`IDX_incident_group_key\` (\`groupKey\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
      console.log('[Notification] Checked/Created table: incident_notification_group_members');
      try {
        await this.notificationRepo.query(`
          ALTER TABLE \`incident_notification_group_members\` ADD COLUMN \`groupKey\` VARCHAR(50) NOT NULL DEFAULT 'GROUP_1'
        `);
      } catch (_) {
        // column already exists
      }
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
   * Resolve contractor users who have contractor access for Incident Management
   * and whose company matches the company involved in the observation/incident.
   */
  async getContractorUsersForIncidentManagementByCompany(
    companyName?: string,
    companyId?: number,
  ): Promise<Array<{ id: number; username?: string; email?: string; phone?: string; name?: string; companyName?: string }>> {
    const userMap = new Map<number, { id: number; username?: string; email?: string; phone?: string; name?: string; companyName?: string }>();
    const trimmedName = (companyName || '').trim();
    const cId = companyId && !isNaN(Number(companyId)) ? Number(companyId) : null;

    let resolvedSubId = cId;
    let resolvedName = trimmedName;

    try {
      if (!resolvedSubId && resolvedName) {
        const subs = await this.userRepo.query(
          `SELECT id, subContractorName FROM subcontractors WHERE LOWER(TRIM(subContractorName)) = LOWER(TRIM(?)) OR subContractorName LIKE ? LIMIT 1`,
          [resolvedName, `%${resolvedName}%`],
        );
        if (subs && subs.length > 0) {
          resolvedSubId = Number(subs[0].id);
          resolvedName = subs[0].subContractorName;
        }
      } else if (resolvedSubId && !resolvedName) {
        const subs = await this.userRepo.query(
          `SELECT id, subContractorName FROM subcontractors WHERE id = ? LIMIT 1`,
          [resolvedSubId],
        );
        if (subs && subs.length > 0) {
          resolvedName = subs[0].subContractorName;
        }
      }

      const rows = await this.userRepo.query(
        `
        SELECT 
          u.id AS userId,
          u.username,
          u.userType,
          u.typeId,
          e.id AS empId,
          e.employeeName,
          e.companyName,
          e.subContId,
          e.access,
          s.subContractorName,
          e.module_access,
          e.email,
          e.phonenumber
        FROM users u
        LEFT JOIN employees e ON u.empId = e.id OR u.username = e.username
        LEFT JOIN subcontractors s ON e.subContId = s.id OR u.typeId = s.id
        WHERE (
          (e.subContId IS NOT NULL AND e.subContId = ?)
          OR (s.id IS NOT NULL AND s.id = ?)
          OR (u.typeId IS NOT NULL AND u.typeId = ?)
          OR (s.subContractorName IS NOT NULL AND LOWER(TRIM(s.subContractorName)) = LOWER(TRIM(?)))
          OR (e.companyName IS NOT NULL AND LOWER(TRIM(e.companyName)) = LOWER(TRIM(?)))
          OR (s.subContractorName IS NOT NULL AND s.subContractorName LIKE ?)
          OR (e.companyName IS NOT NULL AND e.companyName LIKE ?)
        )
      `,
        [
          resolvedSubId || 0,
          resolvedSubId || 0,
          resolvedSubId || 0,
          resolvedName || '',
          resolvedName || '',
          resolvedName ? `%${resolvedName}%` : '',
          resolvedName ? `%${resolvedName}%` : '',
        ],
      );

      for (const r of rows) {
        if (!r || r.userId === null || r.userId === undefined) continue;
        const uId = Number(r.userId);
        if (isNaN(uId)) continue;

        // Filter: user MUST have contractor access for Incident Management
        const modAccess = (r.module_access || '').toLowerCase();
        const hasExplicitIMContractor =
          modAccess.includes('incident-management:subcontractor') ||
          modAccess.includes('incident-management:contractor');

        const isLegacyIM = modAccess.includes('incident-management') && !modAccess.includes('incident-management:');
        const isContractorUserType =
          (r.userType || '').toLowerCase().includes('subcontractor') ||
          (r.userType || '').toLowerCase().includes('contractor');

        const isIMContractor = hasExplicitIMContractor || (isLegacyIM && isContractorUserType);
        if (!isIMContractor) {
          continue;
        }

        // Active employee check: skip if access is explicitly disabled (0)
        if (r.access !== null && r.access !== undefined && (r.access === 0 || r.access === '0' || r.access === false)) {
          continue;
        }

        let email = r.email || (r.username && r.username.includes('@') ? r.username : undefined);
        let phone = r.phonenumber || undefined;
        const name = r.employeeName || r.username;
        const comp = r.subContractorName || r.companyName || resolvedName;

        // Fallback: check incidentGroupRepo if email or phone is missing
        if (!email || !phone) {
          try {
            const member = await this.incidentGroupRepo.findOne({ where: { userId: uId } });
            if (member) {
              if (!email && member.email) email = member.email;
              if (!phone && member.phoneNumber) phone = member.phoneNumber;
            }
          } catch (_) {}
        }

        if (!userMap.has(uId)) {
          userMap.set(uId, {
            id: uId,
            username: r.username,
            name,
            companyName: comp,
            email,
            phone,
          });
        }
      }

      console.log(
        `[Notification] Resolved ${userMap.size} contractor user(s) with Incident Management contractor access for company "${resolvedName || companyName}" (ID: ${resolvedSubId}):`,
        Array.from(userMap.values()).map(u => `${u.name} (ID: ${u.id}, Email: ${u.email || 'none'}, Phone: ${u.phone || 'none'}, Company: ${u.companyName})`),
      );
    } catch (err) {
      console.error('[Notification] Error in getContractorUsersForIncidentManagementByCompany:', err);
    }

    return Array.from(userMap.values());
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

      // SPECIAL WORKFLOW: Observation Escalated to Incident -> Notify contractor users with Incident Management contractor access matching the company involved
      if (actionType === 'ESCALATED') {
        const incCase = extraData?.incidentCaseNumber ? ` to Incident ${extraData.incidentCaseNumber}` : ' to an official Incident';
        const reasonText = extraRemarks ? ` Reason: "${extraRemarks}"` : '';

        title = 'Safety Observation Escalated to Incident';
        message = `Safety Observation ${observation.observationNumber} (${observation.subject || observation.safetyCategory || 'Finding'}) assigned to ${contractorName || 'your company'} has been escalated${incCase} by ${actorDisplayName}.${reasonText}`;

        const incidentId = extraData?.escalatedIncidentId || observation.id;
        const incidentLink = this.getIncidentDirectLink(incidentId);

        const imContractorUsers = await this.getContractorUsersForIncidentManagementByCompany(
          contractorName,
          contractorId ?? undefined,
        );

        console.log(`[Notification] Dispatching ESCALATION alert to ${imContractorUsers.length} contractor user(s) with Incident Management access for company "${contractorName}"`);

        for (const rx of imContractorUsers) {
          // 1. In-App Notification (marked for both Incident & Observation modules)
          await this.notificationRepo.save(
            this.notificationRepo.create({
              receiverUserId: rx.id,
              senderUserId: actorUserId || undefined,
              companyId: contractorId || undefined,
              notificationType: 'OBSERVATION_ESCALATED',
              permitStatus: 'ESCALATED',
              title,
              message,
              isRead: 0,
              metadata: JSON.stringify({
                module: 'INCIDENTS',
                observationId: observation.id,
                observationNumber: observation.observationNumber,
                subject: observation.subject,
                safetyCategory: observation.safetyCategory,
                riskLevel: observation.riskLevel,
                contractorName: rx.companyName || contractorName,
                actionType: 'ESCALATED',
                remarks: extraRemarks,
                escalatedIncidentId: extraData?.escalatedIncidentId,
                incidentCaseNumber: extraData?.incidentCaseNumber,
                link: `/incident-management/details/${incidentId}`,
              }),
            }),
          ).catch(err => {
            console.error(`[Notification] In-app notification error to ${rx.id} for escalated observation:`, err);
          });

          // 2. Email Dispatch with Direct Incident Link
          if (rx.email) {
            const emailSubject = `Incident Alert: Observation ${observation.observationNumber} Escalated to Incident ${extraData?.incidentCaseNumber || ''} (${rx.companyName || contractorName})`;
            const emailHtml = this.buildIncidentEmailHtml({
              title,
              message,
              caseNumber: extraData?.incidentCaseNumber || `INC-${incidentId}`,
              stepName: 'Heads-Up Notification (Escalated)',
              categoryName: observation.safetyCategory || observation.subject || 'Incident',
              incidentId,
              badgeText: 'Observation Escalated',
              badgeColor: '#fee2e2',
              badgeTextColor: '#991b1b',
              borderColor: '#e11d48',
              extraRows: [
                { label: 'Origin Observation', value: observation.observationNumber },
                { label: 'Company Involved', value: rx.companyName || contractorName || 'N/A' },
                { label: 'Risk Level', value: observation.riskLevel || 'N/A' },
                { label: 'Escalated By', value: actorDisplayName },
                ...(extraRemarks ? [{ label: 'Escalation Reason', value: extraRemarks }] : []),
              ],
            });

            await this.emailService.sendEmail({
              to: rx.email,
              subject: emailSubject,
              text: `${title}\n\n${message}\n\nIncident: ${extraData?.incidentCaseNumber || ''}\nObservation: ${observation.observationNumber}\nCompany Involved: ${rx.companyName || contractorName}\nEscalated By: ${actorDisplayName}${extraRemarks ? `\nReason: ${extraRemarks}` : ''}\n\nView Incident Details:\n${incidentLink}`,
              html: emailHtml,
            }).catch(emailErr => {
              console.error(`[Notification] Email error to ${rx.email} for escalated observation ${observation.observationNumber}:`, emailErr);
            });
          } else {
            console.warn(`[Notification] No email for contractor user ${rx.name} (ID: ${rx.id}) on escalation`);
          }

          // 3. SMS Dispatch
          if (rx.phone) {
            const smsText = `Safety Alert: Observation ${observation.observationNumber} involving ${rx.companyName || contractorName} escalated to Incident ${extraData?.incidentCaseNumber || ''} by ${actorDisplayName}.${extraRemarks ? ` Reason: ${extraRemarks}.` : ''} Link: ${incidentLink}`;
            await this.smsService.sendSms(rx.phone, smsText).catch(smsErr => {
              console.error(`[Notification] SMS error to ${rx.phone} for escalated observation ${observation.observationNumber}:`, smsErr);
            });
          } else {
            console.warn(`[Notification] No phone for contractor user ${rx.name} (ID: ${rx.id}) on escalation`);
          }
        }

        return;
      }

      // SCENARIO 1: Observation Created, Reassigned, or Closed -> Notify Contractor Users
      if (actionType === 'CREATED' || actionType === 'REASSIGNED' || actionType === 'CLOSED') {
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
  async getIncidentNotificationGroupMembers(groupKey?: string): Promise<IncidentNotificationGroupMember[]> {
    try {
      const where: any = {};
      if (groupKey && groupKey !== 'ALL') {
        where.groupKey = groupKey;
      }
      const members = await this.incidentGroupRepo.find({
        where,
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
  async getAvailableUsersForIncidentGroup(groupKey: string = 'GROUP_1'): Promise<any[]> {
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

      const where: any = {};
      if (groupKey && groupKey !== 'ALL') {
        where.groupKey = groupKey;
      }
      const existingMembers = await this.incidentGroupRepo.find({ where });
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
      groupKey?: string;
      isEmailEnabled?: boolean;
      isSmsEnabled?: boolean;
      isInAppEnabled?: boolean;
    }>,
    actorUserId?: number,
    defaultGroupKey: string = 'GROUP_1',
  ): Promise<IncidentNotificationGroupMember[]> {
    const saved: IncidentNotificationGroupMember[] = [];
    const userIds = members.filter(m => m.userId !== null && m.userId !== undefined).map(m => Number(m.userId));
    const liveContacts = userIds.length > 0 ? await this.resolveLiveUserContacts(userIds) : new Map();

    for (const m of members) {
      const targetGroup = m.groupKey || defaultGroupKey || 'GROUP_1';
      const uIdNum = m.userId !== null && m.userId !== undefined ? Number(m.userId) : undefined;
      const live = uIdNum !== undefined ? liveContacts.get(uIdNum) : null;

      const finalEmail = live?.email || m.email || '';
      const finalPhone = live?.phone || m.phoneNumber || '';
      const finalName = live?.name || m.name || m.email || 'User';
      const finalDept = live?.departmentName || m.departmentName || '';
      const finalUserType = live?.userType || m.userType || 'User';

      // Check if already exists in this specific group
      let existing: IncidentNotificationGroupMember | null = null;
      if (uIdNum !== undefined) {
        existing = await this.incidentGroupRepo.findOne({ where: { userId: uIdNum, groupKey: targetGroup } });
      } else if (m.email) {
        existing = await this.incidentGroupRepo.findOne({ where: { email: m.email.trim(), groupKey: targetGroup } });
      }

      if (existing) {
        // Update flags and live info
        existing.name = finalName;
        existing.email = finalEmail;
        existing.phoneNumber = finalPhone;
        existing.userType = finalUserType;
        existing.departmentName = finalDept;
        existing.groupKey = targetGroup;
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
          groupKey: targetGroup,
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
  async getIncidentNotificationGroupUsers(groupKey: string = 'GROUP_1'): Promise<{
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
      const members = await this.incidentGroupRepo.find({
        where: { groupKey },
      });
      if (members.length === 0) {
        return [];
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
        .leftJoin('employees', 'emp', '(user.empId = emp.id OR user.username = emp.username OR (user.typeId = emp.id AND user.userType IN (:...empTypes)))', {
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
      const results: Array<{ id: number; username?: string; email?: string; phone?: string; name?: string }> = [];

      for (const m of matched) {
        if (!m || m.id === null || m.id === undefined) continue;
        const uId = Number(m.id);
        if (isNaN(uId)) continue;

        let email = m.email || (m.username && m.username.includes('@') ? m.username : undefined);
        let phone = m.phone;
        const name = m.employeeName || m.username;

        // Fallback: check incidentGroupRepo if email or phone is missing
        if (!email || !phone) {
          try {
            const member = await this.incidentGroupRepo.findOne({ where: { userId: uId } });
            if (member) {
              if (!email && member.email) email = member.email;
              if (!phone && member.phoneNumber) phone = member.phoneNumber;
            }
          } catch (_) {}
        }

        // Fallback: if trimmed looks like an email and user still has no email
        if (!email && trimmed.includes('@')) {
          email = trimmed;
        }

        results.push({
          id: uId,
          username: m.username,
          email,
          phone,
          name,
        });
      }

      return results;
    } catch (err) {
      console.error('[Notification] Error finding user by submitter identifier:', err);
      return [];
    }
  }

  /**
   * Resolve ONLY the specific contractor / submitter user(s) who actually submitted the incident / step.
   * Checks stage submitters (Heads-Up, Initial Report, Investigation), edit history, and direct incident creator.
   */
  async getContractorUsersForIncident(incident: any, stepName?: string): Promise<Array<{ id: number; username?: string; email?: string; phone?: string; name?: string }>> {
    const userMap = new Map<number, { id: number; username?: string; email?: string; phone?: string; name?: string }>();
    try {
      const incidentId = incident.id;
      const submitterIdentifiers: string[] = [];

      // 1. Direct creator ID / username on incident
      const creatorId = incident.createdByUserId || incident.createdById || incident.userId;
      if (creatorId !== undefined && creatorId !== null && String(creatorId).trim() !== '') {
        submitterIdentifiers.push(String(creatorId).trim());
      }
      if (incident.submittedBy || incident.submitted_by) {
        submitterIdentifiers.push(String(incident.submittedBy || incident.submitted_by).trim());
      }

      // 2. Query stage-specific submitters from incident tables
      if (incidentId) {
        try {
          const headsupRows = await this.userRepo.query(
            `SELECT submitted_by, edit_history FROM incident_headsup WHERE incident_id = ?`,
            [incidentId],
          );
          for (const r of headsupRows) {
            if (r.submitted_by) submitterIdentifiers.push(String(r.submitted_by).trim());
            if (r.edit_history) {
              try {
                const edits = typeof r.edit_history === 'string' ? JSON.parse(r.edit_history) : r.edit_history;
                if (Array.isArray(edits)) {
                  edits.forEach(e => {
                    if (e && e.editedBy) submitterIdentifiers.push(String(e.editedBy).trim());
                    if (e && e.submittedBy) submitterIdentifiers.push(String(e.submittedBy).trim());
                  });
                }
              } catch (_) {}
            }
          }

          const initialRows = await this.userRepo.query(
            `SELECT submitted_by, edit_history FROM incident_initial_reports WHERE incident_id = ?`,
            [incidentId],
          ).catch(() => this.userRepo.query(
            `SELECT submitted_by, edit_history FROM incident_initial_report WHERE incident_id = ?`,
            [incidentId],
          ).catch(() => []));
          for (const r of initialRows) {
            if (r.submitted_by) submitterIdentifiers.push(String(r.submitted_by).trim());
            if (r.edit_history) {
              try {
                const edits = typeof r.edit_history === 'string' ? JSON.parse(r.edit_history) : r.edit_history;
                if (Array.isArray(edits)) {
                  edits.forEach(e => {
                    if (e && e.editedBy) submitterIdentifiers.push(String(e.editedBy).trim());
                    if (e && e.submittedBy) submitterIdentifiers.push(String(e.submittedBy).trim());
                  });
                }
              } catch (_) {}
            }
          }

          const invRows = await this.userRepo.query(
            `SELECT signatures, team, edit_history FROM incident_investigations WHERE incident_id = ?`,
            [incidentId],
          ).catch(() => this.userRepo.query(
            `SELECT signatures, team, edit_history FROM incident_investigation WHERE incident_id = ?`,
            [incidentId],
          ).catch(() => []));

          for (const row of invRows) {
            if (row.signatures) {
              try {
                const sigs = typeof row.signatures === 'string' ? JSON.parse(row.signatures) : row.signatures;
                if (Array.isArray(sigs)) {
                  sigs.forEach(s => s && s.name && submitterIdentifiers.push(String(s.name).trim()));
                }
              } catch (_) { }
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
              } catch (_) { }
            }
            if (row.edit_history) {
              try {
                const edits = typeof row.edit_history === 'string' ? JSON.parse(row.edit_history) : row.edit_history;
                if (Array.isArray(edits)) {
                  edits.forEach(e => {
                    if (e && e.editedBy) submitterIdentifiers.push(String(e.editedBy).trim());
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

      // Fallback: if no user resolved, search by contractorsInvolved
      if (userMap.size === 0 && (incident.contractorsInvolved || incident.contractors_involved)) {
        const contractorName = String(incident.contractorsInvolved || incident.contractors_involved).trim();
        if (contractorName) {
          const matchedByContractor = await this.findUsersBySubmitterIdentifier(contractorName);
          for (const u of matchedByContractor) {
            if (!userMap.has(u.id)) {
              userMap.set(u.id, u);
            }
          }
        }
      }

      // Enrichment: For any resolved user that lacks email or phone, check employees table & incidentGroupRepo
      for (const [userId, user] of userMap.entries()) {
        if (!user.email || !user.phone) {
          try {
            const empRows = await this.userRepo.query(
              `SELECT email, phonenumber FROM employees WHERE id = ? OR username = ? OR employeeName = ?`,
              [userId, user.username || '', user.name || ''],
            );
            if (empRows && empRows.length > 0) {
              if (!user.email && empRows[0].email) user.email = empRows[0].email;
              if (!user.phone && empRows[0].phonenumber) user.phone = empRows[0].phonenumber;
            }
          } catch (_) {}
          try {
            const member = await this.incidentGroupRepo.findOne({ where: { userId } });
            if (member) {
              if (!user.email && member.email) user.email = member.email;
              if (!user.phone && member.phoneNumber) user.phone = member.phoneNumber;
            }
          } catch (_) {}
        }
      }

      if (userMap.size > 0) {
        console.log(`[Notification] Resolved ${userMap.size} submitter user(s) for incident ${incident.caseNumber || incident.id}:`, Array.from(userMap.values()).map(u => `${u.name} (ID: ${u.id}, Email: ${u.email || 'none'}, Phone: ${u.phone || 'none'})`));
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
   * Helper to construct direct incident detail link.
   */
  getIncidentDirectLink(incidentId: number | string): string {
    const rawUrl =
      process.env.FRONTEND_URL ||
      process.env.APP_URL ||
      process.env.CLIENT_URL ||
      'https://beam.safesiteworks.com/development/m3south';
    const baseUrl = rawUrl.trim().replace(/\/+$/, '');
    return `${baseUrl}/incident-management/details/${incidentId}`;
  }

  /**
   * Helper to build modern, rich HTML email for incidents with direct link.
   */
  buildIncidentEmailHtml(options: {
    title: string;
    message: string;
    caseNumber: string;
    stepName: string;
    categoryName: string;
    incidentId: number | string;
    badgeText?: string;
    badgeColor?: string;
    badgeTextColor?: string;
    borderColor?: string;
    extraRows?: Array<{ label: string; value: string }>;
  }): string {
    const incidentLink = this.getIncidentDirectLink(options.incidentId);
    const badgeBg = options.badgeColor || '#fee2e2';
    const badgeFg = options.badgeTextColor || '#991b1b';
    const borderCol = options.borderColor || '#e11d48';

    const extraRowsHtml = (options.extraRows || [])
      .map(
        (r) => `
          <tr>
            <td style="padding: 7px 0; color: #64748b; font-weight: 600; width: 140px; vertical-align: top;">${r.label}:</td>
            <td style="padding: 7px 0; color: #0f172a; font-weight: 500;">${r.value}</td>
          </tr>
        `,
      )
      .join('');

    return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 620px; margin: 0 auto; padding: 24px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
        <div style="border-bottom: 2px solid ${borderCol}; padding-bottom: 16px; margin-bottom: 20px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td>
                <h2 style="color: #0f172a; margin: 0; font-size: 20px; font-weight: 700;">BEAM Safety Management</h2>
                <div style="font-size: 13px; color: #64748b; margin-top: 2px;">Incident Notification System</div>
              </td>
              <td style="text-align: right; vertical-align: middle;">
                <span style="display: inline-block; padding: 4px 12px; background-color: ${badgeBg}; color: ${badgeFg}; font-size: 12px; font-weight: 700; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.5px;">
                  ${options.badgeText || 'Incident Alert'}
                </span>
              </td>
            </tr>
          </table>
        </div>

        <h3 style="color: #1e293b; margin: 0 0 12px 0; font-size: 17px; font-weight: 600;">
          ${options.title}
        </h3>
        <p style="font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 20px 0;">
          ${options.message}
        </p>

        <div style="margin: 20px 0; padding: 16px 20px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid ${borderCol}; border-radius: 6px; font-size: 14px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 7px 0; color: #64748b; font-weight: 600; width: 140px;">Case Number:</td>
              <td style="padding: 7px 0; color: #0f172a; font-weight: 700;">${options.caseNumber}</td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #64748b; font-weight: 600;">Incident Type:</td>
              <td style="padding: 7px 0; color: #0f172a;">${options.categoryName}</td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #64748b; font-weight: 600;">Stage / Step:</td>
              <td style="padding: 7px 0; color: #0f172a; font-weight: 600;">${options.stepName}</td>
            </tr>
            ${extraRowsHtml}
          </table>
        </div>

        <!-- Direct Incident Link Button -->
        <div style="margin: 28px 0; text-align: center;">
          <a href="${incidentLink}" style="display: inline-block; background-color: #e11d48; color: #ffffff !important; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-size: 15px; font-weight: 600; box-shadow: 0 2px 4px rgba(225, 29, 72, 0.25);">
            View Incident Details &rarr;
          </a>
        </div>

        <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; word-break: break-all;">
          <p style="margin: 0 0 6px 0;">If the button above does not work, copy and paste this link into your browser:</p>
          <a href="${incidentLink}" style="color: #2563eb; text-decoration: underline;">${incidentLink}</a>
        </div>

        <div style="font-size: 12px; color: #94a3b8; margin-top: 16px; text-align: center;">
          This is an automated notification from the BEAM Incident Management System.
        </div>
      </div>
    `;
  }

  /**
   * Determine the incident PDF form type and filename suffix based on the current step.
   */
  private determineIncidentFormType(stepName?: string, isClosed?: boolean): { formType: string; suffix: string } {
    if (isClosed) {
      return { formType: 'all', suffix: '_All_Forms_Report' };
    }
    const lower = (stepName || '').toLowerCase();
    if (lower.includes('head') || lower.includes('step 1') || lower.includes('form 1')) {
      return { formType: 'headsUp', suffix: '_Form1_HeadsUp' };
    }
    if (lower.includes('init') || lower.includes('step 2') || lower.includes('form 2')) {
      return { formType: 'initialReport', suffix: '_Form2_InitialReport' };
    }
    if (lower.includes('invest') || lower.includes('step 3') || lower.includes('form 3')) {
      return { formType: 'investigation', suffix: '_Form3_Investigation' };
    }
    return { formType: 'all', suffix: '_All_Forms_Report' };
  }

  /**
   * Generates the incident PDF report buffer and formats it as an email attachment.
   */
  private async generateIncidentPdfAttachment(
    incidentId: number,
    stepName?: string,
    isClosed?: boolean,
    caseNumber?: string,
  ): Promise<Array<{ filename: string; content: Buffer; contentType: string }> | undefined> {
    try {
      if (!this.incidentPdfService || !this.incidentsService) {
        console.warn('[Notification] IncidentPdfService or IncidentsService not injected. Skipping PDF attachment generation.');
        return undefined;
      }
      const details = await this.incidentsService.getIncidentDetails(incidentId);
      if (!details) {
        console.warn(`[Notification] Incident details not found for ID: ${incidentId}`);
        return undefined;
      }
      const { formType, suffix } = this.determineIncidentFormType(stepName, isClosed);
      const pdfPromise = this.incidentPdfService.generate3In1Pdf(details, formType, {
        includeWitnesses: true,
        includeAttachments: true,
      });
      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('PDF generation timed out after 30s')), 30000),
      );
      const pdfBuffer = await Promise.race([pdfPromise, timeoutPromise]);
      if (pdfBuffer && (pdfBuffer as Buffer).length > 0) {
        const safeCase = caseNumber || details.incident?.caseNumber || `INC-${incidentId}`;
        const filename = `${safeCase}${suffix}.pdf`;
        return [{
          filename,
          content: pdfBuffer as Buffer,
          contentType: 'application/pdf',
        }];
      }
    } catch (err) {
      console.error(`[Notification] Failed to generate incident PDF report for incident ID ${incidentId}:`, err);
    }
    return undefined;
  }

  /**
   * Trigger notifications when a contractor submits an incident step report or resubmits after revision.
   * Sends to Notification Group 1 (GROUP_1):
   * 1. In-App Notification to configured group members (isInAppEnabled !== false).
   * 2. Email with direct incident link to group members (isEmailEnabled === true).
   * 3. SMS to group members (isSmsEnabled === true).
   */
  async triggerIncidentSubmissionNotification(
    incident: any,
    stepName: string,
    contractorName?: string,
    actorUserId?: number,
    groupKey: string = 'GROUP_1',
    isResubmission: boolean = false,
  ): Promise<void> {
    try {
      const cName = contractorName || incident.contractorsInvolved || incident.contractorName || 'Contractor';
      const categoryName = Array.isArray(incident.categories) && incident.categories.length > 0
        ? incident.categories.join(', ')
        : (incident.category || incident.type || 'Incident');
      const caseNumber = incident.caseNumber || `INC-${incident.id}`;
      const incidentLink = this.getIncidentDirectLink(incident.id);

      const title = isResubmission ? `${stepName} Resubmitted (Revised)` : `New ${stepName} Submitted`;
      const message = isResubmission
        ? `${cName} has resubmitted the revised ${stepName} report for ${categoryName} with ${caseNumber}.`
        : `${cName} has submitted the ${stepName} report for ${categoryName} with ${caseNumber}.`;
      const emailSubject = isResubmission
        ? `Incident Alert: ${caseNumber} - ${stepName} Resubmitted`
        : `Incident Alert: ${caseNumber} - ${stepName} Submitted`;

      // Fetch configured group members for Group 1 (or specified groupKey)
      const groupUsers = await this.getIncidentNotificationGroupUsers(groupKey || 'GROUP_1');
      if (!groupUsers || groupUsers.length === 0) {
        console.log(`[Notification] No members configured in ${groupKey || 'GROUP_1'}. Skipping submission notification.`);
        return;
      }

      // Build recipient map from configured group members ONLY
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

      for (const rx of groupUsers) {
        if (rx.userId !== null && rx.userId !== undefined) {
          const uId = Number(rx.userId);
          if (!isNaN(uId)) {
            recipientMap.set(uId, {
              userId: uId,
              username: rx.username || `User-${uId}`,
              email: rx.email,
              phone: rx.phone,
              name: rx.username,
              userType: rx.userType || 'Group Member',
              isInAppEnabled: rx.isInAppEnabled !== false,
              isSmsEnabled: rx.isSmsEnabled === true,
              isEmailEnabled: rx.isEmailEnabled === true,
            });
          }
        }
      }

      const recipientSummary = Array.from(recipientMap.values()).map(r => `[ID:${r.userId} (${r.username}/${r.userType}) InApp:${r.isInAppEnabled} Mail:${r.isEmailEnabled}]`).join(', ');
      console.log(`[Notification] Dispatching Incident submission alert (${groupKey || 'GROUP_1'}) to ${recipientMap.size} recipients: ${recipientSummary}`);

      const emailHtml = this.buildIncidentEmailHtml({
        title,
        message,
        caseNumber,
        stepName,
        categoryName,
        incidentId: incident.id,
        badgeText: isResubmission ? 'Revision Resubmitted' : 'Report Submitted',
        badgeColor: isResubmission ? '#fef3c7' : '#fee2e2',
        badgeTextColor: isResubmission ? '#92400e' : '#991b1b',
        borderColor: isResubmission ? '#f59e0b' : '#ef4444',
        extraRows: [
          { label: 'Contractor', value: cName },
          { label: 'Submission Type', value: isResubmission ? 'Return to Revision Resubmission' : 'Initial Submission' },
        ],
      });

      // If sending to GROUP_2, generate and attach the incident report PDF
      let group2SubmissionAttachments: Array<{ filename: string; content: Buffer; contentType: string }> | undefined = undefined;
      if (groupKey === 'GROUP_2') {
        try {
          group2SubmissionAttachments = await this.generateIncidentPdfAttachment(incident.id, stepName, false, caseNumber);
          if (group2SubmissionAttachments && group2SubmissionAttachments.length > 0) {
            console.log(`[Notification] Generated PDF attachment for Group 2 submission email: ${group2SubmissionAttachments[0].filename} (${group2SubmissionAttachments[0].content?.length || 0} bytes)`);
          }
        } catch (pdfErr) {
          console.error('[Notification] Error preparing Group 2 submission PDF attachment:', pdfErr);
        }
      }

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
              notificationType: isResubmission ? 'INCIDENT_REVISION_SUBMITTED' : 'INCIDENT_SUBMISSION',
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
                isResubmission,
                link: `/incident-management/details/${incident.id}`,
              }),
            }),
          );
        }

        // 2. Email Dispatch (with Incident Direct Link and PDF attachment if Group 2)
        if (rx.isEmailEnabled && rx.email) {
          await this.emailService.sendEmail({
            to: rx.email,
            subject: emailSubject,
            text: `${title}\n\n${message}\n\nCase Number: ${caseNumber}\nIncident Type: ${categoryName}\nStep: ${stepName}\nContractor: ${cName}\n\nView Incident Details:\n${incidentLink}`,
            html: emailHtml,
            attachments: group2SubmissionAttachments,
          }).catch(err => {
            console.error(`[Notification] Failed to send submission email to ${rx.email}:`, err);
          });
        }

        // 3. SMS Dispatch (if enabled)
        if (rx.isSmsEnabled && rx.phone) {
          const smsText = `${message} Link: ${incidentLink}`;
          await this.smsService.sendSms(rx.phone, smsText).catch(err => {
            console.error(`[Notification] Failed to send submission SMS to ${rx.phone}:`, err);
          });
        }
      }
    } catch (err) {
      console.error('[Notification] Error in triggerIncidentSubmissionNotification:', err);
    }
  }

  /**
   * Trigger notifications when an Incident is reopened.
   * Sends notifications strictly to Notification Group 1 (GROUP_1):
   * 1. In-App Notification with REOPENED metadata and direct link.
   * 2. Email with rich card, direct incident link, reopen details (reopenedBy, role, stage, reason), and attached report PDF.
   * 3. SMS notification with direct link.
   */
  async triggerIncidentReopenedNotification(
    incident: any,
    reopenedBy: string,
    reason: string,
    stageReopenedTo?: string,
    role?: string,
    actorUserId?: number,
  ): Promise<void> {
    try {
      const caseNumber = incident.caseNumber || `INC-${incident.id}`;
      const categoryName = Array.isArray(incident.categories) && incident.categories.length > 0
        ? incident.categories.join(', ')
        : (incident.category || incident.type || 'Incident');
      const incidentLink = this.getIncidentDirectLink(incident.id);

      const stageLabel = stageReopenedTo === 'HEADS_UP'
        ? 'Heads-Up Notification'
        : stageReopenedTo === 'INITIAL_REPORT'
        ? 'Initial Incident Report'
        : 'Incident Investigation Report';

      const title = `Incident Reopened: ${caseNumber}`;
      const message = `Incident ${caseNumber} (${categoryName}) has been reopened by ${reopenedBy || 'Department User'} to ${stageLabel} stage. Reason: ${reason || 'N/A'}`;
      const emailSubject = `Incident Alert: ${caseNumber} - Reopened`;

      // Fetch configured members for Group 1 ONLY
      const groupUsers = await this.getIncidentNotificationGroupUsers('GROUP_1');
      if (!groupUsers || groupUsers.length === 0) {
        console.log('[Notification] No members configured in GROUP_1. Skipping incident reopened notification.');
        return;
      }

      console.log(`[Notification] Dispatching Incident REOPENED alert to ${groupUsers.length} member(s) in GROUP_1 for ${caseNumber}.`);

      const emailHtml = this.buildIncidentEmailHtml({
        title,
        message,
        caseNumber,
        stepName: `Reopened to ${stageLabel}`,
        categoryName,
        incidentId: incident.id,
        badgeText: 'Incident Reopened',
        badgeColor: '#fef3c7',
        badgeTextColor: '#92400e',
        borderColor: '#f59e0b',
        extraRows: [
          { label: 'Reopened By', value: reopenedBy || 'Department User' },
          { label: 'User Role', value: role || 'Department User / HSE' },
          { label: 'Reopened Stage', value: stageLabel },
          { label: 'Reopen Reason', value: reason || 'N/A' },
        ],
      });

      // Try generating PDF report attachment
      let pdfAttachments: Array<{ filename: string; content: Buffer; contentType: string }> | undefined = undefined;
      try {
        pdfAttachments = await this.generateIncidentPdfAttachment(incident.id, stageLabel, false, caseNumber);
        if (pdfAttachments && pdfAttachments.length > 0) {
          console.log(`[Notification] Generated PDF attachment for GROUP_1 reopen email: ${pdfAttachments[0].filename} (${pdfAttachments[0].content?.length || 0} bytes)`);
        }
      } catch (pdfErr) {
        console.error('[Notification] Error preparing reopen PDF attachment:', pdfErr);
      }

      for (const rx of groupUsers) {
        const uId = rx.userId !== null && rx.userId !== undefined ? Number(rx.userId) : undefined;

        // 1. In-App Notification
        if (uId !== undefined && !isNaN(uId)) {
          if (actorUserId && uId === actorUserId) {
            // Skip self in-app notification if actor is the same
          } else if (rx.isInAppEnabled !== false) {
            await this.notificationRepo.save(
              this.notificationRepo.create({
                receiverUserId: uId,
                senderUserId: actorUserId || undefined,
                notificationType: 'INCIDENT_REOPENED',
                permitStatus: stageLabel,
                title,
                message,
                isRead: 0,
                metadata: JSON.stringify({
                  module: 'INCIDENTS',
                  incidentId: incident.id,
                  caseNumber,
                  stageReopenedTo,
                  stageLabel,
                  reopenedBy,
                  role,
                  reason,
                  link: `/incident-management/details/${incident.id}`,
                }),
              }),
            ).catch(err => {
              console.error(`[Notification] Failed to save in-app reopen alert for GROUP_1 user ${uId}:`, err);
            });
          }
        }

        // 2. Email Dispatch
        if (rx.isEmailEnabled && rx.email) {
          await this.emailService.sendEmail({
            to: rx.email,
            subject: emailSubject,
            text: `${title}\n\n${message}\n\nCase Number: ${caseNumber}\nIncident Type: ${categoryName}\nReopened To: ${stageLabel}\nReopened By: ${reopenedBy}\nReason: ${reason}\n\nView Incident Details:\n${incidentLink}`,
            html: emailHtml,
            attachments: pdfAttachments,
          }).catch(err => {
            console.error(`[Notification] Failed to send reopen email to GROUP_1 member ${rx.email}:`, err);
          });
        }

        // 3. SMS Dispatch
        if (rx.isSmsEnabled && rx.phone) {
          const smsText = `${message} Link: ${incidentLink}`;
          await this.smsService.sendSms(rx.phone, smsText).catch(err => {
            console.error(`[Notification] Failed to send reopen SMS to GROUP_1 member ${rx.phone}:`, err);
          });
        }
      }
    } catch (err) {
      console.error('[Notification] Error in triggerIncidentReopenedNotification:', err);
    }
  }

  /**
   * Trigger notifications when Department / Department1 / Admin reviews & approves an incident step, returns it for revision, or closes the incident.
   * Rules:
   * 1. On Review OK / Approval of Step 1, Step 2, Step 3, or Closure: Dispatches to Notification Group 2 (GROUP_2) & contractor users.
   *    Attaches the incident report PDF to the email sent to GROUP 2.
   * 2. On Return to Revision: Dispatches to the contractor user(s) with revision reason.
   * 3. Direct Incident link is always included in the emails.
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
      const incidentLink = this.getIncidentDirectLink(incident.id);

      let message = '';
      let title = '';
      let notifType = 'INCIDENT_APPROVED';
      let emailSubject = '';

      if (isReturned) {
        message = `${approverName} has returned the ${stepName} report for revision on ${caseNumber}.${returnReason ? ` Reason: ${returnReason}` : ''}`;
        title = `${stepName} Returned for Revision`;
        notifType = 'INCIDENT_REVISION';
        emailSubject = `Incident Revision Required: ${caseNumber} - ${stepName}`;
      } else if (isClosed) {
        message = `${approverName} has approved and closed incident ${caseNumber} (${categoryName}).`;
        title = 'Incident Approved & Closed';
        notifType = 'INCIDENT_CLOSED';
        emailSubject = `Incident Closed: ${caseNumber}`;
      } else {
        message = `${approverName} has reviewed and approved the ${stepName} report for ${categoryName} with ${caseNumber}.`;
        title = `${stepName} Approved`;
        notifType = 'INCIDENT_APPROVED';
        emailSubject = `Incident Report Approved: ${caseNumber} - ${stepName}`;
      }

      const emailHtml = this.buildIncidentEmailHtml({
        title,
        message,
        caseNumber,
        stepName,
        categoryName,
        incidentId: incident.id,
        badgeText: isReturned ? 'Revision Required' : isClosed ? 'Incident Closed' : 'Review Approved',
        badgeColor: isReturned ? '#fef2f2' : isClosed ? '#e0e7ff' : '#dcfce7',
        badgeTextColor: isReturned ? '#991b1b' : isClosed ? '#3730a3' : '#166534',
        borderColor: isReturned ? '#ef4444' : isClosed ? '#6366f1' : '#10b981',
        extraRows: [
          { label: 'Reviewed / Signed By', value: approverName },
          ...(isReturned && returnReason ? [{ label: 'Return Reason', value: returnReason }] : []),
        ],
      });

      // Target group is GROUP_1 for return to review (revision), and GROUP_2 for review OK / approval / closure
      const targetGroupKey = isReturned ? 'GROUP_1' : 'GROUP_2';
      const targetGroupUsers = await this.getIncidentNotificationGroupUsers(targetGroupKey);
      console.log(`[Notification] Dispatching ${isReturned ? 'Return to Review' : 'Review OK / Approval'} (${stepName}) to ${targetGroupUsers.length} member(s) in ${targetGroupKey}.`);

      // Step 1: In-App notifications sent immediately to target group members
      for (const rx of targetGroupUsers) {
        const uId = rx.userId !== null && rx.userId !== undefined ? Number(rx.userId) : undefined;
        if (uId !== undefined && !isNaN(uId)) {
          if (actorUserId && uId === actorUserId) {
            // Skip in-app alert for self if actor is the same user
          } else {
            if (rx.isInAppEnabled !== false) {
              await this.notificationRepo.save(
                this.notificationRepo.create({
                  receiverUserId: uId,
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
                    link: `/incident-management/details/${incident.id}`,
                  }),
                }),
              ).catch(err => {
                console.error(`[Notification] Failed to save in-app alert for ${targetGroupKey} user ${uId}:`, err);
              });
            }
          }
        }
      }

      // Step 2: Generate PDF report attachment for emails (attached to Group 2 approval emails)
      let pdfAttachments: Array<{ filename: string; content: Buffer; contentType: string }> | undefined = undefined;
      if (!isReturned) {
        try {
          pdfAttachments = await this.generateIncidentPdfAttachment(incident.id, stepName, isClosed, caseNumber);
          if (pdfAttachments && pdfAttachments.length > 0) {
            console.log(`[Notification] Generated PDF attachment for ${targetGroupKey} email: ${pdfAttachments[0].filename} (${pdfAttachments[0].content?.length || 0} bytes)`);
          }
        } catch (pdfErr) {
          console.error(`[Notification] Error preparing ${targetGroupKey} PDF attachment:`, pdfErr);
        }
      }

      // Step 3: Dispatch Email and SMS to all configured members of the target group
      for (const rx of targetGroupUsers) {
        // Email Dispatch
        if (rx.isEmailEnabled && rx.email) {
          await this.emailService.sendEmail({
            to: rx.email,
            subject: emailSubject,
            text: `${title}\n\n${message}\n\nCase Number: ${caseNumber}\nIncident Type: ${categoryName}\nStep: ${stepName}\nReviewed By: ${approverName}${isReturned && returnReason ? `\nReason: ${returnReason}` : ''}\n\nView Incident Details:\n${incidentLink}`,
            html: emailHtml,
            attachments: pdfAttachments,
          }).catch(err => {
            console.error(`[Notification] Failed to send ${targetGroupKey} email to ${rx.email}:`, err);
          });
        }

        // SMS Dispatch
        if (rx.isSmsEnabled && rx.phone) {
          const smsText = `${message} Link: ${incidentLink}`;
          await this.smsService.sendSms(rx.phone, smsText).catch(err => {
            console.error(`[Notification] Failed to send ${targetGroupKey} SMS to ${rx.phone}:`, err);
          });
        }
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
