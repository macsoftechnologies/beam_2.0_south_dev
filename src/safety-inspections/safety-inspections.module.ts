import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SafetyInspection } from './entities/safety-inspection.entity';
import { SafetyInspectionItem } from './entities/safety-inspection-item.entity';
import { Observation } from '../observations/entities/observation.entity';
import { SafetyInspectionsService } from './services/safety-inspections.service';
import { SafetyInspectionPdfService } from './services/safety-inspection-pdf.service';
import { SafetyInspectionsController } from './controllers/safety-inspections.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SafetyInspection, SafetyInspectionItem, Observation])],
  controllers: [SafetyInspectionsController],
  providers: [SafetyInspectionsService, SafetyInspectionPdfService],
  exports: [SafetyInspectionsService, SafetyInspectionPdfService],
})
export class SafetyInspectionsModule {}
