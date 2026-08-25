import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Incident } from './incident.entity';

export enum ActionItemType {
  IMMEDIATE = 'IMMEDIATE',
  CORRECTIVE = 'CORRECTIVE',
}

export enum ActionItemStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
}

export interface ActionItemStatusHistoryLog {
  status: ActionItemStatus;
  updatedBy: string;
  timestamp: string;
  remarks?: string;
}

@Entity('incident_action_items')
export class IncidentActionItem {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'incident_id', type: 'int' })
  incidentId: number;

  @ManyToOne(() => Incident, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'incident_id' })
  incident: Incident;

  @Column({
    name: 'action_type',
    type: 'enum',
    enum: ActionItemType,
    default: ActionItemType.IMMEDIATE,
  })
  actionType: ActionItemType;

  @Column({ name: 'action', type: 'text' })
  action: string;

  @Column({ name: 'responsible', type: 'varchar', length: 255 })
  responsible: string;

  @Column({ name: 'target_date', type: 'date', nullable: true })
  targetDate?: string;

  @Column({ name: 'time_implemented', type: 'varchar', length: 100, nullable: true })
  timeImplemented?: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: ActionItemStatus,
    default: ActionItemStatus.PENDING,
  })
  status: ActionItemStatus;

  @Column({ name: 'updated_by', type: 'varchar', length: 255, nullable: true })
  updatedBy?: string;

  @Column({ name: 'status_history', type: 'json', nullable: true })
  statusHistory?: ActionItemStatusHistoryLog[];

  @CreateDateColumn({ name: 'created_time', type: 'datetime' })
  createdTime: Date;

  @UpdateDateColumn({ name: 'updated_time', type: 'datetime' })
  updatedTime: Date;
}
