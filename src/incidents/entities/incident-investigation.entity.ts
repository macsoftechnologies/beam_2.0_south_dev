import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, JoinColumn, OneToOne } from 'typeorm';
import { Incident } from './incident.entity';

export interface FishboneCategoryData {
  category: 'People' | 'Machine/Equipment' | 'Method/Procedure' | 'Materials' | 'Environmental Conditions' | 'Measurement';
  causes: {
    causeText: string;
    score: number; // 1 to 5 (1 Low, 5 High)
    isSelectedForFiveWhys: boolean;
  }[];
}

export interface FiveWhysChain {
  fishboneCauseText: string;
  why1: string;
  why2?: string;
  why3?: string;
  why4?: string;
  why5?: string;
  rootCauseSummary?: string;
}

export interface MandatoryAttachmentItem {
  key: string;
  label?: string;
  checked?: boolean;
  fileName?: string;
  fileUrl?: string;
  fileType?: string;
  fileSize?: number;
  uploadedAt?: string;
}

export interface MandatoryAttachmentChecklist {
  contractorsIncidentReport?: boolean | MandatoryAttachmentItem;
  witnessStatement?: boolean | MandatoryAttachmentItem;
  rams?: boolean | MandatoryAttachmentItem;
  trainingRecords?: boolean | MandatoryAttachmentItem;
  permitsToWork?: boolean | MandatoryAttachmentItem;
  safePlanOfAction?: boolean | MandatoryAttachmentItem;
  photos?: boolean | MandatoryAttachmentItem;
  evidenceForActionsTaken?: boolean | MandatoryAttachmentItem;
  wasteDisposalInvoice?: boolean | MandatoryAttachmentItem;
  other?: string | MandatoryAttachmentItem;
  items?: MandatoryAttachmentItem[];
  missingExplanation?: string;
}

export interface InvestigationSignature {
  role: string;
  name: string;
  signature?: string;
  date?: string;
}

@Entity('incident_investigations')
export class IncidentInvestigation {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'incident_id', type: 'int' })
  incidentId: number;

  @OneToOne(() => Incident, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'incident_id' })
  incident: Incident;

  @Column({ name: 'investigation_details', type: 'text', nullable: true })
  investigationDetails?: string;

  @Column({ name: 'fishbone_data', type: 'json', nullable: true })
  fishboneData?: FishboneCategoryData[];

  @Column({ name: 'problem_statement', type: 'text', nullable: true })
  problemStatement?: string;

  @Column({ name: 'five_whys_data', type: 'json', nullable: true })
  fiveWhysData?: FiveWhysChain[];

  @Column({ name: 'root_causes', type: 'json', nullable: true })
  rootCauses?: string[];

  @Column({ name: 'contributing_factors', type: 'json', nullable: true })
  contributingFactors?: string[];

  @Column({ name: 'mandatory_attachments', type: 'json', nullable: true })
  mandatoryAttachments?: MandatoryAttachmentChecklist;

  @Column({ name: 'environmental_details', type: 'json', nullable: true })
  environmentalDetails?: any;

  @Column({ name: 'property_damage_details', type: 'json', nullable: true })
  propertyDamageDetails?: any;

  @Column({ name: 'signatures', type: 'json', nullable: true })
  signatures?: InvestigationSignature[];

  @Column({ name: 'team', type: 'json', nullable: true })
  team?: any[];

  @Column({ name: 'witnesses', type: 'json', nullable: true })
  witnesses?: any[];

  @Column({ name: 'effect_description', type: 'text', nullable: true })
  effectDescription?: string;

  @Column({ name: 'lessons_learned', type: 'text', nullable: true })
  lessonsLearned?: string;

  @Column({ name: 'preventative_measures', type: 'text', nullable: true })
  preventativeMeasures?: string;

  @Column({ name: 'pre_severity', type: 'int', nullable: true })
  preSeverity?: number;

  @Column({ name: 'post_severity', type: 'int', nullable: true })
  postSeverity?: number;

  @CreateDateColumn({ name: 'completed_time', type: 'datetime' })
  completedTime: Date;

  @Column({ name: 'reviewed_by', type: 'varchar', length: 255, nullable: true })
  reviewedBy?: string;

  @Column({ name: 'reviewer_role', type: 'varchar', length: 255, nullable: true })
  reviewerRole?: string;

  @Column({ name: 'reviewer_signature', type: 'text', nullable: true })
  reviewerSignature?: string;

  @Column({ name: 'reviewed_time', type: 'datetime', nullable: true })
  reviewedTime?: Date;

  @Column({ name: 'edit_history', type: 'json', nullable: true })
  editHistory?: any[];
}
