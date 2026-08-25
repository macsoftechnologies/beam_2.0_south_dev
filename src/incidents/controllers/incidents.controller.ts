import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe, UseInterceptors, UploadedFiles, UploadedFile, BadRequestException } from '@nestjs/common';
import { FilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { IncidentsService } from '../services/incidents.service';
import { CreateHeadsUpDto } from '../dtos/create-headsup.dto';
import { CreateInitialReportDto } from '../dtos/create-initial-report.dto';
import { UpdateInvestigationDto } from '../dtos/update-investigation.dto';
import { StageApprovalDto, ReviewInvestigationDto, CloseIncidentDto } from '../dtos/stage-approval.dto';
import { CreateActionItemDto, UpdateActionItemDto } from '../dtos/action-item.dto';
import { IncidentStage, InvestigationLevel } from '../entities/incident.entity';
import { incidentMulterConfig } from '../config/multer.config';

@Controller('incidents')
export class IncidentsController {
  constructor(private readonly incidentsService: IncidentsService) {}

  /**
   * Upload multiple incident photos/images via Multer into uploads/incidents/
   * POST /incidents/upload-images
   */
  @Post('upload-images')
  @UseInterceptors(FilesInterceptor('files', 10, incidentMulterConfig))
  uploadMultipleImages(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No image files were provided for upload.');
    }
    const urls = files.map((file) => `/uploads/incidents/${file.filename}`);
    return {
      statusCode: 200,
      message: `${files.length} image(s) uploaded successfully`,
      urls,
    };
  }

  /**
   * Upload single incident photo/image via Multer into uploads/incidents/
   * POST /incidents/upload-image
   */
  @Post('upload-image')
  @UseInterceptors(FileInterceptor('file', incidentMulterConfig))
  uploadSingleImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No image file was provided for upload.');
    }
    const url = `/uploads/incidents/${file.filename}`;
    return {
      statusCode: 200,
      message: 'Image uploaded successfully',
      url,
    };
  }

  /**
   * Stage 1: Submit Heads-Up Notification (within 2 hours)
   * POST /incidents/headsup
   */
  @Post('headsup')
  async submitHeadsUp(@Body() dto: CreateHeadsUpDto) {
    return await this.incidentsService.submitHeadsUp(dto);
  }

  /**
   * Stage 1 Approval
   * POST /incidents/:id/headsup/approve
   */
  @Post(':id/headsup/approve')
  async approveHeadsUp(@Param('id', ParseIntPipe) id: number, @Body() dto: StageApprovalDto) {
    return await this.incidentsService.approveHeadsUp(id, dto);
  }

  /**
   * Stage 2: Submit Initial Incident Report (within 24 hours)
   * POST /incidents/:id/initial-report
   * Supports BOTH JSON payload (with image URLs) AND direct multipart/form-data photo uploads!
   */
  @Post(':id/initial-report')
  @UseInterceptors(FilesInterceptor('photos', 10, incidentMulterConfig))
  async submitInitialReport(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateInitialReportDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    let photosList: string[] = dto.photos || [];

    // Append URLs of any direct file uploads in this request
    if (files && files.length > 0) {
      const uploadedUrls = files.map((file) => `/uploads/incidents/${file.filename}`);
      photosList = [...photosList, ...uploadedUrls];
    }

    dto.photos = photosList;

    return await this.incidentsService.submitInitialReport(id, dto);
  }

  /**
   * Stage 2 Approval
   * POST /incidents/:id/initial-report/approve
   */
  @Post(':id/initial-report/approve')
  async approveInitialReport(@Param('id', ParseIntPipe) id: number, @Body() dto: StageApprovalDto) {
    return await this.incidentsService.approveInitialReport(id, dto);
  }

  /**
   * Stage 3: Save / Update Incident Investigation (within 7 days)
   * PUT /incidents/:id/investigation
   */
  @Put(':id/investigation')
  async saveInvestigation(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateInvestigationDto) {
    return await this.incidentsService.saveInvestigation(id, dto);
  }

  /**
   * Stage 3 Review
   * POST /incidents/:id/investigation/review
   */
  @Post(':id/investigation/review')
  async reviewInvestigation(@Param('id', ParseIntPipe) id: number, @Body() dto: ReviewInvestigationDto) {
    return await this.incidentsService.reviewInvestigation(id, dto);
  }

  /**
   * Close Incident Investigation
   * PUT /incidents/:id/close
   */
  @Put(':id/close')
  async closeIncident(@Param('id', ParseIntPipe) id: number, @Body() dto?: CloseIncidentDto) {
    return await this.incidentsService.closeIncident(id, dto);
  }

  /**
   * Add Action Item to an Incident
   * POST /incidents/:id/action-items
   */
  @Post(':id/action-items')
  async addActionItem(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateActionItemDto) {
    return await this.incidentsService.addActionItem(id, dto);
  }

  /**
   * Get all Action Items for an Incident
   * GET /incidents/:id/action-items
   */
  @Get(':id/action-items')
  async getActionItems(@Param('id', ParseIntPipe) id: number) {
    return await this.incidentsService.getActionItems(id);
  }

  /**
   * Update an Action Item
   * PUT /incidents/:id/action-items/:actionId
   */
  @Put(':id/action-items/:actionId')
  async updateActionItem(
    @Param('id', ParseIntPipe) id: number,
    @Param('actionId', ParseIntPipe) actionId: number,
    @Body() dto: UpdateActionItemDto,
  ) {
    return await this.incidentsService.updateActionItem(id, actionId, dto);
  }

  /**
   * Delete an Action Item
   * DELETE /incidents/:id/action-items/:actionId
   */
  @Delete(':id/action-items/:actionId')
  async deleteActionItem(
    @Param('id', ParseIntPipe) id: number,
    @Param('actionId', ParseIntPipe) actionId: number,
  ) {
    return await this.incidentsService.deleteActionItem(id, actionId);
  }

  /**
   * Get complete details of a single incident across all stages
   * GET /incidents/:id
   */
  @Get(':id')
  async getIncidentDetails(@Param('id', ParseIntPipe) id: number) {
    return await this.incidentsService.getIncidentDetails(id);
  }

  /**
   * List incidents with filters matching all UI table dropdown columns
   * GET /incidents
   */
  @Get()
  async findAll(
    @Query('stage') stage?: IncidentStage,
    @Query('isHipo') isHipo?: string,
    @Query('category') category?: string,
    @Query('building') building?: string,
    @Query('buildingId') buildingId?: string,
    @Query('actualSeverity') actualSeverity?: string,
    @Query('potentialSeverity') potentialSeverity?: string,
    @Query('investigationLevel') investigationLevel?: InvestigationLevel,
    @Query('contractor') contractor?: string,
    @Query('origin') origin?: string,
    @Query('search') search?: string,
  ) {
    const hipoBool = isHipo !== undefined ? isHipo === 'true' : undefined;
    const bId = buildingId ? parseInt(buildingId, 10) : undefined;
    const actSev = actualSeverity ? parseInt(actualSeverity, 10) : undefined;
    const potSev = potentialSeverity ? parseInt(potentialSeverity, 10) : undefined;

    return await this.incidentsService.findAll({
      stage,
      isHipo: hipoBool,
      category,
      building,
      buildingId: bId,
      actualSeverity: actSev,
      potentialSeverity: potSev,
      investigationLevel,
      contractor,
      origin,
      search,
    });
  }
}
