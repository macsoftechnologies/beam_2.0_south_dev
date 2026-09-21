import { IsString, IsNotEmpty, IsOptional, IsEnum, IsNumber, IsArray } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ObservationType, NatureOfFinding, ObservationRiskLevel } from '../entities/observation.entity';

export class CreateObservationDto {
  @IsEnum(ObservationType)
  @IsOptional()
  observationType?: ObservationType; // POSITIVE or NEEDS_ATTENTION

  @IsEnum(NatureOfFinding)
  @IsOptional()
  natureOfFinding?: NatureOfFinding; // GOOD_PRACTICE, UNSAFE_ACT, UNSAFE_CONDITION

  @IsString()
  @IsNotEmpty()
  subject: string;

  @IsString()
  @IsNotEmpty()
  safetyCategory: string;

  @IsString()
  @IsOptional()
  subcategory?: string;

  @IsString()
  @IsOptional()
  date?: string;

  @IsString()
  @IsOptional()
  observationDate?: string;

  @IsString()
  @IsOptional()
  time?: string;

  @IsString()
  @IsOptional()
  observationTime?: string;

  @IsEnum(ObservationRiskLevel)
  @IsOptional()
  riskLevel?: ObservationRiskLevel; // LOW, MEDIUM, HIGH, CRITICAL

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsOptional()
  projectName?: string;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  projectId?: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  buildingId?: number;

  @IsString()
  @IsOptional()
  buildingName?: string;

  @IsString()
  @IsOptional()
  floorLevel?: string;

  @IsString()
  @IsOptional()
  specificLocation?: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null || value === undefined ? undefined : Number(value)))
  assignedContractorId?: number;

  @IsString()
  @IsOptional()
  assignedContractorName?: string;

  @IsString()
  @IsOptional()
  deadline?: string;

  @IsString()
  @IsOptional()
  dueDate?: string;

  @IsString()
  @IsOptional()
  targetDate?: string;

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

  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null || value === undefined ? undefined : Number(value)))
  createdByUserId?: number;

  @IsString()
  @IsOptional()
  createdByUserName?: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null || value === undefined ? undefined : Number(value)))
  createdByContractorId?: number;

  @IsString()
  @IsOptional()
  createdByRole?: string; // DEPARTMENT, CONTRACTOR, SITE_HSE, ADMIN

  @IsString()
  @IsOptional()
  immediateActionTaken?: string;
}
