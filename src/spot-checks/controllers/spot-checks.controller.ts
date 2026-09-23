import { Controller, Get, Post, Put, Delete, Body, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { SpotChecksService } from '../services/spot-checks.service';
import { SpotCheckPdfService } from '../services/spot-check-pdf.service';
import { CreateSpotCheckDto } from '../dtos/create-spot-check.dto';
import { UpdateSpotCheckDto } from '../dtos/update-spot-check.dto';

@Controller('spot-checks')
export class SpotChecksController {
  constructor(
    private readonly scService: SpotChecksService,
    private readonly scPdfService: SpotCheckPdfService,
  ) {}

  /**
   * Create a new Spot Check
   * POST /spot-checks
   */
  @Post()
  async create(@Body() dto: CreateSpotCheckDto) {
    return await this.scService.create(dto);
  }

  /**
   * Aggregated Dashboard Statistics
   * GET /spot-checks/stats
   */
  @Get('stats')
  async getStats() {
    return await this.scService.getStats();
  }

  /**
   * List Spot Checks with search, filters, and pagination
   * GET /spot-checks
   */
  @Get()
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('building') building?: string,
    @Query('contractor') contractor?: string,
    @Query('compliance') compliance?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return await this.scService.findAll({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 10,
      status,
      search,
      building,
      contractor,
      compliance,
      dateFrom,
      dateTo,
    });
  }

  /**
   * Export Spot Check Official Form as PDF
   * GET /spot-checks/:id/export-pdf
   */
  @Get(':id/export-pdf')
  async exportPdf(
    @Param('id') id: string,
    @Query('includeAttachments') includeAttachmentsQuery: string,
    @Res() res: Response,
  ) {
    const numericId = parseInt(id, 10);
    const spotCheck = await this.scService.findOne(numericId);
    const includeAttachments = includeAttachmentsQuery === undefined ? true : (includeAttachmentsQuery === 'true' || includeAttachmentsQuery === '1');
    const pdfBuffer = await this.scPdfService.generateSpotCheckPdf(spotCheck, includeAttachments);
    const ref = spotCheck.spotCheckRef || `SC-${spotCheck.id}`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${ref}_HSE_Spot_Check.pdf"`);
    res.end(pdfBuffer);
  }

  /**
   * Download Spot Check PDF
   * GET /spot-checks/:id/download-pdf
   */
  @Get(':id/download-pdf')
  async downloadPdf(
    @Param('id') id: string,
    @Query('includeAttachments') includeAttachmentsQuery: string,
    @Res() res: Response,
  ) {
    const numericId = parseInt(id, 10);
    const spotCheck = await this.scService.findOne(numericId);
    const includeAttachments = includeAttachmentsQuery === undefined ? true : (includeAttachmentsQuery === 'true' || includeAttachmentsQuery === '1');
    const pdfBuffer = await this.scPdfService.generateSpotCheckPdf(spotCheck, includeAttachments);
    const ref = spotCheck.spotCheckRef || `SC-${spotCheck.id}`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${ref}_HSE_Spot_Check.pdf"`);
    res.end(pdfBuffer);
  }

  /**
   * Get single Spot Check by ID
   * GET /spot-checks/:id
   */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.scService.findOne(parseInt(id, 10));
  }

  /**
   * Update Spot Check by ID
   * PUT /spot-checks/:id
   */
  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateSpotCheckDto) {
    return await this.scService.update(parseInt(id, 10), dto);
  }

  /**
   * Delete Spot Check by ID
   * DELETE /spot-checks/:id
   */
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return await this.scService.remove(parseInt(id, 10));
  }
}
