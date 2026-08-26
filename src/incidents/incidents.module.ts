import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Incident } from './entities/incident.entity';
import { IncidentHeadsUp } from './entities/incident-headsup.entity';
import { IncidentInitialReport } from './entities/incident-initial-report.entity';
import { IncidentInvestigation } from './entities/incident-investigation.entity';
import { IncidentActionItem } from './entities/incident-action-item.entity';
import { IncidentsService } from './services/incidents.service';
import { IncidentSlaService } from './services/incident-sla.service';
import { IncidentsController } from './controllers/incidents.controller';

import { IncidentPdfService } from './services/incident-pdf.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Incident,
      IncidentHeadsUp,
      IncidentInitialReport,
      IncidentInvestigation,
      IncidentActionItem,
    ]),
  ],
  controllers: [IncidentsController],
  providers: [IncidentsService, IncidentSlaService, IncidentPdfService],
  exports: [IncidentsService, IncidentPdfService],
})
export class IncidentsModule {}
