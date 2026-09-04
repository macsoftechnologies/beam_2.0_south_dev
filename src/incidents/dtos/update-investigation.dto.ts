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

  @IsOptional()
  environmentalDetails?: any;

  @IsOptional()
  propertyDamageDetails?: any;

  @IsArray()
  @IsOptional()
  signatures?: InvestigationSignature[];

  @IsArray()
  @IsOptional()
  team?: any[];

  @IsArray()
  @IsOptional()
  witnesses?: any[];

  @IsString()
  @IsOptional()
  effectDescription?: string;

  @IsString()
  @IsOptional()
  effect?: string;

  @IsString()
  @IsOptional()
  lessonsLearned?: string;

  @IsString()
  @IsOptional()
  preventativeMeasures?: string;

  @IsOptional()
  preSeverity?: number;

  @IsOptional()
  postSeverity?: number;

  @IsOptional()
  severityBefore?: number;

  @IsOptional()
  severityAfter?: number;

  @IsArray()
  @IsOptional()
  actionItems?: any[];

  @IsArray()
  @IsOptional()
  correctiveActions?: any[];

  @IsString()
  @IsOptional()
  editedBy?: string;

  @IsString()
  @IsOptional()
  editorRole?: string;

  @IsString()
  @IsOptional()
  editReason?: string;

  @IsString()
  @IsOptional()
  editorSignature?: string;

  @IsString()
  @IsOptional()
  changes?: string;
}
