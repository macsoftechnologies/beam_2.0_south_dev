import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsArray, IsDateString, IsNumber } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class ImmediateActionDto {
  @IsString()
  @IsNotEmpty()
  action: string;

  @IsString()
  @IsNotEmpty()
  responsible: string;

  @IsString()
  @IsOptional()
  targetDate?: string; // YYYY-MM-DD

  @IsString()
  @IsOptional()
  date?: string; // Friendly alias for targetDate (YYYY-MM-DD)

  @IsString()
  @IsOptional()
  timeImplemented?: string;
}

export class CreateHeadsUpDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsNotEmpty()
  projectName: string;

  @IsNumber()
  @IsOptional()
  projectId?: number;

  @IsString()
  @IsNotEmpty()
  incidentDate: string; // YYYY-MM-DD

  @IsString()
  @IsNotEmpty()
  incidentTime: string; // HH:mm (24hr)

  @IsNumber()
  @IsOptional()
  buildingId?: number;

  @IsString()
  @IsOptional()
  buildingName?: string;

  @IsString()
  @IsOptional()
  origin?: string;

  @IsString()
  @IsOptional()
  floorLevel?: string;

  @IsString()
  @IsOptional()
  specificLocation?: string;

  @IsString()
  @IsOptional()
  contractorsInvolved?: string;

  @IsArray()
  @IsOptional()
  categories?: string[];

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  actualSeverity?: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  potentialSeverity?: number;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === '1' || value === true || value === 1) return true;
    if (value === 'false' || value === '0' || value === false || value === 0) return false;
    return value;
  })
  isHipo?: boolean;

  @IsString()
  @IsOptional()
  descriptionWhatHappened?: string;

  @IsString()
  @IsOptional()
  descriptionConsequence?: string;

  @IsBoolean()
  @IsOptional()
  isEnvironmental?: boolean;

  @IsArray()
  @IsOptional()
  spillType?: string[];

  @IsString()
  @IsOptional()
  spillSubstance?: string;

  @IsString()
  @IsOptional()
  spillCause?: string;

  @IsString()
  @IsOptional()
  spillQuantity?: string;

  @IsArray()
  @IsOptional()
  spillSystemEntered?: string[];

  @IsArray()
  @IsOptional()
  immediateActions?: ImmediateActionDto[];

  @IsBoolean()
  @IsOptional()
  gatekeeperInformed?: boolean;

  @IsString()
  @IsOptional()
  gatekeeperName?: string;

  @IsString()
  @IsOptional()
  submittedBy?: string;

  @IsString()
  @IsOptional()
  signature?: string;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === '1' || value === true || value === 1) return true;
    if (value === 'false' || value === '0' || value === false || value === 0) return false;
    return value;
  })
  noFurtherInvestigation?: boolean;
}
