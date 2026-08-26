import { IsString, IsOptional, IsNumber } from 'class-validator';
import { Transform } from 'class-transformer';

const ToOptionalNumber = () =>
  Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return undefined;
    const cleaned = String(value).replace(/'/g, '').trim();
    if (cleaned === '') return undefined;
    const num = Number(cleaned);
    return isNaN(num) ? undefined : num;
  });

export class SearchRequestDto {
  @IsOptional()
  Start?: any;

  // Pagination
  @ToOptionalNumber()
  @IsNumber()
  @IsOptional()
  Page?: number;

  @ToOptionalNumber()
  @IsNumber()
  @IsOptional()
  End?: number; // acts as limit

  // Main filters
  @IsString()
  @IsOptional()
  PermitNo?: string;

  @IsString()
  @IsOptional()
  fromDate?: string;

  @IsString()
  @IsOptional()
  toDate?: string;

  @IsString()
  @IsOptional()
  Activity?: string;

  @IsString()
  @IsOptional()
  Request_status?: string;

  @ToOptionalNumber()
  @IsNumber()
  @IsOptional()
  Site_Id?: number;

  @IsOptional()
  Building_Id?: any;

  // Floor_Id accepts either a numeric floor ID or a floor name string
  @IsString()
  @IsOptional()
  Floor_Id?: string;

  // Room_Nos accepts either a numeric room ID or a room name string
  @IsString()
  @IsOptional()
  Room_Nos?: string;

  @IsOptional()
  Zone_Id?: any;

  @IsString()
  @IsOptional()
  zone?: string;

  @IsOptional()
  zoneIds?: any;

  @IsOptional()
  Sub_Contractor_Id?: any;

  @ToOptionalNumber()
  @IsNumber()
  @IsOptional()
  Type_Of_Activity_Id?: number;

  @IsString()
  @IsOptional()
  Room_Type?: string;

  @IsString()
  @IsOptional()
  permit_type?: string;

  @IsString()
  @IsOptional()
  permit_under?: string;

  @IsString()
  @IsOptional()
  night_shift?: string;

  @IsString()
  @IsOptional()
  new_date?: string;

  @IsString()
  @IsOptional()
  new_end_time?: string;

  @IsString()
  @IsOptional()
  Start_Time?: string;

  @IsString()
  @IsOptional()
  End_Time?: string;

  // Login Type for role validation
  @IsString()
  @IsOptional()
  LoginType?: string;

  @ToOptionalNumber()
  @IsNumber()
  @IsOptional()
  user_id?: number;

  // Safety work flags from sub-tables
  @ToOptionalNumber()
  @IsNumber()
  @IsOptional()
  Hot_work?: number;

  @ToOptionalNumber()
  @IsNumber()
  @IsOptional()
  working_on_electrical_system?: number;

  @ToOptionalNumber()
  @IsNumber()
  @IsOptional()
  working_hazardious_substen?: number;

  @ToOptionalNumber()
  @IsNumber()
  @IsOptional()
  using_cranes_or_lifting?: number;

  @ToOptionalNumber()
  @IsNumber()
  @IsOptional()
  pressure_testing_of_equipment?: number;

  @ToOptionalNumber()
  @IsNumber()
  @IsOptional()
  pressure_tesing_of_equipment?: number;

  @ToOptionalNumber()
  @IsNumber()
  @IsOptional()
  working_at_height?: number;

  @ToOptionalNumber()
  @IsNumber()
  @IsOptional()
  working_confined_spaces?: number;

  @ToOptionalNumber()
  @IsNumber()
  @IsOptional()
  work_in_atex_area?: number;

  @ToOptionalNumber()
  @IsNumber()
  @IsOptional()
  securing_facilities?: number;

  @ToOptionalNumber()
  @IsNumber()
  @IsOptional()
  excavation_works?: number;

  @ToOptionalNumber()
  @IsNumber()
  @IsOptional()
  specific_gloves?: number;

  @ToOptionalNumber()
  @IsNumber()
  @IsOptional()
  eye_protection?: number;

  @ToOptionalNumber()
  @IsNumber()
  @IsOptional()
  fall_protection?: number;

  @ToOptionalNumber()
  @IsNumber()
  @IsOptional()
  hearing_protection?: number;

  @ToOptionalNumber()
  @IsNumber()
  @IsOptional()
  respiratory_protection?: number;

  @ToOptionalNumber()
  @IsNumber()
  @IsOptional()
  hras?: number;

  @ToOptionalNumber()
  @IsNumber()
  @IsOptional()
  taskSpecificPPE?: number;

  @IsString()
  @IsOptional()
  area?: string;

  @ToOptionalNumber()
  @IsNumber()
  @IsOptional()
  power_on?: number;

  @ToOptionalNumber()
  @IsNumber()
  @IsOptional()
  pressurization?: number;

  @IsString()
  @IsOptional()
  permit_under_filter?: string;
}
