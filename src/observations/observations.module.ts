import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Observation } from './entities/observation.entity';
import { ObservationActionLog } from './entities/observation-action-log.entity';
import { ObservationsService } from './services/observations.service';
import { ObservationsController } from './controllers/observations.controller';
import { IncidentsModule } from '../incidents/incidents.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ObservationPdfService } from './services/observation-pdf.service';
import { SafetyInspectionsModule } from '../safety-inspections/safety-inspections.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Observation, ObservationActionLog]),
    forwardRef(() => IncidentsModule),
    forwardRef(() => SafetyInspectionsModule),
    NotificationsModule,
  ],
  controllers: [ObservationsController],
  providers: [ObservationsService, ObservationPdfService],
  exports: [ObservationsService, ObservationPdfService],
})
export class ObservationsModule {}
