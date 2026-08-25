import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum ObservationType {
  POSITIVE = 'POSITIVE',
  NEEDS_ATTENTION = 'NEEDS_ATTENTION',
}

export enum NatureOfFinding {
  GOOD_PRACTICE = 'GOOD_PRACTICE',
  UNSAFE_ACT = 'UNSAFE_ACT',
  UNSAFE_CONDITION = 'UNSAFE_CONDITION',
}

export enum ObservationRiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum ObservationStatus {
  OPEN = 'OPEN',
  ASSIGNED = 'ASSIGNED',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
  ESCALATED = 'ESCALATED',
}

@Entity('observations')
export class Observation {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'observation_number', type: 'varchar', length: 100, unique: true })
  observationNumber: string;

  @Column({
    name: 'observation_type',
    type: 'enum',
    enum: ObservationType,
    default: ObservationType.NEEDS_ATTENTION,
  })
  observationType: ObservationType;

  @Column({
    name: 'nature_of_finding',
    type: 'enum',
    enum: NatureOfFinding,
    default: NatureOfFinding.UNSAFE_CONDITION,
  })
  natureOfFinding: NatureOfFinding;

  @Column({ name: 'subject', type: 'varchar', length: 255 })
  subject: string;

  @Column({ name: 'safety_category', type: 'varchar', length: 150 })
  safetyCategory: string;

  @Column({
    name: 'risk_level',
    type: 'enum',
    enum: ObservationRiskLevel,
    default: ObservationRiskLevel.MEDIUM,
  })
  riskLevel: ObservationRiskLevel;

  @Column({ name: 'description', type: 'text' })
  description: string;

  @Column({ name: 'project_name', type: 'varchar', length: 255, nullable: true })
  projectName?: string;

  @Column({ name: 'project_id', type: 'int', nullable: true })
  projectId?: number;

  @Column({ name: 'building_id', type: 'int', nullable: true })
  buildingId?: number;

  @Column({ name: 'building_name', type: 'varchar', length: 255, nullable: true })
  buildingName?: string;

  @Column({ name: 'floor_level', type: 'varchar', length: 150, nullable: true })
  floorLevel?: string;

  @Column({ name: 'specific_location', type: 'text', nullable: true })
  specificLocation?: string;

  @Column({ name: 'assigned_contractor_id', type: 'int', nullable: true })
  assignedContractorId?: number;

  @Column({ name: 'assigned_contractor_name', type: 'varchar', length: 255, nullable: true })
  assignedContractorName?: string;

  @Column({ name: 'photos', type: 'json', nullable: true })
  photos?: string[];

  @Column({
    name: 'status',
    type: 'enum',
    enum: ObservationStatus,
    default: ObservationStatus.OPEN,
  })
  status: ObservationStatus;

  @Column({ name: 'created_by_user_id', type: 'int', nullable: true })
  createdByUserId?: number;

  @Column({ name: 'created_by_user_name', type: 'varchar', length: 255, nullable: true })
  createdByUserName?: string;

  @Column({ name: 'created_by_contractor_id', type: 'int', nullable: true })
  createdByContractorId?: number;

  @Column({ name: 'created_by_role', type: 'varchar', length: 100, default: 'DEPARTMENT' })
  createdByRole: string; // DEPARTMENT, CONTRACTOR, SITE_HSE, ADMIN

  @Column({ name: 'resolution_notes', type: 'text', nullable: true })
  resolutionNotes?: string;

  @Column({ name: 'resolution_photos', type: 'json', nullable: true })
  resolutionPhotos?: string[];

  @Column({ name: 'closed_by', type: 'varchar', length: 255, nullable: true })
  closedBy?: string;

  @Column({ name: 'closed_time', type: 'datetime', nullable: true })
  closedTime?: Date;

  @Column({ name: 'closure_comments', type: 'text', nullable: true })
  closureComments?: string;

  @Column({ name: 'closure_signature', type: 'text', nullable: true })
  closureSignature?: string;

  @Column({ name: 'escalated_incident_id', type: 'int', nullable: true })
  escalatedIncidentId?: number;

  @CreateDateColumn({ name: 'created_time', type: 'datetime' })
  createdTime: Date;

  @UpdateDateColumn({ name: 'updated_time', type: 'datetime' })
  updatedTime: Date;
}
