import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseInterceptors,
  UploadedFiles,
  HttpStatus,
  HttpCode,
  Res,
  UseGuards,
  Request,
  Headers,
} from '@nestjs/common';
import { FilesInterceptor, FileFieldsInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';
import { Response } from 'express';

import { RequestsService } from './requests.service';
import { CreateRequestDto } from './dtos/create-request.dto';
import { UpdateRequestDto } from './dtos/update-request.dto';
import { SearchRequestDto } from './dtos/search-request.dto';
import { CreateByCountDto } from './dtos/create-by-count.dto';
import { generateLogsHtml } from './utils/logs-html-template';
import { generatePermitPdf, generateLogsPdf } from './utils/pdf-generator';
import { PlanSearchDto } from './dtos/planssearch.dto';
import { DashboardFilterDto } from './dtos/dashboard-filter.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { generatePermitHtml } from './utils/permit-html-template';

// Ensure directory exists
const uploadDir = './uploads/requests';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

export const requestMulterOptions = {
  storage: diskStorage({
    destination: uploadDir,
    filename: (req, file, callback) => {
      const originalName = file.originalname || 'file';
      const ext = extname(originalName);
      const nameWithoutExt = originalName.substring(0, originalName.length - ext.length);
      const cleanBaseName = nameWithoutExt.replace(/^rams[_-]/i, '');
      const sanitizedBaseName = cleanBaseName.replace(/[/\\?%*:|"<>]/g, '_');

      let targetFilename = `${sanitizedBaseName}${ext}`;
      const filePath = join(uploadDir, targetFilename);

      if (fs.existsSync(filePath)) {
        targetFilename = `${sanitizedBaseName}_${Date.now()}${ext}`;
      }

      callback(null, targetFilename);
    },
  }),
  fileFilter: (req, file, callback) => {
    callback(null, true);
  },
};

@Controller('requests')
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) { }

  // 1. Create Request
  @Post()
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'rams_file', maxCount: 10 },
        { name: 'rams_file[]', maxCount: 10 },
      ],
      requestMulterOptions,
    ),
  )
  async create(
    @Body() createDto: CreateRequestDto,
    @UploadedFiles() files?: { rams_file?: any[]; 'rams_file[]'?: any[] },
    @Headers('x-user-type') userTypeHeader?: string,
  ) {
    if ((userTypeHeader || '').toLowerCase().includes('observer')) {
      return {
        status: HttpStatus.FORBIDDEN,
        message: 'Observer access is not authorized to create permits',
      };
    }
    try {
      const ramsFiles = [
        ...(files?.rams_file || []),
        ...(files?.['rams_file[]'] || []),
      ];
      const result = await this.requestsService.create(createDto, ramsFiles);
      return result;
    } catch (error) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message || 'Request creation failed',
      };
    }
  }

  // 2. Update Request
  @Put(':id')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'rams_file', maxCount: 10 },
        { name: 'rams_file[]', maxCount: 10 },
        { name: 'images', maxCount: 10 },
        { name: 'images[]', maxCount: 10 },
        { name: 'fire_image', maxCount: 10 },
        { name: 'fire_image[]', maxCount: 10 },
      ],
      requestMulterOptions,
    ),
  )
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateRequestDto,
    @UploadedFiles()
    files?: {
      rams_file?: any[];
      'rams_file[]'?: any[];
      images?: any[];
      'images[]'?: any[];
      fire_image?: any[];
      'fire_image[]'?: any[];
    },
    @Headers('x-user-type') userTypeHeader?: string,
  ) {
    if ((userTypeHeader || '').toLowerCase().includes('observer')) {
      return {
        status: HttpStatus.FORBIDDEN,
        message: 'Observer access is not authorized to edit permits',
      };
    }
    try {
      const ramsFiles = [
        ...(files?.rams_file || []),
        ...(files?.['rams_file[]'] || []),
      ];
      const imageFiles = [
        ...(files?.images || []),
        ...(files?.['images[]'] || []),
        ...(files?.fire_image || []),
        ...(files?.['fire_image[]'] || []),
      ];
      const result = await this.requestsService.update(Number(id), updateDto, ramsFiles, imageFiles, userTypeHeader);
      return result;
    } catch (error) {
      throw error;
    }
  }

  // 3. Search Requests
  @Post('search')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async search(@Body() searchDto: SearchRequestDto, @Request() req: any, @Headers('x-user-type') userTypeHeader?: string) {
    try {
      const activeType = userTypeHeader || req.headers?.['x-user-type'];
      const results = await this.requestsService.search(searchDto, req.user?.userId, activeType);
      return results;
    } catch (error) {
      return {
        status: false,
        message: 'Error searching requests',
        error: error.message,
      };
    }
  }

  // 4. Bulk Update Status
  @Put('status/change')
  async updateStatus(
    @Body() body: {
      id: string;
      Request_status?: string;
      status?: number;
      userId?: number;
      initials?: string;
      ConM_initials?: string;
      CoMM_initials?: string;
      ConM_initials1?: string;
      reject_reason?: string;
      cancel_reason?: string;
      close_note?: string;
      Start_Time?: string;
      End_Time?: string;
      night_shift?: number;
      new_end_time?: string;
    },
    @Headers('x-user-type') userTypeHeader?: string,
  ) {
    if ((userTypeHeader || '').toLowerCase().includes('observer')) {
      return {
        status: HttpStatus.FORBIDDEN,
        message: 'Observer access is not authorized to change permit status',
      };
    }
    try {
      const result = await this.requestsService.updateStatus(body, userTypeHeader);
      return result;
    } catch (error) {
      throw error;
    }
  }

  // 4b. Bulk Update Safety Precautions
  @Put('safety/change')
  async updateSafety(
    @Body() body: { id: string; safety: string },
    @Headers('x-user-type') userTypeHeader?: string,
  ) {
    if ((userTypeHeader || '').toLowerCase().includes('observer')) {
      return {
        status: HttpStatus.FORBIDDEN,
        message: 'Observer access is not authorized to change safety precautions',
      };
    }
    try {
      const result = await this.requestsService.updateSafety(body);
      return result;
    } catch (error) {
      throw error;
    }
  }

  // 5a. Create by count — copy a permit N times across consecutive days (createbycount.php)
  @Post('createbycount')
  @HttpCode(HttpStatus.OK)
  async createByCount(
    @Body() dto: CreateByCountDto,
    @Headers('x-user-type') userTypeHeader?: string,
  ) {
    if ((userTypeHeader || '').toLowerCase().includes('observer')) {
      return {
        status: HttpStatus.FORBIDDEN,
        message: 'Observer access is not authorized to copy permits',
      };
    }
    try {
      return await this.requestsService.createByCount(dto);
    } catch (error) {
      const status = typeof error.getStatus === 'function' ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
      return {
        status,
        message: error.message || 'Create by count failed',
      };
    }
  }

  // 5. Soft delete single request (delete.php)
  @Delete(':id')
  async softDelete(@Param('id') id: string, @Headers('x-user-type') userTypeHeader?: string) {
    if ((userTypeHeader || '').toLowerCase().includes('observer')) {
      return { success: false, message: 'Observer access is not authorized to delete permits' };
    }
    try {
      return await this.requestsService.softDelete(Number(id));
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // 6. Bulk soft delete requests (multipledelete.php)
  @Delete()
  async softDeleteMultiple(@Body('ids') ids: number[], @Headers('x-user-type') userTypeHeader?: string) {
    if ((userTypeHeader || '').toLowerCase().includes('observer')) {
      return { status: false, message: 'Observer access is not authorized to delete permits' };
    }
    try {
      return await this.requestsService.softDeleteMultiple(ids);
    } catch (error) {
      return { status: false, message: error.message };
    }
  }

  // 7. Selected delete status update (deleteSelected.php)
  @Post('deleteSelected')
  async deleteSelected(
    @Body() body: { id: string; Request_status: string },
    @Headers('x-user-type') userTypeHeader?: string,
  ) {
    if ((userTypeHeader || '').toLowerCase().includes('observer')) {
      return { status: 403, message: 'Observer access is not authorized to delete permits' };
    }
    try {
      return await this.requestsService.deleteSelected(body.id, body.Request_status);
    } catch (error) {
      return { status: 202, message: error.message };
    }
  }

  // Upload/Add RAMS file attachments to an existing request (edit form)
  @Post('files')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'rams_file', maxCount: 20 },
        { name: 'rams_file[]', maxCount: 20 },
      ],
      requestMulterOptions,
    ),
  )
  async addRamsFiles(
    @Body() body: { id?: string | number; request_id?: string | number; requestId?: string | number; userId?: string | number; user_id?: string | number },
    @UploadedFiles() files?: { rams_file?: any[]; 'rams_file[]'?: any[] },
  ) {
    try {
      const ramsFiles = [
        ...(files?.rams_file || []),
        ...(files?.['rams_file[]'] || []),
      ];
      const reqId = body.id || body.request_id || body.requestId;
      const uId = body.userId || body.user_id;

      if (!reqId) {
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Request ID (id or request_id) is required',
        };
      }

      return await this.requestsService.addRamsFiles(
        Number(reqId),
        ramsFiles,
        Number(uId || 0),
      );
    } catch (error) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message || 'Failed to upload RAMS files',
      };
    }
  }

  // 8. Delete RAMS file attachment (ramsfiledelete.php)
  @Delete('files/:fileId')
  async softDeleteRamsFile(@Param('fileId') fileId: string) {
    try {
      return await this.requestsService.softDeleteRamsFile(Number(fileId));
    } catch (error) {
      return { message: error.message };
    }
  }

  // Get RAMS file attachment (for download/view)
  @Get('files/:fileId')
  async getRamsFile(@Param('fileId') fileId: string, @Res() res: any) {
    try {
      const file = await this.requestsService.getRamsFile(Number(fileId));
      if (!file || !file.ramsFile) {
        return res.status(HttpStatus.NOT_FOUND).send('File not found');
      }

      const rawPath = file.ramsFile || '';
      const filename = (rawPath ? rawPath.split('/').pop()?.split('\\').pop() : '') || 'Attachment';
      const possiblePaths = [
        join(process.cwd(), rawPath),
        join(process.cwd(), 'uploads', 'requests', filename),
        join(process.cwd(), './uploads/requests', filename),
        join(process.cwd(), 'dist', 'uploads', 'requests', filename),
        rawPath,
      ];

      let absolutePath = '';
      for (const p of possiblePaths) {
        if (p && fs.existsSync(p)) {
          absolutePath = p;
          break;
        }
      }

      if (!absolutePath) {
        return res.status(HttpStatus.NOT_FOUND).send('File not found on disk');
      }

      res.download(absolutePath, filename);
    } catch (error) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).send(error.message);
    }
  }

  // 9. Add Notes (addnote.php)
  @Post('notes')
  async addNotes(@Body() body: { request_id: string; permit_no: string; user_id?: number; username?: string; note?: string; createdTime?: string }) {
    try {
      return await this.requestsService.addNotes(body);
    } catch (error) {
      return { status: 400, message: error.message };
    }
  }

  // 9b. Delete a single note by ID
  @Delete('notes/:id')
  async deleteNote(@Param('id') id: string, @Request() req: any) {
    try {
      return await this.requestsService.deleteNote(Number(id), req.user?.userId || req.user?.id);
    } catch (error) {
      return { status: 400, message: error.message };
    }
  }

  // 10. Fetch user logs (readLogs.php)
  @Get('logs/user/:userId')
  async readLogs(@Param('userId') userId: string) {
    try {
      return await this.requestsService.readLogs(Number(userId));
    } catch (error) {
      return { message: error.message };
    }
  }

  // 10b. Fetch permit logs (log.php) - path param style
  @Get('logs/permit/:permitNo')
  async getPermitLogs(@Param('permitNo') permitNo: string) {
    if (!permitNo || permitNo.trim() === '') {
      return { status: HttpStatus.BAD_REQUEST, message: 'Missing or empty permitNo' };
    }
    try {
      return await this.requestsService.getPermitLogs(permitNo);
    } catch (error) {
      return { status: HttpStatus.INTERNAL_SERVER_ERROR, message: error.message };
    }
  }

  // 10c. Fetch permit logs (log.php) - query param style
  @Get('logs')
  async getPermitLogsQuery(@Query('permit_no') permitNo: string) {
    if (!permitNo || permitNo.trim() === '') {
      return { status: HttpStatus.BAD_REQUEST, message: 'Missing or empty permit_no' };
    }
    try {
      return await this.requestsService.getPermitLogs(permitNo);
    } catch (error) {
      return { status: HttpStatus.INTERNAL_SERVER_ERROR, message: error.message };
    }
  }

  // 11. Create complete log (log.php)
  @Post('logs/complete')
  async createCompleteLog(@Body() body: { id: number; PermitNo: string; status: string; module: string }) {
    try {
      return await this.requestsService.createCompleteLog(body);
    } catch (error) {
      return { status: 200, message: error.message };
    }
  }


  // 14. Trigger cron expiration task (cron.php)
  @Post('cron/trigger')
  async triggerCron() {
    try {
      return await this.requestsService.triggerCron();
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }

  // 15. Fetch requests counts (readCounts.php)
  @Get('counts')
  @UseGuards(JwtAuthGuard)
  async readCounts(@Request() req: any, @Headers('x-user-type') userTypeHeader?: string) {
    try {
      const activeType = userTypeHeader || req.headers?.['x-user-type'];
      return await this.requestsService.readCounts(req.user?.userId, activeType);
    } catch (error) {
      return { message: error.message };
    }
  }

  // 16. Fetch request status count (readRequestCount.php)
  @Post('counts/status')
  @UseGuards(JwtAuthGuard)
  async readRequestCount(@Body('Request_status') status: string, @Request() req: any, @Headers('x-user-type') userTypeHeader?: string) {
    try {
      const activeType = userTypeHeader || req.headers?.['x-user-type'];
      return await this.requestsService.readRequestCount(status, req.user?.userId, activeType);
    } catch (error) {
      return { message: error.message };
    }
  }

  // 17. Fetch plans list with nested notes (planslist.php)
  @Post('plans')
  // @UseGuards(JwtAuthGuard)
  async plansList(@Body() searchDto: PlanSearchDto, @Request() req: any, @Headers('x-user-type') userTypeHeader?: string) {
    try {
      const activeType = userTypeHeader || req.headers?.['x-user-type'];
      const result = await this.requestsService.plansList(searchDto, req.user?.userId, activeType);
      return [result[0], result[1]];
    } catch (error) {
      return { message: error.message };
    }
  }

  // 18. Fetch Graph counts per day (readGraph.php)
  @Post('analytics/graph')
  @UseGuards(JwtAuthGuard)
  async readGraph(@Body() body: { WeekFirstday: string; WeekLastday: string }, @Request() req: any, @Headers('x-user-type') userTypeHeader?: string) {
    try {
      const activeType = userTypeHeader || req.headers?.['x-user-type'];
      return await this.requestsService.readGraph(body.WeekFirstday, body.WeekLastday, req.user?.userId, activeType);
    } catch (error) {
      return { message: error.message };
    }
  }

  // 19. Fetch Graph summary (readGraphCounts.php)
  @Get('analytics/graph/counts')
  @UseGuards(JwtAuthGuard)
  async readGraphCounts(@Request() req: any, @Headers('x-user-type') userTypeHeader?: string) {
    try {
      const activeType = userTypeHeader || req.headers?.['x-user-type'];
      return await this.requestsService.readGraphCounts(req.user?.userId, activeType);
    } catch (error) {
      return { message: error.message };
    }
  }

  // --- NEWLY ADDED VIEW AND DOWNLOAD ROUTE ENDPOINTS ---

  @Get('permit-design/:permitNo')
  async servePermitHtml(@Param('permitNo') permitNo: string, @Res() res: any) {
    try {
      const data = await this.requestsService.getRequestDetailsByPermitNo(permitNo);
      if (!data) {
        return res.status(HttpStatus.NOT_FOUND).send('Permit not found');
      }
      const html = generatePermitHtml(data);
      res.type('html').send(html);
    } catch (error) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).send(error.message);
    }
  }

  @Get('permit-design/:permitNo/pdf')
  async downloadPermitPdf(@Param('permitNo') permitNo: string, @Res() res: any) {
    try {
      const data = await this.requestsService.getRequestDetailsByPermitNo(permitNo);
      if (!data) {
        return res.status(HttpStatus.NOT_FOUND).send('Permit not found');
      }
      const pdfBuffer = await generatePermitPdf(data);
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Permit_${permitNo}.pdf"`,
        'Content-Length': pdfBuffer.length,
      });
      res.end(pdfBuffer);
    } catch (error) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).send(error.message);
    }
  }

  @Get('logs-design/:permitNo')
  async serveLogsHtml(@Param('permitNo') permitNo: string, @Res() res: any) {
    try {
      const details = await this.requestsService.getLogsDetailsByPermitNo(permitNo);
      if (!details) {
        return res.status(HttpStatus.NOT_FOUND).send('Permit not found');
      }
      const html = generateLogsHtml(details.permitNo, details.logs, details.images);
      res.type('html').send(html);
    } catch (error) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).send(error.message);
    }
  }

  @Get('logs-design/:permitNo/pdf')
  async downloadLogsPdf(@Param('permitNo') permitNo: string, @Res() res: any) {
    try {
      const details = await this.requestsService.getLogsDetailsByPermitNo(permitNo);
      if (!details) {
        return res.status(HttpStatus.NOT_FOUND).send('Permit not found');
      }
      const pdfBuffer = await generateLogsPdf(details.permitNo, details.logs, details.images);
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Permit_Logs_${permitNo}.pdf"`,
        'Content-Length': pdfBuffer.length,
      });
      res.end(pdfBuffer);
    } catch (error) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).send(error.message);
    }
  }

  // Executive Dashboard Overview Metrics
  @Get('dashboard/overview')
  async getDashboardOverview(
    @Query('building') building?: string,
    @Query('buildingId') buildingId?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    try {
      const data = await this.requestsService.getDashboardOverview({
        building: building || buildingId,
        fromDate,
        toDate,
      });
      return {
        status: HttpStatus.OK,
        data,
      };
    } catch (error) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message || 'Failed to retrieve dashboard overview',
      };
    }
  }

  // Executive Dashboard Building/Floor Metrics
  @Get('dashboard/building')
  async getDashboardBuilding(
    @Query() filterDto: DashboardFilterDto,
    @Query('building') building?: string,
    @Query('floor') floor?: string,
  ) {
    try {
      const payload = Object.keys(filterDto || {}).length > 0 ? filterDto : { building, floor };
      const data = await this.requestsService.getDashboardBuilding(payload);
      return {
        status: HttpStatus.OK,
        data,
      };
    } catch (error) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message || 'Failed to retrieve dashboard building metrics',
      };
    }
  }

  @Post('dashboard/building')
  @HttpCode(HttpStatus.OK)
  async postDashboardBuilding(@Body() filterDto: DashboardFilterDto) {
    try {
      const data = await this.requestsService.getDashboardBuilding(filterDto);
      return {
        status: HttpStatus.OK,
        data,
      };
    } catch (error) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message || 'Failed to retrieve dashboard building metrics',
      };
    }
  }

  @Get('dashboard/floor')
  async getDashboardFloor(
    @Query() filterDto: DashboardFilterDto,
    @Query('building') building?: string,
    @Query('floor') floor?: string,
    @Query('room') room?: string,
  ) {
    try {
      const payload = Object.keys(filterDto || {}).length > 0 ? filterDto : { building, floor, room };
      const data = await this.requestsService.getDashboardBuilding(payload);
      return {
        status: HttpStatus.OK,
        data,
      };
    } catch (error) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message || 'Failed to retrieve dashboard floor metrics',
      };
    }
  }

  @Post('dashboard/floor')
  @HttpCode(HttpStatus.OK)
  async postDashboardFloor(@Body() filterDto: DashboardFilterDto) {
    try {
      const data = await this.requestsService.getDashboardBuilding(filterDto);
      return {
        status: HttpStatus.OK,
        data,
      };
    } catch (error) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message || 'Failed to retrieve dashboard floor metrics',
      };
    }
  }

  // 20. Fetch Request details by ID
  @Get(':id')
  async getRequestDetailsById(@Param('id') id: string) {
    try {
      const data = await this.requestsService.getRequestDetailsById(Number(id));
      if (!data) {
        return {
          status: HttpStatus.NOT_FOUND,
          message: `Request with ID ${id} not found`,
        };
      }
      return data;
    } catch (error) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message || 'Failed to retrieve request details',
      };
    }
  }
}
