import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { ActionItemType, ActionItemStatus } from '../entities/incident-action-item.entity';

export class CreateActionItemDto {
  @IsEnum(ActionItemType)
  @IsOptional()
  actionType?: ActionItemType; // IMMEDIATE or CORRECTIVE

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

  @IsEnum(ActionItemStatus)
  @IsOptional()
  status?: ActionItemStatus; // PENDING, IN_PROGRESS, COMPLETED

  @IsString()
  @IsOptional()
  createdBy?: string;

  @IsString()
  @IsOptional()
  updatedBy?: string;
}

export class UpdateActionItemDto {
  @IsEnum(ActionItemType)
  @IsOptional()
  actionType?: ActionItemType;

  @IsString()
  @IsOptional()
  action?: string;

  @IsString()
  @IsOptional()
  responsible?: string;

  @IsString()
  @IsOptional()
  targetDate?: string;

  @IsString()
  @IsOptional()
  date?: string; // Friendly alias for targetDate (YYYY-MM-DD)

  @IsString()
  @IsOptional()
  timeImplemented?: string;

  @IsEnum(ActionItemStatus)
  @IsOptional()
  status?: ActionItemStatus;

  @IsString()
  @IsOptional()
  updatedBy?: string;

  @IsString()
  @IsOptional()
  statusChangedBy?: string; // Friendly alias for updatedBy

  @IsString()
  @IsOptional()
  remarks?: string;
}
