import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationSetting } from './entities/notification-setting.entity';
import { IncidentNotificationGroupMember } from './entities/incident-notification-group-member.entity';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { User } from '../users/entities/user.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Subcontractor } from '../subcontractor/entities/subcontractor.entity';
import { Department } from '../department/entities/department.entity';
import { RequestEntity } from '../requests/entities/request.entity';
import { RedisModule } from '../redis/redis.module';

import { EmailService } from './services/email.service';
import { SmsService } from './services/sms.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Notification,
      NotificationSetting,
      IncidentNotificationGroupMember,
      User,
      Employee,
      Subcontractor,
      Department,
      RequestEntity,
    ]),
    RedisModule,
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, EmailService, SmsService],
  exports: [NotificationsService, EmailService, SmsService],
})
export class NotificationsModule {}
