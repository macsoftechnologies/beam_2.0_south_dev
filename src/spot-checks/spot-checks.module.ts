import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SpotCheck } from './entities/spot-check.entity';
import { SpotChecksService } from './services/spot-checks.service';
import { SpotCheckPdfService } from './services/spot-check-pdf.service';
import { SpotChecksController } from './controllers/spot-checks.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SpotCheck])],
  controllers: [SpotChecksController],
  providers: [SpotChecksService, SpotCheckPdfService],
  exports: [SpotChecksService, SpotCheckPdfService],
})
export class SpotChecksModule {}
