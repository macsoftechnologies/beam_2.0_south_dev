import { PartialType } from '@nestjs/mapped-types';
import { CreateSafetyInspectionDto } from './create-safety-inspection.dto';

export class UpdateSafetyInspectionDto extends PartialType(CreateSafetyInspectionDto) {}
