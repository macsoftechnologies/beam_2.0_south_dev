import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

export enum InspectionActionType {
  CREATED = 'CREATED',
  REOPENED = 'REOPENED',
  UPDATED = 'UPDATED',
  CLOSED = 'CLOSED',
}

@Entity('safety_inspection_action_logs')
export class SafetyInspectionActionLog {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'inspection_id', type: 'int' })
  inspectionId: number;

  @Column({
    name: 'action_type',
    type: 'varchar',
    length: 50,
  })
  actionType: InspectionActionType | string;

  @Column({ name: 'performed_by_user_id', type: 'int', nullable: true })
  performedByUserId?: number;

  @Column({ name: 'performed_by_user_name', type: 'varchar', length: 255 })
  performedByUserName: string;

  @Column({ name: 'performed_by_user_role', type: 'varchar', length: 100, nullable: true })
  performedByUserRole?: string;

  @Column({ name: 'remarks', type: 'text', nullable: true })
  remarks?: string;

  @CreateDateColumn({ name: 'timestamp', type: 'datetime' })
  timestamp: Date;
}
