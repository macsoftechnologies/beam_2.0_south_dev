import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToOne, OneToMany } from 'typeorm';

export enum IncidentStage {
  HEADS_UP = 'HEADS_UP',
  INITIAL_REPORT = 'INITIAL_REPORT',
  INVESTIGATION = 'INVESTIGATION',
  CLOSED = 'CLOSED',
}

export enum InvestigationLevel {
  L1 = 'L1', // 5 Whys
  L2 = 'L2', // Fishbone + 5 Whys
  L3 = 'L3', // TapRooT® / A3
}

@Entity('incidents')
export class Incident {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'case_number', type: 'varchar', length: 100, unique: true })
  caseNumber: string;

  @Column({ name: 'project_name', type: 'varchar', length: 255, nullable: true })
  projectName?: string;

  @Column({ name: 'project_id', type: 'int', nullable: true })
  projectId?: number;

  @Column({ name: 'incident_date', type: 'date', nullable: true })
  incidentDate?: string;

  @Column({ name: 'incident_time', type: 'varchar', length: 50, nullable: true })
  incidentTime?: string;

  @Column({ name: 'incident_timestamp', type: 'datetime', nullable: true })
  incidentTimestamp?: Date;

  @Column({ name: 'building_id', type: 'int', nullable: true })
  buildingId?: number;

  @Column({ name: 'building_name', type: 'varchar', length: 255, nullable: true })
  buildingName?: string;

  @Column({ name: 'origin', type: 'varchar', length: 100, default: 'Direct' })
  origin: string;

  @Column({ name: 'floor_level', type: 'varchar', length: 150, nullable: true })
  floorLevel?: string;

  @Column({ name: 'specific_location', type: 'text', nullable: true })
  specificLocation?: string;

  @Column({ name: 'contractors_involved', type: 'text', nullable: true })
  contractorsInvolved?: string;

  @Column({
    name: 'stage',
    type: 'enum',
    enum: IncidentStage,
    default: IncidentStage.HEADS_UP,
  })
  stage: IncidentStage;

  @Column({ name: 'categories', type: 'json', nullable: true })
  categories?: string[];

  @Column({ name: 'actual_severity', type: 'int', nullable: true })
  actualSeverity?: number; // 1-5 scale (N/A for Near Miss)

  @Column({ name: 'potential_severity', type: 'int', nullable: true })
  potentialSeverity?: number; // 1-5 scale

  @Column({ name: 'is_hipo', type: 'boolean', default: false })
  isHipo: boolean; // Auto-derived if potentialSeverity >= 4 or manually set

  @Column({
    name: 'investigation_level',
    type: 'enum',
    enum: InvestigationLevel,
    default: InvestigationLevel.L1,
  })
  investigationLevel: InvestigationLevel;

  @Column({ name: 'gatekeeper_informed', type: 'boolean', default: false })
  gatekeeperInformed: boolean;

  @Column({ name: 'gatekeeper_name', type: 'varchar', length: 255, nullable: true })
  gatekeeperName?: string;

  @Column({ name: 'sla_headsup_due', type: 'datetime', nullable: true })
  slaHeadsUpDue?: Date;

  @Column({ name: 'sla_initial_due', type: 'datetime', nullable: true })
  slaInitialDue?: Date;

  @Column({ name: 'sla_investigation_due', type: 'datetime', nullable: true })
  slaInvestigationDue?: Date;

  @Column({ name: 'closed_by', type: 'varchar', length: 255, nullable: true })
  closedBy?: string;

  @Column({ name: 'closed_time', type: 'datetime', nullable: true })
  closedTime?: Date;

  @Column({ name: 'closure_comments', type: 'text', nullable: true })
  closureComments?: string;

  @Column({ name: 'closure_signature', type: 'text', nullable: true })
  closureSignature?: string;

  @Column({ name: 'status', type: 'int', default: 1 })
  status: number;

  @CreateDateColumn({ name: 'created_time', type: 'datetime' })
  createdTime: Date;

  @UpdateDateColumn({ name: 'updated_time', type: 'datetime' })
  updatedTime: Date;
}
