import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationSetting } from './entities/notification-setting.entity';
import { User } from '../users/entities/user.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Subcontractor } from '../subcontractor/entities/subcontractor.entity';
import { RequestEntity } from '../requests/entities/request.entity';
import { RedisCacheService } from '../redis/redid-cache.service';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(NotificationSetting)
    private readonly settingRepo: Repository<NotificationSetting>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(Subcontractor)
    private readonly subcontractorRepo: Repository<Subcontractor>,
    @InjectRepository(RequestEntity)
    private readonly requestRepo: Repository<RequestEntity>,
    private readonly redisCacheService: RedisCacheService,
  ) {}

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
    actionType: 'CREATED' | 'REASSIGNED' | 'CONTRACTOR_ACCEPTED' | 'CONTRACTOR_REJECTED' | 'RESOLVED' | 'CLOSED',
    actorUserId?: number,
    actorName?: string,
    actorRole?: string,
    extraRemarks?: string,
  ): Promise<void> {
    try {
      const contractorId = observation.assignedContractorId;
      const contractorName = (observation.assignedContractorName || '').trim();

      const actorDisplayName = actorName || (actorUserId ? await this.getUserDisplayName(actorUserId) : 'User');
      const recipients: User[] = [];

      let title = 'Safety Observation Update';
      let message = '';
      let notifType = `OBSERVATION_${actionType}`;

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

      for (const rx of uniqueRecipients) {
        if (actorUserId && rx.id === actorUserId) {
          continue;
        }

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
            }),
          }),
        );
      }
    } catch (error) {
      console.error('[Notification] Error in triggerObservationNotification:', error);
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
    const qb = this.notificationRepo.createQueryBuilder('n')
      .where('n.receiverUserId = :userId', { userId })
      .orderBy('n.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (module === 'observations') {
      qb.andWhere("(n.notificationType LIKE 'OBSERVATION%' OR n.metadata LIKE '%\"module\":\"OBSERVATIONS\"%')");
    } else if (module === 'permits') {
      qb.andWhere("(n.notificationType NOT LIKE 'OBSERVATION%' AND (n.metadata IS NULL OR n.metadata NOT LIKE '%\"module\":\"OBSERVATIONS\"%'))");
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
    const qb = this.notificationRepo.createQueryBuilder('n')
      .where('n.receiverUserId = :userId', { userId })
      .andWhere('n.isRead = 0');

    if (module === 'observations') {
      qb.andWhere("(n.notificationType LIKE 'OBSERVATION%' OR n.metadata LIKE '%\"module\":\"OBSERVATIONS\"%')");
    } else if (module === 'permits') {
      qb.andWhere("(n.notificationType NOT LIKE 'OBSERVATION%' AND (n.metadata IS NULL OR n.metadata NOT LIKE '%\"module\":\"OBSERVATIONS\"%'))");
    }

    return qb.getCount();
  }

  /**
   * Mark a single notification as read.
   */
  async markAsRead(notificationId: number, userId: number): Promise<boolean> {
    const result = await this.notificationRepo.update(
      { id: notificationId, receiverUserId: userId },
      { isRead: 1 },
    );
    return (result.affected ?? 0) > 0;
  }

  /**
   * Mark all notifications as read for a user.
   */
  async markAllAsRead(userId: number): Promise<boolean> {
    const result = await this.notificationRepo.update(
      { receiverUserId: userId, isRead: 0 },
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
