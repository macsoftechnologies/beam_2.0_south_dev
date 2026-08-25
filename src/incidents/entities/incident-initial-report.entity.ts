import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, JoinColumn, OneToOne } from 'typeorm';
import { Incident } from './incident.entity';

export interface BodyPartInjurySelection {
  part: string;
  side?: 'L' | 'R';
}

@Entity('incident_initial_reports')
export class IncidentInitialReport {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'incident_id', type: 'int' })
  incidentId: number;

  @OneToOne(() => Incident, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'incident_id' })
  incident: Incident;

  @Column({ name: 'photos', type: 'json', nullable: true })
  photos?: string[];

  @Column({ name: 'has_injury_illness', type: 'boolean', default: false })
  hasInjuryIllness: boolean;

  @Column({ name: 'nature_of_injury', type: 'text', nullable: true })
  natureOfInjury?: string;

  @Column({ name: 'treatment_prescribed', type: 'text', nullable: true })
  treatmentPrescribed?: string;

  @Column({ name: 'anticipated_absence', type: 'varchar', length: 255, nullable: true })
  anticipatedAbsence?: string;

  @Column({ name: 'treatment_provided', type: 'json', nullable: true })
  treatmentProvided?: string[]; // On-Site First Aid, Off-Site Treatment, Medical Center

  @Column({ name: 'accident_categories', type: 'json', nullable: true })
  accidentCategories?: string[]; // 22 NNE categories (Electrocution, Scaffolding, Crane, Cuts, etc.)

  @Column({ name: 'injury_types', type: 'json', nullable: true })
  injuryTypes?: string[]; // 21 NNE types (Abrasion, Concussion, Burn, Fracture, etc.)

  @Column({ name: 'body_parts_injured', type: 'json', nullable: true })
  bodyPartsInjured?: {
    selections: BodyPartInjurySelection[];
    notes?: string;
  };

  @Column({ name: 'submitted_by', type: 'varchar', length: 255, nullable: true })
  submittedBy?: string;

  @Column({ name: 'signature', type: 'text', nullable: true })
  signature?: string;

  @CreateDateColumn({ name: 'submitted_time', type: 'datetime' })
  submittedTime: Date;

  @Column({ name: 'approved_by', type: 'varchar', length: 255, nullable: true })
  approvedBy?: string;

  @Column({ name: 'approver_role', type: 'varchar', length: 255, nullable: true })
  approverRole?: string;

  @Column({ name: 'approver_signature', type: 'text', nullable: true })
  approverSignature?: string;

  @Column({ name: 'approved_time', type: 'datetime', nullable: true })
  approvedTime?: Date;
}
