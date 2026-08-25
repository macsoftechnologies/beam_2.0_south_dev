import { IsString, IsOptional, IsArray, IsObject } from 'class-validator';
import type { FishboneCategoryData, FiveWhysChain, MandatoryAttachmentChecklist, InvestigationSignature } from '../entities/incident-investigation.entity';

export class UpdateInvestigationDto {
  @IsString()
  @IsOptional()
  investigationDetails?: string;

  @IsArray()
  @IsOptional()
  fishboneData?: FishboneCategoryData[];

  @IsString()
  @IsOptional()
  problemStatement?: string;

  @IsArray()
  @IsOptional()
  fiveWhysData?: FiveWhysChain[];

  @IsArray()
  @IsOptional()
  rootCauses?: string[];

  @IsArray()
  @IsOptional()
  contributingFactors?: string[];

  @IsObject()
  @IsOptional()
  mandatoryAttachments?: MandatoryAttachmentChecklist;

  @IsArray()
  @IsOptional()
  signatures?: InvestigationSignature[];
}
