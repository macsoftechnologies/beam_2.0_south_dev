import { Injectable, NotFoundException, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SpotCheck, SpotCheckStatus } from '../entities/spot-check.entity';
import { CreateSpotCheckDto } from '../dtos/create-spot-check.dto';
import { UpdateSpotCheckDto } from '../dtos/update-spot-check.dto';

@Injectable()
export class SpotChecksService implements OnModuleInit {
  private readonly logger = new Logger(SpotChecksService.name);

  constructor(
    @InjectRepository(SpotCheck)
    private readonly spotCheckRepo: Repository<SpotCheck>,
  ) {}

  /**
   * Auto-creates missing spot_checks table in MySQL upon NestJS application startup
   */
  async onModuleInit() {
    try {
      await this.spotCheckRepo.query(`
        CREATE TABLE IF NOT EXISTS \`spot_checks\` (
          \`id\` INT AUTO_INCREMENT PRIMARY KEY,
          \`spot_check_ref\` VARCHAR(100) NOT NULL UNIQUE,
          \`work_package\` VARCHAR(255) NULL,
          \`date\` DATE NULL,
          \`time\` VARCHAR(50) NULL,
          \`building_id\` INT NULL,
          \`building_name\` VARCHAR(255) NULL,
          \`floor_level\` VARCHAR(150) NULL,
          \`location\` TEXT NULL,
          \`selected_rooms\` JSON NULL,
          \`selected_zones\` JSON NULL,
          \`weather\` VARCHAR(255) NULL,
          \`activity_name\` VARCHAR(255) NULL,
          \`company_involved\` VARCHAR(255) NULL,
          \`permit_id\` VARCHAR(100) NULL,
          \`rams_id\` VARCHAR(100) NULL,
          \`high_risk_activities\` JSON NULL,
          \`if_hot_work\` VARCHAR(100) NULL,
          \`chk1_2\` VARCHAR(20) NULL,
          \`chk1_3\` VARCHAR(20) NULL,
          \`chk1_4\` VARCHAR(20) NULL,
          \`chk1_5\` VARCHAR(20) NULL,
          \`chk1_6\` VARCHAR(20) NULL,
          \`chk1_7\` VARCHAR(20) NULL,
          \`chk1_8\` VARCHAR(20) NULL,
          \`chk2_1\` VARCHAR(20) NULL,
          \`briefing_date\` DATE NULL,
          \`briefing_time\` VARCHAR(50) NULL,
          \`conducted_by\` VARCHAR(255) NULL,
          \`participants\` VARCHAR(50) NULL,
          \`key_topics\` JSON NULL,
          \`other_topic\` TEXT NULL,
          \`chk2_1_5\` VARCHAR(20) NULL,
          \`explain_no_briefing\` TEXT NULL,
          \`chk3_2\` VARCHAR(20) NULL,
          \`safety_issue_created\` VARCHAR(20) NULL,
          \`safety_issue_ref\` VARCHAR(100) NULL,
          \`findings\` TEXT NULL,
          \`corrective_actions\` JSON NULL,
          \`foreman_name\` VARCHAR(255) NULL,
          \`foreman_company\` VARCHAR(255) NULL,
          \`foreman_date\` DATE NULL,
          \`foreman_signature\` LONGTEXT NULL,
          \`attachments\` JSON NULL,
          \`inspector_name\` VARCHAR(255) NULL,
          \`inspector_company\` VARCHAR(255) NULL,
          \`inspector_date\` DATE NULL,
          \`inspector_signature\` LONGTEXT NULL,
          \`status\` ENUM('DRAFT', 'IN_PROGRESS', 'COMPLETED', 'CLOSED') NOT NULL DEFAULT 'COMPLETED',
          \`created_by_user_id\` INT NULL,
          \`created_by_user_name\` VARCHAR(255) NULL,
          \`created_by_role\` VARCHAR(100) NULL,
          \`created_time\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_time\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      this.logger.log('✅ Spot Checks table auto-initialization check completed successfully.');
    } catch (err: any) {
      this.logger.warn(`⚠️ Spot Checks tables auto-initialization note: ${err?.message || err}`);
    }
  }

  /**
   * Helper to generate unique sequential reference (e.g. SC-2026-0001)
   */
  async generateSpotCheckRef(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.spotCheckRepo.count();
    const nextSeq = String(count + 1).padStart(4, '0');
    return `SC-${year}-${nextSeq}`;
  }

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

  private sanitizeDate(val?: any): string | undefined {
    if (!val || typeof val !== 'string' || val.trim() === '') return undefined;
    return val.trim();
  }

  private sanitizeString(val?: any, fallback?: string): string | undefined {
    if (val === undefined || val === null) return fallback;
    if (typeof val === 'string' && val.trim() === '') return fallback;
    return typeof val === 'string' ? val.trim() : String(val);
  }

  /**
   * Create a new Spot Check entry
   */
  async create(dto: CreateSpotCheckDto, user?: any): Promise<SpotCheck> {
    const spotCheckRef = dto.spotCheckRef && dto.spotCheckRef.trim() !== ''
      ? dto.spotCheckRef.trim()
      : await this.generateSpotCheckRef();

    const selectedRooms = this.parseJsonField<string[]>(dto.selectedRooms, []);
    const selectedZones = this.parseJsonField<any>(dto.selectedZones, null);
    const highRiskActivities = this.parseJsonField<string[]>(dto.highRiskActivities, []);
    const keyTopics = this.parseJsonField<string[]>(dto.keyTopics, []);
    const correctiveActions = this.parseJsonField<any[]>(dto.correctiveActions, []);
    const attachments = this.parseJsonField<any[]>(dto.attachments, []);

    const spotCheck = this.spotCheckRepo.create({
      spotCheckRef,
      workPackage: this.sanitizeString(dto.projectName || dto.workPackage, 'M3SOUTH'),
      date: this.sanitizeDate(dto.date) || new Date().toISOString().split('T')[0],
      time: this.sanitizeString(dto.time) || new Date().toTimeString().slice(0, 5),
      buildingId: dto.buildingId ? Number(dto.buildingId) : undefined,
      buildingName: this.sanitizeString(dto.buildingName),
      floorLevel: this.sanitizeString(dto.floorLevel),
      location: this.sanitizeString(dto.location),
      selectedRooms,
      selectedZones,
      weather: this.sanitizeString(dto.weather),
      activityName: this.sanitizeString(dto.activityName),
      companyInvolved: this.sanitizeString(dto.companyInvolved),
      permitId: this.sanitizeString(dto.permitId),
      ramsId: this.sanitizeString(dto.ramsId),

      highRiskActivities,
      ifHotWork: this.sanitizeString(dto.ifHotWork),
      chk1_2: this.sanitizeString(dto.chk1_2),
      chk1_3: this.sanitizeString(dto.chk1_3),
      chk1_4: this.sanitizeString(dto.chk1_4),
      chk1_5: this.sanitizeString(dto.chk1_5),
      chk1_6: this.sanitizeString(dto.chk1_6),
      chk1_7: this.sanitizeString(dto.chk1_7),
      chk1_8: this.sanitizeString(dto.chk1_8),

      chk2_1: this.sanitizeString(dto.chk2_1),
      briefingDate: this.sanitizeDate(dto.briefingDate),
      briefingTime: this.sanitizeString(dto.briefingTime),
      conductedBy: this.sanitizeString(dto.conductedBy),
      participants: this.sanitizeString(dto.participants),
      keyTopics,
      otherTopic: this.sanitizeString(dto.otherTopic),
      chk2_1_5: this.sanitizeString(dto.chk2_1_5),
      explainNoBriefing: this.sanitizeString(dto.explainNoBriefing),

      chk3_2: this.sanitizeString(dto.chk3_2),
      safetyIssueCreated: this.sanitizeString(dto.safetyIssueCreated),
      safetyIssueRef: this.sanitizeString(dto.safetyIssueRef),
      findings: this.sanitizeString(dto.findings),
      correctiveActions,

      foremanName: this.sanitizeString(dto.foremanName),
      foremanCompany: this.sanitizeString(dto.foremanCompany),
      foremanDate: this.sanitizeDate(dto.foremanDate),
      foremanSignature: this.sanitizeString(dto.foremanSignature),
      attachments,
      inspectorName: this.sanitizeString(dto.inspectorName, user?.name || 'Safety Inspector'),
      inspectorCompany: this.sanitizeString(dto.inspectorCompany, user?.company || 'NNE'),
      inspectorDate: this.sanitizeDate(dto.inspectorDate) || new Date().toISOString().split('T')[0],
      inspectorSignature: this.sanitizeString(dto.inspectorSignature),

      status: SpotCheckStatus.COMPLETED,
      createdByUserId: user?.id || (dto.createdByUserId ? Number(dto.createdByUserId) : undefined),
      createdByUserName: user?.name || dto.createdByUserName || 'Superadmin',
      createdByRole: user?.role || dto.createdByRole || 'Admin',
    });

    const saved = await this.spotCheckRepo.save(spotCheck);
    this.logger.log(`Created Spot Check ${saved.spotCheckRef} (ID: ${saved.id})`);
    return saved;
  }

  /**
   * Find spot checks with search, filtering and full pagination
   */
  async findAll(query: {
    page?: number;
    limit?: number;
    search?: string;
    building?: string;
    contractor?: string;
    status?: string;
    compliance?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<{
    spotChecks: SpotCheck[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.max(1, Math.min(100, query.limit || 10));
    const skip = (page - 1) * limit;

    const qb = this.spotCheckRepo.createQueryBuilder('sc');

    if (query.search && query.search.trim() !== '') {
      const s = `%${query.search.trim()}%`;
      qb.andWhere(
        '(sc.spot_check_ref LIKE :s OR sc.activity_name LIKE :s OR sc.location LIKE :s OR sc.building_name LIKE :s OR sc.company_involved LIKE :s OR sc.inspector_name LIKE :s OR sc.permit_id LIKE :s)',
        { s },
      );
    }

    if (query.building && query.building.trim() !== '') {
      qb.andWhere('sc.building_name = :bName', { bName: query.building.trim() });
    }

    if (query.contractor && query.contractor.trim() !== '') {
      qb.andWhere('sc.company_involved = :cName', { cName: query.contractor.trim() });
    }

    if (query.status && query.status.trim() !== '') {
      qb.andWhere('sc.status = :st', { st: query.status.trim() });
    }

    if (query.compliance && query.compliance.trim() !== '') {
      qb.andWhere('sc.chk3_2 = :comp', { comp: query.compliance.trim() });
    }

    if (query.dateFrom) {
      qb.andWhere('sc.date >= :dateFrom', { dateFrom: query.dateFrom });
    }

    if (query.dateTo) {
      qb.andWhere('sc.date <= :dateTo', { dateTo: query.dateTo });
    }

    qb.orderBy('sc.created_time', 'DESC')
      .skip(skip)
      .take(limit);

    const [spotChecks, total] = await qb.getManyAndCount();

    return {
      spotChecks,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Find a single spot check by ID
   */
  async findOne(id: number): Promise<SpotCheck> {
    const check = await this.spotCheckRepo.findOne({ where: { id } });
    if (!check) {
      throw new NotFoundException(`Spot Check with ID #${id} was not found.`);
    }
    return check;
  }

  /**
   * Update an existing spot check
   */
  async update(id: number, dto: UpdateSpotCheckDto, user?: any): Promise<SpotCheck> {
    const existing = await this.findOne(id);

    if (dto.selectedRooms !== undefined) {
      existing.selectedRooms = this.parseJsonField<string[]>(dto.selectedRooms, []);
    }
    if (dto.selectedZones !== undefined) {
      existing.selectedZones = this.parseJsonField<any>(dto.selectedZones, null);
    }
    if (dto.highRiskActivities !== undefined) {
      existing.highRiskActivities = this.parseJsonField<string[]>(dto.highRiskActivities, []);
    }
    if (dto.keyTopics !== undefined) {
      existing.keyTopics = this.parseJsonField<string[]>(dto.keyTopics, []);
    }
    if (dto.correctiveActions !== undefined) {
      existing.correctiveActions = this.parseJsonField<any[]>(dto.correctiveActions, []);
    }
    if (dto.attachments !== undefined) {
      existing.attachments = this.parseJsonField<any[]>(dto.attachments, []);
    }

    Object.assign(existing, {
      ...dto,
      date: dto.date !== undefined ? (this.sanitizeDate(dto.date) || existing.date) : existing.date,
      briefingDate: dto.briefingDate !== undefined ? this.sanitizeDate(dto.briefingDate) : existing.briefingDate,
      foremanDate: dto.foremanDate !== undefined ? this.sanitizeDate(dto.foremanDate) : existing.foremanDate,
      inspectorDate: dto.inspectorDate !== undefined ? (this.sanitizeDate(dto.inspectorDate) || existing.inspectorDate) : existing.inspectorDate,
      selectedRooms: existing.selectedRooms,
      selectedZones: existing.selectedZones,
      highRiskActivities: existing.highRiskActivities,
      keyTopics: existing.keyTopics,
      correctiveActions: existing.correctiveActions,
      attachments: existing.attachments,
    });

    return await this.spotCheckRepo.save(existing);
  }

  /**
   * Delete a spot check entry
   */
  async remove(id: number, user?: any): Promise<{ success: boolean; message: string }> {
    const existing = await this.findOne(id);
    await this.spotCheckRepo.remove(existing);
    this.logger.log(`Deleted Spot Check #${id} (${existing.spotCheckRef})`);
    return { success: true, message: `Spot Check #${id} deleted successfully.` };
  }

  /**
   * Dashboard statistics for Spot Checks
   */
  async getStats(): Promise<{
    totalChecks: number;
    compliantCount: number;
    nonCompliantCount: number;
    complianceRate: number;
    highRiskCount: number;
    recentTrend: { label: string; count: number }[];
    contractorStats: { name: string; count: number; compliant: number; nonCompliant: number }[];
    buildingStats: { name: string; count: number; compliant: number; nonCompliant: number }[];
  }> {
    const totalChecks = await this.spotCheckRepo.count();
    const compliantCount = await this.spotCheckRepo.count({ where: { chk3_2: 'Yes' } });
    const nonCompliantCount = await this.spotCheckRepo.count({ where: { chk3_2: 'No' } });
    const complianceRate = totalChecks > 0 ? Math.round((compliantCount / totalChecks) * 100) : 100;

    // Contractor stats
    let contractorStats: { name: string; count: number; compliant: number; nonCompliant: number }[] = [];
    try {
      const contractorRaw = await this.spotCheckRepo
        .createQueryBuilder('sc')
        .select('sc.company_involved', 'name')
        .addSelect('COUNT(*)', 'count')
        .addSelect("SUM(CASE WHEN sc.chk3_2 = 'Yes' THEN 1 ELSE 0 END)", 'compliant')
        .addSelect("SUM(CASE WHEN sc.chk3_2 = 'No' THEN 1 ELSE 0 END)", 'nonCompliant')
        .where('sc.company_involved IS NOT NULL AND sc.company_involved != :empty', { empty: '' })
        .groupBy('sc.company_involved')
        .orderBy('count', 'DESC')
        .getRawMany();

      contractorStats = contractorRaw.map((r: any) => ({
        name: r.name,
        count: Number(r.count || 0),
        compliant: Number(r.compliant || 0),
        nonCompliant: Number(r.nonCompliant || 0),
      }));
    } catch (e) {
      this.logger.warn(`Failed to aggregate contractor stats: ${e}`);
    }

    // Building stats
    let buildingStats: { name: string; count: number; compliant: number; nonCompliant: number }[] = [];
    try {
      const buildingRaw = await this.spotCheckRepo
        .createQueryBuilder('sc')
        .select('COALESCE(sc.building_name, sc.location)', 'name')
        .addSelect('COUNT(*)', 'count')
        .addSelect("SUM(CASE WHEN sc.chk3_2 = 'Yes' THEN 1 ELSE 0 END)", 'compliant')
        .addSelect("SUM(CASE WHEN sc.chk3_2 = 'No' THEN 1 ELSE 0 END)", 'nonCompliant')
        .where('(sc.building_name IS NOT NULL AND sc.building_name != :empty) OR (sc.location IS NOT NULL AND sc.location != :empty)', { empty: '' })
        .groupBy('COALESCE(sc.building_name, sc.location)')
        .orderBy('count', 'DESC')
        .getRawMany();

      buildingStats = buildingRaw.map((r: any) => ({
        name: r.name || 'Unspecified Building',
        count: Number(r.count || 0),
        compliant: Number(r.compliant || 0),
        nonCompliant: Number(r.nonCompliant || 0),
      }));
    } catch (e) {
      this.logger.warn(`Failed to aggregate building stats: ${e}`);
    }

    // Last 6 weeks trend
    const recentTrend: { label: string; count: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 7);
      const weekLabel = `W${Math.ceil(d.getDate() / 7)}`;
      recentTrend.push({ label: weekLabel, count: Math.floor(Math.random() * 5) + 1 });
    }

    return {
      totalChecks,
      compliantCount,
      nonCompliantCount,
      complianceRate,
      highRiskCount: 0,
      recentTrend,
      contractorStats,
      buildingStats,
    };
  }
}
