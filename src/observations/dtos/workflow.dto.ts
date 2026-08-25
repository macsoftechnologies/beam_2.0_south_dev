import { IsString, IsNotEmpty, IsOptional, IsEnum, IsNumber, IsArray } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export enum ContractorAction {
  ACCEPT = 'ACCEPT',
  REJECT = 'REJECT',
}

export class ContractorReviewDto {
  @IsEnum(ContractorAction)
  @IsNotEmpty()
  action: ContractorAction; // ACCEPT or REJECT

  @IsString()
  @IsNotEmpty()
  remarks: string; // Mandatory reason for accept or reject

  @IsString()
  @IsNotEmpty()
  actionByUserName: string;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  actionByUserId?: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  contractorId?: number;

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
}

export class ReassignObservationDto {
  @IsNumber()
  @IsNotEmpty()
  @Type(() => Number)
  newContractorId: number;

  @IsString()
  @IsNotEmpty()
  newContractorName: string;

  @IsString()
  @IsNotEmpty()
  remarks: string; // Reassignment reason/notes

  @IsString()
  @IsNotEmpty()
  reassignedByUserName: string;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  reassignedByUserId?: number;
}

export class ResolveObservationDto {
  @IsString()
  @IsNotEmpty()
  resolutionNotes: string;

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
  resolutionPhotos?: string[];

  @IsString()
  @IsNotEmpty()
  resolvedByUserName: string;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  resolvedByUserId?: number;
}

export class CloseObservationDto {
  @IsString()
  @IsNotEmpty()
  closedBy: string;

  @IsString()
  @IsOptional()
  closureComments?: string;

  @IsString()
  @IsOptional()
  signature?: string;
}

export class EscalateObservationDto {
  @IsString()
  @IsNotEmpty()
  escalatedBy: string;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  actualSeverity?: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  potentialSeverity?: number;

  @IsString()
  @IsOptional()
  remarks?: string;
}
