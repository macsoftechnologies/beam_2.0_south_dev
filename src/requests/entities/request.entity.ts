import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('requests')
export class RequestEntity {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'userId', type: 'int', nullable: true })
  userId?: number;

  @Column({ name: 'Company_Name', type: 'varchar', length: 250, nullable: true })
  companyName?: string;

  @Column({ name: 'PermitNo', type: 'varchar', length: 200, nullable: true })
  permitNo?: string;

  @Column({ name: 'Sub_Contractor_Id', type: 'int', nullable: true })
  subContractorId?: number;

  @Column({ name: 'Foreman', type: 'varchar', length: 250, nullable: true })
  foreman?: string;

  @Column({ name: 'Foreman_Phone_Number', type: 'varchar', length: 150, nullable: true })
  foremanPhoneNumber?: string;

  @Column({ name: 'Activity', type: 'varchar', length: 100, nullable: true })
  activity?: string;

  @Column({ name: 'Type_Of_Activity_Id', type: 'varchar', length: 100, nullable: true })
  typeOfActivityId?: string;

  @Column({ name: 'Request_Date', type: 'date', nullable: true })
  requestDate?: string;

  @Column({ name: 'Working_Date', type: 'date', nullable: true })
  workingDate?: string;

  @Column({ name: 'Start_Time', type: 'time', nullable: true })
  startTime?: string;

  @Column({ name: 'End_Time', type: 'time', nullable: true })
  endTime?: string;

  @Column({ name: 'Assign_Start_Time', type: 'time', nullable: true })
  assignStartTime?: string;

  @Column({ name: 'Assign_End_Time', type: 'time', nullable: true })
  assignEndTime?: string;

  @Column({ name: 'Assign_Start_Date', type: 'date', nullable: true })
  assignStartDate?: string;

  @Column({ name: 'Assign_End_Date', type: 'date', nullable: true })
  assignEndDate?: string;

  @Column({ name: 'Building_Id', type: 'int', nullable: true })
  buildingId?: number;

  @Column({ name: 'Floor_Id', type: 'varchar', length: 255, nullable: true })
  floorId?: string;

  @Column({ name: 'Plans_Id', type: 'int', nullable: true })
  plansId?: number;

  @Column({ name: 'Zone_Id', type: 'varchar', length: 255, nullable: true })
  zoneId?: string | number;

  @Column({ name: 'Room_Nos', type: 'text', nullable: true })
  roomNos?: string;

  @Column({ name: 'Room_Type', type: 'varchar', length: 150, nullable: true })
  roomType?: string;

  @Column({ name: 'Number_Of_Workers', type: 'varchar', length: 50, nullable: true })
  numberOfWorkers?: string;

  @Column({ name: 'Badge_Numbers', type: 'varchar', length: 250, nullable: true })
  badgeNumbers?: string;

  @Column({ name: 'teamId', type: 'int', nullable: true })
  teamId?: number;

  @Column({ name: 'Notes', type: 'text', nullable: true })
  notes?: string;

  @Column({ name: 'Request_status', type: 'varchar', length: 200, nullable: true })
  requestStatus?: string;

  @Column({ name: 'status', type: 'int', default: 1 })
  status: number;

  @Column({ name: 'createdTime', type: 'datetime', nullable: true })
  createdTime?: Date;

  @Column({ name: 'Site_Id', type: 'int', default: 5 })
  siteId: number;

  @Column({ name: 'permit_type', type: 'varchar', length: 255, nullable: true })
  permitType?: string;

  @Column({ name: 'permit_under', type: 'varchar', length: 200, nullable: false })
  permitUnder: string;

  @Column({ name: 'new_date', type: 'varchar', length: 200, nullable: true })
  newDate?: string;

  @Column({ name: 'new_end_time', type: 'varchar', length: 200, nullable: true })
  newEndTime?: string;

  @Column({ name: 'night_shift', type: 'varchar', length: 300, nullable: true })
  nightShift?: string;

  @Column({ name: 'Safety_Precautions', type: 'text', nullable: true })
  safetyPrecautions?: string;

  @Column({ name: 'zone', type: 'varchar', length: 255, nullable: true })
  zone?: string;
}
