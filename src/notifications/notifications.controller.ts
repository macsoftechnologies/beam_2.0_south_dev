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

  /* ─────────────────────────────────────────────────────────────
     Incident Notification Group Endpoints
  ───────────────────────────────────────────────────────────── */

  /**
   * Get all members in the Incident Notification Group.
   */
  @Get('incident-group')
  async getIncidentGroup() {
    return this.notificationsService.getIncidentNotificationGroupMembers();
  }

  /**
   * Get candidate users who can be added to the Incident Notification Group.
   */
  @Get('incident-group/available-users')
  async getAvailableUsersForGroup() {
    return this.notificationsService.getAvailableUsersForIncidentGroup();
  }

  /**
   * Add one or more members to the Incident Notification Group.
   */
  @Post('incident-group')
  async addMembersToGroup(
    @Request() req: any,
    @Body() body: { members: any[] } | any[],
  ) {
    const list = Array.isArray(body) ? body : body.members || [body];
    const created = await this.notificationsService.addIncidentNotificationGroupMembers(
      list,
      req.user?.userId,
    );
    return { success: true, count: created.length, data: created };
  }

  /**
   * Update channel preferences for an Incident Notification Group member.
   */
  @Post('incident-group/:id/update')
  @HttpCode(HttpStatus.OK)
  async updateGroupMember(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
  ) {
    const updated = await this.notificationsService.updateIncidentNotificationGroupMember(id, body);
    return { success: true, data: updated };
  }

  /**
   * Remove a member from the Incident Notification Group.
   */
  @Post('incident-group/:id/delete')
  @HttpCode(HttpStatus.OK)
  async removeGroupMember(@Param('id', ParseIntPipe) id: number) {
    const success = await this.notificationsService.removeIncidentNotificationGroupMember(id);
    return { success };
  }

  /**
   * Quick-import / seed default Department & Department1 users into the Incident Notification Group.
   */
  @Post('incident-group/seed-defaults')
  @HttpCode(HttpStatus.OK)
  async seedDefaults(@Request() req: any) {
    const seeded = await this.notificationsService.seedDefaultDepartmentUsers(req.user?.userId);
    return { success: true, count: seeded.length, data: seeded };
  }
}
