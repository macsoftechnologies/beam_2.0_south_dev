import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('incident_notification_group_members')
export class IncidentNotificationGroupMember {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'int', nullable: true })
  userId: number;

  @Column({ type: 'int', nullable: true })
  employeeId: number;

  @Column({ type: 'varchar', length: 150, nullable: true })
  name: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  email: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phoneNumber: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  userType: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  departmentName: string;

  @Column({ type: 'boolean', default: true })
  isEmailEnabled: boolean;

  @Column({ type: 'boolean', default: true })
  isSmsEnabled: boolean;

  @Column({ type: 'boolean', default: true })
  isInAppEnabled: boolean;

  @Column({ type: 'int', nullable: true })
  addedByUserId: number;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
