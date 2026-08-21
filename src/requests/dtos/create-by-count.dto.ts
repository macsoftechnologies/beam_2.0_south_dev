import { IsString, IsOptional, IsNumber, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ZoneItemDto {
  @Type(() => Number)
  @IsNumber()
  Zone_Id: number;

  @IsString()
  zone: string;
}

export class CreateByCountDto {
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  userId?: number;

  @IsString()
  @IsOptional()
  Request_Date?: string;

  @IsString()
  @IsOptional()
  Company_Name?: string;

  // PermitNo of the ORIGINAL permit to copy from
  @IsString()
  @IsOptional()
  PermitNo?: string;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  Sub_Contractor_Id?: number;

  @IsString()
  @IsOptional()
  Foreman?: string;

  @IsString()
  @IsOptional()
  Foreman_Phone_Number?: string;

  @IsString()
  @IsOptional()
  Activity?: string;

  @IsString()
  @IsOptional()
  Type_Of_Activity_Id?: string;

  @IsString()
  @IsOptional()
  Start_Time?: string;

  @IsString()
  @IsOptional()
  End_Time?: string;

  @IsString()
  @IsOptional()
  Assign_Start_Time?: string;

  @IsString()
  @IsOptional()
  Assign_End_Time?: string;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  Site_Id?: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  Building_Id?: number;

  @IsOptional()
  Floor_Id?: any;

  @IsString()
  @IsOptional()
  Room_Nos?: string;

  @IsString()
  @IsOptional()
  Room_Type?: string;

  @IsString()
  @IsOptional()
  Assign_Start_Date?: string;

  @IsString()
  @IsOptional()
  Assign_End_Date?: string;

  @IsString()
  @IsOptional()
  Request_status?: string;

  @IsString()
  @IsOptional()
  permit_under?: string;

  @IsOptional()
  zone?: any;

  @IsString()
  @IsOptional()
  createdTime?: string;

  // Number of days to repeat the insert (loop count)
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  count?: number;

  @IsString()
  @IsOptional()
  New_End_Time?: string;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  night_shift?: number;

  @IsString()
  @IsOptional()
  new_date?: string;

  @IsString()
  @IsOptional()
  Number_Of_Workers?: string;
}
