import { Injectable, NotFoundException, BadRequestException, OnModuleInit, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Observation, ObservationType, NatureOfFinding, ObservationRiskLevel, ObservationStatus } from '../entities/observation.entity';
import { ObservationActionLog, ObservationActionType } from '../entities/observation-action-log.entity';
import { CreateObservationDto } from '../dtos/create-observation.dto';
import { ContractorReviewDto, ContractorAction, ReassignObservationDto, ResolveObservationDto, CloseObservationDto, EscalateObservationDto } from '../dtos/workflow.dto';
import { IncidentsService } from '../../incidents/services/incidents.service';
import { saveBase64Signature } from '../../incidents/utils/signature-storage.util';

@Injectable()
export class ObservationsService implements OnModuleInit {
  private readonly logger = new Logger(ObservationsService.name);

  constructor(
    @InjectRepository(Observation)
    private readonly obsRepo: Repository<Observation>,
    @InjectRepository(ObservationActionLog)
    private readonly logRepo: Repository<ObservationActionLog>,
    @Inject(forwardRef(() => IncidentsService))
    private readonly incidentsService: IncidentsService,
  ) {}

  /**
   * Auto-creates missing observation tables in MySQL upon NestJS startup
   */
  async onModuleInit() {
    try {
      await this.obsRepo.query(`
        CREATE TABLE IF NOT EXISTS \`observations\` (
          \`id\` INT AUTO_INCREMENT PRIMARY KEY,
          \`observation_number\` VARCHAR(100) NOT NULL UNIQUE,
          \`observation_type\` ENUM('POSITIVE', 'NEEDS_ATTENTION') NOT NULL DEFAULT 'NEEDS_ATTENTION',
          \`nature_of_finding\` ENUM('GOOD_PRACTICE', 'UNSAFE_ACT', 'UNSAFE_CONDITION') NOT NULL DEFAULT 'UNSAFE_CONDITION',
          \`subject\` VARCHAR(255) NOT NULL,
          \`safety_category\` VARCHAR(150) NOT NULL,
          \`risk_level\` ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'MEDIUM',
          \`description\` TEXT NOT NULL,
          \`project_name\` VARCHAR(255) NULL,
          \`project_id\` INT NULL,
          \`building_id\` INT NULL,
          \`building_name\` VARCHAR(255) NULL,
          \`floor_level\` VARCHAR(150) NULL,
          \`specific_location\` TEXT NULL,
          \`assigned_contractor_id\` INT NULL,
          \`assigned_contractor_name\` VARCHAR(255) NULL,
          \`photos\` JSON NULL,
          \`status\` ENUM('OPEN', 'ASSIGNED', 'ACCEPTED', 'REJECTED', 'RESOLVED', 'CLOSED', 'ESCALATED') NOT NULL DEFAULT 'OPEN',
          \`created_by_user_id\` INT NULL,
          \`created_by_user_name\` VARCHAR(255) NULL,
          \`created_by_contractor_id\` INT NULL,
          \`created_by_role\` VARCHAR(100) NOT NULL DEFAULT 'DEPARTMENT',
          \`resolution_notes\` TEXT NULL,
          \`resolution_photos\` JSON NULL,
          \`closed_by\` VARCHAR(255) NULL,
          \`closed_time\` DATETIME NULL,
          \`closure_comments\` TEXT NULL,
          \`closure_signature\` TEXT NULL,
          \`escalated_incident_id\` INT NULL,
          \`created_time\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_time\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      await this.logRepo.query(`
        CREATE TABLE IF NOT EXISTS \`observation_action_logs\` (
          \`id\` INT AUTO_INCREMENT PRIMARY KEY,
          \`observation_id\` INT NOT NULL,
          \`action_type\` ENUM('CREATED', 'ASSIGNED', 'CONTRACTOR_ACCEPTED', 'CONTRACTOR_REJECTED', 'REASSIGNED', 'RESOLVED', 'CLOSED', 'ESCALATED') NOT NULL,
          \`performed_by_user_id\` INT NULL,
          \`performed_by_user_name\` VARCHAR(255) NOT NULL,
          \`performed_by_user_role\` VARCHAR(100) NOT NULL,
          \`previous_contractor\` VARCHAR(255) NULL,
          \`new_contractor\` VARCHAR(255) NULL,
          \`remarks\` TEXT NULL,
          \`photos\` JSON NULL,
          \`timestamp\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT \`fk_obs_log\` FOREIGN KEY (\`observation_id\`) REFERENCES \`observations\` (\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      this.logger.log('✅ Safety Observations tables auto-initialization check completed successfully.');
    } catch (err) {
      this.logger.error('❌ Failed to auto-create observations tables in MySQL', err);
    }
  }

  /**
   * Auto-generates unique tracking number: SO-2026-0001
   */
  private async generateObservationNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `SO-${year}-`;
    const lastObs = await this.obsRepo.find({
      where: { observationNumber: Like(`${prefix}%`) },
      order: { id: 'DESC' },
      take: 1,
    });

    let nextSeq = 1;
    if (lastObs.length > 0) {
      const parts = lastObs[0].observationNumber.split('-');
      const lastSeq = parseInt(parts[2], 10);
      if (!isNaN(lastSeq)) {
        nextSeq = lastSeq + 1;
      }
    }
    return `${prefix}${nextSeq.toString().padStart(4, '0')}`;
  }

  /**
   * Create a new Safety Observation
   */
  async createObservation(dto: CreateObservationDto): Promise<{ observation: Observation; history: ObservationActionLog[] }> {
    const observationNumber = await this.generateObservationNumber();
    const obsType = dto.observationType || ObservationType.NEEDS_ATTENTION;

    // Positive observations are auto-closed immediately
    let initialStatus = ObservationStatus.OPEN;
    if (obsType === ObservationType.POSITIVE) {
      initialStatus = ObservationStatus.CLOSED;
    } else if (dto.assignedContractorId || dto.assignedContractorName) {
      initialStatus = ObservationStatus.ASSIGNED;
    }

    const observation = this.obsRepo.create({
      observationNumber,
      observationType: obsType,
      natureOfFinding: dto.natureOfFinding || NatureOfFinding.UNSAFE_CONDITION,
      subject: dto.subject,
      safetyCategory: dto.safetyCategory,
      riskLevel: dto.riskLevel || ObservationRiskLevel.MEDIUM,
      description: dto.description,
      projectName: dto.projectName,
      projectId: dto.projectId,
      buildingId: dto.buildingId,
      buildingName: dto.buildingName,
      floorLevel: dto.floorLevel,
      specificLocation: dto.specificLocation,
      assignedContractorId: dto.assignedContractorId,
      assignedContractorName: dto.assignedContractorName,
      photos: dto.photos || [],
      status: initialStatus,
      createdByUserId: dto.createdByUserId,
      createdByUserName: dto.createdByUserName || 'Safety Officer',
      createdByContractorId: dto.createdByContractorId,
      createdByRole: dto.createdByRole || 'DEPARTMENT',
    });

    const savedObservation = await this.obsRepo.save(observation);

    // Write CREATED action log
    const createLog = this.logRepo.create({
      observationId: savedObservation.id,
      actionType: ObservationActionType.CREATED,
      performedByUserId: dto.createdByUserId,
      performedByUserName: dto.createdByUserName || 'Safety Officer',
      performedByUserRole: dto.createdByRole || 'DEPARTMENT',
      newContractor: dto.assignedContractorName,
      remarks: dto.description,
      photos: dto.photos,
    });

    await this.logRepo.save(createLog);

    // If assigned upon creation, write ASSIGNED log
    if (dto.assignedContractorName) {
      const assignLog = this.logRepo.create({
        observationId: savedObservation.id,
        actionType: ObservationActionType.ASSIGNED,
        performedByUserId: dto.createdByUserId,
        performedByUserName: dto.createdByUserName || 'Safety Officer',
        performedByUserRole: dto.createdByRole || 'DEPARTMENT',
        newContractor: dto.assignedContractorName,
        remarks: `Assigned to contractor ${dto.assignedContractorName} upon observation creation.`,
      });
      await this.logRepo.save(assignLog);
    }

    const history = await this.logRepo.find({ where: { observationId: savedObservation.id }, order: { id: 'ASC' } });
    return { observation: savedObservation, history };
  }

  /**
   * Contractor Review Action: ACCEPT or REJECT with mandatory remarks
   */
  async contractorReview(id: number, dto: ContractorReviewDto): Promise<{ observation: Observation; history: ObservationActionLog[] }> {
    const obs = await this.obsRepo.findOne({ where: { id } });
    if (!obs) {
      throw new NotFoundException(`Observation with ID ${id} not found`);
    }

    if (obs.status === ObservationStatus.CLOSED || obs.status === ObservationStatus.ESCALATED) {
      throw new BadRequestException(`Cannot review Observation ${obs.observationNumber} as it is already ${obs.status}`);
    }

    const isAccept = dto.action === ContractorAction.ACCEPT;
    obs.status = isAccept ? ObservationStatus.ACCEPTED : ObservationStatus.REJECTED;

    const savedObs = await this.obsRepo.save(obs);

    // Log Accept / Reject action
    const actionType = isAccept ? ObservationActionType.CONTRACTOR_ACCEPTED : ObservationActionType.CONTRACTOR_REJECTED;
    const log = this.logRepo.create({
      observationId: id,
      actionType,
      performedByUserId: dto.actionByUserId,
      performedByUserName: dto.actionByUserName,
      performedByUserRole: 'CONTRACTOR',
      previousContractor: obs.assignedContractorName,
      newContractor: obs.assignedContractorName,
      remarks: dto.remarks,
    });

    await this.logRepo.save(log);
    const history = await this.logRepo.find({ where: { observationId: id }, order: { id: 'ASC' } });

    return { observation: savedObs, history };
  }

  /**
   * Reassign Contractor (when rejected or re-routed by Department/HSE)
   */
  async reassignContractor(id: number, dto: ReassignObservationDto): Promise<{ observation: Observation; history: ObservationActionLog[] }> {
    const obs = await this.obsRepo.findOne({ where: { id } });
    if (!obs) {
      throw new NotFoundException(`Observation with ID ${id} not found`);
    }

    const prevContractor = obs.assignedContractorName;
    obs.assignedContractorId = dto.newContractorId;
    obs.assignedContractorName = dto.newContractorName;
    obs.status = ObservationStatus.ASSIGNED;

    const savedObs = await this.obsRepo.save(obs);

    // Log REASSIGNED action
    const log = this.logRepo.create({
      observationId: id,
      actionType: ObservationActionType.REASSIGNED,
      performedByUserId: dto.reassignedByUserId,
      performedByUserName: dto.reassignedByUserName,
      performedByUserRole: 'DEPARTMENT',
      previousContractor: prevContractor,
      newContractor: dto.newContractorName,
      remarks: dto.remarks,
    });

    await this.logRepo.save(log);
    const history = await this.logRepo.find({ where: { observationId: id }, order: { id: 'ASC' } });

    return { observation: savedObs, history };
  }

  /**
   * Contractor submits Resolution details & proof photos
   */
  async resolveObservation(id: number, dto: ResolveObservationDto): Promise<{ observation: Observation; history: ObservationActionLog[] }> {
    const obs = await this.obsRepo.findOne({ where: { id } });
    if (!obs) {
      throw new NotFoundException(`Observation with ID ${id} not found`);
    }

    obs.status = ObservationStatus.RESOLVED;
    obs.resolutionNotes = dto.resolutionNotes;
    obs.resolutionPhotos = dto.resolutionPhotos || [];

    const savedObs = await this.obsRepo.save(obs);

    // Log RESOLVED action
    const log = this.logRepo.create({
      observationId: id,
      actionType: ObservationActionType.RESOLVED,
      performedByUserId: dto.resolvedByUserId,
      performedByUserName: dto.resolvedByUserName,
      performedByUserRole: 'CONTRACTOR',
      previousContractor: obs.assignedContractorName,
      remarks: dto.resolutionNotes,
      photos: dto.resolutionPhotos,
    });

    await this.logRepo.save(log);
    const history = await this.logRepo.find({ where: { observationId: id }, order: { id: 'ASC' } });

    return { observation: savedObs, history };
  }

  /**
   * Department / HSE User Closes the Observation
   */
  async closeObservation(id: number, dto: CloseObservationDto): Promise<{ observation: Observation; history: ObservationActionLog[] }> {
    const obs = await this.obsRepo.findOne({ where: { id } });
    if (!obs) {
      throw new NotFoundException(`Observation with ID ${id} not found`);
    }

    obs.status = ObservationStatus.CLOSED;
    obs.closedBy = dto.closedBy;
    obs.closedTime = new Date();
    if (dto.closureComments) obs.closureComments = dto.closureComments;
    if (dto.signature) obs.closureSignature = saveBase64Signature(dto.signature, `sig_obs_close_${id}`);

    const savedObs = await this.obsRepo.save(obs);

    // Log CLOSED action
    const log = this.logRepo.create({
      observationId: id,
      actionType: ObservationActionType.CLOSED,
      performedByUserName: dto.closedBy,
      performedByUserRole: 'DEPARTMENT',
      remarks: dto.closureComments || 'Observation verified and closed out by Department / HSE.',
    });

    await this.logRepo.save(log);
    const history = await this.logRepo.find({ where: { observationId: id }, order: { id: 'ASC' } });

    return { observation: savedObs, history };
  }

  /**
   * Escalate Safety Observation to formal Incident
   */
  async escalateToIncident(id: number, dto: EscalateObservationDto): Promise<{ observation: Observation; incident: any; history: ObservationActionLog[] }> {
    const obs = await this.obsRepo.findOne({ where: { id } });
    if (!obs) {
      throw new NotFoundException(`Observation with ID ${id} not found`);
    }

    if (obs.observationType === ObservationType.POSITIVE) {
      throw new BadRequestException(`Positive Safety Observations cannot be escalated to Incidents.`);
    }

    // Auto-create Stage 1 Incident
    const incidentResult = await this.incidentsService.submitHeadsUp({
      projectName: obs.projectName || 'Default Site Project',
      projectId: obs.projectId,
      incidentDate: new Date().toISOString().split('T')[0],
      incidentTime: new Date().toTimeString().split(' ')[0].substring(0, 5),
      buildingId: obs.buildingId,
      buildingName: obs.buildingName,
      origin: obs.observationNumber,
      floorLevel: obs.floorLevel,
      specificLocation: obs.specificLocation,
      contractorsInvolved: obs.assignedContractorName,
      categories: [obs.safetyCategory],
      descriptionWhatHappened: `[ESCALATED FROM ${obs.observationNumber}]: ${obs.description}`,
      descriptionConsequence: `Escalated safety observation due to ${obs.riskLevel} risk level.`,
      submittedBy: dto.escalatedBy,
    });

    obs.status = ObservationStatus.ESCALATED;
    obs.escalatedIncidentId = incidentResult.incident.id;
    const savedObs = await this.obsRepo.save(obs);

    // Log ESCALATED action
    const log = this.logRepo.create({
      observationId: id,
      actionType: ObservationActionType.ESCALATED,
      performedByUserName: dto.escalatedBy,
      performedByUserRole: 'SITE_HSE',
      remarks: dto.remarks || `Escalated Observation ${obs.observationNumber} to Incident ${incidentResult.incident.caseNumber} (ID: ${incidentResult.incident.id})`,
    });

    await this.logRepo.save(log);
    const history = await this.logRepo.find({ where: { observationId: id }, order: { id: 'ASC' } });

    return { observation: savedObs, incident: incidentResult, history };
  }

  /**
   * Get single observation with full audit history timeline
   */
  async findOne(id: number): Promise<{ observation: Observation; history: ObservationActionLog[] }> {
    const observation = await this.obsRepo.findOne({ where: { id } });
    if (!observation) {
      throw new NotFoundException(`Observation with ID ${id} not found`);
    }
    const history = await this.logRepo.find({
      where: { observationId: id },
      order: { id: 'ASC' },
    });

    return { observation, history };
  }

  /**
   * List observations with RBAC contractor data scoping & filters
   */
  async findAll(query: {
    status?: ObservationStatus;
    type?: ObservationType;
    riskLevel?: ObservationRiskLevel;
    category?: string;
    building?: string;
    contractor?: string;
    contractorId?: number;
    userRole?: string;
    search?: string;
  }) {
    const qb = this.obsRepo.createQueryBuilder('obs');

    // Role-Based Access Control (RBAC) Scoping
    if (query.userRole === 'CONTRACTOR' && query.contractorId) {
      qb.andWhere(
        '(obs.assignedContractorId = :contractorId OR obs.createdByContractorId = :contractorId)',
        { contractorId: query.contractorId },
      );
    }

    if (query.status) {
      qb.andWhere('obs.status = :status', { status: query.status });
    }
    if (query.type) {
      qb.andWhere('obs.observationType = :type', { type: query.type });
    }
    if (query.riskLevel) {
      qb.andWhere('obs.riskLevel = :riskLevel', { riskLevel: query.riskLevel });
    }
    if (query.category) {
      qb.andWhere('obs.safetyCategory LIKE :category', { category: `%${query.category}%` });
    }
    if (query.building) {
      qb.andWhere('obs.buildingName LIKE :building', { building: `%${query.building}%` });
    }
    if (query.contractor) {
      qb.andWhere('obs.assignedContractorName LIKE :contractor', { contractor: `%${query.contractor}%` });
    }
    if (query.contractorId && query.userRole !== 'CONTRACTOR') {
      qb.andWhere('obs.assignedContractorId = :cId', { cId: query.contractorId });
    }
    if (query.search) {
      const searchLike = `%${query.search}%`;
      qb.andWhere(
        '(obs.observationNumber LIKE :searchLike OR obs.subject LIKE :searchLike OR obs.description LIKE :searchLike OR obs.safetyCategory LIKE :searchLike OR obs.assignedContractorName LIKE :searchLike)',
        { searchLike },
      );
    }

    qb.orderBy('obs.id', 'DESC');
    return await qb.getMany();
  }
}
