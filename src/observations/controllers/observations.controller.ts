import { Controller, Get, Post, Put, Body, Param, Query, ParseIntPipe, UseInterceptors, UploadedFiles, UploadedFile, BadRequestException } from '@nestjs/common';
import { FilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { ObservationsService } from '../services/observations.service';
import { CreateObservationDto } from '../dtos/create-observation.dto';
import { ContractorReviewDto, ReassignObservationDto, ResolveObservationDto, CloseObservationDto, EscalateObservationDto } from '../dtos/workflow.dto';
import { ObservationType, ObservationRiskLevel, ObservationStatus } from '../entities/observation.entity';
import { observationMulterConfig } from '../config/multer.config';

@Controller('observations')
export class ObservationsController {
  constructor(private readonly obsService: ObservationsService) {}

  /**
   * Upload photo files for observations via Multer into uploads/observations/
   * POST /observations/upload-images
   */
  @Post('upload-images')
  @UseInterceptors(FilesInterceptor('files', 10, observationMulterConfig))
  uploadMultipleImages(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No photo files were provided for upload.');
    }
    const urls = files.map((file) => `/uploads/observations/${file.filename}`);
    return {
      statusCode: 200,
      message: `${files.length} photo(s) uploaded successfully`,
      urls,
    };
  }

  /**
   * Create a new Safety Observation
   * POST /observations
   * Supports BOTH JSON body AND direct multipart/form-data photo file uploads!
   */
  @Post()
  @UseInterceptors(FilesInterceptor('photos', 10, observationMulterConfig))
  async createObservation(
    @Body() dto: CreateObservationDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    let photosList: string[] = [];

    if (dto.photos) {
      if (typeof dto.photos === 'string') {
        try {
          photosList = JSON.parse(dto.photos);
        } catch {
          photosList = [dto.photos];
        }
      } else if (Array.isArray(dto.photos)) {
        photosList = dto.photos;
      }
    }

    // Append URLs of any direct file uploads in this request
    if (files && files.length > 0) {
      const uploadedUrls = files.map((file) => `/uploads/observations/${file.filename}`);
      photosList = [...photosList, ...uploadedUrls];
    }

    dto.photos = photosList;

    return await this.obsService.createObservation(dto);
  }

  /**
   * Contractor Review Action: ACCEPT or REJECT with mandatory remarks
   * POST /observations/:id/contractor-review
   */
  @Post(':id/contractor-review')
  async contractorReview(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ContractorReviewDto,
  ) {
    return await this.obsService.contractorReview(id, dto);
  }

  /**
   * Department Reassign Contractor (when rejected or re-routed)
   * POST /observations/:id/reassign
   */
  @Post(':id/reassign')
  async reassignContractor(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReassignObservationDto,
  ) {
    return await this.obsService.reassignContractor(id, dto);
  }

  /**
   * Contractor Submit Resolution
   * POST /observations/:id/resolve
   * Supports BOTH JSON body AND direct multipart/form-data photo file uploads!
   */
  @Post(':id/resolve')
  @UseInterceptors(FilesInterceptor('resolutionPhotos', 10, observationMulterConfig))
  async resolveObservation(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResolveObservationDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    let photosList: string[] = [];

    if (dto.resolutionPhotos) {
      if (typeof dto.resolutionPhotos === 'string') {
        try {
          photosList = JSON.parse(dto.resolutionPhotos);
        } catch {
          photosList = [dto.resolutionPhotos];
        }
      } else if (Array.isArray(dto.resolutionPhotos)) {
        photosList = dto.resolutionPhotos;
      }
    }

    if (files && files.length > 0) {
      const uploadedUrls = files.map((file) => `/uploads/observations/${file.filename}`);
      photosList = [...photosList, ...uploadedUrls];
    }

    dto.resolutionPhotos = photosList;

    return await this.obsService.resolveObservation(id, dto);
  }

  /**
   * Department Close Observation
   * PUT /observations/:id/close
   */
  @Put(':id/close')
  async closeObservation(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CloseObservationDto,
  ) {
    return await this.obsService.closeObservation(id, dto);
  }

  /**
   * Escalate Safety Observation to formal Incident
   * POST /observations/:id/escalate
   */
  @Post(':id/escalate')
  async escalateToIncident(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EscalateObservationDto,
  ) {
    return await this.obsService.escalateToIncident(id, dto);
  }

  /**
   * Get single observation details along with complete audit trail timeline history
   * GET /observations/:id
   */
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return await this.obsService.findOne(id);
  }

  /**
   * List observations with RBAC contractor scoping & dropdown filters
   * GET /observations
   */
  @Get()
  async findAll(
    @Query('status') status?: ObservationStatus,
    @Query('type') type?: ObservationType,
    @Query('riskLevel') riskLevel?: ObservationRiskLevel,
    @Query('category') category?: string,
    @Query('building') building?: string,
    @Query('contractor') contractor?: string,
    @Query('contractorId') contractorId?: string,
    @Query('userRole') userRole?: string,
    @Query('search') search?: string,
  ) {
    const cId = contractorId ? parseInt(contractorId, 10) : undefined;
    return await this.obsService.findAll({
      status,
      type,
      riskLevel,
      category,
      building,
      contractor,
      contractorId: cId,
      userRole,
      search,
    });
  }
}
