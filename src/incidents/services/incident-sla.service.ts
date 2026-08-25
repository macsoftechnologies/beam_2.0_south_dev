import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Incident, IncidentStage } from '../entities/incident.entity';

@Injectable()
export class IncidentSlaService {
  private readonly logger = new Logger(IncidentSlaService.name);

  constructor(
    @InjectRepository(Incident)
    private readonly incidentRepo: Repository<Incident>,
  ) {}

  /**
   * Runs every 5 minutes to check SLA stage deadlines and log warnings for approaching or breached deadlines.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkSlaBreaches() {
    const now = new Date();

    // 1. Stage 1 (Heads-Up) SLA Check (< 2 hours)
    const pendingHeadsUp = await this.incidentRepo.find({
      where: {
        stage: IncidentStage.HEADS_UP,
        slaHeadsUpDue: LessThan(now),
      },
    });

    for (const inc of pendingHeadsUp) {
      this.logger.warn(`[SLA BREACH - Stage 1] Incident ${inc.caseNumber} exceeded 2-hour Heads-Up Notification deadline!`);
    }

    // 2. Stage 2 (Initial Report) SLA Check (< 24 hours)
    const pendingInitial = await this.incidentRepo.find({
      where: {
        stage: IncidentStage.INITIAL_REPORT,
        slaInitialDue: LessThan(now),
      },
    });

    for (const inc of pendingInitial) {
      this.logger.warn(`[SLA BREACH - Stage 2] Incident ${inc.caseNumber} exceeded 24-hour Initial Incident Report deadline!`);
    }

    // 3. Stage 3 (Investigation) SLA Check (< 7 days)
    const pendingInvestigation = await this.incidentRepo.find({
      where: {
        stage: IncidentStage.INVESTIGATION,
        slaInvestigationDue: LessThan(now),
      },
    });

    for (const inc of pendingInvestigation) {
      this.logger.warn(`[SLA BREACH - Stage 3] Incident ${inc.caseNumber} exceeded 7-day Incident Investigation Report deadline!`);
    }
  }
}
