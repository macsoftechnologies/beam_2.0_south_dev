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

  @Column({ name: 'injured_person_name', type: 'varchar', length: 255, nullable: true })
  injuredPersonName?: string;

  @Column({ name: 'injured_person_company', type: 'varchar', length: 255, nullable: true })
  injuredPersonCompany?: string;

  @Column({ name: 'injured_person_supervisor', type: 'varchar', length: 255, nullable: true })
  injuredPersonSupervisor?: string;

  @Column({ name: 'injured_person_job_title', type: 'varchar', length: 255, nullable: true })
  injuredPersonJobTitle?: string;

  @Column({ name: 'length_of_service', type: 'varchar', length: 255, nullable: true })
  lengthOfService?: string;

  @Column({ name: 'experience_in_role', type: 'varchar', length: 255, nullable: true })
  experienceInRole?: string;

  @Column({ name: 'worker_activity', type: 'text', nullable: true })
  workerActivity?: string;

  @Column({ name: 'medical_treatment_class', type: 'varchar', length: 255, nullable: true })
  medicalTreatmentClass?: string;

  @Column({ name: 'initial_root_cause', type: 'text', nullable: true })
  initialRootCause?: string;

  @Column({ name: 'environmental_conditions', type: 'varchar', length: 255, nullable: true })
  environmentalConditions?: string;

  @Column({ name: 'equipment_involved', type: 'varchar', length: 255, nullable: true })
  equipmentInvolved?: string;

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
