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

export interface MandatoryAttachmentChecklist {
  contractorsIncidentReport?: boolean;
  witnessStatement?: boolean;
  rams?: boolean;
  trainingRecords?: boolean;
  permitsToWork?: boolean;
  safePlanOfAction?: boolean;
  photos?: boolean;
  evidenceForActionsTaken?: boolean;
  wasteDisposalInvoice?: boolean;
  other?: string;
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

  @Column({ name: 'signatures', type: 'json', nullable: true })
  signatures?: InvestigationSignature[];

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
}
