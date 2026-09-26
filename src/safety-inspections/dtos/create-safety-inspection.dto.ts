import { IsString, IsOptional, IsNumber, IsBoolean, IsArray } from 'class-validator';

export class SafetyChecklistItemDto {
  @IsNumber()
  itemIndex: number;

  @IsString()
  categoryName: string;

  @IsString()
  status: string; // 'na' | 'green' | 'yellow' | 'red'

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsString()
  commentAuthor?: string;

  @IsOptional()
  commentDate?: string | Date;

  @IsOptional()
  photos?: string[];

  @IsOptional()
  issues?: any[];
}

export class CreateSafetyInspectionDto {
  @IsOptional()
  @IsString()
  projectName?: string;

  @IsOptional()
  @IsNumber()
  projectId?: number;

  @IsOptional()
  @IsString()
  projectNo?: string;

  @IsOptional()
  @IsNumber()
  buildingId?: number;

  @IsOptional()
  @IsString()
  buildingName?: string;

  @IsOptional()
  @IsString()
  floorLevel?: string;

  @IsOptional()
  @IsString()
  specificLocation?: string;

  @IsOptional()
  selectedRooms?: any;

  @IsOptional()
  selectedZones?: any;

  @IsOptional()
  @IsString()
  inspectionDate?: string;

  @IsOptional()
  performedBy?: any;

  @IsOptional()
  participants?: any;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  isCompleted?: boolean | string | number;

  @IsOptional()
  @IsNumber()
  score?: number;

  @IsOptional()
  summaryCounts?: any;

  @IsOptional()
  @IsNumber()
  createdByUserId?: number;

  @IsOptional()
  @IsString()
  createdByUserName?: string;

  @IsOptional()
  @IsString()
  createdByRole?: string;

  @IsOptional()
  @IsString()
  modifiedByUserName?: string;

  @IsOptional()
  @IsNumber()
  modifiedByUserId?: number;

  @IsOptional()
  @IsString()
  modifiedByUserRole?: string;

  @IsOptional()
  @IsString()
  actionType?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  checklistItems?: any;
}
