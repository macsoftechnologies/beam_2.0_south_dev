import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SafetyInspection } from './entities/safety-inspection.entity';
import { SafetyInspectionItem } from './entities/safety-inspection-item.entity';
import { SafetyInspectionActionLog } from './entities/safety-inspection-action-log.entity';
import { Observation } from '../observations/entities/observation.entity';
import { SafetyInspectionsService } from './services/safety-inspections.service';
import { SafetyInspectionPdfService } from './services/safety-inspection-pdf.service';
import { SafetyInspectionsController } from './controllers/safety-inspections.controller';
import { ObservationsModule } from '../observations/observations.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SafetyInspection, SafetyInspectionItem, SafetyInspectionActionLog, Observation]),
    forwardRef(() => ObservationsModule),
  ],
  controllers: [SafetyInspectionsController],
  providers: [SafetyInspectionsService, SafetyInspectionPdfService],
  exports: [SafetyInspectionsService, SafetyInspectionPdfService],
})
export class SafetyInspectionsModule {}
