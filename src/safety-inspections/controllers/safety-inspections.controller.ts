import { Controller, Get, Post, Put, Delete, Body, Param, Query, Res, UseInterceptors, UploadedFiles, BadRequestException, NotFoundException } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import 'multer';
import { SafetyInspectionsService } from '../services/safety-inspections.service';
import { SafetyInspectionPdfService } from '../services/safety-inspection-pdf.service';
import { CreateSafetyInspectionDto } from '../dtos/create-safety-inspection.dto';
import { UpdateSafetyInspectionDto } from '../dtos/update-safety-inspection.dto';
import { safetyInspectionMulterConfig } from '../config/multer.config';

@Controller('safety-inspections')
export class SafetyInspectionsController {
  constructor(
    private readonly siService: SafetyInspectionsService,
    private readonly siPdfService: SafetyInspectionPdfService,
  ) {}

  /**
   * Upload photos/attachments for safety inspections
   * POST /safety-inspections/upload-images
   */
  @Post('upload-images')
  @UseInterceptors(FilesInterceptor('files', 10, safetyInspectionMulterConfig))
  uploadMultipleImages(@UploadedFiles() files: any[]) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No photo files were provided for upload.');
    }
    const urls = files.map((file) => `/uploads/safety-inspections/${file.filename}`);
    return {
      statusCode: 200,
      message: `${files.length} photo(s) uploaded successfully`,
      urls,
    };
  }

  /**
   * Create a new Safety Inspection
   * POST /safety-inspections
   */
  @Post()
  async create(@Body() dto: CreateSafetyInspectionDto) {
    return await this.siService.create(dto);
  }

  /**
   * Aggregated Dashboard Statistics
   * GET /safety-inspections/stats
   */
  @Get('stats')
  async getStats() {
    return await this.siService.getStats();
  }

  /**
   * List Safety Inspections with search, filters, and pagination
   * GET /safety-inspections
   */
  @Get()
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('building') building?: string,
    @Query('floor') floor?: string,
    @Query('room') room?: string,
    @Query('contractor') contractor?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return await this.siService.findAll({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 10,
      status,
      search,
      building,
      floor,
      room,
      contractor,
      dateFrom,
      dateTo,
    });
  }

  /**
   * Export Safety Inspection Official Form as PDF
   * GET /safety-inspections/:id/export-pdf
   */
  @Get(':id/export-pdf')
  async exportPdf(@Param('id') id: string, @Res() res: Response) {
    const inspection = await this.siService.findOne(id);
    if (!inspection) {
      throw new NotFoundException(`Safety Inspection #${id} not found`);
    }
    const pdfBuffer = await this.siPdfService.generateInspectionPdf(inspection);

    const fileName = `${inspection.inspectionNumber || `SI-${inspection.id}`}_Safety_Inspection.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.end(pdfBuffer);
  }

  /**
   * Download Safety Inspection PDF (alias for export-pdf)
   * GET /safety-inspections/:id/download-pdf
   */
  @Get(':id/download-pdf')
  async downloadPdf(@Param('id') id: string, @Res() res: Response) {
    return this.exportPdf(id, res);
  }

  /**
   * Get single Safety Inspection details by ID or reference number
   * GET /safety-inspections/:id
   */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.siService.findOne(id);
  }

  /**
   * Update an existing Safety Inspection
   * PUT /safety-inspections/:id
   */
  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateSafetyInspectionDto) {
    return await this.siService.update(parseInt(id, 10), dto);
  }

  /**
   * Delete a safety inspection record (Strictly Admin / Superadmin only)
   * DELETE /safety-inspections/:id
   */
  @Delete(':id')
  async delete(
    @Param('id') id: string,
    @Query('userId') userId?: string,
    @Query('userRole') userRole?: string,
  ) {
    return await this.siService.deleteInspection(
      parseInt(id, 10),
      userId ? parseInt(userId, 10) : undefined,
      userRole,
    );
  }
}
