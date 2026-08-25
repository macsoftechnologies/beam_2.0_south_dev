import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class StageApprovalDto {
  @IsString()
  @IsNotEmpty()
  approvedBy: string;

  @IsString()
  @IsOptional()
  approverRole?: string;

  @IsString()
  @IsOptional()
  signature?: string;

  @IsString()
  @IsOptional()
  comments?: string;
}

export class ReviewInvestigationDto {
  @IsString()
  @IsOptional()
  reviewedBy?: string;

  @IsString()
  @IsOptional()
  approvedBy?: string;

  @IsString()
  @IsOptional()
  reviewerRole?: string;

  @IsString()
  @IsOptional()
  approverRole?: string;

  @IsString()
  @IsOptional()
  signature?: string;

  @IsString()
  @IsOptional()
  comments?: string;
}

export class CloseIncidentDto {
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
