import { IsOptional, IsString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class PlanSearchDto {
    @IsOptional()
    @IsString()
    Date?: string;

    @IsOptional()
    @IsString()
    Week?: string;

    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    Year?: number;

    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    Month?: number;

    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    Site_Id?: number;

    @IsOptional()
    Building_Id?: any;

    @IsOptional()
    Sub_Contractor_Id?: any;

    @IsOptional()
    @IsString()
    Room_Type?: string;

    @IsOptional()
    Floor_Id?: any;

    @IsOptional()
    @IsString()
    from_date?: string;

    @IsOptional()
    @IsString()
    to_date?: string;

    @IsOptional()
    @IsString()
    start_time?: string;

    @IsOptional()
    @IsString()
    end_time?: string;

    @IsOptional()
    @IsString()
    area?: string;

    @IsOptional()
    @IsString()
    permit_type?: string;

    @IsOptional()
    @IsString()
    permit_under?: string;

    @IsOptional()
    @IsString()
    night_shift?: string;

    @IsOptional()
    @IsString()
    new_date?: string;

    @IsOptional()
    @IsString()
    new_end_time?: string;

    @IsOptional()
    hras?: any;

    @IsOptional()
    @IsString()
    Room_Nos?: string;

    @IsOptional()
    @IsString()
    Request_status?: string;

    // Safety flags
    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    Hot_work?: number;

    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    working_on_electrical_system?: number;

    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    working_hazardious_substen?: number;

    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    using_cranes_or_lifting?: number;

    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    pressure_testing_of_equipment?: number;

    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    pressure_tesing_of_equipment?: number;

    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    working_at_height?: number;

    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    working_confined_spaces?: number;

    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    work_in_atex_area?: number;

    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    securing_facilities?: number;

    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    excavation_works?: number;

    // PPE flags
    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    specific_gloves?: number;

    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    eye_protection?: number;

    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    fall_protection?: number;

    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    hearing_protection?: number;

    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    respiratory_protection?: number;

    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    taskSpecificPPE?: number;

    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    power_on?: number;

    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    pressurization?: number;

    @IsOptional()
    @IsString()
    fromDate?: string;

    @IsOptional()
    @IsString()
    toDate?: string;

    @IsOptional()
    @IsString()
    Start_Time?: string;

    @IsOptional()
    @IsString()
    End_Time?: string;

    @IsOptional()
    Zone_Id?: any;

    @IsOptional()
    @IsString()
    zone?: string;

    @IsOptional()
    zoneIds?: any;

    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    Type_Of_Activity_Id?: number;

    @IsOptional()
    @IsString()
    PermitNo?: string;

    @IsOptional()
    @IsString()
    Activity?: string;
}