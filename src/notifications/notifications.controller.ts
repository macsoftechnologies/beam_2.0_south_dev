import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * Get user's paginated notifications list.
   */
  @Get()
  async getNotifications(
    @Request() req: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('module') module?: string,
  ) {
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
    return this.notificationsService.getNotificationsForUser(req.user.userId, p, l, module);
  }

  /**
   * Get unread notifications count.
   */
  @Get('unread-count')
  async getUnreadCount(
    @Request() req: any,
    @Query('module') module?: string,
  ) {
    const count = await this.notificationsService.getUnreadCount(req.user.userId, module);
    return { count };
  }

  /**
   * Mark a specific notification as read.
   */
  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  async markRead(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const success = await this.notificationsService.markAsRead(id, req.user.userId);
    return { success };
  }

  /**
   * Mark all notifications as read.
   */
  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  async markAllRead(@Request() req: any) {
    const success = await this.notificationsService.markAllAsRead(req.user.userId);
    return { success };
  }

  /**
   * Get notification settings for user.
   */
  @Get('settings')
  async getSettings(@Request() req: any) {
    const settings = await this.notificationsService.getNotificationSettings(req.user.userId);
    return settings;
  }

  /**
   * Update notification settings for user.
   */
  @Post('settings')
  @HttpCode(HttpStatus.OK)
  async updateSettings(
    @Request() req: any,
    @Body() settings: Record<string, boolean>,
  ) {
    await this.notificationsService.updateNotificationSettings(req.user.userId, settings);
    return { success: true };
  }
}
