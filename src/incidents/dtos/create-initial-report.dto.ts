import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsArray, IsNumber, Min, Max } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class BodyPartSelectionDto {
  @IsString()
  @IsNotEmpty()
  part: string;

  @IsString()
  @IsOptional()
  side?: 'L' | 'R';
}

export class BodyPartsInjuredDto {
  @IsArray()
  selections: BodyPartSelectionDto[];

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateInitialReportDto {
  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  actualSeverity?: number;

  @IsNumber()
  @IsNotEmpty()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  potentialSeverity: number;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === '1' || value === true || value === 1) return true;
    if (value === 'false' || value === '0' || value === false || value === 0) return false;
    return value;
  })
  isHipo?: boolean;

  @IsArray()
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return [value];
      }
    }
    return value;
  })
  photos?: string[];

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === '1' || value === true || value === 1) return true;
    if (value === 'false' || value === '0' || value === false || value === 0) return false;
    return value;
  })
  hasInjuryIllness?: boolean;

  @IsString()
  @IsOptional()
  natureOfInjury?: string;

  @IsString()
  @IsOptional()
  treatmentPrescribed?: string;

  @IsString()
  @IsOptional()
  anticipatedAbsence?: string;

  @IsArray()
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return [value];
      }
    }
    return value;
  })
  treatmentProvided?: string[];

  @IsArray()
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return [value];
      }
    }
    return value;
  })
  accidentCategories?: string[];

  @IsArray()
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return [value];
      }
    }
    return value;
  })
  injuryTypes?: string[];

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  })
  bodyPartsInjured?: BodyPartsInjuredDto;

  @IsString()
  @IsOptional()
  injuredPersonName?: string;

  @IsString()
  @IsOptional()
  injuredPersonCompany?: string;

  @IsString()
  @IsOptional()
  injuredPersonSupervisor?: string;

  @IsString()
  @IsOptional()
  injuredPersonJobTitle?: string;

  @IsString()
  @IsOptional()
  lengthOfService?: string;

  @IsString()
  @IsOptional()
  experienceInRole?: string;

  @IsString()
  @IsOptional()
  workerActivity?: string;

  @IsString()
  @IsOptional()
  medicalTreatmentClass?: string;

  @IsString()
  @IsOptional()
  initialRootCause?: string;

  @IsString()
  @IsOptional()
  environmentalConditions?: string;

  @IsString()
  @IsOptional()
  equipmentInvolved?: string;

  @IsString()
  @IsOptional()
  submittedBy?: string;

  @IsString()
  @IsOptional()
  signature?: string;
}
