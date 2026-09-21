import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { SafetyInspection } from './safety-inspection.entity';

export enum SafetyCheckItemStatus {
  NA = 'na',
  GREEN = 'green',
  YELLOW = 'yellow',
  RED = 'red',
}

@Entity('safety_inspection_items')
export class SafetyInspectionItem {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'inspection_id', type: 'int' })
  inspectionId: number;

  @Column({ name: 'item_index', type: 'int' })
  itemIndex: number;

  @Column({ name: 'category_name', type: 'varchar', length: 255 })
  categoryName: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: SafetyCheckItemStatus,
    default: SafetyCheckItemStatus.NA,
  })
  status: SafetyCheckItemStatus;

  @Column({ name: 'comment', type: 'text', nullable: true })
  comment?: string;

  @Column({ name: 'comment_author', type: 'varchar', length: 255, nullable: true })
  commentAuthor?: string;

  @Column({ name: 'comment_date', type: 'datetime', nullable: true })
  commentDate?: Date;

  @Column({ name: 'photos', type: 'json', nullable: true })
  photos?: string[];

  @Column({ name: 'issues', type: 'json', nullable: true })
  issues?: any[];

  @CreateDateColumn({ name: 'created_time' })
  createdTime: Date;

  @UpdateDateColumn({ name: 'updated_time' })
  updatedTime: Date;

  @ManyToOne(() => SafetyInspection, (inspection) => inspection.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'inspection_id' })
  inspection: SafetyInspection;
}
