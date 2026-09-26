import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { SafetyInspectionItem } from './safety-inspection-item.entity';

export enum SafetyInspectionStatus {
  DRAFT = 'DRAFT',
  IN_PROGRESS = 'IN_PROGRESS',
  CLOSED = 'CLOSED',
  FAILED = 'FAILED',
}

@Entity('safety_inspections')
export class SafetyInspection {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'inspection_number', type: 'varchar', length: 100, unique: true })
  inspectionNumber: string;

  @Column({ name: 'project_name', type: 'varchar', length: 255, nullable: true })
  projectName?: string;

  @Column({ name: 'project_id', type: 'int', nullable: true })
  projectId?: number;

  @Column({ name: 'project_no', type: 'varchar', length: 100, nullable: true })
  projectNo?: string;

  @Column({ name: 'building_id', type: 'int', nullable: true })
  buildingId?: number;

  @Column({ name: 'building_name', type: 'varchar', length: 255, nullable: true })
  buildingName?: string;

  @Column({ name: 'floor_level', type: 'varchar', length: 150, nullable: true })
  floorLevel?: string;

  @Column({ name: 'specific_location', type: 'text', nullable: true })
  specificLocation?: string;

  @Column({ name: 'selected_rooms', type: 'json', nullable: true })
  selectedRooms?: string[];

  @Column({ name: 'selected_zones', type: 'json', nullable: true })
  selectedZones?: any;

  @Column({ name: 'inspection_date', type: 'date', nullable: true })
  inspectionDate?: string;

  @Column({ name: 'performed_by', type: 'json', nullable: true })
  performedBy?: any[];

  @Column({ name: 'participants', type: 'json', nullable: true })
  participants?: any[];

  @Column({
    name: 'status',
    type: 'enum',
    enum: SafetyInspectionStatus,
    default: SafetyInspectionStatus.IN_PROGRESS,
  })
  status: SafetyInspectionStatus;

  @Column({ name: 'is_completed', type: 'tinyint', default: 0 })
  isCompleted: boolean;

  @Column({ name: 'score', type: 'int', nullable: true, default: 100 })
  score?: number;

  @Column({ name: 'summary_counts', type: 'json', nullable: true })
  summaryCounts?: { green: number; yellow: number; red: number; na: number };

  @Column({ name: 'created_by_user_id', type: 'int', nullable: true })
  createdByUserId?: number;

  @Column({ name: 'created_by_user_name', type: 'varchar', length: 255, nullable: true })
  createdByUserName?: string;

  @Column({ name: 'created_by_role', type: 'varchar', length: 100, nullable: true })
  createdByRole?: string;

  @Column({ name: 'modified_by_user_name', type: 'varchar', length: 255, nullable: true })
  modifiedByUserName?: string;

  @CreateDateColumn({ name: 'created_time' })
  createdTime: Date;

  @UpdateDateColumn({ name: 'updated_time' })
  updatedTime: Date;

  @OneToMany(() => SafetyInspectionItem, (item) => item.inspection, { cascade: true, eager: true })
  items: SafetyInspectionItem[];

  history?: any[];
}

