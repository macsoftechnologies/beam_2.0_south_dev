import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum SpotCheckStatus {
  DRAFT = 'DRAFT',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CLOSED = 'CLOSED',
}

@Entity('spot_checks')
export class SpotCheck {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'spot_check_ref', type: 'varchar', length: 100, unique: true })
  spotCheckRef: string;

  @Column({ name: 'work_package', type: 'varchar', length: 255, nullable: true })
  workPackage?: string;

  get projectName(): string | undefined {
    return this.workPackage;
  }

  @Column({ name: 'date', type: 'date', nullable: true })
  date?: string;

  @Column({ name: 'time', type: 'varchar', length: 50, nullable: true })
  time?: string;

  @Column({ name: 'building_id', type: 'int', nullable: true })
  buildingId?: number;

  @Column({ name: 'building_name', type: 'varchar', length: 255, nullable: true })
  buildingName?: string;

  @Column({ name: 'floor_level', type: 'varchar', length: 150, nullable: true })
  floorLevel?: string;

  @Column({ name: 'location', type: 'text', nullable: true })
  location?: string;

  @Column({ name: 'selected_rooms', type: 'json', nullable: true })
  selectedRooms?: string[];

  @Column({ name: 'selected_zones', type: 'json', nullable: true })
  selectedZones?: any;

  @Column({ name: 'weather', type: 'varchar', length: 255, nullable: true })
  weather?: string;

  @Column({ name: 'activity_name', type: 'varchar', length: 255, nullable: true })
  activityName?: string;

  @Column({ name: 'company_involved', type: 'varchar', length: 255, nullable: true })
  companyInvolved?: string;

  @Column({ name: 'permit_id', type: 'varchar', length: 100, nullable: true })
  permitId?: string;

  @Column({ name: 'rams_id', type: 'varchar', length: 100, nullable: true })
  ramsId?: string;

  // 1 | PERMIT TO WORK (PTW)
  @Column({ name: 'high_risk_activities', type: 'json', nullable: true })
  highRiskActivities?: string[];

  @Column({ name: 'if_hot_work', type: 'varchar', length: 100, nullable: true })
  ifHotWork?: string;

  @Column({ name: 'chk1_2', type: 'varchar', length: 20, nullable: true })
  chk1_2?: string;

  @Column({ name: 'chk1_3', type: 'varchar', length: 20, nullable: true })
  chk1_3?: string;

  @Column({ name: 'chk1_4', type: 'varchar', length: 20, nullable: true })
  chk1_4?: string;

  @Column({ name: 'chk1_5', type: 'varchar', length: 20, nullable: true })
  chk1_5?: string;

  @Column({ name: 'chk1_6', type: 'varchar', length: 20, nullable: true })
  chk1_6?: string;

  @Column({ name: 'chk1_7', type: 'varchar', length: 20, nullable: true })
  chk1_7?: string;

  @Column({ name: 'chk1_8', type: 'varchar', length: 20, nullable: true })
  chk1_8?: string;

  // 2 | COMMUNICATION / TOOLBOX TALK
  @Column({ name: 'chk2_1', type: 'varchar', length: 20, nullable: true })
  chk2_1?: string;

  @Column({ name: 'briefing_date', type: 'date', nullable: true })
  briefingDate?: string;

  @Column({ name: 'briefing_time', type: 'varchar', length: 50, nullable: true })
  briefingTime?: string;

  @Column({ name: 'conducted_by', type: 'varchar', length: 255, nullable: true })
  conductedBy?: string;

  @Column({ name: 'participants', type: 'varchar', length: 50, nullable: true })
  participants?: string;

  @Column({ name: 'key_topics', type: 'json', nullable: true })
  keyTopics?: string[];

  @Column({ name: 'other_topic', type: 'text', nullable: true })
  otherTopic?: string;

  @Column({ name: 'chk2_1_5', type: 'varchar', length: 20, nullable: true })
  chk2_1_5?: string;

  @Column({ name: 'explain_no_briefing', type: 'text', nullable: true })
  explainNoBriefing?: string;

  // 3 | SUMMARY
  @Column({ name: 'chk3_2', type: 'varchar', length: 20, nullable: true })
  chk3_2?: string;

  @Column({ name: 'safety_issue_created', type: 'varchar', length: 20, nullable: true })
  safetyIssueCreated?: string;

  @Column({ name: 'safety_issue_ref', type: 'varchar', length: 100, nullable: true })
  safetyIssueRef?: string;

  @Column({ name: 'findings', type: 'text', nullable: true })
  findings?: string;

  @Column({ name: 'corrective_actions', type: 'json', nullable: true })
  correctiveActions?: any[];

  // 3 | SIGNATURES AND EVIDENCE
  @Column({ name: 'foreman_name', type: 'varchar', length: 255, nullable: true })
  foremanName?: string;

  @Column({ name: 'foreman_company', type: 'varchar', length: 255, nullable: true })
  foremanCompany?: string;

  @Column({ name: 'foreman_date', type: 'date', nullable: true })
  foremanDate?: string;

  @Column({ name: 'foreman_signature', type: 'longtext', nullable: true })
  foremanSignature?: string;

  @Column({ name: 'attachments', type: 'json', nullable: true })
  attachments?: any[];

  @Column({ name: 'inspector_name', type: 'varchar', length: 255, nullable: true })
  inspectorName?: string;

  @Column({ name: 'inspector_company', type: 'varchar', length: 255, nullable: true })
  inspectorCompany?: string;

  @Column({ name: 'inspector_date', type: 'date', nullable: true })
  inspectorDate?: string;

  @Column({ name: 'inspector_signature', type: 'longtext', nullable: true })
  inspectorSignature?: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: SpotCheckStatus,
    default: SpotCheckStatus.COMPLETED,
  })
  status: SpotCheckStatus;

  @Column({ name: 'created_by_user_id', type: 'int', nullable: true })
  createdByUserId?: number;

  @Column({ name: 'created_by_user_name', type: 'varchar', length: 255, nullable: true })
  createdByUserName?: string;

  @Column({ name: 'created_by_role', type: 'varchar', length: 100, nullable: true })
  createdByRole?: string;

  @CreateDateColumn({ name: 'created_time' })
  createdTime: Date;

  @UpdateDateColumn({ name: 'updated_time' })
  updatedTime: Date;
}
