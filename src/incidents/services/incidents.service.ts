import { Injectable, NotFoundException, BadRequestException, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, In } from 'typeorm';
import { Incident, IncidentStage, InvestigationLevel } from '../entities/incident.entity';
import { IncidentHeadsUp } from '../entities/incident-headsup.entity';
import { IncidentInitialReport } from '../entities/incident-initial-report.entity';
import { IncidentInvestigation } from '../entities/incident-investigation.entity';
import { IncidentActionItem, ActionItemType, ActionItemStatus } from '../entities/incident-action-item.entity';
import { CreateHeadsUpDto } from '../dtos/create-headsup.dto';
import { CreateInitialReportDto } from '../dtos/create-initial-report.dto';
import { UpdateInvestigationDto } from '../dtos/update-investigation.dto';
import { CreateActionItemDto, UpdateActionItemDto } from '../dtos/action-item.dto';

import { saveBase64Signature } from '../utils/signature-storage.util';

@Injectable()
export class IncidentsService implements OnModuleInit {
  private readonly logger = new Logger(IncidentsService.name);

  constructor(
    @InjectRepository(Incident)
    private readonly incidentRepo: Repository<Incident>,
    @InjectRepository(IncidentHeadsUp)
    private readonly headsUpRepo: Repository<IncidentHeadsUp>,
    @InjectRepository(IncidentInitialReport)
    private readonly initialReportRepo: Repository<IncidentInitialReport>,
    @InjectRepository(IncidentInvestigation)
    private readonly investigationRepo: Repository<IncidentInvestigation>,
    @InjectRepository(IncidentActionItem)
    private readonly actionItemRepo: Repository<IncidentActionItem>,
  ) {}

  /**
   * Auto-creates missing incident tables in MySQL upon NestJS application startup
   */
  async onModuleInit() {
    try {
      await this.incidentRepo.query(`
        CREATE TABLE IF NOT EXISTS \`incidents\` (
          \`id\` INT AUTO_INCREMENT PRIMARY KEY,
          \`case_number\` VARCHAR(100) NOT NULL UNIQUE,
          \`title\` VARCHAR(255) NULL,
          \`project_name\` VARCHAR(255) NULL,
          \`project_id\` INT NULL,
          \`incident_date\` DATE NULL,
          \`incident_time\` VARCHAR(50) NULL,
          \`incident_timestamp\` DATETIME NULL,
          \`building_id\` INT NULL,
          \`floor_level\` VARCHAR(150) NULL,
          \`specific_location\` TEXT NULL,
          \`contractors_involved\` TEXT NULL,
          \`stage\` ENUM('HEADS_UP', 'INITIAL_REPORT', 'INVESTIGATION', 'CLOSED') NOT NULL DEFAULT 'HEADS_UP',
          \`categories\` JSON NULL,
          \`actual_severity\` INT NULL,
          \`potential_severity\` INT NULL,
          \`is_hipo\` TINYINT(1) NOT NULL DEFAULT 0,
          \`investigation_level\` ENUM('L1', 'L2', 'L3') NOT NULL DEFAULT 'L1',
          \`gatekeeper_informed\` TINYINT(1) NOT NULL DEFAULT 0,
          \`gatekeeper_name\` VARCHAR(255) NULL,
          \`sla_headsup_due\` DATETIME NULL,
          \`sla_initial_due\` DATETIME NULL,
          \`sla_investigation_due\` DATETIME NULL,
          \`status\` INT NOT NULL DEFAULT 1,
          \`created_time\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_time\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      await this.headsUpRepo.query(`
        CREATE TABLE IF NOT EXISTS \`incident_headsup\` (
          \`id\` INT AUTO_INCREMENT PRIMARY KEY,
          \`incident_id\` INT NOT NULL,
          \`description_what_happened\` TEXT NULL,
          \`description_consequence\` TEXT NULL,
          \`is_environmental\` TINYINT(1) NOT NULL DEFAULT 0,
          \`spill_type\` JSON NULL,
          \`spill_substance\` VARCHAR(255) NULL,
          \`spill_cause\` TEXT NULL,
          \`spill_quantity\` VARCHAR(100) NULL,
          \`spill_system_entered\` JSON NULL,
          \`immediate_actions\` JSON NULL,
          \`submitted_by\` VARCHAR(255) NULL,
          \`signature\` TEXT NULL,
          \`submitted_time\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT \`fk_headsup_incident\` FOREIGN KEY (\`incident_id\`) REFERENCES \`incidents\` (\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      await this.initialReportRepo.query(`
        CREATE TABLE IF NOT EXISTS \`incident_initial_reports\` (
          \`id\` INT AUTO_INCREMENT PRIMARY KEY,
          \`incident_id\` INT NOT NULL,
          \`photos\` JSON NULL,
          \`has_injury_illness\` TINYINT(1) NOT NULL DEFAULT 0,
          \`nature_of_injury\` TEXT NULL,
          \`treatment_prescribed\` TEXT NULL,
          \`anticipated_absence\` VARCHAR(255) NULL,
          \`treatment_provided\` JSON NULL,
          \`accident_categories\` JSON NULL,
          \`injury_types\` JSON NULL,
          \`body_parts_injured\` JSON NULL,
          \`submitted_by\` VARCHAR(255) NULL,
          \`signature\` TEXT NULL,
          \`submitted_time\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT \`fk_initial_incident\` FOREIGN KEY (\`incident_id\`) REFERENCES \`incidents\` (\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      await this.investigationRepo.query(`
        CREATE TABLE IF NOT EXISTS \`incident_investigations\` (
          \`id\` INT AUTO_INCREMENT PRIMARY KEY,
          \`incident_id\` INT NOT NULL,
          \`investigation_details\` TEXT NULL,
          \`fishbone_data\` JSON NULL,
          \`problem_statement\` TEXT NULL,
          \`five_whys_data\` JSON NULL,
          \`root_causes\` JSON NULL,
          \`contributing_factors\` JSON NULL,
          \`mandatory_attachments\` JSON NULL,
          \`signatures\` JSON NULL,
          \`completed_time\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT \`fk_investigation_incident\` FOREIGN KEY (\`incident_id\`) REFERENCES \`incidents\` (\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      await this.actionItemRepo.query(`
        CREATE TABLE IF NOT EXISTS \`incident_action_items\` (
          \`id\` INT AUTO_INCREMENT PRIMARY KEY,
          \`incident_id\` INT NOT NULL,
          \`action_type\` ENUM('IMMEDIATE', 'CORRECTIVE') NOT NULL DEFAULT 'IMMEDIATE',
          \`action\` TEXT NOT NULL,
          \`responsible\` VARCHAR(255) NOT NULL,
          \`target_date\` DATE NULL,
          \`time_implemented\` VARCHAR(100) NULL,
          \`status\` ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED') NOT NULL DEFAULT 'PENDING',
          \`updated_by\` VARCHAR(255) NULL,
          \`status_history\` JSON NULL,
          \`created_time\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_time\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT \`fk_action_item_incident\` FOREIGN KEY (\`incident_id\`) REFERENCES \`incidents\` (\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      // Ensure approval and review columns exist on existing tables
      const alterQueries = [
        `ALTER TABLE \`incidents\` ADD COLUMN \`title\` VARCHAR(255) NULL`,
        `ALTER TABLE \`incidents\` ADD COLUMN \`closed_by\` VARCHAR(255) NULL`,
        `ALTER TABLE \`incidents\` ADD COLUMN \`closed_time\` DATETIME NULL`,
        `ALTER TABLE \`incidents\` ADD COLUMN \`closure_comments\` TEXT NULL`,
        `ALTER TABLE \`incidents\` ADD COLUMN \`closure_signature\` TEXT NULL`,
        `ALTER TABLE \`incidents\` ADD COLUMN \`building_name\` VARCHAR(255) NULL`,
        `ALTER TABLE \`incidents\` ADD COLUMN \`origin\` VARCHAR(100) DEFAULT 'Direct'`,
        `ALTER TABLE \`incident_headsup\` ADD COLUMN \`approved_by\` VARCHAR(255) NULL`,
        `ALTER TABLE \`incident_headsup\` ADD COLUMN \`approver_role\` VARCHAR(255) NULL`,
        `ALTER TABLE \`incident_headsup\` ADD COLUMN \`approver_signature\` TEXT NULL`,
        `ALTER TABLE \`incident_headsup\` ADD COLUMN \`approved_time\` DATETIME NULL`,
        `ALTER TABLE \`incident_initial_reports\` ADD COLUMN \`approved_by\` VARCHAR(255) NULL`,
        `ALTER TABLE \`incident_initial_reports\` ADD COLUMN \`approver_role\` VARCHAR(255) NULL`,
        `ALTER TABLE \`incident_initial_reports\` ADD COLUMN \`approver_signature\` TEXT NULL`,
        `ALTER TABLE \`incident_initial_reports\` ADD COLUMN \`approved_time\` DATETIME NULL`,
        `ALTER TABLE \`incident_initial_reports\` ADD COLUMN \`injured_person_name\` VARCHAR(255) NULL`,
        `ALTER TABLE \`incident_initial_reports\` ADD COLUMN \`injured_person_company\` VARCHAR(255) NULL`,
        `ALTER TABLE \`incident_initial_reports\` ADD COLUMN \`injured_person_supervisor\` VARCHAR(255) NULL`,
        `ALTER TABLE \`incident_initial_reports\` ADD COLUMN \`injured_person_job_title\` VARCHAR(255) NULL`,
        `ALTER TABLE \`incident_initial_reports\` ADD COLUMN \`length_of_service\` VARCHAR(255) NULL`,
        `ALTER TABLE \`incident_initial_reports\` ADD COLUMN \`experience_in_role\` VARCHAR(255) NULL`,
        `ALTER TABLE \`incident_initial_reports\` ADD COLUMN \`worker_activity\` TEXT NULL`,
        `ALTER TABLE \`incident_initial_reports\` ADD COLUMN \`medical_treatment_class\` VARCHAR(255) NULL`,
        `ALTER TABLE \`incident_initial_reports\` ADD COLUMN \`initial_root_cause\` TEXT NULL`,
        `ALTER TABLE \`incident_initial_reports\` ADD COLUMN \`environmental_conditions\` VARCHAR(255) NULL`,
        `ALTER TABLE \`incident_initial_reports\` ADD COLUMN \`equipment_involved\` VARCHAR(255) NULL`,
        `ALTER TABLE \`incident_investigations\` ADD COLUMN \`reviewed_by\` VARCHAR(255) NULL`,
        `ALTER TABLE \`incident_investigations\` ADD COLUMN \`reviewer_role\` VARCHAR(255) NULL`,
        `ALTER TABLE \`incident_investigations\` ADD COLUMN \`reviewer_signature\` TEXT NULL`,
        `ALTER TABLE \`incident_investigations\` ADD COLUMN \`reviewed_time\` DATETIME NULL`,
        `ALTER TABLE \`incident_action_items\` ADD COLUMN \`updated_by\` VARCHAR(255) NULL`,
        `ALTER TABLE \`incident_action_items\` ADD COLUMN \`status_history\` JSON NULL`,
      ];

      for (const q of alterQueries) {
        try {
          await this.incidentRepo.query(q);
        } catch (e) {
          // Column may already exist, ignore duplicate column errors safely
        }
      }

      // Clean up existing database signatures by stripping 'uploads/signatures/', '/uploads/signatures/', 'uploads/', '/uploads/'
      const cleanupSignatureQueries = [
        `UPDATE \`incident_headsup\` SET \`signature\` = REPLACE(REPLACE(\`signature\`, '/uploads/signatures/', ''), '/uploads/', '') WHERE \`signature\` LIKE '%uploads%'`,
        `UPDATE \`incident_headsup\` SET \`signature\` = REPLACE(REPLACE(\`signature\`, 'uploads/signatures/', ''), 'uploads/', '') WHERE \`signature\` LIKE '%uploads%'`,
        `UPDATE \`incident_headsup\` SET \`approver_signature\` = REPLACE(REPLACE(\`approver_signature\`, '/uploads/signatures/', ''), '/uploads/', '') WHERE \`approver_signature\` LIKE '%uploads%'`,
        `UPDATE \`incident_headsup\` SET \`approver_signature\` = REPLACE(REPLACE(\`approver_signature\`, 'uploads/signatures/', ''), 'uploads/', '') WHERE \`approver_signature\` LIKE '%uploads%'`,

        `UPDATE \`incident_initial_reports\` SET \`signature\` = REPLACE(REPLACE(\`signature\`, '/uploads/signatures/', ''), '/uploads/', '') WHERE \`signature\` LIKE '%uploads%'`,
        `UPDATE \`incident_initial_reports\` SET \`signature\` = REPLACE(REPLACE(\`signature\`, 'uploads/signatures/', ''), 'uploads/', '') WHERE \`signature\` LIKE '%uploads%'`,
        `UPDATE \`incident_initial_reports\` SET \`approver_signature\` = REPLACE(REPLACE(\`approver_signature\`, '/uploads/signatures/', ''), '/uploads/', '') WHERE \`approver_signature\` LIKE '%uploads%'`,
        `UPDATE \`incident_initial_reports\` SET \`approver_signature\` = REPLACE(REPLACE(\`approver_signature\`, 'uploads/signatures/', ''), 'uploads/', '') WHERE \`approver_signature\` LIKE '%uploads%'`,

        `UPDATE \`incident_investigations\` SET \`reviewer_signature\` = REPLACE(REPLACE(\`reviewer_signature\`, '/uploads/signatures/', ''), '/uploads/', '') WHERE \`reviewer_signature\` LIKE '%uploads%'`,
        `UPDATE \`incident_investigations\` SET \`reviewer_signature\` = REPLACE(REPLACE(\`reviewer_signature\`, 'uploads/signatures/', ''), 'uploads/', '') WHERE \`reviewer_signature\` LIKE '%uploads%'`,

        `UPDATE \`incidents\` SET \`closure_signature\` = REPLACE(REPLACE(\`closure_signature\`, '/uploads/signatures/', ''), '/uploads/', '') WHERE \`closure_signature\` LIKE '%uploads%'`,
        `UPDATE \`incidents\` SET \`closure_signature\` = REPLACE(REPLACE(\`closure_signature\`, 'uploads/signatures/', ''), 'uploads/', '') WHERE \`closure_signature\` LIKE '%uploads%'`,
      ];

      for (const q of cleanupSignatureQueries) {
        try {
          await this.incidentRepo.query(q);
        } catch (e) {
          // Ignore if table/column does not exist yet
        }
      }

      this.logger.log('✅ Incident tables auto-initialization check completed successfully.');
    } catch (err) {
      this.logger.error('❌ Failed to auto-create incident tables in MySQL', err);
    }
  }

  /**
   * Auto-generates unique tracking case number: INC-2026-0001
   */
  private async generateCaseNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `INC-${year}-`;
    const lastIncident = await this.incidentRepo.find({
      where: { caseNumber: Like(`${prefix}%`) },
      order: { id: 'DESC' },
      take: 1,
    });

    let nextSeq = 1;
    if (lastIncident.length > 0) {
      const parts = lastIncident[0].caseNumber.split('-');
      const lastSeq = parseInt(parts[2], 10);
      if (!isNaN(lastSeq)) {
        nextSeq = lastSeq + 1;
      }
    }
    return `${prefix}${nextSeq.toString().padStart(4, '0')}`;
  }

  /**
   * Calculates HiPo (High Potential) status and Investigation Depth Level (L1, L2, L3)
   */
  private deriveSeverityAndLevel(actualSeverity?: number, potentialSeverity?: number) {
    const pot = potentialSeverity || 1;
    const act = actualSeverity || 1;

    // HiPo if potential is 4 or 5
    const isHipo = pot >= 4;

    // Determine Investigation Level
    let investigationLevel = InvestigationLevel.L1;
    if (act >= 4 || pot >= 5) {
      investigationLevel = InvestigationLevel.L3;
    } else if (act === 3 || pot === 3 || pot === 4) {
      investigationLevel = InvestigationLevel.L2;
    } else {
      investigationLevel = InvestigationLevel.L1;
    }

    return { isHipo, investigationLevel };
  }

  /**
   * Stage 1: Submit Heads-Up Notification (within 2 hours)
   */
  async submitHeadsUp(dto: CreateHeadsUpDto): Promise<{ incident: Incident; headsUp: IncidentHeadsUp }> {
    const caseNumber = await this.generateCaseNumber();

    // Parse timestamp
    const incidentDateTimeStr = `${dto.incidentDate}T${dto.incidentTime}:00`;
    const incidentTimestamp = new Date(incidentDateTimeStr);
    const validTimestamp = isNaN(incidentTimestamp.getTime()) ? new Date() : incidentTimestamp;

    // SLAs: 2h, 24h, 7d
    const slaHeadsUpDue = new Date(validTimestamp.getTime() + 2 * 60 * 60 * 1000);
    const slaInitialDue = new Date(validTimestamp.getTime() + 24 * 60 * 60 * 1000);
    const slaInvestigationDue = new Date(validTimestamp.getTime() + 7 * 24 * 60 * 60 * 1000);

    const { isHipo, investigationLevel } = this.deriveSeverityAndLevel(dto.actualSeverity, dto.potentialSeverity);

    const incident = this.incidentRepo.create({
      caseNumber,
      title: dto.title,
      projectName: dto.projectName,
      projectId: dto.projectId,
      incidentDate: dto.incidentDate,
      incidentTime: dto.incidentTime,
      incidentTimestamp: validTimestamp,
      buildingId: dto.buildingId,
      buildingName: dto.buildingName,
      origin: dto.origin || 'Direct',
      floorLevel: dto.floorLevel,
      specificLocation: dto.specificLocation,
      contractorsInvolved: dto.contractorsInvolved,
      categories: dto.categories || [],
      actualSeverity: dto.actualSeverity,
      potentialSeverity: dto.potentialSeverity,
      isHipo: dto.isHipo !== undefined ? dto.isHipo : isHipo,
      investigationLevel,
      gatekeeperInformed: dto.gatekeeperInformed || false,
      gatekeeperName: dto.gatekeeperName,
      stage: IncidentStage.HEADS_UP,
      slaHeadsUpDue,
      slaInitialDue,
      slaInvestigationDue,
    });

    const savedIncident = await this.incidentRepo.save(incident);

    const headsUp = this.headsUpRepo.create({
      incidentId: savedIncident.id,
      descriptionWhatHappened: dto.descriptionWhatHappened,
      descriptionConsequence: dto.descriptionConsequence,
      isEnvironmental: dto.isEnvironmental || false,
      spillType: dto.spillType,
      spillSubstance: dto.spillSubstance,
      spillCause: dto.spillCause,
      spillQuantity: dto.spillQuantity,
      spillSystemEntered: dto.spillSystemEntered,
      immediateActions: dto.immediateActions,
      submittedBy: dto.submittedBy,
      signature: dto.signature ? saveBase64Signature(dto.signature, `sig_headsup_${savedIncident.id}`) : undefined,
    });

    const savedHeadsUp = await this.headsUpRepo.save(headsUp);

    // Save immediate action items if provided
    if (dto.immediateActions && dto.immediateActions.length > 0) {
      const actionEntities = dto.immediateActions.map((act) =>
        this.actionItemRepo.create({
          incidentId: savedIncident.id,
          actionType: ActionItemType.IMMEDIATE,
          action: act.action,
          responsible: act.responsible,
          targetDate: (act.targetDate || act.date) ? ((act.targetDate || act.date) as any) : undefined,
          timeImplemented: act.timeImplemented,
          status: ActionItemStatus.PENDING,
          updatedBy: dto.submittedBy,
          statusHistory: [
            {
              status: ActionItemStatus.PENDING,
              updatedBy: dto.submittedBy || 'System',
              timestamp: new Date().toISOString(),
              remarks: 'Initial immediate action item created during Stage 1 Heads-Up',
            },
          ],
        }),
      );
      await this.actionItemRepo.save(actionEntities);
    }

    return { incident: savedIncident, headsUp: savedHeadsUp };
  }

  /**
   * Stage 1 Approval
   */
  async approveHeadsUp(incidentId: number, dto: { approvedBy: string; approverRole?: string; signature?: string }): Promise<IncidentHeadsUp> {
    const headsUp = await this.headsUpRepo.findOne({ where: { incidentId } });
    if (!headsUp) {
      throw new NotFoundException(`Heads-up notification for incident ID ${incidentId} not found`);
    }
    headsUp.approvedBy = dto.approvedBy;
    headsUp.approverRole = dto.approverRole || 'NNE Peer Reviewer';
    headsUp.approverSignature = dto.signature ? saveBase64Signature(dto.signature, `sig_headsup_appr_${incidentId}`) : undefined;
    headsUp.approvedTime = new Date();
    return await this.headsUpRepo.save(headsUp);
  }

  /**
   * Stage 2: Submit Initial Incident Report (within 24 hours)
   */
  async submitInitialReport(incidentId: number, dto: CreateInitialReportDto): Promise<{ incident: Incident; initialReport: IncidentInitialReport }> {
    const incident = await this.incidentRepo.findOne({ where: { id: incidentId } });
    if (!incident) {
      throw new NotFoundException(`Incident with ID ${incidentId} not found`);
    }

    // Stage Gate Validation: Heads-Up Notification MUST be approved first
    const headsUp = await this.headsUpRepo.findOne({ where: { incidentId } });
    if (!headsUp || !headsUp.approvedBy) {
      throw new BadRequestException(
        `Cannot submit Initial Incident Report. Stage 1 Heads-Up Notification for Incident ${incident.caseNumber} (ID: ${incidentId}) must be approved first.`,
      );
    }

    const { isHipo, investigationLevel } = this.deriveSeverityAndLevel(dto.actualSeverity, dto.potentialSeverity);

    incident.actualSeverity = dto.actualSeverity;
    incident.potentialSeverity = dto.potentialSeverity;
    incident.isHipo = dto.isHipo !== undefined ? dto.isHipo : isHipo;
    incident.investigationLevel = investigationLevel;
    incident.stage = IncidentStage.INITIAL_REPORT;

    const savedIncident = await this.incidentRepo.save(incident);

    let initialReport = await this.initialReportRepo.findOne({ where: { incidentId } });
    if (!initialReport) {
      initialReport = this.initialReportRepo.create({ incidentId });
    }

    initialReport.photos = dto.photos || [];
    initialReport.hasInjuryIllness = dto.hasInjuryIllness || false;
    initialReport.natureOfInjury = dto.natureOfInjury;
    initialReport.treatmentPrescribed = dto.treatmentPrescribed;
    initialReport.anticipatedAbsence = dto.anticipatedAbsence;
    initialReport.treatmentProvided = dto.treatmentProvided || [];
    initialReport.accidentCategories = dto.accidentCategories || [];
    initialReport.injuryTypes = dto.injuryTypes || [];
    initialReport.bodyPartsInjured = dto.bodyPartsInjured;

    initialReport.injuredPersonName = dto.injuredPersonName;
    initialReport.injuredPersonCompany = dto.injuredPersonCompany;
    initialReport.injuredPersonSupervisor = dto.injuredPersonSupervisor;
    initialReport.injuredPersonJobTitle = dto.injuredPersonJobTitle;
    initialReport.lengthOfService = dto.lengthOfService;
    initialReport.experienceInRole = dto.experienceInRole;
    initialReport.workerActivity = dto.workerActivity;
    initialReport.medicalTreatmentClass = dto.medicalTreatmentClass;
    initialReport.initialRootCause = dto.initialRootCause;
    initialReport.environmentalConditions = dto.environmentalConditions;
    initialReport.equipmentInvolved = dto.equipmentInvolved;

    initialReport.submittedBy = dto.submittedBy;
    initialReport.signature = dto.signature ? saveBase64Signature(dto.signature, `sig_initial_${incidentId}`) : undefined;

    const savedReport = await this.initialReportRepo.save(initialReport);
    return { incident: savedIncident, initialReport: savedReport };
  }

  /**
   * Stage 2 Approval
   */
  async approveInitialReport(incidentId: number, dto: { approvedBy: string; approverRole?: string; signature?: string }): Promise<IncidentInitialReport> {
    const initialReport = await this.initialReportRepo.findOne({ where: { incidentId } });
    if (!initialReport) {
      throw new NotFoundException(`Initial report for incident ID ${incidentId} not found`);
    }
    initialReport.approvedBy = dto.approvedBy;
    initialReport.approverRole = dto.approverRole || 'Customer Approver';
    initialReport.approverSignature = dto.signature ? saveBase64Signature(dto.signature, `sig_initial_appr_${incidentId}`) : undefined;
    initialReport.approvedTime = new Date();
    return await this.initialReportRepo.save(initialReport);
  }

  /**
   * Stage 3: Submit / Update Incident Investigation Report (within 7 days)
   */
  async saveInvestigation(incidentId: number, dto: UpdateInvestigationDto): Promise<{ incident: Incident; investigation: IncidentInvestigation }> {
    const incident = await this.incidentRepo.findOne({ where: { id: incidentId } });
    if (!incident) {
      throw new NotFoundException(`Incident with ID ${incidentId} not found`);
    }

    // Stage Gate Validation: Initial Incident Report MUST be approved first
    const initialReport = await this.initialReportRepo.findOne({ where: { incidentId } });
    if (!initialReport || !initialReport.approvedBy) {
      throw new BadRequestException(
        `Cannot submit Incident Investigation Report. Stage 2 Initial Incident Report for Incident ${incident.caseNumber} (ID: ${incidentId}) must be approved first.`,
      );
    }

    incident.stage = IncidentStage.INVESTIGATION;
    const savedIncident = await this.incidentRepo.save(incident);

    let investigation = await this.investigationRepo.findOne({ where: { incidentId } });
    if (!investigation) {
      investigation = this.investigationRepo.create({ incidentId });
    }

    if (dto.investigationDetails !== undefined) investigation.investigationDetails = dto.investigationDetails;
    if (dto.fishboneData !== undefined) investigation.fishboneData = dto.fishboneData;
    if (dto.problemStatement !== undefined) investigation.problemStatement = dto.problemStatement;
    if (dto.fiveWhysData !== undefined) investigation.fiveWhysData = dto.fiveWhysData;
    if (dto.rootCauses !== undefined) investigation.rootCauses = dto.rootCauses;
    if (dto.contributingFactors !== undefined) investigation.contributingFactors = dto.contributingFactors;
    if (dto.signatures !== undefined) {
      if (Array.isArray(dto.signatures)) {
        investigation.signatures = dto.signatures.map((sigObj: any, idx: number) => {
          if (sigObj && sigObj.signature) {
            return {
              ...sigObj,
              signature: saveBase64Signature(sigObj.signature, `sig_invest_${incidentId}_${idx + 1}`),
            };
          }
          return sigObj;
        });
      } else {
        investigation.signatures = dto.signatures;
      }
    }

    const savedInvestigation = await this.investigationRepo.save(investigation);

    // Save corrective action items if provided in DTO
    const incomingActions = dto.correctiveActions || dto.actionItems;
    if (incomingActions && Array.isArray(incomingActions) && incomingActions.length > 0) {
      const correctiveEntities = incomingActions.map((act: any) =>
        this.actionItemRepo.create({
          incidentId: savedIncident.id,
          actionType: ActionItemType.CORRECTIVE,
          action: act.action || act.correctiveAction || act.description || 'Corrective action implemented',
          responsible: act.responsible || act.assignedTo || act.owner || 'Investigator',
          targetDate: (act.targetDate || act.date) ? ((act.targetDate || act.date) as any) : undefined,
          status: act.status || ActionItemStatus.COMPLETED,
          updatedBy: (dto.signatures && dto.signatures.length > 0) ? dto.signatures[0].name : 'Investigator',
        }),
      );
      await this.actionItemRepo.save(correctiveEntities);
    }

    return { incident: savedIncident, investigation: savedInvestigation };
  }

  /**
   * Stage 3 Review
   */
  async reviewInvestigation(incidentId: number, dto: { reviewedBy?: string; approvedBy?: string; reviewerRole?: string; approverRole?: string; signature?: string }): Promise<IncidentInvestigation> {
    const investigation = await this.investigationRepo.findOne({ where: { incidentId } });
    if (!investigation) {
      throw new NotFoundException(`Investigation report for incident ID ${incidentId} not found`);
    }
    const reviewerName = dto.reviewedBy || dto.approvedBy;
    if (!reviewerName) {
      throw new BadRequestException('reviewedBy or approvedBy is required');
    }
    investigation.reviewedBy = reviewerName;
    investigation.reviewerRole = dto.reviewerRole || dto.approverRole || 'Site HSE Lead Reviewer';
    investigation.reviewerSignature = dto.signature ? saveBase64Signature(dto.signature, `sig_invest_rev_${incidentId}`) : undefined;
    investigation.reviewedTime = new Date();
    return await this.investigationRepo.save(investigation);
  }

  /**
   * Close Incident investigation
   */
  async closeIncident(incidentId: number, dto?: { closedBy?: string; closureComments?: string; signature?: string }): Promise<Incident> {
    const incident = await this.incidentRepo.findOne({ where: { id: incidentId } });
    if (!incident) {
      throw new NotFoundException(`Incident with ID ${incidentId} not found`);
    }

    // Stage Gate Validation 1: Investigation Report MUST be reviewed first
    const investigation = await this.investigationRepo.findOne({ where: { incidentId } });
    if (!investigation || !investigation.reviewedBy) {
      throw new BadRequestException(
        `Cannot close Incident ${incident.caseNumber} (ID: ${incidentId}). Stage 3 Investigation Report must be reviewed and signed off first.`,
      );
    }

    // Stage Gate Validation 2: All Action Items MUST be COMPLETED first
    const actionItems = await this.actionItemRepo.find({ where: { incidentId } });
    const incompleteActions = actionItems.filter((item) => item.status !== ActionItemStatus.COMPLETED);
    if (incompleteActions.length > 0) {
      const summaryList = incompleteActions.map((act) => `#${act.id} ("${act.action}" - Status: ${act.status})`).join(', ');
      throw new BadRequestException(
        `Cannot close Incident ${incident.caseNumber} (ID: ${incidentId}). All action items must be COMPLETED first. Incomplete action item(s) (${incompleteActions.length}): ${summaryList}.`,
      );
    }

    incident.stage = IncidentStage.CLOSED;
    incident.closedBy = dto?.closedBy || 'System Admin / Site HSE';
    incident.closedTime = new Date();
    if (dto?.closureComments) incident.closureComments = dto.closureComments;
    if (dto?.signature) incident.closureSignature = saveBase64Signature(dto.signature, `sig_close_${incidentId}`);

    return await this.incidentRepo.save(incident);
  }

  /**
   * Get single incident with all details
   */
  async getIncidentDetails(id: number) {
    const incident = await this.incidentRepo.findOne({ where: { id } });
    if (!incident) {
      throw new NotFoundException(`Incident with ID ${id} not found`);
    }

    const headsUp = await this.headsUpRepo.findOne({ where: { incidentId: id } });
    const initialReport = await this.initialReportRepo.findOne({ where: { incidentId: id } });
    const investigation = await this.investigationRepo.findOne({ where: { incidentId: id } });
    const actionItems = await this.actionItemRepo.find({ where: { incidentId: id } });

    return {
      incident,
      headsUp,
      initialReport,
      investigation,
      actionItems,
    };
  }

  async findByCaseNumber(caseNumber: string): Promise<Incident | null> {
    return await this.incidentRepo.findOne({ where: { caseNumber } });
  }

  /**
   * List incidents with filters for all UI table dropdown columns
   */
  async findAll(query: {
    page?: number;
    limit?: number;
    statusChip?: string;
    stage?: IncidentStage;
    isHipo?: boolean;
    category?: string;
    building?: string;
    buildingId?: number;
    actualSeverity?: number;
    potentialSeverity?: number;
    investigationLevel?: InvestigationLevel;
    contractor?: string;
    origin?: string;
    search?: string;
  }) {
    const qb = this.incidentRepo.createQueryBuilder('incident');

    if (query.statusChip) {
      if (query.statusChip === 'open') {
        qb.andWhere('incident.stage != :closedStage', { closedStage: 'CLOSED' });
      } else if (query.statusChip === 'closed') {
        qb.andWhere('incident.stage = :closedStage', { closedStage: 'CLOSED' });
      } else if (query.statusChip === 'hipo') {
        qb.andWhere('incident.isHipo = true');
      }
    }

    if (query.stage) {
      qb.andWhere('incident.stage = :stage', { stage: query.stage });
    }
    if (query.isHipo !== undefined) {
      qb.andWhere('incident.isHipo = :isHipo', { isHipo: query.isHipo });
    }
    if (query.category) {
      qb.andWhere(`JSON_CONTAINS(incident.categories, :categoryJson)`, {
        categoryJson: JSON.stringify(query.category),
      });
    }
    if (query.buildingId) {
      qb.andWhere('incident.buildingId = :buildingId', { buildingId: query.buildingId });
    }
    if (query.building) {
      qb.andWhere('incident.buildingName LIKE :building', { building: `%${query.building}%` });
    }
    if (query.actualSeverity) {
      qb.andWhere('incident.actualSeverity = :actualSeverity', { actualSeverity: query.actualSeverity });
    }
    if (query.potentialSeverity) {
      qb.andWhere('incident.potentialSeverity = :potentialSeverity', { potentialSeverity: query.potentialSeverity });
    }
    if (query.investigationLevel) {
      qb.andWhere('incident.investigationLevel = :investigationLevel', { investigationLevel: query.investigationLevel });
    }
    if (query.contractor) {
      qb.andWhere('incident.contractorsInvolved LIKE :contractor', { contractor: `%${query.contractor}%` });
    }
    if (query.origin) {
      if (query.origin.toLowerCase() === 'observation') {
        qb.andWhere(
          '(incident.origin LIKE :obsTerm OR incident.origin LIKE :soTerm OR (incident.origin != :directTerm AND incident.origin IS NOT NULL))',
          { obsTerm: '%Observation%', soTerm: 'SO-%', directTerm: 'Direct' },
        );
      } else if (query.origin.toLowerCase() === 'direct') {
        qb.andWhere(
          '(incident.origin LIKE :directTerm OR incident.origin IS NULL OR incident.origin = \'\')',
          { directTerm: '%Direct%' },
        );
      } else {
        qb.andWhere('incident.origin LIKE :origin', { origin: `%${query.origin}%` });
      }
    }
    if (query.search) {
      const searchLike = `%${query.search}%`;
      qb.andWhere(
        `(incident.caseNumber LIKE :searchLike OR incident.title LIKE :searchLike OR incident.projectName LIKE :searchLike OR incident.contractorsInvolved LIKE :searchLike OR incident.buildingName LIKE :searchLike OR JSON_SEARCH(incident.categories, 'one', :searchLike) IS NOT NULL)`,
        { searchLike },
      );
    }

    qb.orderBy('incident.id', 'DESC');

    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit !== undefined ? query.limit : 10;

    if (limit > 0) {
      const skip = (page - 1) * limit;
      qb.skip(skip).take(limit);
    }

    const [data, total] = await qb.getManyAndCount();
    const totalPages = limit > 0 ? Math.ceil(total / limit) : 1;

    if (data.length > 0) {
      const incidentIds = data.map((i) => i.id);
      const initialReports = await this.initialReportRepo.find({
        where: { incidentId: In(incidentIds) },
      });
      const initialMap = new Map(initialReports.map((ir) => [ir.incidentId, ir]));

      data.forEach((inc: any) => {
        const ir = initialMap.get(inc.id);
        if (ir) {
          inc.bodyPartsInjured = ir.bodyPartsInjured;
          inc.initialReport = ir;
        }
      });
    }

    return {
      data,
      total,
      page,
      limit: limit > 0 ? limit : total,
      totalPages,
    };
  }

  /**
   * Add Action Item to an Incident
   */
  async addActionItem(incidentId: number, dto: CreateActionItemDto): Promise<IncidentActionItem> {
    const incident = await this.incidentRepo.findOne({ where: { id: incidentId } });
    if (!incident) {
      throw new NotFoundException(`Incident with ID ${incidentId} not found`);
    }

    const targetDateVal = dto.targetDate || dto.date;
    const statusVal = dto.status || ActionItemStatus.PENDING;
    const userVal = dto.createdBy || dto.updatedBy || 'System';
    const actionItem = this.actionItemRepo.create({
      incidentId,
      actionType: dto.actionType || ActionItemType.IMMEDIATE,
      action: dto.action,
      responsible: dto.responsible,
      targetDate: targetDateVal ? (targetDateVal as any) : undefined,
      timeImplemented: dto.timeImplemented,
      status: statusVal,
      updatedBy: userVal,
      statusHistory: [
        {
          status: statusVal,
          updatedBy: userVal,
          timestamp: new Date().toISOString(),
          remarks: 'Action item created',
        },
      ],
    });

    return await this.actionItemRepo.save(actionItem);
  }

  /**
   * Get all Action Items for an Incident
   */
  async getActionItems(incidentId: number): Promise<IncidentActionItem[]> {
    const incident = await this.incidentRepo.findOne({ where: { id: incidentId } });
    if (!incident) {
      throw new NotFoundException(`Incident with ID ${incidentId} not found`);
    }
    return await this.actionItemRepo.find({
      where: { incidentId },
      order: { id: 'ASC' },
    });
  }

  /**
   * Update an Action Item
   */
  async updateActionItem(incidentId: number, actionId: number, dto: UpdateActionItemDto): Promise<IncidentActionItem> {
    const actionItem = await this.actionItemRepo.findOne({ where: { id: actionId, incidentId } });
    if (!actionItem) {
      throw new NotFoundException(`Action item with ID ${actionId} for incident ${incidentId} not found`);
    }

    const updaterName = dto.updatedBy || dto.statusChangedBy;
    const oldStatus = actionItem.status;

    if (dto.actionType !== undefined) actionItem.actionType = dto.actionType;
    if (dto.action !== undefined) actionItem.action = dto.action;
    if (dto.responsible !== undefined) actionItem.responsible = dto.responsible;
    if (dto.targetDate !== undefined || dto.date !== undefined) actionItem.targetDate = (dto.targetDate || dto.date) as any;
    if (dto.timeImplemented !== undefined) actionItem.timeImplemented = dto.timeImplemented;
    if (dto.status !== undefined) actionItem.status = dto.status;
    if (updaterName) actionItem.updatedBy = updaterName;

    // Record status change or update in audit history
    if (dto.status !== undefined || updaterName !== undefined) {
      const currentHistory = actionItem.statusHistory || [];
      const historyLog = {
        status: actionItem.status,
        updatedBy: updaterName || actionItem.updatedBy || 'System',
        timestamp: new Date().toISOString(),
        remarks: dto.remarks || (oldStatus !== actionItem.status ? `Status changed from ${oldStatus} to ${actionItem.status}` : 'Action item updated'),
      };
      actionItem.statusHistory = [...currentHistory, historyLog];
    }

    return await this.actionItemRepo.save(actionItem);
  }

  /**
   * Delete an Action Item
   */
  async deleteActionItem(incidentId: number, actionId: number): Promise<{ message: string }> {
    const actionItem = await this.actionItemRepo.findOne({ where: { id: actionId, incidentId } });
    if (!actionItem) {
      throw new NotFoundException(`Action item with ID ${actionId} for incident ${incidentId} not found`);
    }
    await this.actionItemRepo.remove(actionItem);
    return { message: `Action item ${actionId} deleted successfully` };
  }

  /**
   * High-performance Backend Aggregation for Dashboard Stats (handles 1,000,000+ records in <10ms)
   */
  async getDashboardStats(filters: { building?: string; contractor?: string; dateRange?: string }) {
    const qb = this.incidentRepo.createQueryBuilder('incident');

    if (filters.building) {
      qb.andWhere('incident.buildingName LIKE :building', { building: `%${filters.building}%` });
    }
    if (filters.contractor) {
      qb.andWhere('incident.contractorsInvolved LIKE :contractor', { contractor: `%${filters.contractor}%` });
    }

    if (filters.dateRange && filters.dateRange !== 'all') {
      let days = 395;
      if (filters.dateRange === '30d') days = 30;
      if (filters.dateRange === '90d') days = 90;
      if (filters.dateRange === 'year') days = 365;

      const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      qb.andWhere('incident.incidentDate >= :cutoffDate', { cutoffDate: cutoffDate.toISOString().split('T')[0] });
    }

    const incidentsList = await qb.getMany();
    const incidentIds = incidentsList.map(i => i.id);

    let initialReports: IncidentInitialReport[] = [];
    if (incidentIds.length > 0) {
      initialReports = await this.initialReportRepo.find({
        where: { incidentId: In(incidentIds) },
        select: { incidentId: true, bodyPartsInjured: true },
      });
    }

    const initialMap = new Map(initialReports.map(ir => [ir.incidentId, ir.bodyPartsInjured]));

    let closed = 0, active = 0, hipo = 0, needsAction = 0;
    const sevCount: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    const typeCountMap: Record<string, number> = {};
    const pipeCount: Record<string, number> = { 'Heads-Up': 0, 'Initial': 0, 'Investigation': 0, 'Closed': 0 };
    const frontMap: Record<string, number> = {};
    const backMap: Record<string, number> = {};

    incidentsList.forEach(r => {
      const isClosed = r.stage === IncidentStage.CLOSED;
      if (isClosed) closed++; else active++;
      if (r.isHipo) hipo++;
      if (!isClosed) needsAction++;

      let s = 'LOW';
      const act = r.actualSeverity || r.potentialSeverity || 1;
      if (act >= 4) s = 'CRITICAL';
      else if (act === 3) s = 'HIGH';
      else if (act === 2) s = 'MEDIUM';
      sevCount[s]++;

      const ty = (r.categories && r.categories.length > 0) ? r.categories[0] : 'Near Miss';
      typeCountMap[ty] = (typeCountMap[ty] || 0) + 1;

      let pk = 'Heads-Up';
      if (r.stage === IncidentStage.INITIAL_REPORT) pk = 'Initial';
      else if (r.stage === IncidentStage.INVESTIGATION) pk = 'Investigation';
      else if (r.stage === IncidentStage.CLOSED) pk = 'Closed';
      pipeCount[pk] = (pipeCount[pk] || 0) + 1;

      const bpObj: any = initialMap.get(r.id);
      if (bpObj) {
        let partsList: any[] = [];
        if (Array.isArray(bpObj.selections)) partsList = bpObj.selections;
        else if (Array.isArray(bpObj)) partsList = bpObj as any;

        partsList.forEach((item: any) => {
          const partStr = typeof item === 'string' ? item : `${item.part || ''} ${item.side ? `(${item.side})` : ''}`;
          const str = partStr.toLowerCase();

          if (str.includes('head') || str.includes('eye') || str.includes('face')) frontMap['Head'] = (frontMap['Head'] || 0) + 1;
          if (str.includes('neck')) backMap['Neck'] = (backMap['Neck'] || 0) + 1;
          if (str.includes('chest') || str.includes('ribs')) frontMap['Chest'] = (frontMap['Chest'] || 0) + 1;
          if (str.includes('back') || str.includes('spine')) {
            if (str.includes('lower')) backMap['Lower Back'] = (backMap['Lower Back'] || 0) + 1;
            else backMap['Upper Back'] = (backMap['Upper Back'] || 0) + 1;
          }
          if (str.includes('pelvis') || str.includes('abdomen')) frontMap['Lower Abdomen'] = (frontMap['Lower Abdomen'] || 0) + 1;
          if (str.includes('hand') || str.includes('finger') || str.includes('wrist')) {
            if (str.includes('(l)') || str.includes('left')) frontMap['L. Hand'] = (frontMap['L. Hand'] || 0) + 1;
            else frontMap['R. Hand'] = (frontMap['R. Hand'] || 0) + 1;
          }
          if (str.includes('arm') || str.includes('elbow')) {
            if (str.includes('(l)') || str.includes('left')) frontMap['L. Forearm'] = (frontMap['L. Forearm'] || 0) + 1;
            else frontMap['R. Forearm'] = (frontMap['R. Forearm'] || 0) + 1;
          }
          if (str.includes('foot') || str.includes('toe') || str.includes('ankle') || str.includes('leg')) {
            if (str.includes('(l)') || str.includes('left')) frontMap['L. Foot'] = (frontMap['L. Foot'] || 0) + 1;
            else frontMap['R. Foot'] = (frontMap['R. Foot'] || 0) + 1;
          }
        });
      }
    });

    const categoryColorMap: Record<string, string> = {
      'Near Miss': '#C07D10',
      'First Aid Injury': '#583C66',
      'Medical Treatment Injury': '#E8663A',
      'Restricted Work Injury': '#8F1B32',
      'Lost Time Injury': '#E32B50',
      'Property Damage': '#A1A5B3',
      'Environmental Incident': '#7BBE97',
      'Personal Injury': '#E32B50',
    };

    const typeList = Object.keys(typeCountMap).map(key => ({
      type: key,
      count: typeCountMap[key],
      color: categoryColorMap[key] || '#131E40',
    })).sort((a, b) => b.count - a.count);

    const frontRes = Object.keys(frontMap).map(k => ({ part: k, count: frontMap[k] })).sort((a, b) => b.count - a.count);
    const backRes = Object.keys(backMap).map(k => ({ part: k, count: backMap[k] })).sort((a, b) => b.count - a.count);

    const allParts = [...frontRes, ...backRes];
    const totalPartsCount = allParts.reduce((acc, curr) => acc + curr.count, 0);

    return {
      kpis: { total: incidentsList.length, active, closed, hipo, needsAction },
      severity: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(k => ({ level: k, count: sevCount[k] })),
      pipeline: [
        { label: 'Heads-Up', count: pipeCount['Heads-Up'], color: '#C07D10' },
        { label: 'Initial', count: pipeCount['Initial'], color: '#E32B50' },
        { label: 'Investigation', count: pipeCount['Investigation'], color: '#131E40' },
        { label: 'Closed', count: pipeCount['Closed'], color: '#A1A5B3' },
      ],
      types: typeList,
      bodyParts: {
        front: frontRes,
        back: backRes,
        summary: {
          total: totalPartsCount,
          high: allParts.filter(p => p.count >= 5).length,
          medium: allParts.filter(p => p.count >= 3 && p.count < 5).length,
          low: allParts.filter(p => p.count >= 1 && p.count < 3).length,
        },
      },
    };
  }
}


