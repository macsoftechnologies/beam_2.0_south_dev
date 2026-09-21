import { IsString, IsOptional, IsArray, IsNumber } from 'class-validator';

export class CreateSpotCheckDto {
  @IsOptional()
  @IsString()
  spotCheckRef?: string;

  @IsOptional()
  @IsString()
  workPackage?: string;

  @IsOptional()
  @IsString()
  projectName?: string;

  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  time?: string;

  @IsOptional()
  buildingId?: any;

  @IsOptional()
  @IsString()
  buildingName?: string;

  @IsOptional()
  @IsString()
  floorLevel?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  selectedRooms?: any;

  @IsOptional()
  selectedZones?: any;

  @IsOptional()
  @IsString()
  weather?: string;

  @IsOptional()
  @IsString()
  activityName?: string;

  @IsOptional()
  @IsString()
  companyInvolved?: string;

  @IsOptional()
  @IsString()
  permitId?: string;

  @IsOptional()
  @IsString()
  ramsId?: string;

  // 1 | PTW
  @IsOptional()
  highRiskActivities?: any;

  @IsOptional()
  @IsString()
  ifHotWork?: string;

  @IsOptional()
  @IsString()
  chk1_2?: string;

  @IsOptional()
  @IsString()
  chk1_3?: string;

  @IsOptional()
  @IsString()
  chk1_4?: string;

  @IsOptional()
  @IsString()
  chk1_5?: string;

  @IsOptional()
  @IsString()
  chk1_6?: string;

  @IsOptional()
  @IsString()
  chk1_7?: string;

  @IsOptional()
  @IsString()
  chk1_8?: string;

  // 2 | COMMUNICATION
  @IsOptional()
  @IsString()
  chk2_1?: string;

  @IsOptional()
  @IsString()
  briefingDate?: string;

  @IsOptional()
  @IsString()
  briefingTime?: string;

  @IsOptional()
  @IsString()
  conductedBy?: string;

  @IsOptional()
  participants?: any;

  @IsOptional()
  keyTopics?: any;

  @IsOptional()
  @IsString()
  otherTopic?: string;

  @IsOptional()
  @IsString()
  chk2_1_5?: string;

  @IsOptional()
  @IsString()
  explainNoBriefing?: string;

  // 3 | SUMMARY
  @IsOptional()
  @IsString()
  chk3_2?: string;

  @IsOptional()
  @IsString()
  safetyIssueCreated?: string;

  @IsOptional()
  @IsString()
  safetyIssueRef?: string;

  @IsOptional()
  @IsString()
  findings?: string;

  @IsOptional()
  correctiveActions?: any;

  // 3 | SIGNATURES
  @IsOptional()
  @IsString()
  foremanName?: string;

  @IsOptional()
  @IsString()
  foremanCompany?: string;

  @IsOptional()
  @IsString()
  foremanDate?: string;

  @IsOptional()
  @IsString()
  foremanSignature?: string;

  @IsOptional()
  attachments?: any;

  @IsOptional()
  @IsString()
  inspectorName?: string;

  @IsOptional()
  @IsString()
  inspectorCompany?: string;

  @IsOptional()
  @IsString()
  inspectorDate?: string;

  @IsOptional()
  @IsString()
  inspectorSignature?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  createdByUserId?: any;

  @IsOptional()
  @IsString()
  createdByUserName?: string;

  @IsOptional()
  @IsString()
  createdByRole?: string;
}
