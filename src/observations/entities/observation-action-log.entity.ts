import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

export enum ObservationActionType {
  CREATED = 'CREATED',
  ASSIGNED = 'ASSIGNED',
  CONTRACTOR_ACCEPTED = 'CONTRACTOR_ACCEPTED',
  CONTRACTOR_REJECTED = 'CONTRACTOR_REJECTED',
  REASSIGNED = 'REASSIGNED',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
  ESCALATED = 'ESCALATED',
}

@Entity('observation_action_logs')
export class ObservationActionLog {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'observation_id', type: 'int' })
  observationId: number;

  @Column({
    name: 'action_type',
    type: 'enum',
    enum: ObservationActionType,
  })
  actionType: ObservationActionType;

  @Column({ name: 'performed_by_user_id', type: 'int', nullable: true })
  performedByUserId?: number;

  @Column({ name: 'performed_by_user_name', type: 'varchar', length: 255 })
  performedByUserName: string;

  @Column({ name: 'performed_by_user_role', type: 'varchar', length: 100 })
  performedByUserRole: string; // DEPARTMENT, CONTRACTOR, SITE_HSE, ADMIN

  @Column({ name: 'previous_contractor', type: 'varchar', length: 255, nullable: true })
  previousContractor?: string;

  @Column({ name: 'new_contractor', type: 'varchar', length: 255, nullable: true })
  newContractor?: string;

  @Column({ name: 'remarks', type: 'text', nullable: true })
  remarks?: string;

  @Column({ name: 'photos', type: 'json', nullable: true })
  photos?: string[];

  @CreateDateColumn({ name: 'timestamp', type: 'datetime' })
  timestamp: Date;
}
