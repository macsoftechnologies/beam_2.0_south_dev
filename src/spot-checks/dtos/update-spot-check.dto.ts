import { PartialType } from '@nestjs/mapped-types';
import { CreateSpotCheckDto } from './create-spot-check.dto';

export class UpdateSpotCheckDto extends PartialType(CreateSpotCheckDto) {}
