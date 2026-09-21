import { Injectable, NotFoundException, ForbiddenException, Logger, BadRequestException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, In, Between } from 'typeorm';
import { SafetyInspection, SafetyInspectionStatus } from '../entities/safety-inspection.entity';
import { SafetyInspectionItem, SafetyCheckItemStatus } from '../entities/safety-inspection-item.entity';
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

      this.logger.log('✅ Safety Inspections tables auto-initialization check completed successfully.');
    } catch (err: any) {
      this.logger.warn(`⚠️ Safety Inspections tables auto-initialization note: ${err?.message || err}`);
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

    const isClosed = dto.isCompleted === true || dto.isCompleted === 'true' || dto.isCompleted === 1 || dto.status === 'COMPLETED' || dto.status === 'CLOSED';

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
      qb.andWhere('(si.buildingName LIKE :building OR si.buildingId = :buildingId)', {
        building: `%${query.building}%`,
        buildingId: isNaN(Number(query.building)) ? -1 : Number(query.building),
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

    const [inspections, total] = await qb.skip(skip).take(limit).getManyAndCount();

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

    return inspection;
  }

  /**
   * Update an existing safety inspection
   */
  async update(id: number, dto: UpdateSafetyInspectionDto, user?: any): Promise<SafetyInspection> {
    const inspection = await this.findOne(id);

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

    await this.inspectionRepo.save(inspection);
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
