import { Controller, Get, Post, Put, Delete, Body, Param, Query, Res, UseInterceptors, UploadedFiles, BadRequestException, NotFoundException, HttpStatus, OnModuleInit } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import 'multer';
import { join } from 'path';
import * as fs from 'fs';
import { SafetyInspectionsService } from '../services/safety-inspections.service';
import { SafetyInspectionPdfService } from '../services/safety-inspection-pdf.service';
import { CreateSafetyInspectionDto } from '../dtos/create-safety-inspection.dto';
import { UpdateSafetyInspectionDto } from '../dtos/update-safety-inspection.dto';
import { safetyInspectionMulterConfig } from '../config/multer.config';

function findFileOnDisk(filename: string): string | null {
  if (!filename) return null;
  const cleanFilename = filename.split('/').pop()?.split('\\').pop() || filename;
  const bareFilename = cleanFilename.replace(/\.[^/.]+$/, '');
  const extensions = ['', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'];

  const possibleDirs = [
    join(process.cwd(), 'uploads', 'safety-inspections'),
    join(process.cwd(), 'uploads', 'observations'),
    join(process.cwd(), 'uploads', 'incidents'),
    join(process.cwd(), 'uploads'),
    join(__dirname, '..', '..', '..', 'uploads', 'safety-inspections'),
    join(__dirname, '..', '..', '..', 'uploads', 'observations'),
    join(__dirname, '..', '..', '..', 'uploads'),
    '/www/wwwroot/api.beam.safesiteworks.com/beam_2.0_south_backend/uploads/safety-inspections',
    '/www/wwwroot/api.beam.safesiteworks.com/beam_2.0_north_backend/uploads/safety-inspections',
    '/www/wwwroot/api.beam.safesiteworks.com/development/m3south/observations',
    '/www/wwwroot/api.beam.safesiteworks.com/uploads/safety-inspections',
  ];

  for (const dir of possibleDirs) {
    if (!fs.existsSync(dir)) continue;

    // Check exact cleanFilename
    const exact = join(dir, cleanFilename);
    if (fs.existsSync(exact)) return exact;

    // Check with variations of extensions
    for (const ext of extensions) {
      const candidate = join(dir, ext ? `${bareFilename}${ext}` : bareFilename);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

@Controller('safety-inspections')
export class SafetyInspectionsController implements OnModuleInit {
  constructor(
    private readonly siService: SafetyInspectionsService,
    private readonly siPdfService: SafetyInspectionPdfService,
  ) {}

  onModuleInit() {
    try {
      const siDir = join(process.cwd(), 'uploads', 'safety-inspections');
      const obsDir = join(process.cwd(), 'uploads', 'observations');
      if (fs.existsSync(siDir) && fs.existsSync(obsDir)) {
        const files = fs.readdirSync(siDir);
        for (const f of files) {
          const dest = join(obsDir, f);
          if (!fs.existsSync(dest)) {
            try {
              fs.copyFileSync(join(siDir, f), dest);
            } catch {
              // ignore copy error
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }

  /**
   * Serve safety inspection photo without ending in static file extension
   * GET /safety-inspections/photo-preview?file=si-...png
   */
  @Get('photo-preview')
  async getPhotoPreview(@Query('file') file: string, @Res() res: Response) {
    if (!file) {
      return res.status(HttpStatus.BAD_REQUEST).send('File parameter required');
    }
    const filePath = findFileOnDisk(file);
    if (filePath) {
      // Also sync to observations folder if not already there so aaPanel Nginx can also serve it
      try {
        const obsDir = join(process.cwd(), 'uploads', 'observations');
        const filename = filePath.split('/').pop()?.split('\\').pop();
        if (filename && fs.existsSync(obsDir) && !fs.existsSync(join(obsDir, filename))) {
          fs.copyFileSync(filePath, join(obsDir, filename));
        }
      } catch {
        // ignore
      }
      return res.sendFile(filePath);
    }
    return res.status(HttpStatus.NOT_FOUND).send('Photo not found on disk');
  }

  /**
   * Serve safety inspection photo by name
   * GET /safety-inspections/photo/:filename
   */
  @Get('photo/:filename')
  async getPhotoByName(@Param('filename') filename: string, @Res() res: Response) {
    const filePath = findFileOnDisk(filename);
    if (filePath) {
      return res.sendFile(filePath);
    }
    return res.status(HttpStatus.NOT_FOUND).send('Photo not found on disk');
  }

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

    // Also mirror to observations directory so aaPanel Nginx can serve statically if needed
    try {
      const obsDir = join(process.cwd(), 'uploads', 'observations');
      if (fs.existsSync(obsDir)) {
        for (const file of files) {
          const dest = join(obsDir, file.filename);
          if (!fs.existsSync(dest) && file.path && fs.existsSync(file.path)) {
            try {
              fs.copyFileSync(file.path, dest);
            } catch {
              // ignore
            }
          }
        }
      }
    } catch {
      // ignore
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
   * Get single Safety Inspection details by ID or reference number,
   * or serve photo directly if :id is an image filename
   * GET /safety-inspections/:id
   */
  @Get(':id')
  async findOne(@Param('id') id: string, @Res() res: Response) {
    if (/\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i.test(id)) {
      const filePath = findFileOnDisk(id);
      if (filePath) {
        return res.sendFile(filePath);
      }
      return res.status(HttpStatus.NOT_FOUND).send('Photo not found on disk');
    }
    const inspection = await this.siService.findOne(id);
    return res.json(inspection);
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
