import { Injectable, NotFoundException, ForbiddenException, Logger, BadRequestException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, In, Between } from 'typeorm';
import { SafetyInspection, SafetyInspectionStatus } from '../entities/safety-inspection.entity';
import { SafetyInspectionItem, SafetyCheckItemStatus } from '../entities/safety-inspection-item.entity';
import { SafetyInspectionActionLog, InspectionActionType } from '../entities/safety-inspection-action-log.entity';
import { Observation } from '../../observations/entities/observation.entity';
import { CreateSafetyInspectionDto } from '../dtos/create-safety-inspection.dto';
import { UpdateSafetyInspectionDto } from '../dtos/update-safety-inspection.dto';

const STANDARD_CATEGORIES = [
  '1. Access / Exit',
  '2. Barriers / Signage / Shielding',
  '3. Housekeeping / Waste',
  '4. Noise / Dust / Fumes / Health Hazards',
  '5. Storage & Handling',
  '6. Electrical Hazards',
  '7. Working at Heights',
  '8. Lifting / Rigging',
  '9. Hot Works',
  '10. Mobile Elevating Work Equipment',
  '11. Lighting',
  '12. Documentation & Procedures',
  '13. Scaffold / Alloy Towers',
  '14. Slip / Trip Hazards',
  '15. PPE',
  '16. Tools & Machinery',
  '17. Environmental Hazards',
  '18. Emergency Equipment',
  '19. Excavation / Trenches',
  '20. Other',
];

@Injectable()
export class SafetyInspectionsService implements OnModuleInit {
  private readonly logger = new Logger(SafetyInspectionsService.name);

  constructor(
    @InjectRepository(SafetyInspection)
    private readonly inspectionRepo: Repository<SafetyInspection>,
    @InjectRepository(SafetyInspectionItem)
    private readonly itemRepo: Repository<SafetyInspectionItem>,
    @InjectRepository(SafetyInspectionActionLog)
    private readonly actionLogRepo: Repository<SafetyInspectionActionLog>,
    @InjectRepository(Observation)
    private readonly obsRepo: Repository<Observation>,
  ) {}

  /**
   * Auto-creates missing safety inspections tables in MySQL upon NestJS application startup
   */
  async onModuleInit() {
    try {
      await this.inspectionRepo.query(`
        CREATE TABLE IF NOT EXISTS \`safety_inspections\` (
          \`id\` INT AUTO_INCREMENT PRIMARY KEY,
          \`inspection_number\` VARCHAR(100) NOT NULL UNIQUE,
          \`project_name\` VARCHAR(255) NULL,
          \`project_id\` INT NULL,
          \`project_no\` VARCHAR(100) NULL,
          \`building_id\` INT NULL,
          \`building_name\` VARCHAR(255) NULL,
          \`floor_level\` VARCHAR(150) NULL,
          \`specific_location\` TEXT NULL,
          \`selected_rooms\` JSON NULL,
          \`selected_zones\` JSON NULL,
          \`inspection_date\` DATE NULL,
          \`performed_by\` JSON NULL,
          \`participants\` JSON NULL,
          \`status\` ENUM('DRAFT', 'IN_PROGRESS', 'CLOSED', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'IN_PROGRESS',
          \`is_completed\` TINYINT(1) NOT NULL DEFAULT 0,
          \`score\` INT NULL DEFAULT 100,
          \`summary_counts\` JSON NULL,
          \`created_by_user_id\` INT NULL,
          \`created_by_user_name\` VARCHAR(255) NULL,
          \`created_by_role\` VARCHAR(100) NULL,
          \`modified_by_user_name\` VARCHAR(255) NULL,
          \`created_time\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_time\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      // Ensure status column enum includes CLOSED
      await this.inspectionRepo.query(`
        ALTER TABLE \`safety_inspections\` 
        MODIFY COLUMN \`status\` ENUM('DRAFT', 'IN_PROGRESS', 'CLOSED', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'IN_PROGRESS';
      `);

      await this.itemRepo.query(`
        CREATE TABLE IF NOT EXISTS \`safety_inspection_items\` (
          \`id\` INT AUTO_INCREMENT PRIMARY KEY,
          \`inspection_id\` INT NOT NULL,
          \`item_index\` INT NOT NULL,
          \`category_name\` VARCHAR(255) NOT NULL,
          \`status\` ENUM('na', 'green', 'yellow', 'red') NOT NULL DEFAULT 'na',
          \`comment\` TEXT NULL,
          \`comment_author\` VARCHAR(255) NULL,
          \`comment_date\` DATETIME NULL,
          \`photos\` JSON NULL,
          \`issues\` JSON NULL,
          \`created_time\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_time\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT \`fk_si_item_inspection\` FOREIGN KEY (\`inspection_id\`) REFERENCES \`safety_inspections\` (\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      await this.inspectionRepo.query(`
        CREATE TABLE IF NOT EXISTS \`safety_inspection_action_logs\` (
          \`id\` INT AUTO_INCREMENT PRIMARY KEY,
          \`inspection_id\` INT NOT NULL,
          \`action_type\` VARCHAR(50) NOT NULL,
          \`performed_by_user_id\` INT NULL,
          \`performed_by_user_name\` VARCHAR(255) NOT NULL,
          \`performed_by_user_role\` VARCHAR(100) NULL,
          \`remarks\` TEXT NULL,
          \`timestamp\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT \`fk_si_action_log_inspection\` FOREIGN KEY (\`inspection_id\`) REFERENCES \`safety_inspections\` (\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      this.logger.log('✅ Safety Inspections tables auto-initialization check completed successfully.');
      await this.syncAllPendingInspections();
    } catch (err: any) {
      this.logger.warn(`⚠️ Safety Inspections tables auto-initialization note: ${err?.message || err}`);
    }
  }

  /**
   * Checks attached observations for inspections that are not marked closed.
   * If all linked observations are CLOSED, auto-updates the inspection status to CLOSED in DB and in memory.
   */
  async syncInspectionStatusWithObservations(inspections: SafetyInspection[]): Promise<void> {
    if (!inspections || inspections.length === 0) return;

    for (const insp of inspections) {
      if (insp.status === SafetyInspectionStatus.CLOSED || (insp.status as any) === 'COMPLETED' || insp.isCompleted) {
        continue;
      }

      const allIssues: any[] = [];
      for (const item of (insp.items || [])) {
        let rawIssues: any[] = [];
        if (Array.isArray(item.issues)) {
          rawIssues = item.issues;
        } else if (typeof item.issues === 'string') {
          try {
            const parsed = JSON.parse(item.issues);
            rawIssues = Array.isArray(parsed) ? parsed : [item.issues];
          } catch {
            rawIssues = [];
          }
        }
        allIssues.push(...rawIssues);
      }

      if (allIssues.length === 0) {
        insp.status = SafetyInspectionStatus.CLOSED;
        insp.isCompleted = true;
        await this.inspectionRepo.update(insp.id, {
          status: SafetyInspectionStatus.CLOSED,
          isCompleted: true,
        });

        const lastLog = await this.actionLogRepo.findOne({
          where: { inspectionId: insp.id },
          order: { id: 'DESC' },
        });
        if (!lastLog || lastLog.actionType !== InspectionActionType.CLOSED) {
          const closeLog = this.actionLogRepo.create({
            inspectionId: insp.id,
            actionType: InspectionActionType.CLOSED,
            performedByUserId: insp.createdByUserId || undefined,
            performedByUserName: insp.createdByUserName || 'Safety Inspector',
            performedByUserRole: insp.createdByRole || 'DEPARTMENT',
            remarks: 'Inspection automatically closed (no attached observations)',
          });
          await this.actionLogRepo.save(closeLog);
        }

        this.logger.log(`Auto-synced Safety Inspection ${insp.inspectionNumber || insp.id} to CLOSED (no attached observations)`);
        continue;
      }

      const obsIds: number[] = [];
      const obsNumbers: string[] = [];

      for (const iss of allIssues) {
        if (!iss) continue;
        const oId = iss.observationId || (typeof iss.id === 'number' ? iss.id : (!isNaN(Number(iss.id)) ? Number(iss.id) : null));
        if (oId) obsIds.push(Number(oId));
        const oNum = iss.observationNumber || (typeof iss.id === 'string' && iss.id.startsWith('SO-') ? iss.id : null);
        if (oNum) obsNumbers.push(String(oNum).trim());
      }

      if (obsIds.length === 0 && obsNumbers.length === 0) {
        continue;
      }

      try {
        const whereConditions: any[] = [];
        if (obsIds.length > 0) whereConditions.push({ id: In(obsIds) });
        if (obsNumbers.length > 0) whereConditions.push({ observationNumber: In(obsNumbers) });

        const foundObs = await this.obsRepo.find({
          where: whereConditions,
          select: { id: true, observationNumber: true, status: true },
        });

        if (foundObs.length > 0) {
          const allClosed = foundObs.every((o) => String(o.status).toUpperCase() === 'CLOSED');
          if (allClosed) {
            insp.status = SafetyInspectionStatus.CLOSED;
            insp.isCompleted = true;
            await this.inspectionRepo.update(insp.id, {
              status: SafetyInspectionStatus.CLOSED,
              isCompleted: true,
            });

            const lastLog = await this.actionLogRepo.findOne({
              where: { inspectionId: insp.id },
              order: { id: 'DESC' },
            });
            if (!lastLog || lastLog.actionType !== InspectionActionType.CLOSED) {
              const closeLog = this.actionLogRepo.create({
                inspectionId: insp.id,
                actionType: InspectionActionType.CLOSED,
                performedByUserId: insp.createdByUserId || undefined,
                performedByUserName: 'System Auto-sync',
                performedByUserRole: 'SYSTEM',
                remarks: 'Inspection automatically closed (all attached observations resolved & closed)',
              });
              await this.actionLogRepo.save(closeLog);
            }

            this.logger.log(`Auto-synced Safety Inspection ${insp.inspectionNumber || insp.id} to CLOSED (all observations closed)`);
          }
        }
      } catch (err: any) {
        this.logger.warn(`Failed to sync observation statuses for inspection ${insp.id}: ${err?.message || err}`);
      }
    }
  }

  async syncAllPendingInspections(): Promise<void> {
    try {
      const openInspections = await this.inspectionRepo.find({
        where: [
          { status: SafetyInspectionStatus.IN_PROGRESS },
          { status: SafetyInspectionStatus.DRAFT },
        ],
        relations: { items: true },
      });

      if (openInspections.length > 0) {
        await this.syncInspectionStatusWithObservations(openInspections);
      }
    } catch (err: any) {
      this.logger.warn(`syncAllPendingInspections note: ${err?.message || err}`);
    }
  }

  /**
   * Called when an observation is closed in ObservationsService.
   * Finds any open safety inspections that have this observation attached.
   * If all attached observations for that inspection are now closed,
   * marks the inspection as CLOSED and stores a CLOSED audit log.
   */
  async onObservationClosed(
    obsId: number,
    obsNumber?: string,
    user?: { id?: number; name?: string; role?: string; remarks?: string },
  ): Promise<void> {
    try {
      const openInspections = await this.inspectionRepo.find({
        where: [
          { status: SafetyInspectionStatus.IN_PROGRESS },
          { status: SafetyInspectionStatus.DRAFT },
        ],
        relations: { items: true },
      });

      if (!openInspections || openInspections.length === 0) return;

      for (const insp of openInspections) {
        let isLinked = false;
        const allIssues: any[] = [];

        for (const item of (insp.items || [])) {
          let rawIssues: any[] = [];
          if (Array.isArray(item.issues)) {
            rawIssues = item.issues;
          } else if (typeof item.issues === 'string') {
            try {
              const parsed = JSON.parse(item.issues);
              rawIssues = Array.isArray(parsed) ? parsed : [item.issues];
            } catch {
              rawIssues = [];
            }
          }

          for (const iss of rawIssues) {
            if (!iss) continue;
            allIssues.push(iss);
            const issId = iss.observationId || (typeof iss.id === 'number' ? iss.id : (!isNaN(Number(iss.id)) ? Number(iss.id) : null));
            const issNum = iss.observationNumber || (typeof iss.id === 'string' && iss.id.startsWith('SO-') ? iss.id : null);
            if ((issId && Number(issId) === Number(obsId)) || (obsNumber && issNum && String(issNum).trim() === String(obsNumber).trim())) {
              isLinked = true;
            }
          }
        }

        if (!isLinked) continue;

        const obsIds: number[] = [];
        const obsNumbers: string[] = [];
        for (const iss of allIssues) {
          const oId = iss.observationId || (typeof iss.id === 'number' ? iss.id : (!isNaN(Number(iss.id)) ? Number(iss.id) : null));
          if (oId) obsIds.push(Number(oId));
          const oNum = iss.observationNumber || (typeof iss.id === 'string' && iss.id.startsWith('SO-') ? iss.id : null);
          if (oNum) obsNumbers.push(String(oNum).trim());
        }

        if (obsIds.length === 0 && obsNumbers.length === 0) {
          continue;
        }

        const whereConds: any[] = [];
        if (obsIds.length > 0) whereConds.push({ id: In(obsIds) });
        if (obsNumbers.length > 0) whereConds.push({ observationNumber: In(obsNumbers) });

        const foundObs = await this.obsRepo.find({
          where: whereConds,
          select: { id: true, observationNumber: true, status: true },
        });

        // The observation `obsId` was just closed in this operation
        const allClosed = foundObs.length > 0 && foundObs.every((o) => {
          if (Number(o.id) === Number(obsId) || (obsNumber && o.observationNumber === obsNumber)) {
            return true;
          }
          return String(o.status).toUpperCase() === 'CLOSED';
        });

        if (allClosed) {
          insp.status = SafetyInspectionStatus.CLOSED;
          insp.isCompleted = true;
          await this.inspectionRepo.update(insp.id, {
            status: SafetyInspectionStatus.CLOSED,
            isCompleted: true,
          });

          const lastLog = await this.actionLogRepo.findOne({
            where: { inspectionId: insp.id },
            order: { id: 'DESC' },
          });

          if (!lastLog || lastLog.actionType !== InspectionActionType.CLOSED) {
            const closeLog = this.actionLogRepo.create({
              inspectionId: insp.id,
              actionType: InspectionActionType.CLOSED,
              performedByUserId: user?.id || undefined,
              performedByUserName: user?.name || 'Department / HSE',
              performedByUserRole: user?.role || 'DEPARTMENT',
              remarks: user?.remarks
                ? `Inspection closed (Observation ${obsNumber || ('#' + obsId)} closed: ${user.remarks})`
                : `Inspection closed automatically (all attached observations resolved and closed)`,
            });
            await this.actionLogRepo.save(closeLog);
          }

          this.logger.log(`Safety Inspection ${insp.inspectionNumber || insp.id} marked as CLOSED after closing observation ${obsNumber || obsId}`);
        }
      }
    } catch (err: any) {
      this.logger.warn(`Failed in onObservationClosed for obs ${obsId}: ${err?.message || err}`);
    }
  }

  /**
   * Generate next sequential inspection number (e.g. SI-2026-0001)
   */
  async generateInspectionNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.inspectionRepo.count();
    const nextSeq = String(count + 1).padStart(4, '0');
    return `SI-${year}-${nextSeq}`;
  }

  /**
   * Helper to safely parse JSON or array
   */
  private parseJsonField<T>(value: any, fallback: T): T {
    if (value === undefined || value === null) return fallback;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return fallback;
      }
    }
    return value as T;
  }

  /**
   * Create a new Safety Inspection record with all 21 checklist items
   */
  async create(dto: CreateSafetyInspectionDto, user?: any): Promise<SafetyInspection> {
    const inspectionNumber = await this.generateInspectionNumber();

    const selectedRooms = this.parseJsonField<string[]>(dto.selectedRooms, []);
    const selectedZones = this.parseJsonField<any>(dto.selectedZones, null);
    const performedBy = this.parseJsonField<any[]>(dto.performedBy, []);
    const participants = this.parseJsonField<any[]>(dto.participants, []);
    const rawChecklist = this.parseJsonField<any[]>(dto.checklistItems, []);

    // Calculate item counts & score
    let greenCount = 0;
    let yellowCount = 0;
    let redCount = 0;
    let naCount = 0;

    const checklistMap = new Map<number, any>();
    if (Array.isArray(rawChecklist)) {
      rawChecklist.forEach((item, index) => {
        const idx = item.itemIndex !== undefined ? Number(item.itemIndex) : index + 1;
        checklistMap.set(idx, item);
      });
    }

    const itemsToInsert: Partial<SafetyInspectionItem>[] = [];

    for (let i = 1; i <= STANDARD_CATEGORIES.length; i++) {
      const categoryName = STANDARD_CATEGORIES[i - 1] || `Item ${i}`;
      const itemData = checklistMap.get(i) || {};
      const statusStr = (itemData.status || 'na').toLowerCase();
      let status = SafetyCheckItemStatus.NA;
      if (statusStr === 'green') {
        status = SafetyCheckItemStatus.GREEN;
        greenCount++;
      } else if (statusStr === 'yellow') {
        status = SafetyCheckItemStatus.YELLOW;
        yellowCount++;
      } else if (statusStr === 'red') {
        status = SafetyCheckItemStatus.RED;
        redCount++;
      } else {
        naCount++;
      }

      itemsToInsert.push({
        itemIndex: i,
        categoryName: itemData.categoryName || categoryName,
        status,
        comment: itemData.comment || null,
        commentAuthor: itemData.commentAuthor || (user?.name || dto.createdByUserName || 'Inspector'),
        commentDate: itemData.comment ? new Date() : undefined,
        photos: itemData.photos ? (Array.isArray(itemData.photos) ? itemData.photos : [itemData.photos]) : null,
        issues: itemData.issues ? (Array.isArray(itemData.issues) ? itemData.issues : [itemData.issues]) : null,
      });
    }

    const assessedCount = greenCount + yellowCount + redCount;
    let score = 100;
    if (assessedCount > 0) {
      const calculated = Math.max(0, Math.round(((greenCount * 1.0 + yellowCount * 0.5) / assessedCount) * 100));
      score = calculated;
    }

    let totalAttachedSOs = 0;
    for (const item of itemsToInsert) {
      let rawIssues: any[] = [];
      if (Array.isArray(item.issues)) {
        rawIssues = item.issues;
      } else if (typeof item.issues === 'string') {
        try {
          const parsed = JSON.parse(item.issues);
          rawIssues = Array.isArray(parsed) ? parsed : [];
        } catch {
          rawIssues = [];
        }
      }
      const validSOs = rawIssues.filter((iss: any) => iss && (iss.observationId || iss.observationNumber || iss.id));
      totalAttachedSOs += validSOs.length;
    }

    // Rule: if no SO attached to inspection -> CLOSED; if SO attached -> IN_PROGRESS
    const isClosed = totalAttachedSOs === 0;

    const inspection = this.inspectionRepo.create({
      inspectionNumber,
      projectName: dto.projectName || 'M3SOUTH',
      projectId: dto.projectId || 1,
      projectNo: dto.projectNo || '063205-010',
      buildingId: dto.buildingId,
      buildingName: dto.buildingName,
      floorLevel: dto.floorLevel,
      specificLocation: dto.specificLocation,
      selectedRooms,
      selectedZones,
      inspectionDate: dto.inspectionDate || new Date().toISOString().split('T')[0],
      performedBy,
      participants,
      status: isClosed ? SafetyInspectionStatus.CLOSED : SafetyInspectionStatus.IN_PROGRESS,
      isCompleted: isClosed,
      score: dto.score !== undefined ? Number(dto.score) : score,
      summaryCounts: { green: greenCount, yellow: yellowCount, red: redCount, na: naCount },
      createdByUserId: user?.id || dto.createdByUserId,
      createdByUserName: user?.name || dto.createdByUserName || 'Safety Inspector',
      createdByRole: user?.role || dto.createdByRole || 'DEPARTMENT',
      modifiedByUserName: user?.name || dto.createdByUserName || 'Safety Inspector',
    });

    const savedInspection = await this.inspectionRepo.save(inspection);

    // Save checklist items with foreign key
    const itemEntities = itemsToInsert.map((item) =>
      this.itemRepo.create({
        ...item,
        inspectionId: savedInspection.id,
      }),
    );
    savedInspection.items = await this.itemRepo.save(itemEntities);

    try {
      const actionLog = this.actionLogRepo.create({
        inspectionId: savedInspection.id,
        actionType: InspectionActionType.CREATED,
        performedByUserId: user?.id || dto.createdByUserId,
        performedByUserName: user?.name || dto.createdByUserName || 'Safety Inspector',
        performedByUserRole: user?.role || dto.createdByRole || 'DEPARTMENT',
        remarks: dto.remarks || 'Safety inspection record created',
      });
      await this.actionLogRepo.save(actionLog);

      if (isClosed) {
        const closedLog = this.actionLogRepo.create({
          inspectionId: savedInspection.id,
          actionType: InspectionActionType.CLOSED,
          performedByUserId: user?.id || dto.createdByUserId,
          performedByUserName: user?.name || dto.createdByUserName || 'Safety Inspector',
          performedByUserRole: user?.role || dto.createdByRole || 'DEPARTMENT',
          remarks: 'Inspection closed upon creation (no observations required)',
        });
        await this.actionLogRepo.save(closedLog);
      }
    } catch (logErr: any) {
      this.logger.warn(`Failed to log creation for inspection ${savedInspection.id}: ${logErr?.message}`);
    }

    this.logger.log(`Created Safety Inspection ${savedInspection.inspectionNumber} (ID: ${savedInspection.id})`);
    return savedInspection;
  }

  /**
   * List safety inspections with search, filtering, and full pagination
   */
  async findAll(query: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
    building?: string;
    floor?: string;
    room?: string;
    contractor?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.max(1, Math.min(100, query.limit || 10));
    const skip = (page - 1) * limit;

    const qb = this.inspectionRepo.createQueryBuilder('si')
      .leftJoinAndSelect('si.items', 'items')
      .orderBy('si.createdTime', 'DESC');

    if (query.status && query.status.trim() !== '') {
      const statusUpper = query.status.toUpperCase();
      qb.andWhere('si.status = :status', { status: statusUpper });
    }

    if (query.building && query.building.trim() !== '') {
      const bTerm = `%${query.building.trim()}%`;
      const bId = isNaN(Number(query.building)) ? -1 : Number(query.building);
      qb.andWhere('(si.buildingName LIKE :bTerm OR si.buildingId = :bId)', {
        bTerm,
        bId,
      });
    }

    if (query.floor && query.floor.trim() !== '') {
      qb.andWhere('si.floorLevel LIKE :floor', {
        floor: `%${query.floor.trim()}%`,
      });
    }

    if (query.room && query.room.trim() !== '') {
      const roomTerm = `%${query.room.trim()}%`;
      qb.andWhere('(CAST(si.selectedRooms AS CHAR) LIKE :roomTerm OR si.specificLocation LIKE :roomTerm)', {
        roomTerm,
      });
    }

    if (query.search && query.search.trim() !== '') {
      const term = `%${query.search.trim()}%`;
      qb.andWhere(
        '(si.inspectionNumber LIKE :term OR si.buildingName LIKE :term OR si.floorLevel LIKE :term OR si.specificLocation LIKE :term OR si.projectName LIKE :term OR si.createdByUserName LIKE :term)',
        { term },
      );
    }

    if (query.contractor && query.contractor.trim() !== '') {
      const contractorTerm = `%${query.contractor.trim()}%`;
      qb.andWhere('(si.participants LIKE :cTerm OR si.performedBy LIKE :cTerm)', { cTerm: contractorTerm });
    }

    if (query.dateFrom) {
      qb.andWhere('si.inspectionDate >= :dateFrom', { dateFrom: query.dateFrom });
    }

    if (query.dateTo) {
      qb.andWhere('si.inspectionDate <= :dateTo', { dateTo: query.dateTo });
    }

    if (query.status) {
      await this.syncAllPendingInspections();
    }

    const [inspections, total] = await qb.skip(skip).take(limit).getManyAndCount();

    // Auto-sync inspection statuses based on linked observation statuses
    await this.syncInspectionStatusWithObservations(inspections);

    // Ensure items in each inspection are ordered by itemIndex
    inspections.forEach((insp) => {
      if (insp.items) {
        insp.items.sort((a, b) => a.itemIndex - b.itemIndex);
      }
    });

    const totalPages = Math.ceil(total / limit);

    return {
      inspections,
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    };
  }

  /**
   * Get single inspection details by ID or inspectionNumber
   */
  async findOne(idOrNumber: string | number): Promise<SafetyInspection> {
    const isNum = !isNaN(Number(idOrNumber));
    let inspection: SafetyInspection | null = null;

    if (isNum) {
      inspection = await this.inspectionRepo.findOne({
        where: { id: Number(idOrNumber) },
        relations: { items: true },
      });
    }

    if (!inspection) {
      inspection = await this.inspectionRepo.findOne({
        where: { inspectionNumber: String(idOrNumber) },
        relations: { items: true },
      });
    }

    if (!inspection) {
      throw new NotFoundException(`Safety Inspection "${idOrNumber}" not found`);
    }

    if (inspection.items) {
      inspection.items.sort((a, b) => a.itemIndex - b.itemIndex);
    }

    await this.syncInspectionStatusWithObservations([inspection]);

    let history = await this.actionLogRepo.find({
      where: { inspectionId: inspection.id },
      order: { id: 'ASC' },
    });

    if (history.length === 0 && inspection.createdTime) {
      const initialLog = this.actionLogRepo.create({
        inspectionId: inspection.id,
        actionType: InspectionActionType.CREATED,
        performedByUserId: inspection.createdByUserId,
        performedByUserName: inspection.createdByUserName || 'Safety Inspector',
        performedByUserRole: inspection.createdByRole || 'DEPARTMENT',
        remarks: 'Safety inspection record created',
        timestamp: inspection.createdTime,
      });
      await this.actionLogRepo.save(initialLog);
      history.push(initialLog);
    }

    const isCurrentlyClosed = inspection.status === SafetyInspectionStatus.CLOSED || (inspection.status as any) === 'COMPLETED' || inspection.isCompleted;
    const hasClosedLog = history.some((l) => l.actionType === InspectionActionType.CLOSED);
    if (isCurrentlyClosed && !hasClosedLog) {
      const closeLog = this.actionLogRepo.create({
        inspectionId: inspection.id,
        actionType: InspectionActionType.CLOSED,
        performedByUserId: inspection.createdByUserId || undefined,
        performedByUserName: inspection.modifiedByUserName || inspection.createdByUserName || 'Safety Inspector',
        performedByUserRole: inspection.createdByRole || 'DEPARTMENT',
        remarks: 'Safety inspection closed',
        timestamp: inspection.updatedTime || new Date(),
      });
      await this.actionLogRepo.save(closeLog);
      history.push(closeLog);
    }

    inspection.history = history;

    return inspection;
  }

  /**
   * Update an existing safety inspection
   */
  async update(id: number, dto: UpdateSafetyInspectionDto, user?: any): Promise<SafetyInspection> {
    const inspection = await this.findOne(id);
    const wasClosed = inspection.isCompleted || inspection.status === SafetyInspectionStatus.CLOSED;

    if (dto.projectName !== undefined) inspection.projectName = dto.projectName;
    if (dto.projectNo !== undefined) inspection.projectNo = dto.projectNo;
    if (dto.buildingId !== undefined) inspection.buildingId = dto.buildingId;
    if (dto.buildingName !== undefined) inspection.buildingName = dto.buildingName;
    if (dto.floorLevel !== undefined) inspection.floorLevel = dto.floorLevel;
    if (dto.specificLocation !== undefined) inspection.specificLocation = dto.specificLocation;
    if (dto.inspectionDate !== undefined) inspection.inspectionDate = dto.inspectionDate;
    if (dto.score !== undefined) inspection.score = dto.score;

    if (dto.selectedRooms !== undefined) inspection.selectedRooms = this.parseJsonField(dto.selectedRooms, inspection.selectedRooms);
    if (dto.selectedZones !== undefined) inspection.selectedZones = this.parseJsonField(dto.selectedZones, inspection.selectedZones);
    if (dto.performedBy !== undefined) inspection.performedBy = this.parseJsonField(dto.performedBy, inspection.performedBy);
    if (dto.participants !== undefined) inspection.participants = this.parseJsonField(dto.participants, inspection.participants);

    if (dto.isCompleted !== undefined) {
      inspection.isCompleted = dto.isCompleted === true || dto.isCompleted === 'true' || dto.isCompleted === 1;
      inspection.status = inspection.isCompleted ? SafetyInspectionStatus.CLOSED : SafetyInspectionStatus.IN_PROGRESS;
    } else if (dto.status !== undefined) {
      const s = String(dto.status).toUpperCase();
      if (s === 'COMPLETED' || s === 'CLOSED') {
        inspection.status = SafetyInspectionStatus.CLOSED;
        inspection.isCompleted = true;
      } else {
        inspection.status = s as SafetyInspectionStatus;
        inspection.isCompleted = false;
      }
    }

    if (user?.name) {
      inspection.modifiedByUserName = user.name;
    }

    if (dto.checklistItems) {
      const rawChecklist = this.parseJsonField<any[]>(dto.checklistItems, []);
      let greenCount = 0;
      let yellowCount = 0;
      let redCount = 0;
      let naCount = 0;

      for (const itemData of rawChecklist) {
        const itemIdx = Number(itemData.itemIndex);
        let existingItem = inspection.items.find((i) => i.itemIndex === itemIdx);
        const statusStr = (itemData.status || 'na').toLowerCase();
        let status = SafetyCheckItemStatus.NA;
        if (statusStr === 'green') {
          status = SafetyCheckItemStatus.GREEN;
          greenCount++;
        } else if (statusStr === 'yellow') {
          status = SafetyCheckItemStatus.YELLOW;
          yellowCount++;
        } else if (statusStr === 'red') {
          status = SafetyCheckItemStatus.RED;
          redCount++;
        } else {
          naCount++;
        }

        if (existingItem) {
          existingItem.status = status;
          if (itemData.comment !== undefined) {
            existingItem.comment = itemData.comment;
            existingItem.commentAuthor = itemData.commentAuthor || user?.name || existingItem.commentAuthor;
            existingItem.commentDate = new Date();
          }
          if (itemData.photos !== undefined) existingItem.photos = itemData.photos;
          if (itemData.issues !== undefined) existingItem.issues = itemData.issues;
          await this.itemRepo.save(existingItem);
        } else {
          const newItem = this.itemRepo.create({
            inspectionId: inspection.id,
            itemIndex: itemIdx,
            categoryName: itemData.categoryName || STANDARD_CATEGORIES[itemIdx - 1] || `Item ${itemIdx}`,
            status,
            comment: itemData.comment,
            commentAuthor: itemData.commentAuthor || user?.name,
            commentDate: itemData.comment ? new Date() : undefined,
            photos: itemData.photos,
            issues: itemData.issues,
          });
          await this.itemRepo.save(newItem);
        }
      }

      inspection.summaryCounts = { green: greenCount, yellow: yellowCount, red: redCount, na: naCount };
      const assessedCount = greenCount + yellowCount + redCount;
      if (assessedCount > 0) {
        inspection.score = Math.max(0, Math.round(((greenCount * 1.0 + yellowCount * 0.5) / assessedCount) * 100));
      }
    }

    const reqStatusUpper = String(dto.status || '').toUpperCase();
    const isExplicitClose =
      dto.actionType === InspectionActionType.CLOSED ||
      reqStatusUpper === 'CLOSED' ||
      reqStatusUpper === 'COMPLETED' ||
      dto.isCompleted === true ||
      dto.isCompleted === 'true' ||
      dto.isCompleted === 1;

    const isExplicitReopen =
      dto.actionType === InspectionActionType.REOPENED ||
      reqStatusUpper === 'IN_PROGRESS' ||
      dto.isCompleted === false ||
      dto.isCompleted === 'false' ||
      dto.isCompleted === 0;

    if (isExplicitClose) {
      inspection.status = SafetyInspectionStatus.CLOSED;
      inspection.isCompleted = true;
    } else if (isExplicitReopen) {
      inspection.status = SafetyInspectionStatus.IN_PROGRESS;
      inspection.isCompleted = false;
    } else if (dto.checklistItems !== undefined) {
      let totalAttachedSOs = 0;
      const allItems = await this.itemRepo.find({ where: { inspectionId: inspection.id } });
      const obsIds: number[] = [];
      const obsNumbers: string[] = [];

      for (const itm of allItems) {
        let rawIssues: any[] = [];
        if (Array.isArray(itm.issues)) {
          rawIssues = itm.issues;
        } else if (typeof itm.issues === 'string') {
          try {
            const parsed = JSON.parse(itm.issues);
            rawIssues = Array.isArray(parsed) ? parsed : [];
          } catch {
            rawIssues = [];
          }
        }
        const validSOs = rawIssues.filter((iss: any) => iss && (iss.observationId || iss.observationNumber || iss.id));
        totalAttachedSOs += validSOs.length;
        for (const iss of validSOs) {
          const oId = iss.observationId || (typeof iss.id === 'number' ? iss.id : (!isNaN(Number(iss.id)) ? Number(iss.id) : null));
          if (oId) obsIds.push(Number(oId));
          const oNum = iss.observationNumber || (typeof iss.id === 'string' && iss.id.startsWith('SO-') ? iss.id : null);
          if (oNum) obsNumbers.push(String(oNum).trim());
        }
      }

      if (totalAttachedSOs === 0) {
        inspection.status = SafetyInspectionStatus.CLOSED;
        inspection.isCompleted = true;
      } else {
        let hasOpenSO = true;
        try {
          const whereConds: any[] = [];
          if (obsIds.length > 0) whereConds.push({ id: In(obsIds) });
          if (obsNumbers.length > 0) whereConds.push({ observationNumber: In(obsNumbers) });
          if (whereConds.length > 0) {
            const foundObs = await this.obsRepo.find({
              where: whereConds,
              select: { id: true, observationNumber: true, status: true },
            });
            if (foundObs.length > 0 && foundObs.every((o) => String(o.status).toUpperCase() === 'CLOSED')) {
              hasOpenSO = false;
            }
          }
        } catch {}

        if (hasOpenSO) {
          inspection.status = SafetyInspectionStatus.IN_PROGRESS;
          inspection.isCompleted = false;
        } else {
          inspection.status = SafetyInspectionStatus.CLOSED;
          inspection.isCompleted = true;
        }
      }
    }

    await this.inspectionRepo.save(inspection);

    try {
      let actionType = dto.actionType;
      const lastLog = await this.actionLogRepo.findOne({
        where: { inspectionId: inspection.id },
        order: { id: 'DESC' },
      });
      const lastAction = lastLog?.actionType;

      if (!actionType) {
        if (inspection.status === SafetyInspectionStatus.CLOSED || inspection.isCompleted) {
          if (lastAction !== InspectionActionType.CLOSED) {
            actionType = InspectionActionType.CLOSED;
          } else {
            actionType = InspectionActionType.UPDATED;
          }
        } else if (inspection.status === SafetyInspectionStatus.IN_PROGRESS || !inspection.isCompleted) {
          if (lastAction === InspectionActionType.CLOSED) {
            actionType = InspectionActionType.REOPENED;
          } else {
            actionType = InspectionActionType.UPDATED;
          }
        } else {
          actionType = InspectionActionType.UPDATED;
        }
      }

      const shouldLog =
        actionType === InspectionActionType.CLOSED
          ? (lastAction !== InspectionActionType.CLOSED || dto.actionType === InspectionActionType.CLOSED)
          : true;

      if (shouldLog) {
        const log = this.actionLogRepo.create({
          inspectionId: inspection.id,
          actionType: actionType as any,
          performedByUserId: user?.id || dto.modifiedByUserId || dto.createdByUserId,
          performedByUserName: user?.name || dto.modifiedByUserName || dto.createdByUserName || 'Safety Inspector',
          performedByUserRole: user?.role || dto.modifiedByUserRole || dto.createdByRole || 'DEPARTMENT',
          remarks: dto.remarks || (
            actionType === InspectionActionType.REOPENED
              ? 'Safety inspection reopened'
              : actionType === InspectionActionType.CLOSED
              ? 'Safety inspection marked as closed'
              : 'Safety inspection details updated'
          ),
        });
        await this.actionLogRepo.save(log);
      }
    } catch (logErr: any) {
      this.logger.warn(`Failed to log action for inspection ${inspection.id}: ${logErr?.message}`);
    }

    return await this.findOne(id);
  }

  /**
   * Delete a safety inspection (Strictly Admin / Superadmin only!)
   */
  async deleteInspection(id: number, requestingUserId?: number, requestingUserRole?: string) {
    const roleUpper = (requestingUserRole || '').toUpperCase();
    const isAdmin = roleUpper.includes('ADMIN') || roleUpper.includes('SUPERADMIN');

    if (!isAdmin) {
      throw new ForbiddenException('Access denied: Only Admins and Superadmins have permission to delete safety inspection records.');
    }

    const inspection = await this.inspectionRepo.findOne({ where: { id } });
    if (!inspection) {
      throw new NotFoundException(`Safety Inspection with ID ${id} not found`);
    }

    // Delete items first
    await this.itemRepo.delete({ inspectionId: id });
    // Delete inspection
    await this.inspectionRepo.delete(id);

    this.logger.log(`Safety Inspection ${inspection.inspectionNumber} (ID: ${id}) deleted by user ${requestingUserId || 'unknown'} (${requestingUserRole})`);

    return {
      statusCode: 200,
      message: `Safety inspection ${inspection.inspectionNumber || id} deleted successfully`,
      id,
    };
  }

  /**
   * Aggregated Dashboard Statistics
   */
  async getStats() {
    const totalInspections = await this.inspectionRepo.count();

    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const thisWeekCount = await this.inspectionRepo
      .createQueryBuilder('si')
      .where('si.createdTime >= :startOfWeek', { startOfWeek })
      .getCount();

    const thisMonthCount = await this.inspectionRepo
      .createQueryBuilder('si')
      .where('si.createdTime >= :startOfMonth', { startOfMonth })
      .getCount();

    const lastWeekStart = new Date(startOfWeek);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekCount = await this.inspectionRepo
      .createQueryBuilder('si')
      .where('si.createdTime >= :lastWeekStart AND si.createdTime < :startOfWeek', { lastWeekStart, startOfWeek })
      .getCount();

    // Average Score & Compliance
    const closedInspections = await this.inspectionRepo.find({
      where: [{ status: SafetyInspectionStatus.CLOSED }, { status: 'COMPLETED' as any }],
      select: { score: true },
    });

    let averageScore = 85;
    let complianceRate = 92;

    if (closedInspections.length > 0) {
      const sum = closedInspections.reduce((acc, curr) => acc + (curr.score || 0), 0);
      averageScore = Math.round(sum / closedInspections.length);
      const passed = closedInspections.filter((c) => (c.score || 0) >= 75).length;
      complianceRate = Math.round((passed / closedInspections.length) * 100);
    }

    // Weekly Trend (last 8 weeks)
    const weeklyTrend: { label: string; count: number }[] = [];
    for (let w = 7; w >= 0; w--) {
      const wStart = new Date(startOfWeek);
      wStart.setDate(wStart.getDate() - w * 7);
      const wEnd = new Date(wStart);
      wEnd.setDate(wEnd.getDate() + 7);

      const count = await this.inspectionRepo
        .createQueryBuilder('si')
        .where('si.createdTime >= :wStart AND si.createdTime < :wEnd', { wStart, wEnd })
        .getCount();

      weeklyTrend.push({
        label: w === 0 ? 'This wk' : `Wk ${8 - w}`,
        count,
      });
    }

    // Recent 5 inspections
    const recentInspections = await this.inspectionRepo.find({
      order: { createdTime: 'DESC' },
      take: 5,
    });

    return {
      totalInspections,
      thisWeek: thisWeekCount,
      thisMonth: thisMonthCount,
      lastWeek: lastWeekCount,
      averageScore,
      complianceRate,
      weeklyTrend,
      recentInspections,
    };
  }
}
