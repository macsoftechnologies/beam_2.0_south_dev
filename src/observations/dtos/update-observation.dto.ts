import { IsString, IsOptional, IsEnum, IsNumber, IsArray } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ObservationType, NatureOfFinding, ObservationRiskLevel } from '../entities/observation.entity';

export class UpdateObservationDto {
  @IsEnum(ObservationType)
  @IsOptional()
  observationType?: ObservationType;

  @IsEnum(NatureOfFinding)
  @IsOptional()
  natureOfFinding?: NatureOfFinding;

  @IsString()
  @IsOptional()
  subject?: string;

  @IsString()
  @IsOptional()
  safetyCategory?: string;

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
  riskLevel?: ObservationRiskLevel;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  immediateActionTaken?: string;

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

  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return [];
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return [value];
      }
    }
    return Array.isArray(value) ? value : [value];
  })
  existingPhotos?: string[];

  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return [];
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return [value];
      }
    }
    return Array.isArray(value) ? value : [value];
  })
  photos?: string[];

  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null || value === undefined ? undefined : Number(value)))
  editedByUserId?: number;

  @IsString()
  @IsOptional()
  editedByUserName?: string;

  @IsString()
  @IsOptional()
  editedByUserRole?: string;

  @IsString()
  @IsOptional()
  editRemarks?: string;
}
