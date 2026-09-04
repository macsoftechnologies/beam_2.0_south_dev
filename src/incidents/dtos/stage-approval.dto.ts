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

export class ReturnForRevisionDto {
  @IsString()
  @IsNotEmpty()
  stage: 'HEADS_UP' | 'INITIAL_REPORT' | 'INVESTIGATION';

  @IsString()
  @IsNotEmpty()
  returnedBy: string;

  @IsString()
  @IsOptional()
  role?: string;

  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsString()
  @IsOptional()
  signature?: string;
}
