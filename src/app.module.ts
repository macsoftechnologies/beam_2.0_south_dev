import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { User } from './users/entities/user.entity';
import { Department } from './department/entities/department.entity';
import { Subcontractor } from './subcontractor/entities/subcontractor.entity';
import { Building } from './building/entities/building.entity';
import { Floor } from './floor/entities/floor.entity';
import { Zone } from './zones/entities/zone.entity';
import { Room } from './room/entities/room.entity';
import { Employee } from './employees/entities/employee.entity';
import { UserLog } from './employees/entities/userlog.entity';
import { UsersModule } from './users/users.module';
import { RedisModule } from './redis/redis.module';
import { EmployeesModule } from './employees/employees.module';
import { AuthModule } from './auth/auth.module';
import { DepartmentModule } from './department/department.module';
import { SubcontractorModule } from './subcontractor/subcontractor.module';
import { BuildingModule } from './building/building.module';
import { FloorModule } from './floor/floor.module';
import { ZonesModule } from './zones/zones.module';
import { RoomModule } from './room/room.module';
import { HealthController } from './swagger/health.controller';

import { Activity } from './activities/entities/activity.entity';
import { ElectricalWork } from './electrical/entities/electrical.entity';
import { MechanicalWork } from './mechanical/entities/mechanical.entity';
import { Precaution } from './precaution/entities/precaution.entity';

import { ActivitiesModule } from './activities/activities.module';
import { ElectricalModule } from './electrical/electrical.module';
import { MechanicalModule } from './mechanical/mechanical.module';
import { PrecautionModule } from './precaution/precaution.module';

import { RequestsModule } from './requests/requests.module';
import { RequestEntity } from './requests/entities/request.entity';
import { RoleModule } from './role/role.module';
import { Role } from './role/entities/role.entity';
import { NotificationsModule } from './notifications/notifications.module';
import { Notification } from './notifications/entities/notification.entity';
import { NotificationSetting } from './notifications/entities/notification-setting.entity';
import {
  RequestChemicalHazard,
  RequestConfined,
  RequestElectrical,
  RequestEnergisingElectrical,
  RequestEnergisingMechanical,
  RequestExcavation,
  RequestExtraMisc,
  RequestFireHotwork,
  RequestGeneral,
  RequestHeight,
  RequestLifting,
  RequestPpe,
  RequestPressureTesting,
} from './requests/entities/request-subtables.entity';
import { RamsFile, RequestNote, UploadImage, RequestLog, RequestLogData } from './requests/entities/supporting.entity';
import { Incident } from './incidents/entities/incident.entity';
import { IncidentHeadsUp } from './incidents/entities/incident-headsup.entity';
import { IncidentInitialReport } from './incidents/entities/incident-initial-report.entity';
import { IncidentInvestigation } from './incidents/entities/incident-investigation.entity';
import { IncidentActionItem } from './incidents/entities/incident-action-item.entity';
import { IncidentsModule } from './incidents/incidents.module';
import { Observation } from './observations/entities/observation.entity';
import { ObservationActionLog } from './observations/entities/observation-action-log.entity';
import { ObservationsModule } from './observations/observations.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      username: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
      entities: [
        User,
        Department,
        Subcontractor,
        Building,
        Floor,
        Zone,
        Room,
        Employee,
        UserLog,
        Activity,
        ElectricalWork,
        MechanicalWork,
        Precaution,
        RequestEntity,
        RequestChemicalHazard,
        RequestConfined,
        RequestElectrical,
        RequestEnergisingElectrical,
        RequestEnergisingMechanical,
        RequestExcavation,
        RequestExtraMisc,
        RequestFireHotwork,
        RequestGeneral,
        RequestHeight,
        RequestLifting,
        RequestPpe,
        RequestPressureTesting,
        RamsFile,
        RequestNote,
        UploadImage,
        RequestLog,
        RequestLogData,
        Role,
        Notification,
        NotificationSetting,
        Incident,
        IncidentHeadsUp,
        IncidentInitialReport,
        IncidentInvestigation,
        IncidentActionItem,
        Observation,
        ObservationActionLog,
      ],
      synchronize: false,
    }),
    RedisModule,
    UsersModule,
    EmployeesModule,
    AuthModule,
    DepartmentModule,
    SubcontractorModule,
    BuildingModule,
    FloorModule,
    ZonesModule,
    RoomModule,
    ActivitiesModule,
    ElectricalModule,
    MechanicalModule,
    PrecautionModule,
    RequestsModule,
    RoleModule,
    NotificationsModule,
    IncidentsModule,
    ObservationsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}