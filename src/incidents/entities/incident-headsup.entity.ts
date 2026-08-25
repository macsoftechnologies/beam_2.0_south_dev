import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, JoinColumn, OneToOne } from 'typeorm';
import { Incident } from './incident.entity';

@Entity('incident_headsup')
export class IncidentHeadsUp {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'incident_id', type: 'int' })
  incidentId: number;

  @OneToOne(() => Incident, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'incident_id' })
  incident: Incident;

  @Column({ name: 'description_what_happened', type: 'text', nullable: true })
  descriptionWhatHappened?: string;

  @Column({ name: 'description_consequence', type: 'text', nullable: true })
  descriptionConsequence?: string;

  @Column({ name: 'is_environmental', type: 'boolean', default: false })
  isEnvironmental: boolean;

  @Column({ name: 'spill_type', type: 'json', nullable: true })
  spillType?: string[];

  @Column({ name: 'spill_substance', type: 'varchar', length: 255, nullable: true })
  spillSubstance?: string;

  @Column({ name: 'spill_cause', type: 'text', nullable: true })
  spillCause?: string;

  @Column({ name: 'spill_quantity', type: 'varchar', length: 100, nullable: true })
  spillQuantity?: string;

  @Column({ name: 'spill_system_entered', type: 'json', nullable: true })
  spillSystemEntered?: string[];

  @Column({ name: 'immediate_actions', type: 'json', nullable: true })
  immediateActions?: { action: string; responsible: string; targetDate?: string; date?: string; timeImplemented?: string }[];

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
