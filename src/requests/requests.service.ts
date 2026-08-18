import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Brackets, DeepPartial } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { RedisCacheService } from 'src/redis/redid-cache.service';
import { NotificationsService } from '../notifications/notifications.service';

import { RequestEntity } from './entities/request.entity';
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
} from './entities/request-subtables.entity';
import {
  RamsFile,
  RequestNote,
  UploadImage,
  RequestLog,
  RequestLogData,
  CompleteLog,
} from './entities/supporting.entity';

import { Building } from '../building/entities/building.entity';
import { Floor } from '../floor/entities/floor.entity';
import { Zone } from '../zones/entities/zone.entity';
import { Room } from '../room/entities/room.entity';
import { Subcontractor } from '../subcontractor/entities/subcontractor.entity';
import { Activity } from '../activities/entities/activity.entity';
import { User } from '../users/entities/user.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Department } from '../department/entities/department.entity';
import { Precaution } from '../precaution/entities/precaution.entity';
import { MechanicalWork } from '../mechanical/entities/mechanical.entity';
import { ElectricalWork } from '../electrical/entities/electrical.entity';

import { CreateRequestDto } from './dtos/create-request.dto';
import { UpdateRequestDto } from './dtos/update-request.dto';
import { SearchRequestDto } from './dtos/search-request.dto';
import { CreateByCountDto } from './dtos/create-by-count.dto';
import { PlanSearchDto } from './dtos/planssearch.dto';

@Injectable()
export class RequestsService {
  constructor(
    @InjectRepository(RequestEntity)
    private readonly requestRepo: Repository<RequestEntity>,
    @InjectRepository(RequestChemicalHazard)
    private readonly chemicalRepo: Repository<RequestChemicalHazard>,
    @InjectRepository(RequestConfined)
    private readonly confinedRepo: Repository<RequestConfined>,
    @InjectRepository(RequestElectrical)
    private readonly electricalRepo: Repository<RequestElectrical>,
    @InjectRepository(RequestEnergisingElectrical)
    private readonly energisingElecRepo: Repository<RequestEnergisingElectrical>,
    @InjectRepository(RequestEnergisingMechanical)
    private readonly energisingMechRepo: Repository<RequestEnergisingMechanical>,
    @InjectRepository(RequestExcavation)
    private readonly excavationRepo: Repository<RequestExcavation>,
    @InjectRepository(RequestExtraMisc)
    private readonly extraMiscRepo: Repository<RequestExtraMisc>,
    @InjectRepository(RequestFireHotwork)
    private readonly fireHotworkRepo: Repository<RequestFireHotwork>,
    @InjectRepository(RequestGeneral)
    private readonly generalRepo: Repository<RequestGeneral>,
    @InjectRepository(RequestHeight)
    private readonly heightRepo: Repository<RequestHeight>,
    @InjectRepository(RequestLifting)
    private readonly liftingRepo: Repository<RequestLifting>,
    @InjectRepository(RequestPpe)
    private readonly ppeRepo: Repository<RequestPpe>,
    @InjectRepository(RequestPressureTesting)
    private readonly pressureTestingRepo: Repository<RequestPressureTesting>,

    @InjectRepository(RamsFile)
    private readonly ramsFileRepo: Repository<RamsFile>,
    @InjectRepository(RequestNote)
    private readonly noteRepo: Repository<RequestNote>,
    @InjectRepository(UploadImage)
    private readonly uploadImageRepo: Repository<UploadImage>,
    @InjectRepository(RequestLog)
    private readonly logRepo: Repository<RequestLog>,
    @InjectRepository(RequestLogData)
    private readonly logDataRepo: Repository<RequestLogData>,
    @InjectRepository(CompleteLog)
    private readonly completeLogRepo: Repository<CompleteLog>,

    @InjectRepository(Building)
    private readonly buildingRepo: Repository<Building>,
    @InjectRepository(Floor) private readonly floorRepo: Repository<Floor>,
    @InjectRepository(Zone) private readonly zoneRepo: Repository<Zone>,
    @InjectRepository(Room) private readonly roomRepo: Repository<Room>,
    @InjectRepository(Subcontractor)
    private readonly subcontractorRepo: Repository<Subcontractor>,
    @InjectRepository(Activity)
    private readonly activityRepo: Repository<Activity>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    @InjectRepository(Precaution)
    private readonly precautionRepo: Repository<Precaution>,
    @InjectRepository(MechanicalWork)
    private readonly mechanicalWorkRepo: Repository<MechanicalWork>,
    @InjectRepository(ElectricalWork)
    private readonly electricalWorkRepo: Repository<ElectricalWork>,
    private readonly redisCacheService: RedisCacheService,
    private readonly notificationsService: NotificationsService,
  ) { }

  private areEqual(val1: any, val2: any): boolean {
    if (val1 === val2) return true;
    const isEmpty = (v: any) =>
      v === null || v === undefined || String(v).trim() === '';
    if (isEmpty(val1) && isEmpty(val2)) return true;
    if (isEmpty(val1) !== isEmpty(val2)) return false;
    const num1 = Number(val1);
    const num2 = Number(val2);
    if (!isNaN(num1) && !isNaN(num2)) {
      return num1 === num2;
    }
    const d1 =
      val1 instanceof Date
        ? val1
        : typeof val1 === 'string' &&
          val1.includes('-') &&
          !isNaN(Date.parse(val1))
          ? new Date(val1)
          : null;
    const d2 =
      val2 instanceof Date
        ? val2
        : typeof val2 === 'string' &&
          val2.includes('-') &&
          !isNaN(Date.parse(val2))
          ? new Date(val2)
          : null;
    if (d1 && d2 && !isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
      const toDateStr = (d: Date) => d.toISOString().split('T')[0];
      return toDateStr(d1) === toDateStr(d2) || d1.getTime() === d2.getTime();
    }
    return String(val1).trim() === String(val2).trim();
  }

  async getSubcontractorIdForUser(userId?: number): Promise<number | null> {
    if (!userId) return null;
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (user && user.userType === 'Subcontractor') {
      return user.typeId;
    }
    return null;
  }

  private async validateStatusTransitionAndRole(
    existing: RequestEntity,
    newStatus: string,
    actorUserId: number,
  ): Promise<void> {
    if (!actorUserId) {
      throw new BadRequestException('Actor userId is required for status updates');
    }
    const user = await this.userRepo.findOne({ where: { id: actorUserId } });
    if (!user) {
      throw new BadRequestException(`User not found for ID: ${actorUserId}`);
    }

    let role = 'observer';
    let departmentName = '';

    // userType can be a comma-separated string (e.g. "Admin,Department")
    // so split and check membership rather than doing an exact string match
    const userTypes = (user.userType || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const isDeptUser = userTypes.includes('Department');
    const isDept1User = userTypes.includes('Department1');
    const isMultiDept = isDeptUser && isDept1User;

    if (userTypes.includes('Admin') || userTypes.includes('SuperAdmin')) {
      role = 'admin';
    } else if (isMultiDept) {
      role = 'multi_dept';
    } else if (isDeptUser || isDept1User) {
      // Department  = CONM (Construction Management / first-approval stream)
      // Department1 = C&Q  (Commissioning / second-approval stream)
      // Try to resolve the exact stream via the employee's department name first
      if (user.empId) {
        const employee = await this.employeeRepo.findOne({ where: { id: user.empId } });
        if (employee) {
          if (employee.departId) {
            const dept = await this.departmentRepo.findOne({ where: { id: employee.departId } });
            if (dept) {
              departmentName = (dept.departmentName || '').toUpperCase().trim();
              if (departmentName.includes('CONM') || departmentName.includes('CON M')) {
                role = 'CoNM';
              } else if (departmentName.includes('C&Q') || departmentName.includes('CQ') || departmentName.includes('C & Q')) {
                role = 'C&Q';
              } else {
                // Generic department – default based on userType flag
                role = isDept1User ? 'C&Q' : 'CoNM';
              }
            } else {
              role = isDept1User ? 'C&Q' : 'CoNM';
            }
          } else if (employee.subContId) {
            role = 'contractor';
          } else if (employee.obserId) {
            role = 'observer';
          } else {
            // Employee exists but no departId/subContId/obserId — treat by userType
            role = isDept1User ? 'C&Q' : 'CoNM';
          }
        } else {
          // No employee record found – fall back to userType
          role = isDept1User ? 'C&Q' : 'CoNM';
        }
      } else {
        // No empId on user – use userType directly
        role = isDept1User ? 'C&Q' : 'CoNM';
      }
    } else if (userTypes.includes('Subcontractor')) {
      role = 'contractor';
    }

    const normalizedCurrent = (existing.requestStatus || '').toLowerCase().trim();
    // Resolve prefixed UI statuses to their base status before applying rules
    const resolvedNewStatus = this.resolveApprovalStatus(newStatus);
    const normalizedNew = resolvedNewStatus.toLowerCase().trim();

    if (normalizedCurrent === normalizedNew) {
      return;
    }

    // Status Levels for Hierarchy validation
    const statusLevels: Record<string, number> = {
      draft: 1,
      hold: 2,
      'pre-approved': 3,
      rejected: 4,
      approved: 4,
      opened: 5,
      cancelled: 5,
      closed: 6,
    };

    const currentLevel = statusLevels[normalizedCurrent] || 0;
    const newLevel = statusLevels[normalizedNew] || 0;

    if (!newLevel) {
      throw new BadRequestException(`Invalid target status: ${newStatus}`);
    }

    // Terminal State Checks
    if (['rejected', 'cancelled', 'closed'].includes(normalizedCurrent)) {
      throw new BadRequestException(
        `Cannot change status from terminal state '${existing.requestStatus}'`
      );
    }

    // Reversion check (except hold -> draft or terminal actions like cancel / reject)
    const isHoldToDraft = (normalizedCurrent === 'hold' && normalizedNew === 'draft');
    const isTerminalAction = (normalizedNew === 'cancelled' || normalizedNew === 'rejected');
    if (newLevel < currentLevel && !isHoldToDraft && !isTerminalAction) {
      throw new BadRequestException(
        `Status cannot be reverted from '${existing.requestStatus}' to '${newStatus}'`
      );
    }

    // Role-based restrictions
    if (role === 'admin' || role === 'multi_dept' || role === 'CoNM' || role === 'C&Q') {
      // Authorized departments/admin can transition
    } else if (role === 'contractor') {
      // Contractor can change status:
      // - between draft and hold (levels 1 & 2)
      // - draft/hold -> rejected
      // - approved -> opened (level 4 -> 5)
      // - opened -> closed (level 5 -> 6)
      // - active status -> cancelled
      const allowedContractorTransitions = [
        ['draft', 'hold'],
        ['hold', 'draft'],
        ['draft', 'rejected'],
        ['hold', 'rejected'],
        ['approved', 'opened'],
        ['opened', 'closed'],
      ];
      const isAllowed =
        allowedContractorTransitions.some(
          ([from, to]) => normalizedCurrent === from && normalizedNew === to
        ) ||
        normalizedNew === 'cancelled';

      if (!isAllowed) {
        throw new BadRequestException(
          `Contractor is not authorized to transition permit status from '${existing.requestStatus}' to '${newStatus}'`
        );
      }
    } else {
      throw new BadRequestException(
        `User role is not authorized to change permit status to '${newStatus}'`
      );
    }

    // Approval / Pre-approval logic based on permit_under and permit_type
    const permitUnder = (existing.permitUnder || 'Construction').toLowerCase().trim();
    const permitType = (existing.permitType || '').toLowerCase().trim();

    const isBothConstruction = (permitUnder === 'construction' && permitType === 'construction');
    const isBothCommissioning = (permitUnder === 'commissioning' && permitType === 'commissioning');
    const isUnderConstTypeComm = (permitUnder === 'construction' && permitType === 'commissioning');
    const isUnderCommTypeConst = (permitUnder === 'commissioning' && permitType === 'construction');

    // Rule A: Transition to pre-approved
    if (normalizedNew === 'pre-approved') {
      if (isBothConstruction || isBothCommissioning) {
        throw new BadRequestException(
          `Pre-approval is not required for permits where both permit_under and permit_type are '${existing.permitUnder}'`
        );
      }

      if (role !== 'admin' && role !== 'multi_dept') {
        if (isUnderConstTypeComm && role !== 'C&Q') {
          throw new BadRequestException('Pre-approval for Construction under Commissioning must be done by a C&Q department user');
        }
        if (isUnderCommTypeConst && role !== 'CoNM') {
          throw new BadRequestException('Pre-approval for Commissioning under Construction must be done by a ConM department user');
        }
      }
    }

    // Rule B: Transition to approved
    if (normalizedNew === 'approved') {
      // If mismatch, pre-approval is required first
      if (isUnderConstTypeComm || isUnderCommTypeConst) {
        if (normalizedCurrent !== 'pre-approved') {
          throw new BadRequestException('Permit must be pre-approved before final approval');
        }
      }

      if (role !== 'admin' && role !== 'multi_dept') {
        if (isBothConstruction && role !== 'CoNM') {
          throw new BadRequestException('Final approval for Construction-only permits must be done by a ConM department user');
        }
        if (isBothCommissioning && role !== 'C&Q') {
          throw new BadRequestException('Final approval for Commissioning-only permits must be done by a C&Q department user');
        }
        if (isUnderConstTypeComm && role !== 'CoNM') {
          throw new BadRequestException('Final approval for Construction under Commissioning permits must be done by a ConM department user');
        }
        if (isUnderCommTypeConst && role !== 'C&Q') {
          throw new BadRequestException('Final approval for Commissioning under Construction permits must be done by a C&Q department user');
        }
      }
    }

    // Rule C: Transition to rejected
    if (normalizedNew === 'rejected') {
      if (role !== 'admin' && role !== 'multi_dept') {
        if (role === 'contractor') {
          if (normalizedCurrent !== 'draft' && normalizedCurrent !== 'hold') {
            throw new BadRequestException(
              `Contractor is not authorized to reject permits in '${existing.requestStatus}' status`
            );
          }
        } else if (normalizedCurrent === 'draft' || normalizedCurrent === 'hold') {
          if (isBothConstruction && role !== 'CoNM') {
            throw new BadRequestException('Rejection for Construction-only permits must be done by a ConM department user');
          }
          if (isBothCommissioning && role !== 'C&Q') {
            throw new BadRequestException('Rejection for Commissioning-only permits must be done by a C&Q department user');
          }
          if (isUnderConstTypeComm && role !== 'C&Q') {
            throw new BadRequestException('Rejection at pre-approval stage for Construction under Commissioning must be done by a C&Q department user');
          }
          if (isUnderCommTypeConst && role !== 'CoNM') {
            throw new BadRequestException('Rejection at pre-approval stage for Commissioning under Construction must be done by a ConM department user');
          }
        } else if (normalizedCurrent === 'pre-approved' || normalizedCurrent === 'approved') {
          if (isBothConstruction && role !== 'CoNM') {
            throw new BadRequestException('Rejection for Construction-only permits must be done by a ConM department user');
          }
          if (isBothCommissioning && role !== 'C&Q') {
            throw new BadRequestException('Rejection for Commissioning-only permits must be done by a C&Q department user');
          }
          if (isUnderConstTypeComm && role !== 'CoNM') {
            throw new BadRequestException('Final rejection for Construction under Commissioning permits must be done by a ConM department user');
          }
          if (isUnderCommTypeConst && role !== 'C&Q') {
            throw new BadRequestException('Final rejection for Commissioning under Construction permits must be done by a C&Q department user');
          }
        }
      }
    }
  }

  // Generate unique PermitNo
  private async generatePermitNo(): Promise<string> {
    let permitNo = '';
    let exists = true;
    while (exists) {
      const prefix = Math.floor(
        10000000000 + Math.random() * 90000000000,
      ).toString();
      permitNo = prefix + new Date().getFullYear().toString();
      const existing = await this.requestRepo.findOne({ where: { permitNo } });
      if (!existing) {
        exists = false;
      }
    }
    return permitNo;
  }

  // Helper to log changes
  async createLogs(
    requestId: number,
    userId: number,
    requestStatus: string,
    createdTime: Date,
    fieldChanges: Array<{
      field_name: string;
      previous: string;
      present: string;
    }> = [],
    system = 0,
  ): Promise<RequestLog> {
    const request = await this.requestRepo.findOne({
      where: { id: requestId },
    });
    const permitNo = request?.permitNo || '';

    const logEntry = this.logRepo.create({
      requestId,
      userId,
      requestType: requestStatus,
      createdTime,
      permitNo,
      system,
    });
    const savedLog = await this.logRepo.save(logEntry);

    if (fieldChanges && fieldChanges.length > 0) {
      for (const change of fieldChanges) {
        await this.logDataRepo.save(
          this.logDataRepo.create({
            logId: savedLog.id,
            fieldName: change.field_name,
            previous: change.previous,
            present: change.present,
            createdTime,
          }),
        );
      }
    }

    return savedLog;
  }

  // Create Request
  async create(dto: CreateRequestDto, files?: any[]): Promise<any> {
    // 1. Validate zone status and set permit_under dynamically
    await this.checkZoneStatusAndAssignPermitUnder(dto);

    // 2. Validate mandatory fields (non-draft)
    this.validateMandatoryFields(dto);

    const permitNo = await this.generatePermitNo();
    const isNightShift = String(dto.night_shift) === '1' || String(dto.night_shift) === 'true';
    const computedNextDate = (dto.Working_Date && this.getNextDateString(dto.Working_Date)) || '';

    // 1. Save Request
    const requestData: DeepPartial<RequestEntity> = {
      userId: dto.userId,
      companyName: dto.Company_Name,
      permitNo: permitNo,
      subContractorId: dto.Sub_Contractor_Id,
      foreman: dto.Foreman,
      foremanPhoneNumber: dto.Foreman_Phone_Number,
      activity: dto.Activity,
      typeOfActivityId: dto.Type_Of_Activity_Id,
      requestDate: dto.Request_Date,
      workingDate: dto.Working_Date,
      startTime: dto.Start_Time,
      endTime: dto.End_Time,
      assignStartTime: dto.Assign_Start_Time,
      assignEndTime: dto.Assign_End_Time,
      assignStartDate: dto.Assign_Start_Date,
      assignEndDate: dto.Assign_End_Date,
      buildingId: dto.Building_Id,
      floorId: dto.Floor_Id,
      plansId: dto.Plans_Id,
      zoneId: Array.isArray(dto.Zone_Id)
        ? dto.Zone_Id.join(',')
        : (dto.Zone_Id !== undefined && dto.Zone_Id !== null ? String(dto.Zone_Id) : undefined),
      zone: Array.isArray(dto.zone)
        ? dto.zone.map((z: any) => (typeof z === 'object' ? (z.zone || z.zone_name) : z)).filter(Boolean).join(',')
        : dto.zone,
      roomNos: dto.Room_Nos,
      roomType: dto.Room_Type,
      numberOfWorkers: dto.Number_Of_Workers,
      badgeNumbers: dto.Badge_Numbers,
      teamId: dto.teamId,
      notes: dto.notes,
      requestStatus: dto.Request_status || 'Pending',
      status: dto.status !== undefined ? dto.status : 1,
      createdTime: dto.createdTime ? new Date(dto.createdTime) : new Date(),
      siteId: dto.Site_Id !== undefined ? dto.Site_Id : 5,
      permitType: dto.permit_type,
      permitUnder: dto.permit_under || 'Construction',
      newDate: isNightShift ? (dto.new_date && dto.new_date !== 'none' ? dto.new_date : computedNextDate) : '',
      newEndTime: isNightShift ? (dto.new_end_time && dto.new_end_time !== 'none' ? dto.new_end_time : '') : '',
      nightShift: isNightShift ? '1' : '0',
      safetyPrecautions: dto.Safety_Precautions,
    };

    const requestObj = this.requestRepo.create(requestData);
    const savedRequest = await this.requestRepo.save(requestObj);
    const requestId = savedRequest.id;

    if (savedRequest.requestStatus) {
      this.notificationsService.triggerNotification(
        savedRequest.id,
        null,
        savedRequest.requestStatus,
        savedRequest.userId ?? 0,
      ).catch((err) => console.error('Notification error:', err));
    }

    // 2. Insert into all 13 sub-tables
    await this.chemicalRepo.save(
      this.chemicalRepo.create({
        requestId,
        workingHazardiousSubsten: dto.working_hazardious_substen || 0,
        relevantMal: dto.relevant_mal || 0,
        msds: dto.msds || 0,
        equipmentTakenAccount: dto.equipment_taken_account || 0,
        ventilation: dto.ventilation || 0,
        hazardousSubstances: dto.hazardous_substances || 0,
        storageAndDisposal: dto.storage_and_disposal || 0,
        reachableCase: dto.reachable_case || 0,
        checicalRiskAssessment: dto.checical_risk_assessment || 0,
      }),
    );

    await this.confinedRepo.save(
      this.confinedRepo.create({
        requestId,
        workingConfinedSpaces: dto.working_confined_spaces || 0,
        vapoursGases: dto.vapours_gases || 0,
        lelMeasurement: dto.lel_measurement || 0,
        allEquipment: dto.all_equipment || 0,
        exitConditions: dto.exit_conditions || 0,
        communicationEmergency: dto.communication_emergency || 0,
        rescueEquipments: dto.rescue_equipments || 0,
        spaceVentilation: dto.space_ventilation || 0,
        oxygenMeter: dto.oxygen_meter || 0,
      }),
    );

    await this.electricalRepo.save(
      this.electricalRepo.create({
        requestId,
        workingOnElectricalSystem: dto.working_on_electrical_system || 0,
        responsibleForTheInformed: dto.responsible_for_the_informed || 0,
        deEnergized: dto.de_energized || 0,
        ifNotLoto: dto.if_not_loto || 0,
        doRiskAssessment: dto.do_risk_assessment || 0,
        electricityHaveIsulation: dto.electricity_have_isulation || 0,
      }),
    );

    await this.energisingElecRepo.save(
      this.energisingElecRepo.create({
        requestId,
        powerOn: dto.power_on || 0,
        energisingEquipment: dto.energising_equipment || 0,
        isolatingLive: dto.isolating_live || 0,
        workingNearLive: dto.working_near_live || 0,
        responsibleForTheArea: dto.responsible_for_the_area || '',
        riskAssessmentDone: dto.risk_assessment_done || 0,
        barriersSignage: dto.barriers_signage || 0,
        arcFlash: dto.arc_flash || 0,
        energizedBeenTested: dto.energized_been_tested || 0,
        punchesBeenClosed: dto.punches_been_closed || 0,
        toctChecklist: dto.toct_checklist || 0,
        informedAligned: dto.informed_aligned || 0,
        isolatingResponsible:
          dto.isolating_responsible !== undefined
            ? dto.isolating_responsible
            : dto.isolating_resposible || 0,
        isolatingRiskAssessment: dto.isolating_risk_assessment || 0,
        cqInformed: dto.cq_informed || 0,
        cqProvided: dto.cq_provided || 0,
        deEnergisationRequest: dto.de_energisation_request || 0,
        ppePrepared: dto.ppe_prepared || 0,
        absenceOfVoltage: dto.absence_of_voltage || 0,
        storedEnergy: dto.stored_energy || 0,
        backupPower: dto.backup_power || 0,
        unavoidable: dto.unavoidable || 0,
        reasonablyPracticable: dto.reasonably_practicable || 0,
        workAuthorised: dto.work_authorised || 0,
        workingRiskAssessment: dto.working_risk_assessment || 0,
        workingArcBoundary: dto.working_arc_boundary || 0,
        workingBarriers: dto.working_barriers || 0,
        insulatedTools: dto.insulated_tools || 0,
        eventOfEmergency: dto.event_of_emergency || 0,
      }),
    );

    await this.energisingMechRepo.save(
      this.energisingMechRepo.create({
        requestId,
        pressurization: dto.pressurization || 0,
        performedApproved: dto.performed_approved || 0,
        flushingApproved: dto.flushing_approved || 0,
        mcApproved: dto.mc_approved || 0,
        visualInspection: dto.visual_inspection || 0,
        lotoPlanApproved: dto.loto_plan_approved || 0,
        followMediaCode: dto.follow_media_code || 0,
        cqSafetySigns: dto.cq_safety_signs || 0,
        mcNumberText: dto.mc_number_text || '',
      }),
    );

    await this.excavationRepo.save(
      this.excavationRepo.create({
        requestId,
        excavationShoring: dto.excavation_shoring || 0,
        excavationSegregated: dto.excavation_segregated || 0,
        nnStandards: dto.nn_standards || 0,
        danishRegulation: dto.danish_regulation || 0,
        safeAccessAndEgress: dto.safe_access_and_egress || 0,
        correctlySloped: dto.correctly_sloped || 0,
        inspectionDates: dto.inspection_dates || 0,
        markedDrawings: dto.marked_drawings || 0,
        undergroundAreasCleared: dto.underground_areas_cleared || 0,
        excavationWorks: dto.excavation_works || 0,
      }),
    );

    await this.extraMiscRepo.save(
      this.extraMiscRepo.create({
        requestId,
        tools: dto.Tools || dto.tools || '',
        machinery: dto.Machinery || dto.machinery || '',
        descriptionOfActivity: dto.description_of_activity || '',
        mechanicalWorks: dto.mechanical_works || '',
        electricalWorks: dto.electrical_works || '',
        conMInitials: dto.ConM_initials || '',
        conMInitials1: dto.ConM_initials1 || '',
        coMMInitials: dto.CoMM_initials || '',
        rejectReason: dto.reject_reason || '',
        cancelReason: dto.cancel_reason || '',
        closeNote: dto.close_note || '',
        newSubContractor: dto.new_sub_contractor || '',
        workType: dto.work_type || '',
        ramsNumber: dto.rams_number,
      }),
    );

    await this.fireHotworkRepo.save(
      this.fireHotworkRepo.create({
        requestId,
        hotWork: dto.Hot_work || 0,
        fireWatchEstablish: dto.fire_watch_establish || 0,
        combustibleMaterial: dto.combustible_material || 0,
        safetyMeasures: dto.safety_measures || 0,
        extinguishersAndFireBlanket: dto.extinguishers_and_fire_blanket || 0,
        weldingActivity:
          dto.welding_activity !== undefined
            ? dto.welding_activity
            : dto.welding_activitiy || 0,
        heatTreatment: dto.heat_treatment || 0,
        airExtractionBeEstablished: dto.air_extraction_be_established || 0,
        nameOfTheFireWatcher: dto.name_of_the_fire_watcher || '',
        phoneNumberOfTheFireWatcher: dto.phone_number_of_the_fire_watcher || '',
        fireGuardPresent: dto.fire_guard_present || '',
        lowRiskHotwork: dto.low_risk_hotwork || '',
        highRiskHotwork: dto.high_risk_hotwork || '',
        hotWorkChecklistFilled: dto.hot_work_checklist_filled || '',
        hHeatSource: dto.h_heat_source || '',
        hWorkplaceCheck: dto.h_workplace_check || '',
        hFireDetectors: dto.h_fire_detectors || '',
        hStartTime: dto.h_start_time || '',
        hEndTime: dto.h_end_time || '',
        fireImage: dto.fire_image || '',
        tasksInProgressInTheArea: dto.tasks_in_progress_in_the_area || 0,
        accountDuringTheWork: dto.account_during_the_work || 0,
        lightingSufficiently: dto.lighting_sufficiently || 0,
        specificRisksBasedOnTask: dto.specific_risks_based_on_task || 0,
        workEnvironmentSafetyEnsured: dto.work_environment_safety_ensured || 0,
        courseOfActionInEmergencies: dto.course_of_action_in_emergencies || 0,
        ifNoLoto: dto.if_no_loto,
        hazardausSubstances: dto.hazardaus_substances,
      }),
    );

    await this.generalRepo.save(
      this.generalRepo.create({
        requestId,
        affectingOtherContractors: dto.affecting_other_contractors || 0,
        otherConditions: dto.other_conditions || 0,
        otherConditionsInput: dto.other_conditions_input || '',
        lightingBeginWork: dto.lighting_begin_work || 0,
        specificRisks: dto.specific_risks || 0,
        environmentEnsured: dto.environment_ensured || 0,
        courseOfActions:
          dto.course_of_actions !== undefined
            ? dto.course_of_actions
            : dto.course_of_action || 0,
      }),
    );

    await this.heightRepo.save(
      this.heightRepo.create({
        requestId,
        workingAtHeight: dto.working_at_height || 0,
        segragatedDemarkated: dto.segragated_demarkated || 0,
        lanyardAttachments: dto.lanyard_attachments || 0,
        rescuePlan: dto.rescue_plan || 0,
        avoidHazards: dto.avoid_hazards || 0,
        heightTraining: dto.height_training || 0,
        heightEquipments: dto.height_equipments || 0,
        supervision: dto.supervision || 0,
        shockAbsorbing: dto.shock_absorbing || 0,
        verticalLife: dto.vertical_life || 0,
        securedFalling: dto.secured_falling || 0,
        droppedObjects: dto.dropped_objects || 0,
        safeAcces: dto.safe_acces || 0,
        weatherAcceptable: dto.weather_acceptable || 0,
      }),
    );

    await this.liftingRepo.save(
      this.liftingRepo.create({
        requestId,
        usingCranesOrLifting: dto.using_cranes_or_lifting || 0,
        appointedPerson: dto.appointed_person || 0,
        vendorSupplies: dto.vendor_supplies || 0,
        liftPlan: dto.lift_plan || 0,
        suppliedAndInspected: dto.supplied_and_inspected || 0,
        legalRequiredCertificates: dto.legal_required_certificates || 0,
        praparedLifting: dto.prapared_lifting || 0,
        liftingTaskFenced: dto.lifting_task_fenced || 0,
        overheadRisks: dto.overhead_risks || 0,
      }),
    );

    await this.ppeRepo.save(
      this.ppeRepo.create({
        requestId,
        specificGloves: dto.specific_gloves || 0,
        eyeProtection: dto.eye_protection || 0,
        fallProtection: dto.fall_protection || 0,
        hearingProtection: dto.hearing_protection || 0,
        respiratoryProtection: dto.respiratory_protection || 0,
        otherPpe: dto.other_ppe || '',
      }),
    );

    await this.pressureTestingRepo.save(
      this.pressureTestingRepo.create({
        requestId,
        pressureTestingOfEquipment: dto.pressure_testing_of_equipment || 0,
        lineWalk: dto.line_walk || 0,
        pressureTestCoordinated: dto.pressure_test_coordinated || 0,
        pipeworkMic: dto.pipework_mic || 0,
        lotoPlanAttached: dto.loto_plan_attached || 0,
        exclusionZoneCalculated: dto.exclusion_zone_calculated || 0,
        pnematicHydrostatic:
          dto.pnematic_hydrostatic !== undefined
            ? dto.pnematic_hydrostatic
            : dto.pneumatic_hydrostatic || 0,
        pressureOfTheTest: dto.pressure_of_the_test || '',
        safetyValvesCalibrated: dto.safety_valves_calibrated || 0,
        pressurePneumatic: dto.pressure_pneumatic || '',
        pressureHydrostatic: dto.pressure_hydrostatic || '',
      }),
    );

    // 3. Save files
    if (files && files.length > 0) {
      for (const file of files) {
        await this.ramsFileRepo.insert({
          requestId,
          ramsFile: file.path.replace(/\\/g, '/'),
          status: 1,
          createdAt: new Date(),
          userId: dto.userId || 0,
        });
      }
    }

    // 4. Create logs
    await this.createLogs(
      requestId,
      dto.userId || 0,
      dto.Request_status || 'Pending',
      new Date(),
      [],
      0,
    );

    // 5. Add note if provided in create DTO
    if (dto.notes && dto.notes.trim() !== '') {
      let noteUsername = 'System';
      if (dto.userId) {
        const user = await this.userRepo.findOne({ where: { id: dto.userId } });
        if (user && user.username) {
          noteUsername = user.username;
        }
      }

      await this.noteRepo.save(
        this.noteRepo.create({
          requestId,
          permitNo,
          userId: dto.userId || 0,
          username: noteUsername,
          note: dto.notes,
          createdTime: new Date(),
        }),
      );
    }

    await this.redisCacheService.deleteByPattern('requests:*');

    return {
      status: 200,
      message: 'Request created successfully',
      request_id: requestId,
      PermitNo: permitNo,
      username: dto.Foreman || 'System',
    };
  }

  // Update Request
  async update(
    id: number,
    dto: UpdateRequestDto,
    files?: any[],
    images?: any[],
  ): Promise<any> {
    const existing = await this.requestRepo.findOne({ where: { id } });
    if (!existing) {
      throw new BadRequestException('Request not found');
    }

    const chem = await this.chemicalRepo.findOne({ where: { requestId: id } });
    const conf = await this.confinedRepo.findOne({ where: { requestId: id } });
    const elec = await this.electricalRepo.findOne({
      where: { requestId: id },
    });
    const energElec = await this.energisingElecRepo.findOne({
      where: { requestId: id },
    });
    const energMech = await this.energisingMechRepo.findOne({
      where: { requestId: id },
    });
    const exc = await this.excavationRepo.findOne({ where: { requestId: id } });
    const ext = await this.extraMiscRepo.findOne({ where: { requestId: id } });
    const fire = await this.fireHotworkRepo.findOne({
      where: { requestId: id },
    });
    const gen = await this.generalRepo.findOne({ where: { requestId: id } });
    const hgt = await this.heightRepo.findOne({ where: { requestId: id } });
    const lift = await this.liftingRepo.findOne({ where: { requestId: id } });
    const ppe = await this.ppeRepo.findOne({ where: { requestId: id } });
    const press = await this.pressureTestingRepo.findOne({
      where: { requestId: id },
    });

    // 1. Validate zone status and set permit_under dynamically
    await this.checkZoneStatusAndAssignPermitUnder(dto, existing.zoneId);

    // 2. Validate mandatory fields (non-draft)
    this.validateMandatoryFields(dto, existing, {
      chem,
      conf,
      elec,
      energElec,
      energMech,
      exc,
      ext,
      fire,
      gen,
      hgt,
      lift,
      ppe,
      press,
    });

    // Validate status transition
    const currentStatus = (existing.requestStatus || '').toLowerCase().trim();
    let isStatusChanged = false;
    let finalRequestStatusForLog = 'Edited';

    if (dto.Request_status !== undefined && dto.Request_status !== '') {
      const normalizedNew = dto.Request_status.toLowerCase().trim();
      if (normalizedNew !== currentStatus) {
        await this.validateStatusTransitionAndRole(existing, normalizedNew, dto.userId ?? 0);
        isStatusChanged = true;
        finalRequestStatusForLog = dto.Request_status;
      }
    } else if (dto.status !== undefined) {
      const normalizedNew = dto.status === 1 ? 'pending' : 'cancelled';
      if (normalizedNew !== currentStatus) {
        try {
          await this.validateStatusTransitionAndRole(existing, normalizedNew, dto.userId ?? 0);
          isStatusChanged = true;
          finalRequestStatusForLog = dto.status === 1 ? 'Pending' : 'Cancelled';
        } catch (error) {
          isStatusChanged = false;
          finalRequestStatusForLog = 'Edited';
        }
      }
    }

    // Compare and build fieldChanges
    const fieldChanges: Array<{
      field_name: string;
      previous: string;
      present: string;
    }> = [];
    const compare = (name: string, prev: any, pres: any) => {
      if (pres !== undefined && !this.areEqual(prev, pres)) {
        fieldChanges.push({
          field_name: name,
          previous: prev === null || prev === undefined ? '' : String(prev),
          present: pres === null || pres === undefined ? '' : String(pres),
        });
      }
    };

    // Compares for requests table
    compare('Company_Name', existing.companyName, dto.Company_Name);
    compare(
      'Sub_Contractor_Id',
      existing.subContractorId,
      dto.Sub_Contractor_Id,
    );
    compare('Foreman', existing.foreman, dto.Foreman);
    compare(
      'Foreman_Phone_Number',
      existing.foremanPhoneNumber,
      dto.Foreman_Phone_Number,
    );
    compare('Activity', existing.activity, dto.Activity);
    compare(
      'Type_Of_Activity_Id',
      existing.typeOfActivityId,
      dto.Type_Of_Activity_Id,
    );
    compare('Request_Date', existing.requestDate, dto.Request_Date);
    compare('Working_Date', existing.workingDate, dto.Working_Date);
    compare('Start_Time', existing.startTime, dto.Start_Time);
    compare('End_Time', existing.endTime, dto.End_Time);
    compare(
      'Assign_Start_Time',
      existing.assignStartTime,
      dto.Assign_Start_Time,
    );
    compare('Assign_End_Time', existing.assignEndTime, dto.Assign_End_Time);
    compare(
      'Assign_Start_Date',
      existing.assignStartDate,
      dto.Assign_Start_Date,
    );
    compare('Assign_End_Date', existing.assignEndDate, dto.Assign_End_Date);
    compare('Building_Id', existing.buildingId, dto.Building_Id);
    compare('Floor_Id', existing.floorId, dto.Floor_Id);
    compare('Plans_Id', existing.plansId, dto.Plans_Id);
    compare('Zone_Id', existing.zoneId, dto.Zone_Id);
    compare('zone', existing.zone, dto.zone);
    compare('Room_Nos', existing.roomNos, dto.Room_Nos);
    compare('Room_Type', existing.roomType, dto.Room_Type);
    compare(
      'Number_Of_Workers',
      existing.numberOfWorkers,
      dto.Number_Of_Workers,
    );
    compare('Badge_Numbers', existing.badgeNumbers, dto.Badge_Numbers);
    compare('teamId', existing.teamId, dto.teamId);
    // compare('notes', existing.notes, dto.notes);
    compare('Request_status', existing.requestStatus, dto.Request_status);
    compare('permit_type', existing.permitType, dto.permit_type);
    compare('permit_under', existing.permitUnder, dto.permit_under);
    compare('new_date', existing.newDate, dto.new_date);
    compare('new_end_time', existing.newEndTime, dto.new_end_time);
    compare('night_shift', existing.nightShift, dto.night_shift);
    compare(
      'Safety_Precautions',
      existing.safetyPrecautions,
      dto.Safety_Precautions,
    );

    // Compares for sub-tables
    if (chem) {
      compare(
        'working_hazardious_substen',
        chem.workingHazardiousSubsten,
        dto.working_hazardious_substen,
      );
      compare('relevant_mal', chem.relevantMal, dto.relevant_mal);
      compare('msds', chem.msds, dto.msds);
      compare(
        'equipment_taken_account',
        chem.equipmentTakenAccount,
        dto.equipment_taken_account,
      );
      compare('ventilation', chem.ventilation, dto.ventilation);
      compare(
        'hazardous_substances',
        chem.hazardousSubstances,
        dto.hazardous_substances,
      );
      compare(
        'storage_and_disposal',
        chem.storageAndDisposal,
        dto.storage_and_disposal,
      );
      compare('reachable_case', chem.reachableCase, dto.reachable_case);
      compare(
        'checical_risk_assessment',
        chem.checicalRiskAssessment,
        dto.checical_risk_assessment,
      );
    }
    if (conf) {
      compare(
        'working_confined_spaces',
        conf.workingConfinedSpaces,
        dto.working_confined_spaces,
      );
      compare('vapours_gases', conf.vapoursGases, dto.vapours_gases);
      compare('lel_measurement', conf.lelMeasurement, dto.lel_measurement);
      compare('all_equipment', conf.allEquipment, dto.all_equipment);
      compare('exit_conditions', conf.exitConditions, dto.exit_conditions);
      compare(
        'communication_emergency',
        conf.communicationEmergency,
        dto.communication_emergency,
      );
      compare(
        'rescue_equipments',
        conf.rescueEquipments,
        dto.rescue_equipments,
      );
      compare(
        'space_ventilation',
        conf.spaceVentilation,
        dto.space_ventilation,
      );
      compare('oxygen_meter', conf.oxygenMeter, dto.oxygen_meter);
    }
    if (elec) {
      compare(
        'working_on_electrical_system',
        elec.workingOnElectricalSystem,
        dto.working_on_electrical_system,
      );
      compare(
        'responsible_for_the_informed',
        elec.responsibleForTheInformed,
        dto.responsible_for_the_informed,
      );
      compare('de_energized', elec.deEnergized, dto.de_energized);
      compare('if_not_loto', elec.ifNotLoto, dto.if_not_loto);
      compare(
        'do_risk_assessment',
        elec.doRiskAssessment,
        dto.do_risk_assessment,
      );
      compare(
        'electricity_have_isulation',
        elec.electricityHaveIsulation,
        dto.electricity_have_isulation,
      );
    }
    if (energElec) {
      compare('power_on', energElec.powerOn, dto.power_on);
      compare(
        'energising_equipment',
        energElec.energisingEquipment,
        dto.energising_equipment,
      );
      compare('isolating_live', energElec.isolatingLive, dto.isolating_live);
      compare(
        'working_near_live',
        energElec.workingNearLive,
        dto.working_near_live,
      );
      compare(
        'responsible_for_the_area',
        energElec.responsibleForTheArea,
        dto.responsible_for_the_area,
      );
      compare(
        'risk_assessment_done',
        energElec.riskAssessmentDone,
        dto.risk_assessment_done,
      );
      compare(
        'barriers_signage',
        energElec.barriersSignage,
        dto.barriers_signage,
      );
      compare('arc_flash', energElec.arcFlash, dto.arc_flash);
      compare(
        'energized_been_tested',
        energElec.energizedBeenTested,
        dto.energized_been_tested,
      );
      compare(
        'punches_been_closed',
        energElec.punchesBeenClosed,
        dto.punches_been_closed,
      );
      compare('toct_checklist', energElec.toctChecklist, dto.toct_checklist);
      compare(
        'informed_aligned',
        energElec.informedAligned,
        dto.informed_aligned,
      );
      compare(
        'isolating_responsible',
        energElec.isolatingResponsible,
        dto.isolating_responsible !== undefined
          ? dto.isolating_responsible
          : dto.isolating_resposible,
      );
      compare(
        'isolating_risk_assessment',
        energElec.isolatingRiskAssessment,
        dto.isolating_risk_assessment,
      );
      compare('cq_informed', energElec.cqInformed, dto.cq_informed);
      compare('cq_provided', energElec.cqProvided, dto.cq_provided);
      compare(
        'de_energisation_request',
        energElec.deEnergisationRequest,
        dto.de_energisation_request,
      );
      compare('ppe_prepared', energElec.ppePrepared, dto.ppe_prepared);
      compare(
        'absence_of_voltage',
        energElec.absenceOfVoltage,
        dto.absence_of_voltage,
      );
      compare('stored_energy', energElec.storedEnergy, dto.stored_energy);
      compare('backup_power', energElec.backupPower, dto.backup_power);
      compare('unavoidable', energElec.unavoidable, dto.unavoidable);
      compare(
        'reasonably_practicable',
        energElec.reasonablyPracticable,
        dto.reasonably_practicable,
      );
      compare('work_authorised', energElec.workAuthorised, dto.work_authorised);
      compare(
        'working_risk_assessment',
        energElec.workingRiskAssessment,
        dto.working_risk_assessment,
      );
      compare(
        'working_arc_boundary',
        energElec.workingArcBoundary,
        dto.working_arc_boundary,
      );
      compare(
        'working_barriers',
        energElec.workingBarriers,
        dto.working_barriers,
      );
      compare('insulated_tools', energElec.insulatedTools, dto.insulated_tools);
      compare(
        'event_of_emergency',
        energElec.eventOfEmergency,
        dto.event_of_emergency,
      );
    }
    if (energMech) {
      compare('pressurization', energMech.pressurization, dto.pressurization);
      compare(
        'performed_approved',
        energMech.performedApproved,
        dto.performed_approved,
      );
      compare(
        'flushing_approved',
        energMech.flushingApproved,
        dto.flushing_approved,
      );
      compare('mc_approved', energMech.mcApproved, dto.mc_approved);
      compare(
        'visual_inspection',
        energMech.visualInspection,
        dto.visual_inspection,
      );
      compare(
        'loto_plan_approved',
        energMech.lotoPlanApproved,
        dto.loto_plan_approved,
      );
      compare(
        'follow_media_code',
        energMech.followMediaCode,
        dto.follow_media_code,
      );
      compare('cq_safety_signs', energMech.cqSafetySigns, dto.cq_safety_signs);
      compare('mc_number_text', energMech.mcNumberText, dto.mc_number_text);
    }
    if (exc) {
      compare(
        'excavation_shoring',
        exc.excavationShoring,
        dto.excavation_shoring,
      );
      compare(
        'excavation_segregated',
        exc.excavationSegregated,
        dto.excavation_segregated,
      );
      compare('nn_standards', exc.nnStandards, dto.nn_standards);
      compare('danish_regulation', exc.danishRegulation, dto.danish_regulation);
      compare(
        'safe_access_and_egress',
        exc.safeAccessAndEgress,
        dto.safe_access_and_egress,
      );
      compare('correctly_sloped', exc.correctlySloped, dto.correctly_sloped);
      compare('inspection_dates', exc.inspectionDates, dto.inspection_dates);
      compare('marked_drawings', exc.markedDrawings, dto.marked_drawings);
      compare(
        'underground_areas_cleared',
        exc.undergroundAreasCleared,
        dto.underground_areas_cleared,
      );
      compare('excavation_works', exc.excavationWorks, dto.excavation_works);
    }
    if (ext) {
      compare(
        'Tools',
        ext.tools,
        dto.Tools !== undefined ? dto.Tools : dto.tools,
      );
      compare(
        'Machinery',
        ext.machinery,
        dto.Machinery !== undefined ? dto.Machinery : dto.machinery,
      );
      compare(
        'description_of_activity',
        ext.descriptionOfActivity,
        dto.description_of_activity,
      );
      compare('mechanical_works', ext.mechanicalWorks, dto.mechanical_works);
      compare('electrical_works', ext.electricalWorks, dto.electrical_works);
      compare('ConM_initials', ext.conMInitials, dto.ConM_initials);
      compare('ConM_initials1', ext.conMInitials1, dto.ConM_initials1);
      compare('CoMM_initials', ext.coMMInitials, dto.CoMM_initials);
      compare('reject_reason', ext.rejectReason, dto.reject_reason);
      compare('cancel_reason', ext.cancelReason, dto.cancel_reason);
      compare('close_note', ext.closeNote, dto.close_note);
      compare(
        'new_sub_contractor',
        ext.newSubContractor,
        dto.new_sub_contractor,
      );
      compare('work_type', ext.workType, dto.work_type);
      compare('rams_number', ext.ramsNumber, dto.rams_number);
    }
    if (fire) {
      compare('Hot_work', fire.hotWork, dto.Hot_work);
      compare(
        'fire_watch_establish',
        fire.fireWatchEstablish,
        dto.fire_watch_establish,
      );
      compare(
        'combustible_material',
        fire.combustibleMaterial,
        dto.combustible_material,
      );
      compare('safety_measures', fire.safetyMeasures, dto.safety_measures);
      compare(
        'extinguishers_and_fire_blanket',
        fire.extinguishersAndFireBlanket,
        dto.extinguishers_and_fire_blanket,
      );
      compare(
        'welding_activity',
        fire.weldingActivity,
        dto.welding_activity !== undefined
          ? dto.welding_activity
          : dto.welding_activitiy,
      );
      compare('heat_treatment', fire.heatTreatment, dto.heat_treatment);
      compare(
        'air_extraction_be_established',
        fire.airExtractionBeEstablished,
        dto.air_extraction_be_established,
      );
      compare(
        'name_of_the_fire_watcher',
        fire.nameOfTheFireWatcher,
        dto.name_of_the_fire_watcher,
      );
      compare(
        'phone_number_of_the_fire_watcher',
        fire.phoneNumberOfTheFireWatcher,
        dto.phone_number_of_the_fire_watcher,
      );
      compare(
        'fire_guard_present',
        fire.fireGuardPresent,
        dto.fire_guard_present,
      );
      compare('low_risk_hotwork', fire.lowRiskHotwork, dto.low_risk_hotwork);
      compare('high_risk_hotwork', fire.highRiskHotwork, dto.high_risk_hotwork);
      compare(
        'hot_work_checklist_filled',
        fire.hotWorkChecklistFilled,
        dto.hot_work_checklist_filled,
      );
      compare('h_heat_source', fire.hHeatSource, dto.h_heat_source);
      compare('h_workplace_check', fire.hWorkplaceCheck, dto.h_workplace_check);
      compare('h_fire_detectors', fire.hFireDetectors, dto.h_fire_detectors);
      compare('h_start_time', fire.hStartTime, dto.h_start_time);
      compare('h_end_time', fire.hEndTime, dto.h_end_time);
      compare('fire_image', fire.fireImage, dto.fire_image);
      compare(
        'tasks_in_progress_in_the_area',
        fire.tasksInProgressInTheArea,
        dto.tasks_in_progress_in_the_area,
      );
      compare(
        'account_during_the_work',
        fire.accountDuringTheWork,
        dto.account_during_the_work,
      );
      compare(
        'lighting_sufficiently',
        fire.lightingSufficiently,
        dto.lighting_sufficiently,
      );
      compare(
        'specific_risks_based_on_task',
        fire.specificRisksBasedOnTask,
        dto.specific_risks_based_on_task,
      );
      compare(
        'work_environment_safety_ensured',
        fire.workEnvironmentSafetyEnsured,
        dto.work_environment_safety_ensured,
      );
      compare(
        'course_of_action_in_emergencies',
        fire.courseOfActionInEmergencies,
        dto.course_of_action_in_emergencies,
      );
      compare('if_no_loto', fire.ifNoLoto, dto.if_no_loto);
      compare('hazardaus_substances', fire.hazardausSubstances, dto.hazardaus_substances);
    }
    if (gen) {
      compare(
        'affecting_other_contractors',
        gen.affectingOtherContractors,
        dto.affecting_other_contractors,
      );
      compare('other_conditions', gen.otherConditions, dto.other_conditions);
      compare(
        'other_conditions_input',
        gen.otherConditionsInput,
        dto.other_conditions_input,
      );
      compare(
        'lighting_begin_work',
        gen.lightingBeginWork,
        dto.lighting_begin_work,
      );
      compare('specific_risks', gen.specificRisks, dto.specific_risks);
      compare(
        'environment_ensured',
        gen.environmentEnsured,
        dto.environment_ensured,
      );
      compare(
        'course_of_actions',
        gen.courseOfActions,
        dto.course_of_actions !== undefined
          ? dto.course_of_actions
          : dto.course_of_action,
      );
    }
    if (hgt) {
      compare('working_at_height', hgt.workingAtHeight, dto.working_at_height);
      compare(
        'segragated_demarkated',
        hgt.segragatedDemarkated,
        dto.segragated_demarkated,
      );
      compare(
        'lanyard_attachments',
        hgt.lanyardAttachments,
        dto.lanyard_attachments,
      );
      compare('rescue_plan', hgt.rescuePlan, dto.rescue_plan);
      compare('avoid_hazards', hgt.avoidHazards, dto.avoid_hazards);
      compare('height_equipments', hgt.heightEquipments, dto.height_equipments);
      compare('supervision', hgt.supervision, dto.supervision);
      compare('shock_absorbing', hgt.shockAbsorbing, dto.shock_absorbing);
      compare('vertical_life', hgt.verticalLife, dto.vertical_life);
      compare('secured_falling', hgt.securedFalling, dto.secured_falling);
      compare('dropped_objects', hgt.droppedObjects, dto.dropped_objects);
      compare('safe_acces', hgt.safeAcces, dto.safe_acces);
      compare(
        'weather_acceptable',
        hgt.weatherAcceptable,
        dto.weather_acceptable,
      );
    }
    if (lift) {
      compare(
        'using_cranes_or_lifting',
        lift.usingCranesOrLifting,
        dto.using_cranes_or_lifting,
      );
      compare('appointed_person', lift.appointedPerson, dto.appointed_person);
      compare(
        'vendor_supplies',
        lift.vendorSupplies,
        dto.vendor_supplies !== undefined
          ? dto.vendor_supplies
          : dto.vendor_supplier,
      );
      compare('lift_plan', lift.liftPlan, dto.lift_plan);
      compare(
        'supplied_and_inspected',
        lift.suppliedAndInspected,
        dto.supplied_and_inspected,
      );
      compare(
        'legal_required_certificates',
        lift.legalRequiredCertificates,
        dto.legal_required_certificates,
      );
      compare('prapared_lifting', lift.praparedLifting, dto.prapared_lifting);
      compare(
        'lifting_task_fenced',
        lift.liftingTaskFenced,
        dto.lifting_task_fenced,
      );
      compare('overhead_risks', lift.overheadRisks, dto.overhead_risks);
    }
    if (ppe) {
      compare('specific_gloves', ppe.specificGloves, dto.specific_gloves);
      compare('eye_protection', ppe.eyeProtection, dto.eye_protection);
      compare('fall_protection', ppe.fallProtection, dto.fall_protection);
      compare(
        'hearing_protection',
        ppe.hearingProtection,
        dto.hearing_protection,
      );
      compare(
        'respiratory_protection',
        ppe.respiratoryProtection,
        dto.respiratory_protection,
      );
      compare('other_ppe', ppe.otherPpe, dto.other_ppe);
    }
    if (press) {
      compare(
        'pressure_testing_of_equipment',
        press.pressureTestingOfEquipment,
        dto.pressure_testing_of_equipment,
      );
      compare('line_walk', press.lineWalk, dto.line_walk);
      compare(
        'pressure_test_coordinated',
        press.pressureTestCoordinated,
        dto.pressure_test_coordinated,
      );
      compare('pipework_mic', press.pipeworkMic, dto.pipework_mic);
      compare(
        'loto_plan_attached',
        press.lotoPlanAttached,
        dto.loto_plan_attached,
      );
      compare(
        'exclusion_zone_calculated',
        press.exclusionZoneCalculated,
        dto.exclusion_zone_calculated,
      );
      compare(
        'pnematic_hydrostatic',
        press.pnematicHydrostatic,
        dto.pnematic_hydrostatic !== undefined
          ? dto.pnematic_hydrostatic
          : dto.pneumatic_hydrostatic,
      );
      compare(
        'pressure_of_the_test',
        press.pressureOfTheTest,
        dto.pressure_of_the_test,
      );
      compare(
        'safety_valves_calibrated',
        press.safetyValvesCalibrated,
        dto.safety_valves_calibrated,
      );
      compare(
        'pressure_pneumatic',
        press.pressurePneumatic,
        dto.pressure_pneumatic,
      );
      compare(
        'pressure_hydrostatic',
        press.pressureHydrostatic,
        dto.pressure_hydrostatic,
      );
    }

    // 1. Update main Requests table
    const toUpdate: Partial<RequestEntity> = {};
    const addIfChanged = (
      dbKey: keyof RequestEntity,
      dtoVal: any,
      dbVal: any,
    ) => {
      if (dtoVal !== undefined && !this.areEqual(dbVal, dtoVal)) {
        (toUpdate as any)[dbKey] = dtoVal;
      }
    };

    addIfChanged('userId', dto.userId, existing.userId);
    addIfChanged('companyName', dto.Company_Name, existing.companyName);
    addIfChanged(
      'subContractorId',
      dto.Sub_Contractor_Id,
      existing.subContractorId,
    );
    addIfChanged('foreman', dto.Foreman, existing.foreman);
    addIfChanged(
      'foremanPhoneNumber',
      dto.Foreman_Phone_Number,
      existing.foremanPhoneNumber,
    );
    addIfChanged('activity', dto.Activity, existing.activity);
    addIfChanged(
      'typeOfActivityId',
      dto.Type_Of_Activity_Id,
      existing.typeOfActivityId,
    );
    addIfChanged('requestDate', dto.Request_Date, existing.requestDate);
    addIfChanged('workingDate', dto.Working_Date, existing.workingDate);
    addIfChanged('startTime', dto.Start_Time, existing.startTime);
    addIfChanged('endTime', dto.End_Time, existing.endTime);
    addIfChanged(
      'assignStartTime',
      dto.Assign_Start_Time,
      existing.assignStartTime,
    );
    addIfChanged('assignEndTime', dto.Assign_End_Time, existing.assignEndTime);
    addIfChanged(
      'assignStartDate',
      dto.Assign_Start_Date,
      existing.assignStartDate,
    );
    addIfChanged('assignEndDate', dto.Assign_End_Date, existing.assignEndDate);
    addIfChanged('buildingId', dto.Building_Id, existing.buildingId);
    addIfChanged('floorId', dto.Floor_Id, existing.floorId);
    addIfChanged('plansId', dto.Plans_Id, existing.plansId);
    addIfChanged('zoneId', dto.Zone_Id, existing.zoneId);
    addIfChanged('zone', dto.zone, existing.zone);
    addIfChanged('roomNos', dto.Room_Nos, existing.roomNos);
    addIfChanged('roomType', dto.Room_Type, existing.roomType);
    addIfChanged(
      'numberOfWorkers',
      dto.Number_Of_Workers,
      existing.numberOfWorkers,
    );
    addIfChanged('badgeNumbers', dto.Badge_Numbers, existing.badgeNumbers);
    addIfChanged('teamId', dto.teamId, existing.teamId);
    addIfChanged('notes', dto.notes, existing.notes);
    if (isStatusChanged) {
      if (dto.Request_status !== undefined && dto.Request_status !== '') {
        addIfChanged('requestStatus', dto.Request_status, existing.requestStatus);
      } else if (dto.status !== undefined) {
        addIfChanged('status', dto.status, existing.status);
      }
    }
    addIfChanged('permitType', dto.permit_type, existing.permitType);
    addIfChanged('permitUnder', dto.permit_under, existing.permitUnder);

    if (dto.night_shift !== undefined || dto.new_date !== undefined || dto.new_end_time !== undefined) {
      const isNightShift = dto.night_shift !== undefined
        ? (String(dto.night_shift) === '1' || String(dto.night_shift) === 'true')
        : (String(existing.nightShift) === '1' || String(existing.nightShift) === 'true');

      if (isNightShift) {
        const workingDateVal = dto.Working_Date || existing.workingDate;
        const computedNextDate = (workingDateVal && this.getNextDateString(workingDateVal)) || '';

        const finalNewDate = dto.new_date !== undefined
          ? (dto.new_date && dto.new_date !== 'none' ? dto.new_date : computedNextDate)
          : (existing.newDate || computedNextDate);

        const finalNewEndTime = dto.new_end_time !== undefined
          ? (dto.new_end_time && dto.new_end_time !== 'none' ? dto.new_end_time : '')
          : existing.newEndTime;

        addIfChanged('newDate', finalNewDate, existing.newDate);
        addIfChanged('newEndTime', finalNewEndTime, existing.newEndTime);
        addIfChanged('nightShift', '1', existing.nightShift);
      } else {
        addIfChanged('newDate', '', existing.newDate);
        addIfChanged('newEndTime', '', existing.newEndTime);
        addIfChanged('nightShift', '0', existing.nightShift);
      }
    }
    addIfChanged(
      'safetyPrecautions',
      dto.Safety_Precautions,
      existing.safetyPrecautions,
    );

    if (Object.keys(toUpdate).length > 0) {
      await this.requestRepo.update(id, toUpdate);
    }

    if (isStatusChanged) {
      const newStatus = dto.Request_status !== undefined && dto.Request_status !== ''
        ? dto.Request_status
        : (dto.status === 1 ? 'Pending' : 'Cancelled');
      this.notificationsService.triggerNotification(
        id,
        existing.requestStatus,
        newStatus,
        dto.userId ?? 0,
      ).catch((err) => console.error('Notification error:', err));
    }

    // 2. Update sub-tables
    const updateSubTable = async (
      repo: Repository<any>,
      existingSub: any,
      fields: any,
    ) => {
      const filteredFields: any = {};
      for (const key in fields) {
        if (fields[key] !== undefined) {
          filteredFields[key] = fields[key];
        }
      }
      if (Object.keys(filteredFields).length > 0) {
        if (existingSub) {
          const changedFields: any = {};
          for (const key in filteredFields) {
            if (!this.areEqual(existingSub[key], filteredFields[key])) {
              changedFields[key] = filteredFields[key];
            }
          }
          if (Object.keys(changedFields).length > 0) {
            await repo.update({ requestId: id }, changedFields);
          }
        } else {
          await repo.save(repo.create({ requestId: id, ...filteredFields }));
        }
      }
    };

    await updateSubTable(this.chemicalRepo, chem, {
      workingHazardiousSubsten: dto.working_hazardious_substen,
      relevantMal: dto.relevant_mal,
      msds: dto.msds,
      equipmentTakenAccount: dto.equipment_taken_account,
      ventilation: dto.ventilation,
      hazardousSubstances: dto.hazardous_substances,
      storageAndDisposal: dto.storage_and_disposal,
      reachableCase: dto.reachable_case,
      checicalRiskAssessment: dto.checical_risk_assessment,
    });

    await updateSubTable(this.confinedRepo, conf, {
      workingConfinedSpaces: dto.working_confined_spaces,
      vapoursGases: dto.vapours_gases,
      lelMeasurement: dto.lel_measurement,
      allEquipment: dto.all_equipment,
      exitConditions: dto.exit_conditions,
      communicationEmergency: dto.communication_emergency,
      rescueEquipments: dto.rescue_equipments,
      spaceVentilation: dto.space_ventilation,
      oxygenMeter: dto.oxygen_meter,
    });

    await updateSubTable(this.electricalRepo, elec, {
      workingOnElectricalSystem: dto.working_on_electrical_system,
      responsibleForTheInformed: dto.responsible_for_the_informed,
      deEnergized: dto.de_energized,
      ifNotLoto: dto.if_not_loto,
      doRiskAssessment: dto.do_risk_assessment,
      electricityHaveIsulation: dto.electricity_have_isulation,
    });

    await updateSubTable(this.energisingElecRepo, energElec, {
      powerOn: dto.power_on,
      energisingEquipment: dto.energising_equipment,
      isolatingLive: dto.isolating_live,
      workingNearLive: dto.working_near_live,
      responsibleForTheArea: dto.responsible_for_the_area,
      riskAssessmentDone: dto.risk_assessment_done,
      barriersSignage: dto.barriers_signage,
      arcFlash: dto.arc_flash,
      energizedBeenTested: dto.energized_been_tested,
      punchesBeenClosed: dto.punches_been_closed,
      toctChecklist: dto.toct_checklist,
      informedAligned: dto.informed_aligned,
      isolatingResponsible:
        dto.isolating_responsible !== undefined
          ? dto.isolating_responsible
          : dto.isolating_resposible,
      isolatingRiskAssessment: dto.isolating_risk_assessment,
      cqInformed: dto.cq_informed,
      cqProvided: dto.cq_provided,
      deEnergisationRequest: dto.de_energisation_request,
      ppePrepared: dto.ppe_prepared,
      absenceOfVoltage: dto.absence_of_voltage,
      storedEnergy: dto.stored_energy,
      backupPower: dto.backup_power,
      unavoidable: dto.unavoidable,
      reasonablyPracticable: dto.reasonably_practicable,
      workAuthorised: dto.work_authorised,
      workingRiskAssessment: dto.working_risk_assessment,
      workingArcBoundary: dto.working_arc_boundary,
      workingBarriers: dto.working_barriers,
      insulatedTools: dto.insulated_tools,
      eventOfEmergency: dto.event_of_emergency,
    });

    await updateSubTable(this.energisingMechRepo, energMech, {
      pressurization: dto.pressurization,
      performedApproved: dto.performed_approved,
      flushingApproved: dto.flushing_approved,
      mcApproved: dto.mc_approved,
      visualInspection: dto.visual_inspection,
      lotoPlanApproved: dto.loto_plan_approved,
      followMediaCode: dto.follow_media_code,
      cqSafetySigns: dto.cq_safety_signs,
      mcNumberText: dto.mc_number_text,
    });

    await updateSubTable(this.excavationRepo, exc, {
      excavationShoring: dto.excavation_shoring,
      excavationSegregated: dto.excavation_segregated,
      nnStandards: dto.nn_standards,
      danishRegulation: dto.danish_regulation,
      safeAccessAndEgress: dto.safe_access_and_egress,
      correctlySloped: dto.correctly_sloped,
      inspectionDates: dto.inspection_dates,
      markedDrawings: dto.marked_drawings,
      undergroundAreasCleared: dto.underground_areas_cleared,
      excavationWorks: dto.excavation_works,
    });

    await updateSubTable(this.extraMiscRepo, ext, {
      tools: dto.Tools !== undefined ? dto.Tools : dto.tools,
      machinery: dto.Machinery !== undefined ? dto.Machinery : dto.machinery,
      descriptionOfActivity: dto.description_of_activity,
      mechanicalWorks: dto.mechanical_works,
      electricalWorks: dto.electrical_works,
      conMInitials: dto.ConM_initials,
      conMInitials1: dto.ConM_initials1,
      coMMInitials: dto.CoMM_initials,
      rejectReason: dto.reject_reason,
      cancelReason: dto.cancel_reason,
      closeNote: dto.close_note,
      newSubContractor: dto.new_sub_contractor,
      workType: dto.work_type,
      ramsNumber: dto.rams_number,
    });

    await updateSubTable(this.fireHotworkRepo, fire, {
      hotWork: dto.Hot_work,
      fireWatchEstablish: dto.fire_watch_establish,
      combustibleMaterial: dto.combustible_material,
      safetyMeasures: dto.safety_measures,
      extinguishersAndFireBlanket: dto.extinguishers_and_fire_blanket,
      weldingActivity:
        dto.welding_activity !== undefined
          ? dto.welding_activity
          : dto.welding_activitiy,
      heatTreatment: dto.heat_treatment,
      airExtractionBeEstablished: dto.air_extraction_be_established,
      nameOfTheFireWatcher: dto.name_of_the_fire_watcher,
      phoneNumberOfTheFireWatcher: dto.phone_number_of_the_fire_watcher,
      fireGuardPresent: dto.fire_guard_present,
      lowRiskHotwork: dto.low_risk_hotwork,
      highRiskHotwork: dto.high_risk_hotwork,
      hotWorkChecklistFilled: dto.hot_work_checklist_filled,
      hHeatSource: dto.h_heat_source,
      hWorkplaceCheck: dto.h_workplace_check,
      hFireDetectors: dto.h_fire_detectors,
      hStartTime: dto.h_start_time,
      hEndTime: dto.h_end_time,
      fireImage: dto.fire_image,
      tasksInProgressInTheArea: dto.tasks_in_progress_in_the_area,
      accountDuringTheWork: dto.account_during_the_work,
      lightingSufficiently: dto.lighting_sufficiently,
      specificRisksBasedOnTask: dto.specific_risks_based_on_task,
      workEnvironmentSafetyEnsured: dto.work_environment_safety_ensured,
      courseOfActionInEmergencies: dto.course_of_action_in_emergencies,
      ifNoLoto: dto.if_no_loto,
      hazardausSubstances: dto.hazardaus_substances,
    });

    await updateSubTable(this.generalRepo, gen, {
      affectingOtherContractors: dto.affecting_other_contractors,
      otherConditions: dto.other_conditions,
      otherConditionsInput: dto.other_conditions_input,
      lightingBeginWork: dto.lighting_begin_work,
      specificRisks: dto.specific_risks,
      environmentEnsured: dto.environment_ensured,
      courseOfActions:
        dto.course_of_actions !== undefined && dto.course_of_actions !== null
          ? dto.course_of_actions
          : dto.course_of_action,
    });

    await updateSubTable(this.heightRepo, hgt, {
      workingAtHeight: dto.working_at_height,
      segragatedDemarkated: dto.segragated_demarkated,
      lanyardAttachments: dto.lanyard_attachments,
      rescuePlan: dto.rescue_plan,
      avoidHazards: dto.avoid_hazards,
      heightTraining: dto.height_training,
      heightEquipments: dto.height_equipments,
      supervision: dto.supervision,
      shockAbsorbing: dto.shock_absorbing,
      verticalLife: dto.vertical_life,
      securedFalling: dto.secured_falling,
      droppedObjects: dto.dropped_objects,
      safeAcces: dto.safe_acces,
      weatherAcceptable: dto.weather_acceptable,
    });

    await updateSubTable(this.liftingRepo, lift, {
      usingCranesOrLifting: dto.using_cranes_or_lifting,
      appointedPerson: dto.appointed_person,
      vendorSupplies:
        dto.vendor_supplies !== undefined
          ? dto.vendor_supplies
          : dto.vendor_supplier,
      liftPlan: dto.lift_plan,
      suppliedAndInspected: dto.supplied_and_inspected,
      legalRequiredCertificates: dto.legal_required_certificates,
      praparedLifting: dto.prapared_lifting,
      liftingTaskFenced: dto.lifting_task_fenced,
      overheadRisks: dto.overhead_risks,
    });

    await updateSubTable(this.ppeRepo, ppe, {
      specificGloves: dto.specific_gloves,
      eyeProtection: dto.eye_protection,
      fallProtection: dto.fall_protection,
      hearingProtection: dto.hearing_protection,
      respiratoryProtection: dto.respiratory_protection,
      otherPpe: dto.other_ppe,
    });

    await updateSubTable(this.pressureTestingRepo, press, {
      pressureTestingOfEquipment: dto.pressure_testing_of_equipment,
      lineWalk: dto.line_walk,
      pressureTestCoordinated: dto.pressure_test_coordinated,
      pipeworkMic: dto.pipework_mic,
      lotoPlanAttached: dto.loto_plan_attached,
      exclusionZoneCalculated: dto.exclusion_zone_calculated,
      pnematicHydrostatic:
        dto.pnematic_hydrostatic !== undefined
          ? dto.pnematic_hydrostatic
          : dto.pneumatic_hydrostatic,
      pressureOfTheTest: dto.pressure_of_the_test,
      safetyValvesCalibrated: dto.safety_valves_calibrated,
      pressurePneumatic: dto.pressure_pneumatic,
      pressureHydrostatic: dto.pressure_hydrostatic,
    });

    // 3. Save uploaded files
    if (files && files.length > 0) {
      for (const file of files) {
        await this.ramsFileRepo.insert({
          requestId: id,
          ramsFile: file.path.replace(/\\/g, '/'),
          status: 1,
          createdAt: new Date(),
          userId: dto.userId || existing.userId || 0,
        });
      }
    }

    // Save uploaded images (multer)
    if (images && images.length > 0) {
      for (const file of images) {
        await this.uploadImageRepo.save(
          this.uploadImageRepo.create({
            requestId: id,
            imageName: file.path.replace(/\\/g, '/'),
            userId: dto.userId || existing.userId || 0,
          }),
        );
      }
    }

    // Save base64 images if passed (accepts single base64 string or JSON array of base64 strings)
    if (dto.Image1) {
      let base64Array: string[] = [];
      try {
        if (typeof dto.Image1 === 'string' && dto.Image1.trim().startsWith('[')) {
          base64Array = JSON.parse(dto.Image1);
        } else {
          base64Array = [dto.Image1];
        }
      } catch (e) {
        base64Array = [dto.Image1];
      }

      for (const imgStr of base64Array) {
        if (!imgStr) continue;
        const encodedString = imgStr.split(',');
        const base64Data = encodedString[1] || encodedString[0];
        if (base64Data) {
          const buffer = Buffer.from(base64Data, 'base64');
          const filename = `${Date.now()}_${Math.round(Math.random() * 1e9)}.png`;
          const uploadDir = './uploads/requests';
          if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
          }
          const filePath = path.join(uploadDir, filename);
          fs.writeFileSync(filePath, buffer);

          // insert record into uploadimage table
          await this.uploadImageRepo.save(
            this.uploadImageRepo.create({
              requestId: id,
              imageName: filePath.replace(/\\/g, '/'),
              userId: dto.userId || existing.userId || 0,
            }),
          );
        }
      }
    }

    // 4. Log changes
    const finalChanges = dto.fields
      ? Array.isArray(dto.fields)
        ? dto.fields
        : []
      : fieldChanges;
    await this.createLogs(
      id,
      dto.userId || existing.userId || 0,
      finalRequestStatusForLog,
      new Date(),
      finalChanges,
      0,
    );

    await this.redisCacheService.deleteByPattern('requests:*');

    return {
      success: true,
      message: 'Request updated successfully.',
    };
  }

  // Bulk Status Update
  private getNextDateString(dateStr: string | Date): string | null {
    if (!dateStr) return null;
    const dateStrNorm = typeof dateStr === 'object' ? dateStr.toISOString().split('T')[0] : String(dateStr);
    const parts = dateStrNorm.split('-');
    if (parts.length !== 3) return null;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);

    const dateObj = new Date(y, m, d);
    dateObj.setDate(dateObj.getDate() + 1);

    const nextY = dateObj.getFullYear();
    const nextM = String(dateObj.getMonth() + 1).padStart(2, '0');
    const nextD = String(dateObj.getDate()).padStart(2, '0');
    return `${nextY}-${nextM}-${nextD}`;
  }

  async updateStatus(body: {
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
  }): Promise<any> {
    const {
      id,
      Request_status,
      status,
      userId,
      initials,
      ConM_initials,
      CoMM_initials,
      ConM_initials1,
      reject_reason,
      cancel_reason,
      close_note,
      Start_Time,
      End_Time,
      night_shift,
      new_end_time,
    } = body;

    if (!id) {
      throw new BadRequestException('Missing required field: id');
    }

    const idsArray = id
      .split(',')
      .map((val) => Number(val.trim()))
      .filter((val) => !isNaN(val));

    const successfulUpdates: number[] = [];
    const failedUpdates: { id: number; error: string }[] = [];

    // Resolve the incoming status to the actual stored value
    const resolvedStatus = this.resolveApprovalStatus(Request_status);

    for (const singleId of idsArray) {
      const existing = await this.requestRepo.findOne({
        where: { id: singleId },
      });
      if (!existing) {
        failedUpdates.push({ id: singleId, error: 'Request not found' });
        continue;
      }
      const statusLower = existing.requestStatus?.toLowerCase() || '';
      if (
        statusLower === 'rejected' ||
        statusLower === 'cancelled' ||
        statusLower === 'closed' ||
        statusLower === 'auto-cancelled' ||
        statusLower === 'auto cancelled'
      ) {
        failedUpdates.push({
          id: singleId,
          error: `Permit is in '${existing.requestStatus}' status and cannot be modified.`,
        });
        continue;
      }

      try {
        const updateData: Partial<RequestEntity> = {};

        // 1. Process Status transition if requested
        let targetStatus = '';
        if (Request_status !== undefined) {
          targetStatus = Request_status;
        } else if (status !== undefined) {
          targetStatus = status === 1 ? 'Pending' : 'Cancelled';
        }

        if (targetStatus !== '') {
          // Prevent setting to same status (status must move forward)
          const currentStatusClean = (existing.requestStatus || '').trim().toLowerCase();
          const targetStatusClean = (targetStatus || '').trim().toLowerCase();
          const resolvedStatusClean = (resolvedStatus || '').trim().toLowerCase();

          if (
            targetStatusClean !== '' &&
            (targetStatusClean === currentStatusClean || resolvedStatusClean === currentStatusClean)
          ) {
            throw new BadRequestException(
              `Permit ${existing.permitNo ? existing.permitNo + ' ' : ''}is already in '${existing.requestStatus}' status.`,
            );
          }

          await this.validateStatusTransitionAndRole(existing, targetStatus, userId || 0);
          if (Request_status !== undefined) {
            updateData.requestStatus = resolvedStatus;
          }
          if (status !== undefined) {
            updateData.status = status;
          }
        }

        // 1b. Update extension subtable (initials, reasons, notes)
        let ext = await this.extraMiscRepo.findOne({ where: { requestId: singleId } });
        if (!ext) {
          ext = this.extraMiscRepo.create({ requestId: singleId });
        }

        let isExtUpdated = false;

        if (reject_reason !== undefined && reject_reason !== '') {
          ext.rejectReason = reject_reason;
          isExtUpdated = true;
        }
        if (cancel_reason !== undefined && cancel_reason !== '') {
          ext.cancelReason = cancel_reason;
          isExtUpdated = true;
        }
        if (close_note !== undefined && close_note !== '') {
          ext.closeNote = close_note;
          isExtUpdated = true;
        }

        const providedInitials = (initials || '').trim();
        const providedConM = (ConM_initials || '').trim();
        const providedCoMM = (CoMM_initials || '').trim();
        const providedConM1 = (ConM_initials1 || '').trim();
        const sig = providedInitials || providedConM || providedCoMM || providedConM1;

        if (sig !== '') {
          const nextStatus = resolvedStatus || targetStatus || existing.requestStatus || '';
          if (nextStatus === 'Opened' || targetStatus === 'Opened') {
            ext.conMInitials1 = providedConM1 || sig;
            isExtUpdated = true;
          }

          const permitType = (existing.permitType || '').trim();
          const permitUnder = (existing.permitUnder || '').trim();
          const currentStatus = (existing.requestStatus || '').trim();

          // Rule 1: Construction & Construction => ONLY ConM_initials (Direct approval)
          if (permitType === 'Construction' && permitUnder === 'Construction') {
            ext.conMInitials = providedConM || sig;
            isExtUpdated = true;
          }
          // Rule 2: Commissioning & Commissioning => ONLY CoMM_initials (Direct approval)
          else if (permitType === 'Commissioning' && permitUnder === 'Commissioning') {
            ext.coMMInitials = providedCoMM || sig;
            isExtUpdated = true;
          }
          // Rule 3: permit_under: Construction, permit_type: Commissioning
          else if (permitUnder === 'Construction' && permitType === 'Commissioning') {
            if (nextStatus === 'Pre-Approved' || currentStatus === 'Hold' || currentStatus === 'Pending') {
              ext.conMInitials = providedConM || sig;
              isExtUpdated = true;
            } else if (nextStatus === 'Approved' || currentStatus === 'Pre-Approved') {
              ext.coMMInitials = providedCoMM || sig;
              isExtUpdated = true;
            } else {
              ext.conMInitials = providedConM || sig;
              isExtUpdated = true;
            }
          }
          // Rule 4: permit_under: Commissioning, permit_type: Construction
          else if (permitUnder === 'Commissioning' && permitType === 'Construction') {
            if (nextStatus === 'Pre-Approved' || currentStatus === 'Hold' || currentStatus === 'Pending') {
              ext.coMMInitials = providedCoMM || sig;
              isExtUpdated = true;
            } else if (nextStatus === 'Approved' || currentStatus === 'Pre-Approved') {
              ext.conMInitials = providedConM || sig;
              isExtUpdated = true;
            } else {
              ext.coMMInitials = providedCoMM || sig;
              isExtUpdated = true;
            }
          }
          else {
            if (providedConM) {
              ext.conMInitials = providedConM;
              isExtUpdated = true;
            } else if (providedCoMM) {
              ext.coMMInitials = providedCoMM;
              isExtUpdated = true;
            } else if (sig) {
              ext.conMInitials = sig;
              isExtUpdated = true;
            }
          }
        }

        if (isExtUpdated) {
          await this.extraMiscRepo.save(ext);
        }

        // 2. Process Shift & Timing bulk edit if requested
        const isTimeUpdate = Start_Time !== undefined || End_Time !== undefined || night_shift !== undefined || new_end_time !== undefined;
        if (isTimeUpdate) {
          let effectiveStartTime = Start_Time !== undefined && Start_Time !== "" ? Start_Time : existing.startTime;
          let effectiveEndTime = End_Time !== undefined && End_Time !== "" ? End_Time : existing.endTime;

          if (night_shift === 1) {
            const valNewEndTime = new_end_time !== undefined && new_end_time !== "" ? new_end_time : existing.newEndTime;
            if (valNewEndTime) {
              if (effectiveStartTime && valNewEndTime >= effectiveStartTime) {
                throw new BadRequestException('For night shift, new end time must be earlier than start time.');
              }
            }
            updateData.nightShift = '1';
            updateData.endTime = '23:59';
            if (existing.workingDate) {
              const nextDate = this.getNextDateString(existing.workingDate);
              if (nextDate) {
                updateData.newDate = nextDate;
              }
            }
            if (new_end_time !== undefined) {
              updateData.newEndTime = new_end_time;
            }
          } else if (night_shift === 0) {
            if (effectiveStartTime && effectiveEndTime) {
              if (effectiveStartTime >= effectiveEndTime) {
                throw new BadRequestException('Start time must be earlier than End time.');
              }
            }
            updateData.nightShift = '0';
            if (End_Time !== undefined) {
              updateData.endTime = End_Time;
            }
            updateData.newDate = '';
            updateData.newEndTime = '';
          } else {
            // night_shift is not being changed, just updating start/end times
            const currentNightShift = existing.nightShift === '1';
            if (currentNightShift) {
              const valNewEndTime = new_end_time !== undefined && new_end_time !== "" ? new_end_time : existing.newEndTime;
              if (valNewEndTime) {
                if (effectiveStartTime && valNewEndTime >= effectiveStartTime) {
                  throw new BadRequestException('For night shift, new end time must be earlier than start time.');
                }
              }
              updateData.endTime = '23:59';
              if (new_end_time !== undefined) {
                updateData.newEndTime = new_end_time;
              }
            } else {
              if (effectiveStartTime && effectiveEndTime) {
                if (effectiveStartTime >= effectiveEndTime) {
                  throw new BadRequestException('Start time must be earlier than End time.');
                }
              }
              if (End_Time !== undefined) {
                updateData.endTime = End_Time;
              }
            }
          }

          if (Start_Time !== undefined) {
            updateData.startTime = Start_Time;
          }
        }

        // Apply update to DB if there's any data to change
        if (Object.keys(updateData).length > 0) {
          await this.requestRepo.update(existing.id, updateData);
        }

        // Create log if status changed
        if (targetStatus !== '') {
          const finalStatus = resolvedStatus || (status === 1 ? 'Pending' : 'Cancelled');
          await this.createLogs(
            existing.id,
            userId || 0,
            finalStatus,
            new Date(),
            [],
            0,
          );

          this.notificationsService.triggerNotification(
            existing.id,
            existing.requestStatus,
            finalStatus,
            userId || 0,
          ).catch((err) => console.error('Notification error:', err));
        } else if (isTimeUpdate) {
          await this.createLogs(
            existing.id,
            userId || 0,
            existing.requestStatus || 'Updated',
            new Date(),
            [],
            0,
          );
        }

        successfulUpdates.push(existing.id);
      } catch (err: any) {
        failedUpdates.push({
          id: existing.id,
          error: err.message || 'Update failed validation',
        });
      }
    }

    await this.redisCacheService.deleteByPattern('requests:*');

    const message = `Successfully updated permits: [${successfulUpdates.join(', ')}].` + 
      (failedUpdates.length > 0 ? ` Failed/Skipped: ${failedUpdates.map((f) => `ID ${f.id} (${f.error})`).join('; ')}` : '');

    return {
      status: failedUpdates.length === idsArray.length ? 500 : 200,
      message,
      successfulIds: successfulUpdates,
      failed: failedUpdates,
    };
  }

  async updateSafety(body: { id: string; safety: string }): Promise<any> {
    const { id, safety } = body;
    if (!id) {
      throw new BadRequestException('Missing required field: id');
    }

    const idsArray = id
      .split(',')
      .map((val) => Number(val.trim()))
      .filter((val) => !isNaN(val));

    // Parse the new precaution IDs the user selected
    const newPrecautionIds = (safety || '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);

    // Fetch current safety precautions for all selected permits
    const permits = await this.requestRepo.findBy({ id: In(idsArray) });

    // For each permit, merge existing IDs with new IDs (union, no duplicates)
    for (const permit of permits) {
      const existingIds = (permit.safetyPrecautions || '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);

      const mergedIds = Array.from(new Set([...existingIds, ...newPrecautionIds]));
      await this.requestRepo.update(permit.id, { safetyPrecautions: mergedIds.join(',') });
    }

    await this.redisCacheService.deleteByPattern('requests:*');
    return { success: true, updatedCount: idsArray.length };
  }

  /**
   * Resolves CONM-prefixed and COMM-prefixed statuses (sent from the UI approval buttons)
   * into the actual requestStatus value to be stored in the database.
   *
   * CONM = Construction Management (Department / first-approval role)
   * COMM = Commissioning Management (Department1 / second-approval role)
   *
   * Mapping:
   *   CONM-Pre-Approved    => Pre-Approved
   *   CONM-Final-Approved  => Approved
   *   CONM-Single-Approved => Approved
   *   COMM-Pre-Approved    => Pre-Approved
   *   COMM-Final-Approved  => Approved
   *   COMM-Single-Approved => Approved
   *
   * Any other status (Rejected, Opened, Closed, etc.) is passed through unchanged.
   */
  private resolveApprovalStatus(requestStatus?: string): string {
    if (!requestStatus) return requestStatus ?? '';

    const statusMap: Record<string, string> = {
      'CONM-Pre-Approved': 'Pre-Approved',
      'CONM-Final-Approved': 'Approved',
      'CONM-Single-Approved': 'Approved',
      'COMM-Pre-Approved': 'Pre-Approved',
      'COMM-Final-Approved': 'Approved',
      'COMM-Single-Approved': 'Approved',
    };

    return statusMap[requestStatus] ?? requestStatus;
  }


  // Helper to resolve room names from ID string
  private async resolveRoomNames(roomNos?: string): Promise<string> {
    if (!roomNos) return '';
    const ids = roomNos.split(',').map((s) => s.trim());
    const allNumeric = ids.every((id) => /^\d+$/.test(id));
    if (allNumeric && ids.length > 0) {
      const roomIds = ids.map((id) => Number(id));
      const rooms = await this.roomRepo.find({
        where: { room_id: In(roomIds) },
      });
      return rooms.map((r) => r.room_name).join(', ');
    }
    return roomNos; // Return raw value if not numeric
  }

  private async resolveLevelFilters(
    floorIdInput?: any,
    roomTypeInput?: any,
  ): Promise<{ resolvedFloorIds: number[]; resolvedFloorNames: string[]; rawTerms: string[] } | null> {
    const rawTerms: string[] = [];

    const extractItems = (val: any) => {
      if (val === undefined || val === null || val === '') return;
      if (Array.isArray(val)) {
        val.forEach((item) => extractItems(item));
      } else if (typeof val === 'string') {
        val.split(',').forEach((s) => {
          const cleaned = s.replace(/'/g, '').trim();
          if (cleaned && cleaned !== '0') rawTerms.push(cleaned);
        });
      } else if (typeof val === 'number' && !isNaN(val) && val !== 0) {
        rawTerms.push(String(val));
      }
    };

    extractItems(floorIdInput);
    extractItems(roomTypeInput);

    if (rawTerms.length === 0) return null;

    const directFloorIds: number[] = [];
    const nameTerms: string[] = [];

    rawTerms.forEach((term) => {
      if (/^\d+$/.test(term)) {
        directFloorIds.push(Number(term));
      } else {
        nameTerms.push(term);
      }
    });

    const floorIdsSet = new Set<number>(directFloorIds);
    const floorNamesSet = new Set<string>();

    nameTerms.forEach((term) => {
      const trimmed = term.trim();
      floorNamesSet.add(trimmed);
      const baseName = trimmed.replace(/^(?:[A-Za-z0-9]+\s*[-:]?\s*)/, '').trim();
      if (baseName && baseName !== trimmed) {
        floorNamesSet.add(baseName);
      }
    });

    if (directFloorIds.length > 0) {
      try {
        const foundFloors = await this.floorRepo.findBy({
          fl_id: In(directFloorIds),
        });
        foundFloors.forEach((f) => {
          if (f && f.floor_name) {
            floorNamesSet.add(f.floor_name.trim());
            const base = f.floor_name.replace(/^(?:[A-Za-z0-9]+\s*[-:]?\s*)/, '').trim();
            if (base) floorNamesSet.add(base);
          }
        });
      } catch (e) {}
    }

    if (nameTerms.length > 0) {
      for (const nTerm of nameTerms) {
        const fullTerm = nTerm.trim();
        const baseTerm = nTerm.replace(/^(?:[A-Za-z0-9]+\s*[-:]?\s*)/, '').trim();
        try {
          const matchingFloors = await this.floorRepo
            .createQueryBuilder('f')
            .where('f.floor_name LIKE :full', { full: `%${fullTerm}%` })
            .orWhere('f.floor_name LIKE :base', { base: `%${baseTerm}%` })
            .getMany();
          matchingFloors.forEach((f) => {
            if (f && f.fl_id) floorIdsSet.add(f.fl_id);
            if (f && f.floor_name) {
              floorNamesSet.add(f.floor_name.trim());
              const base = f.floor_name.replace(/^(?:[A-Za-z0-9]+\s*[-:]?\s*)/, '').trim();
              if (base) floorNamesSet.add(base);
            }
          });
        } catch (e) {}
      }
    }

    return {
      resolvedFloorIds: Array.from(floorIdsSet),
      resolvedFloorNames: Array.from(floorNamesSet),
      rawTerms: Array.from(new Set(rawTerms)),
    };
  }

  private async resolveZoneFilters(
    zoneIdsInput?: any,
    zoneIdInput?: any,
    zoneInput?: any,
  ): Promise<{ selectedZoneIds: number[]; zoneNames: string[] } | null> {
    const rawZoneTerms: string[] = [];

    const extractZoneItems = (val: any) => {
      if (val === undefined || val === null || val === '') return;
      if (Array.isArray(val)) {
        val.forEach((item) => extractZoneItems(item));
      } else if (typeof val === 'string') {
        val.split(',').forEach((s) => {
          const cleaned = s.replace(/'/g, '').trim();
          if (cleaned) rawZoneTerms.push(cleaned);
        });
      } else if (typeof val === 'number' && !isNaN(val)) {
        rawZoneTerms.push(String(val));
      }
    };

    extractZoneItems(zoneIdsInput);
    extractZoneItems(zoneIdInput);
    extractZoneItems(zoneInput);

    if (rawZoneTerms.length === 0) return null;

    const directIds: number[] = [];
    const nameTerms: string[] = [];

    rawZoneTerms.forEach((term) => {
      if (/^\d+$/.test(term)) {
        directIds.push(Number(term));
      } else {
        nameTerms.push(term);
      }
    });

    const resolvedZoneIdsSet = new Set<number>(directIds);
    const resolvedZoneNamesSet = new Set<string>(nameTerms);

    if (nameTerms.length > 0) {
      for (const nTerm of nameTerms) {
        try {
          const matchingZones = await this.zoneRepo
            .createQueryBuilder('z')
            .where('z.zone LIKE :zName', { zName: `%${nTerm}%` })
            .getMany();
          matchingZones.forEach((z) => {
            if (z.id) resolvedZoneIdsSet.add(z.id);
            if (z.zone) resolvedZoneNamesSet.add(z.zone.trim());
          });
        } catch (e) {}
      }
    }

    if (directIds.length > 0) {
      try {
        const foundZones = await this.zoneRepo.findBy({ id: In(directIds) });
        foundZones.forEach((z) => {
          if (z.zone) resolvedZoneNamesSet.add(z.zone.trim());
        });
      } catch (e) {}
    }

    const selectedZoneIds = Array.from(resolvedZoneIdsSet);
    const zoneNames = Array.from(new Set([...resolvedZoneNamesSet, ...nameTerms]));

    return {
      selectedZoneIds,
      zoneNames,
    };
  }

  /**
   * Resolves a Floor_Id search term (numeric ID or floor name) to an array of floor IDs.
   * Returns null when the input is empty/falsy (meaning no filter should be applied).
   */
  private async resolveFloorIds(
    floorIdOrName?: string,
  ): Promise<number[] | null> {
    if (
      !floorIdOrName ||
      floorIdOrName.trim() === '' ||
      floorIdOrName.trim() === '0'
    )
      return null;
    const term = floorIdOrName.trim();
    if (/^\d+$/.test(term)) {
      // Pure numeric – treat as floor ID directly
      return [Number(term)];
    }
    // Non-numeric – search floors table by name
    const floors = await this.floorRepo
      .createQueryBuilder('f')
      .where('f.floor_name LIKE :name', { name: `%${term}%` })
      .getMany();
    return floors.length > 0 ? floors.map((f) => f.fl_id) : [];
  }

  /**
   * Resolves a Room_Nos search term (numeric room ID or room name) to a list of
   * LIKE-match terms suitable for querying the comma-separated Room_Nos text column.
   * Returns null when the input is empty/falsy (meaning no filter should be applied).
   */
  private async resolveRoomSearchTerms(
    roomIdOrName?: string,
  ): Promise<string[] | null> {
    if (
      !roomIdOrName ||
      String(roomIdOrName).trim() === '' ||
      String(roomIdOrName).trim() === '0'
    )
      return null;

    const parts = String(roomIdOrName)
      .split(/[|,]/)
      .map((p) => p.replace(/'/g, '').trim())
      .filter(Boolean);

    if (parts.length === 0) return null;

    const terms: Set<string> = new Set();
    const numericIds: number[] = [];
    const nameParts: string[] = [];

    for (const part of parts) {
      terms.add(part);
      if (/^\d+$/.test(part)) {
        numericIds.push(Number(part));
      } else {
        nameParts.push(part);
      }
    }

    if (numericIds.length > 0) {
      try {
        const foundRooms = await this.roomRepo.find({
          where: { room_id: In(numericIds) },
        });
        foundRooms.forEach((r) => {
          if (r && r.room_name) {
            terms.add(r.room_name.trim());
          }
        });
      } catch (err) {
        for (const id of numericIds) {
          try {
            const room = await this.roomRepo.findOne({ where: { room_id: id } });
            if (room && room.room_name) terms.add(room.room_name.trim());
          } catch {}
        }
      }
    }

    if (nameParts.length > 0) {
      for (const nPart of nameParts) {
        try {
          const matchingRooms = await this.roomRepo
            .createQueryBuilder('r')
            .where('r.room_name LIKE :name', { name: `%${nPart}%` })
            .getMany();
          matchingRooms.forEach((r) => {
            terms.add(String(r.room_id));
            if (r && r.room_name) terms.add(r.room_name.trim());
          });
        } catch {}
      }
    }

    return [...terms];
  }


  private parseIdList(input: any): number[] {
    if (input === undefined || input === null || input === '' || input === 0 || input === '0') {
      return [];
    }
    if (Array.isArray(input)) {
      return input
        .map(item => Number(String(item).replace(/'/g, '').trim()))
        .filter(num => !isNaN(num) && num !== 0);
    }
    const str = String(input).replace(/'/g, '').trim();
    if (!str) return [];
    return str
      .split(',')
      .map(item => Number(item.trim()))
      .filter(num => !isNaN(num) && num !== 0);
  }

  private parseStringList(input: any): string[] {
    if (input === undefined || input === null || input === '') {
      return [];
    }
    if (Array.isArray(input)) {
      return input
        .map(item => String(item).replace(/'/g, '').trim())
        .filter(Boolean);
    }
    const str = String(input).replace(/'/g, '').trim();
    if (!str) return [];
    return str
      .split(',')
      .map(item => item.trim().replace(/^'|'$/g, ''))
      .filter(Boolean);
  }

  // Search/Filter Requests
  async search(dto: SearchRequestDto, loggedInUserId?: number): Promise<any> {
    const subContractorId = await this.getSubcontractorIdForUser(loggedInUserId);
    const key = subContractorId
      ? `requests:search:${JSON.stringify(dto)}:subcon:${subContractorId}`
      : `requests:search:${JSON.stringify(dto)}`;
    return this.redisCacheService.getOrSet(
      key,
      async () => {
        const page = dto.Page && Number(dto.Page) >= 1 ? Number(dto.Page) : 1;
        const limit = dto.End && Number(dto.End) >= 1 ? Number(dto.End) : 10;
        const skip = (page - 1) * limit;

        // Build TypeORM Query Builder to support complex safety joins and filters
        const qb = this.requestRepo
          .createQueryBuilder('requests')
          .where('requests.status = :status', { status: 1 })
          // Left join sub-tables
          .leftJoinAndMapOne(
            'requests.chemical',
            RequestChemicalHazard,
            'chemical',
            'requests.id = chemical.request_id',
          )
          .leftJoinAndMapOne(
            'requests.confined',
            RequestConfined,
            'confined',
            'requests.id = confined.request_id',
          )
          .leftJoinAndMapOne(
            'requests.electrical',
            RequestElectrical,
            'electrical',
            'requests.id = electrical.request_id',
          )
          .leftJoinAndMapOne(
            'requests.energisingElectrical',
            RequestEnergisingElectrical,
            'energisingElectrical',
            'requests.id = energisingElectrical.request_id',
          )
          .leftJoinAndMapOne(
            'requests.energisingMechanical',
            RequestEnergisingMechanical,
            'energisingMechanical',
            'requests.id = energisingMechanical.request_id',
          )
          .leftJoinAndMapOne(
            'requests.excavation',
            RequestExcavation,
            'excavation',
            'requests.id = excavation.request_id',
          )
          .leftJoinAndMapOne(
            'requests.extraMisc',
            RequestExtraMisc,
            'extraMisc',
            'requests.id = extraMisc.request_id',
          )
          .leftJoinAndMapOne(
            'requests.fireHotwork',
            RequestFireHotwork,
            'fireHotwork',
            'requests.id = fireHotwork.request_id',
          )
          .leftJoinAndMapOne(
            'requests.general',
            RequestGeneral,
            'general',
            'requests.id = general.request_id',
          )
          .leftJoinAndMapOne(
            'requests.height',
            RequestHeight,
            'height',
            'requests.id = height.request_id',
          )
          .leftJoinAndMapOne(
            'requests.lifting',
            RequestLifting,
            'lifting',
            'requests.id = lifting.request_id',
          )
          .leftJoinAndMapOne(
            'requests.ppe',
            RequestPpe,
            'ppe',
            'requests.id = ppe.request_id',
          )
          .leftJoinAndMapOne(
            'requests.pressureTesting',
            RequestPressureTesting,
            'pressureTesting',
            'requests.id = pressureTesting.request_id',
          )

          // Left join Location tables
          .leftJoinAndMapOne(
            'requests.building',
            Building,
            'building',
            'requests.Building_Id = building.build_id',
          )
          .leftJoinAndMapOne(
            'requests.floor',
            Floor,
            'floor',
            'requests.Floor_Id = floor.fl_id',
          )
          .leftJoinAndMapOne(
            'requests.zone',
            Zone,
            'zone',
            'requests.Zone_Id = zone.id',
          )
          .leftJoinAndMapOne(
            'requests.subcontractor',
            Subcontractor,
            'subcontractor',
            'requests.Sub_Contractor_Id = subcontractor.id',
          )
          .leftJoinAndMapOne(
            'requests.activityRelation',
            Activity,
            'activityRelation',
            'requests.Type_Of_Activity_Id = activityRelation.id',
          );

        // Add filters
        if (dto.PermitNo) {
          qb.andWhere('requests.PermitNo LIKE :permitNo', {
            permitNo: `%${dto.PermitNo}%`,
          });
        }
        if (dto.fromDate && dto.toDate) {
          qb.andWhere('requests.Working_Date BETWEEN :fromDate AND :toDate', {
            fromDate: dto.fromDate,
            toDate: dto.toDate,
          });
        } else if (dto.fromDate) {
          qb.andWhere('requests.Working_Date >= :fromDate', {
            fromDate: dto.fromDate,
          });
        } else if (dto.toDate) {
          qb.andWhere('requests.Working_Date <= :toDate', {
            toDate: dto.toDate,
          });
        }

        if (dto.Activity) {
          qb.andWhere('requests.Activity LIKE :activityName', {
            activityName: `%${dto.Activity}%`,
          });
        }
        if (dto.Request_status) {
          const rawStatus = String(dto.Request_status).replace(/'/g, '').trim();
          const statusList = rawStatus
            .split(',')
            .map((s) => s.trim().replace(/^'|'$/g, ''))
            .filter(Boolean);

          if (statusList.length > 0) {
            qb.andWhere(
              new Brackets((statusQb) => {
                statusList.forEach((st, idx) => {
                  const paramName = `reqStatus_${idx}`;
                  const autoCancelMsgParam = `autoCancelMsg_${idx}`;
                  if (st === 'Auto-Cancelled') {
                    const autoCancelCond = `(requests.Request_status = :${paramName} OR extraMisc.cancelReason = :${autoCancelMsgParam})`;
                    const params = {
                      [paramName]: 'Auto-Cancelled',
                      [autoCancelMsgParam]: 'Permit not opened so system cancelled automatically',
                    };
                    if (idx === 0) {
                      statusQb.where(autoCancelCond, params);
                    } else {
                      statusQb.orWhere(autoCancelCond, params);
                    }
                  } else if (st === 'Cancelled') {
                    const cancelCond = `(requests.Request_status = :${paramName} AND (extraMisc.cancelReason IS NULL OR extraMisc.cancelReason != :${autoCancelMsgParam}))`;
                    const params = {
                      [paramName]: 'Cancelled',
                      [autoCancelMsgParam]: 'Permit not opened so system cancelled automatically',
                    };
                    if (idx === 0) {
                      statusQb.where(cancelCond, params);
                    } else {
                      statusQb.orWhere(cancelCond, params);
                    }
                  } else {
                    const normalCond = `requests.Request_status = :${paramName}`;
                    const params = { [paramName]: st };
                    if (idx === 0) {
                      statusQb.where(normalCond, params);
                    } else {
                      statusQb.orWhere(normalCond, params);
                    }
                  }
                });
              }),
            );
          }
        }
        if (
          dto.Site_Id !== undefined &&
          dto.Site_Id !== null &&
          Number(String(dto.Site_Id).replace(/'/g, '').trim()) !== 0
        ) {
          qb.andWhere('requests.Site_Id = :siteId', { siteId: Number(String(dto.Site_Id).replace(/'/g, '').trim()) });
        }
        const buildingIds = this.parseIdList(dto.Building_Id);
        if (buildingIds.length > 1) {
          qb.andWhere('requests.Building_Id IN (:...buildingIds)', { buildingIds });
        } else if (buildingIds.length === 1) {
          qb.andWhere('requests.Building_Id = :buildingId', { buildingId: buildingIds[0] });
        }

        // Level / Floor filtering (supports single or multi-level, floor IDs or floor names, across old & new DB records)
        const levelRes = await this.resolveLevelFilters(dto.Floor_Id, dto.Room_Type);
        if (levelRes) {
          const { resolvedFloorIds, resolvedFloorNames, rawTerms } = levelRes;
          const allTerms = Array.from(new Set([...resolvedFloorNames, ...rawTerms]));
          if (resolvedFloorIds.length > 0 || allTerms.length > 0) {
            qb.andWhere(
              new Brackets((levelQb) => {
                let hasCondition = false;
                if (resolvedFloorIds.length > 0) {
                  levelQb.where('requests.Floor_Id IN (:...resolvedFloorIds)', { resolvedFloorIds });
                  hasCondition = true;
                }
                allTerms.forEach((fTerm, idx) => {
                  const paramName = `fTerm_${idx}`;
                  if (hasCondition) {
                    levelQb.orWhere(`requests.Room_Type LIKE :${paramName}`, { [paramName]: `%${fTerm}%` });
                  } else {
                    levelQb.where(`requests.Room_Type LIKE :${paramName}`, { [paramName]: `%${fTerm}%` });
                    hasCondition = true;
                  }
                });
              }),
            );
          } else {
            qb.andWhere('1 = 0');
          }
        }

        const zoneRes = await this.resolveZoneFilters(dto.zoneIds, dto.Zone_Id, dto.zone);
        if (zoneRes) {
          const { selectedZoneIds, zoneNames } = zoneRes;
          if (selectedZoneIds.length > 0 || zoneNames.length > 0) {
            qb.andWhere(
              new Brackets((zoneQb) => {
                let hasCond = false;
                if (selectedZoneIds.length > 0) {
                  zoneQb.where('requests.Zone_Id IN (:...selectedZoneIds)', { selectedZoneIds });
                  hasCond = true;
                }

                zoneNames.forEach((zName, index) => {
                  const paramName = `zName_${index}`;
                  if (hasCond) {
                    zoneQb.orWhere(`requests.zone LIKE :${paramName}`, { [paramName]: `%${zName}%` });
                  } else {
                    zoneQb.where(`requests.zone LIKE :${paramName}`, { [paramName]: `%${zName}%` });
                    hasCond = true;
                  }
                });
              }),
            );
          } else {
            qb.andWhere('1 = 0');
          }
        }

        // Support both area and Room_Nos search terms with strict token boundary matching
        const roomSearchVal = dto.Room_Nos !== undefined && dto.Room_Nos !== null && String(dto.Room_Nos).trim() !== ''
          ? String(dto.Room_Nos)
          : (dto.area !== undefined && dto.area !== null && String(dto.area).trim() !== '' ? String(dto.area) : '');

        if (roomSearchVal !== '' && roomSearchVal !== '0') {
          const roomTerms = await this.resolveRoomSearchTerms(roomSearchVal);
          if (roomTerms && roomTerms.length > 0) {
            const escapedTerms = roomTerms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
            const regexPattern = `(^|,[[:space:]]*)(${escapedTerms.join('|')})([[:space:]]*,|$)`;
            qb.andWhere(`requests.Room_Nos REGEXP :roomRegex`, { roomRegex: regexPattern });
          } else {
            qb.andWhere('1 = 0');
          }
        }

        const subContractorIds = this.parseIdList(dto.Sub_Contractor_Id);
        if (subContractorIds.length > 1) {
          qb.andWhere('requests.Sub_Contractor_Id IN (:...subContractorIds)', {
            subContractorIds,
          });
        } else if (subContractorIds.length === 1) {
          qb.andWhere('requests.Sub_Contractor_Id = :subContractorId', {
            subContractorId: subContractorIds[0],
          });
        }
        if (
          dto.Type_Of_Activity_Id !== undefined &&
          dto.Type_Of_Activity_Id !== null &&
          Number(String(dto.Type_Of_Activity_Id).replace(/'/g, '').trim()) !== 0
        ) {
          qb.andWhere('requests.Type_Of_Activity_Id = :typeOfActivityId', {
            typeOfActivityId: Number(String(dto.Type_Of_Activity_Id).replace(/'/g, '').trim()),
          });
        }

        if (dto.permit_type) {
          qb.andWhere('requests.permit_type = :permitType', {
            permitType: dto.permit_type,
          });
        }
        if (dto.permit_under) {
          qb.andWhere('requests.permit_under = :permitUnder', {
            permitUnder: dto.permit_under,
          });
        }
        if (dto.night_shift !== undefined && dto.night_shift !== null && String(dto.night_shift).trim() !== '') {
          const nsVal = String(dto.night_shift).trim();
          if (nsVal === '1' || nsVal === 'true') {
            qb.andWhere('(requests.night_shift = :nsOne OR requests.night_shift = 1)', { nsOne: '1' });
          } else if (nsVal === '0' || nsVal === 'false') {
            qb.andWhere(
              '(requests.night_shift = :nsZero OR requests.night_shift = 0 OR requests.night_shift IS NULL OR requests.night_shift = :nsEmpty)',
              { nsZero: '0', nsEmpty: '' },
            );
          }
        }
        if (dto.new_date) {
          qb.andWhere('requests.new_date = :newDate', {
            newDate: dto.new_date,
          });
        }
        if (dto.new_end_time) {
          qb.andWhere('requests.new_end_time = :newEndTime', {
            newEndTime: dto.new_end_time,
          });
        }
        if (dto.Start_Time) {
          qb.andWhere('requests.Start_Time = :startTime', {
            startTime: dto.Start_Time,
          });
        }
        if (dto.End_Time) {
          qb.andWhere('requests.End_Time = :endTime', {
            endTime: dto.End_Time,
          });
        }

        // Role filters
        if (subContractorId) {
          qb.andWhere('requests.Sub_Contractor_Id = :subContractorIdFilter', {
            subContractorIdFilter: subContractorId,
          });
        } else if (dto.LoginType === 'Subcontractor' && dto.user_id) {
          const user = await this.userRepo.findOne({ where: { id: dto.user_id } });
          if (user && user.userType === 'Subcontractor') {
            qb.andWhere('requests.Sub_Contractor_Id = :subContractorIdFilter', {
              subContractorIdFilter: user.typeId,
            });
          } else {
            qb.andWhere('requests.userId = :userIdFilter', {
              userIdFilter: dto.user_id,
            });
          }
        }

        // Safety Flag Filters (requires joining sub-tables) - group multi-selected HRAs with OR
        const activeHraConds: string[] = [];
        if (dto.Hot_work !== undefined && dto.Hot_work !== null && Number(dto.Hot_work) === 1) {
          activeHraConds.push('fireHotwork.Hot_work = 1');
        }
        if (dto.working_on_electrical_system !== undefined && dto.working_on_electrical_system !== null && Number(dto.working_on_electrical_system) === 1) {
          activeHraConds.push('electrical.working_on_electrical_system = 1');
        }
        if (dto.working_hazardious_substen !== undefined && dto.working_hazardious_substen !== null && Number(dto.working_hazardious_substen) === 1) {
          activeHraConds.push('chemical.working_hazardious_substen = 1');
        }
        if (dto.using_cranes_or_lifting !== undefined && dto.using_cranes_or_lifting !== null && Number(dto.using_cranes_or_lifting) === 1) {
          activeHraConds.push('lifting.using_cranes_or_lifting = 1');
        }
        if (dto.pressure_tesing_of_equipment !== undefined && dto.pressure_tesing_of_equipment !== null && Number(dto.pressure_tesing_of_equipment) === 1) {
          activeHraConds.push('pressureTesting.pressure_testing_of_equipment = 1');
        }
        if (dto.working_at_height !== undefined && dto.working_at_height !== null && Number(dto.working_at_height) === 1) {
          activeHraConds.push('height.working_at_height = 1');
        }
        if (dto.working_confined_spaces !== undefined && dto.working_confined_spaces !== null && Number(dto.working_confined_spaces) === 1) {
          activeHraConds.push('confined.working_confined_spaces = 1');
        }
        if (dto.power_on !== undefined && dto.power_on !== null && Number(dto.power_on) === 1) {
          activeHraConds.push('energisingElectrical.power_on = 1');
        }
        if (dto.pressurization !== undefined && dto.pressurization !== null && Number(dto.pressurization) === 1) {
          activeHraConds.push('energisingMechanical.pressurization = 1');
        }
        if (dto.excavation_works !== undefined && dto.excavation_works !== null && Number(dto.excavation_works) === 1) {
          activeHraConds.push('excavation.excavation_works = 1');
        }

        if (activeHraConds.length > 0) {
          qb.andWhere(`(${activeHraConds.join(' OR ')})`);
        }

        // PPE Equipment Filters
        if (dto.specific_gloves !== undefined && dto.specific_gloves !== null && Number(dto.specific_gloves) === 1) {
          qb.andWhere('ppe.specific_gloves = 1');
        }
        if (dto.eye_protection !== undefined && dto.eye_protection !== null && Number(dto.eye_protection) === 1) {
          qb.andWhere('ppe.eye_protection = 1');
        }
        if (dto.fall_protection !== undefined && dto.fall_protection !== null && Number(dto.fall_protection) === 1) {
          qb.andWhere('ppe.fall_protection = 1');
        }
        if (dto.hearing_protection !== undefined && dto.hearing_protection !== null && Number(dto.hearing_protection) === 1) {
          qb.andWhere('ppe.hearing_protection = 1');
        }
        if (dto.respiratory_protection !== undefined && dto.respiratory_protection !== null && Number(dto.respiratory_protection) === 1) {
          qb.andWhere('ppe.respiratory_protection = 1');
        }

        if (
          dto.hras !== undefined &&
          dto.hras !== null &&
          String(dto.hras).trim() !== ''
        ) {
          const hrasVal = Number(dto.hras);
          if (hrasVal === 0) {
            qb.andWhere(
              '(fireHotwork.Hot_work IS NULL OR fireHotwork.Hot_work = 0 OR fireHotwork.Hot_work = :zeroStr) ' +
              'AND (electrical.working_on_electrical_system IS NULL OR electrical.working_on_electrical_system = 0 OR electrical.working_on_electrical_system = :zeroStr) ' +
              'AND (chemical.working_hazardious_substen IS NULL OR chemical.working_hazardious_substen = 0 OR chemical.working_hazardious_substen = :zeroStr) ' +
              'AND (pressureTesting.pressure_testing_of_equipment IS NULL OR pressureTesting.pressure_testing_of_equipment = 0 OR pressureTesting.pressure_testing_of_equipment = :zeroStr) ' +
              'AND (height.working_at_height IS NULL OR height.working_at_height = 0 OR height.working_at_height = :zeroStr) ' +
              'AND (confined.working_confined_spaces IS NULL OR confined.working_confined_spaces = 0 OR confined.working_confined_spaces = :zeroStr) ' +
              'AND (excavation.excavation_works IS NULL OR excavation.excavation_works = 0 OR excavation.excavation_works = :zeroStr) ' +
              'AND (lifting.using_cranes_or_lifting IS NULL OR lifting.using_cranes_or_lifting = 0 OR lifting.using_cranes_or_lifting = :zeroStr) ' +
              'AND (energisingElectrical.power_on IS NULL OR energisingElectrical.power_on = 0 OR energisingElectrical.power_on = :zeroStr) ' +
              'AND (energisingMechanical.pressurization IS NULL OR energisingMechanical.pressurization = 0 OR energisingMechanical.pressurization = :zeroStr)',
              { zeroStr: '0' }
            );
          } else if (hrasVal === 1) {
            const hasSpecificHraFilter = [
              dto.Hot_work, dto.working_on_electrical_system, dto.working_hazardious_substen,
              dto.using_cranes_or_lifting, dto.pressure_tesing_of_equipment, dto.working_at_height,
              dto.working_confined_spaces, dto.power_on, dto.pressurization, dto.excavation_works
            ].some(v => v !== undefined && v !== null && Number(v) === 1);

            if (!hasSpecificHraFilter) {
              qb.andWhere(
                '(fireHotwork.Hot_work = 1 OR electrical.working_on_electrical_system = 1 OR ' +
                'chemical.working_hazardious_substen = 1 OR pressureTesting.pressure_testing_of_equipment = 1 OR ' +
                'height.working_at_height = 1 OR confined.working_confined_spaces = 1 OR ' +
                'excavation.excavation_works = 1 OR lifting.using_cranes_or_lifting = 1 OR ' +
                'energisingElectrical.power_on = 1 OR energisingMechanical.pressurization = 1)'
              );
            }
          }
        }

        // Sorting and Pagination
        qb.orderBy('requests.id', 'DESC').skip(skip).take(limit);

        const [rawRequests, totalCount] = await qb.getManyAndCount();

        // Build zone lookup for all zone IDs present in the search results
        const zoneLookupMap = new Map<number, string>();
        const allZoneIdsSet = new Set<number>();
        rawRequests.forEach((req) => {
          if (req.zoneId) {
            String(req.zoneId).split(',').forEach((id) => {
              const num = Number(id.trim());
              if (!isNaN(num) && num > 0) allZoneIdsSet.add(num);
            });
          }
        });
        if (allZoneIdsSet.size > 0) {
          const zoneEntities = await this.zoneRepo.findBy({ id: In([...allZoneIdsSet]) });
          zoneEntities.forEach((z) => zoneLookupMap.set(z.id, z.zone));
        }

        // Map responses to match legacy format and resolve Room, Building, Level and Zone names
        const dataList: any[] = [];
        for (const req of rawRequests) {
          // Resolve room names
          const resolvedRooms = await this.resolveRoomNames(req.roomNos);

          // Resolve all zone names string
          let resolvedZoneNames = '';
          if (req.zoneId) {
            const names = String(req.zoneId)
              .split(',')
              .map((id) => zoneLookupMap.get(Number(id.trim())))
              .filter(Boolean);
            if (names.length > 0) {
              resolvedZoneNames = names.join(', ');
            }
          }
          if (!resolvedZoneNames && typeof req.zone === 'string') {
            resolvedZoneNames = req.zone;
          }
          if (!resolvedZoneNames && (req as any).zone?.zone) {
            resolvedZoneNames = (req as any).zone.zone;
          }

          // Join safety fields back into flat properties to match legacy output
          const flatObj: any = {
            id: req.id,
            userId: req.userId || '',
            Company_Name: req.companyName || '',
            PermitNo: req.permitNo || '',
            Sub_Contractor_Id: req.subContractorId || '',
            subContractorName:
              (req as any).subcontractor?.subContractorName || '',
            Foreman: req.foreman || '',
            Foreman_Phone_Number: req.foremanPhoneNumber || '',
            Activity: req.activity || '',
            activityName: (req as any).activityRelation?.activityName || '',
            Type_Of_Activity_Id: req.typeOfActivityId || '',
            Request_Date: req.requestDate || '',
            Working_Date: req.workingDate || '',
            Start_Time: req.startTime || '',
            End_Time: req.endTime || '',
            Assign_Start_Time: req.assignStartTime || '',
            Assign_End_Time: req.assignEndTime || '',
            Assign_Start_Date: req.assignStartDate || '',
            Assign_End_Date: req.assignEndDate || '',
            Building_Id: req.buildingId || '',
            building_name: (req as any).building?.building_name || '',
            Floor_Id: req.floorId || '',
            floor_name: (req as any).floor?.floor_name || '',
            Plans_Id: req.plansId || '',
            Zone_Id: req.zoneId || '',
            zone_name: resolvedZoneNames || '',
            zone: resolvedZoneNames || '',
            Room_Nos: resolvedRooms || '',
            room_names: resolvedRooms,
            Room_Type: req.roomType || '',
            Number_Of_Workers: req.numberOfWorkers || '',
            Badge_Numbers: req.badgeNumbers || '',
            teamId: req.teamId || '',
            notes: req.notes || '',
            Request_status: req.requestStatus || '',
            status: req.status,
            createdTime: req.createdTime || '',
            Site_Id: req.siteId,
            permit_type: req.permitType || 'Construction',
            permit_under: req.permitUnder || 'Construction',
            new_date: req.newDate || '',
            new_end_time: req.newEndTime || '',
            night_shift: req.nightShift || '',
            Safety_Precautions: req.safetyPrecautions || '',
          };

          // Pull flat fields from sub-tables using database column names as keys
          const mergeSub = (sub: any, repo: Repository<any>) => {
            if (!sub) return;
            for (const column of repo.metadata.columns) {
              if (column.propertyName !== 'requestId') {
                const val = sub[column.propertyName];
                flatObj[column.databaseName] =
                  val !== undefined && val !== null ? val : '';
              }
            }
          };

          mergeSub((req as any).chemical, this.chemicalRepo);
          mergeSub((req as any).confined, this.confinedRepo);
          mergeSub((req as any).electrical, this.electricalRepo);
          mergeSub((req as any).energisingElectrical, this.energisingElecRepo);
          mergeSub((req as any).energisingMechanical, this.energisingMechRepo);
          mergeSub((req as any).excavation, this.excavationRepo);
          mergeSub((req as any).extraMisc, this.extraMiscRepo);
          mergeSub((req as any).fireHotwork, this.fireHotworkRepo);
          mergeSub((req as any).general, this.generalRepo);
          mergeSub((req as any).height, this.heightRepo);
          mergeSub((req as any).lifting, this.liftingRepo);
          mergeSub((req as any).ppe, this.ppeRepo);
          mergeSub((req as any).pressureTesting, this.pressureTestingRepo);

          if (flatObj.course_of_actions !== undefined) {
            flatObj.course_of_action = flatObj.course_of_actions;
          }

          // Fetch files & notes
          const files = await this.ramsFileRepo.find({
            where: { requestId: req.id, status: 1 },
          });
          const notes = await this.noteRepo.find({
            where: { requestId: req.id },
            order: { createdTime: 'DESC' },
          });

          flatObj.files = files;
          flatObj.note = notes;

          if (flatObj.cancel_reason === 'Permit not opened so system cancelled automatically') {
            flatObj.Request_status = 'Auto-Cancelled';
          }

          dataList.push(flatObj);
        }

        // Subcontractors and Activities lists
        let subcontractors;
        if (subContractorId) {
          subcontractors = await this.subcontractorRepo.find({
            where: { id: subContractorId },
          });
        } else {
          subcontractors = await this.subcontractorRepo.find({
            order: { subContractorName: 'ASC' },
          });
        }
        const activities = await this.activityRepo.find({
          order: { activityName: 'ASC' },
        });

        // Legacy response format
        return [
          { data: dataList },
          { count: totalCount },
          { subcontractors },
          { activities },
        ];
      },
      1000 * 60 * 5,
    );
  }

  async plansList(searchDto: PlanSearchDto, loggedInUserId?: number): Promise<any> {
    const allowedKeys: (keyof PlanSearchDto)[] = [
      'Date', 'Week', 'Year', 'Month', 'Site_Id', 'Building_Id', 'Sub_Contractor_Id',
      'Room_Type', 'from_date', 'to_date', 'start_time', 'end_time', 'area',
      'permit_type', 'permit_under', 'night_shift', 'new_date', 'new_end_time',
      'hras', 'Request_status', 'Hot_work', 'working_on_electrical_system',
      'working_hazardious_substen', 'using_cranes_or_lifting',
      'pressure_tesing_of_equipment', 'working_at_height', 'working_confined_spaces',
      'work_in_atex_area', 'securing_facilities', 'excavation_works',
      'specific_gloves', 'eye_protection', 'fall_protection', 'hearing_protection',
      'respiratory_protection', 'taskSpecificPPE', 'power_on', 'pressurization',
      'fromDate', 'toDate', 'Start_Time', 'End_Time', 'Zone_Id', 'zone', 'zoneIds', 'Room_Nos', 'Floor_Id', 'Type_Of_Activity_Id', 'PermitNo', 'Activity'
    ];
    const filteredSearchDto: PlanSearchDto = {};
    for (const key of allowedKeys) {
      if (searchDto && searchDto[key] !== undefined) {
        filteredSearchDto[key] = searchDto[key] as any;
      }
    }

    // Map alternate frontend keys to canonical DB query keys if provided
    if (filteredSearchDto.fromDate && !filteredSearchDto.from_date) {
      filteredSearchDto.from_date = filteredSearchDto.fromDate;
    }
    if (filteredSearchDto.toDate && !filteredSearchDto.to_date) {
      filteredSearchDto.to_date = filteredSearchDto.toDate;
    }
    if (filteredSearchDto.Start_Time && !filteredSearchDto.start_time) {
      filteredSearchDto.start_time = filteredSearchDto.Start_Time;
    }
    if (filteredSearchDto.End_Time && !filteredSearchDto.end_time) {
      filteredSearchDto.end_time = filteredSearchDto.End_Time;
    }

    // Delete alternate keys to maintain Redis key serialization consistency
    delete filteredSearchDto.fromDate;
    delete filteredSearchDto.toDate;
    delete filteredSearchDto.Start_Time;
    delete filteredSearchDto.End_Time;

    searchDto = filteredSearchDto;

    const subContractorId = await this.getSubcontractorIdForUser(loggedInUserId);
    // --- Week parsing ---
        let weekStart: string | null = null;
        let weekEnd: string | null = null;
        let weekValue: string | null = null;

        if (searchDto.Week) {
          const dateParts = searchDto.Week.split('  -  ');
          weekStart = dateParts[0] ? dateParts[0].trim() : null;
          weekEnd = dateParts[1] ? dateParts[1].trim() : null;
          weekValue = dateParts[2] ? dateParts[2].trim() : null;
        }

        const qb = this.requestRepo
          .createQueryBuilder('requests')
          .leftJoinAndMapOne('requests.chemical', RequestChemicalHazard, 'chemical', 'requests.id = chemical.request_id')
          .leftJoinAndMapOne('requests.confined', RequestConfined, 'confined', 'requests.id = confined.request_id')
          .leftJoinAndMapOne('requests.electrical', RequestElectrical, 'electrical', 'requests.id = electrical.request_id')
          .leftJoinAndMapOne('requests.energisingElectrical', RequestEnergisingElectrical, 'energisingElectrical', 'requests.id = energisingElectrical.request_id')
          .leftJoinAndMapOne('requests.energisingMechanical', RequestEnergisingMechanical, 'energisingMechanical', 'requests.id = energisingMechanical.request_id')
          .leftJoinAndMapOne('requests.excavation', RequestExcavation, 'excavation', 'requests.id = excavation.request_id')
          .leftJoinAndMapOne('requests.extraMisc', RequestExtraMisc, 'extraMisc', 'requests.id = extraMisc.request_id')
          .leftJoinAndMapOne('requests.fireHotwork', RequestFireHotwork, 'fireHotwork', 'requests.id = fireHotwork.request_id')
          .leftJoinAndMapOne('requests.general', RequestGeneral, 'general', 'requests.id = general.request_id')
          .leftJoinAndMapOne('requests.height', RequestHeight, 'height', 'requests.id = height.request_id')
          .leftJoinAndMapOne('requests.lifting', RequestLifting, 'lifting', 'requests.id = lifting.request_id')
          .leftJoinAndMapOne('requests.ppe', RequestPpe, 'ppe', 'requests.id = ppe.request_id')
          .leftJoinAndMapOne('requests.pressureTesting', RequestPressureTesting, 'pressureTesting', 'requests.id = pressureTesting.request_id')
          .leftJoinAndMapOne('requests.building', Building, 'building', 'requests.Building_Id = building.build_id')
          .leftJoinAndMapOne('requests.floor', Floor, 'floor', 'requests.Floor_Id = floor.fl_id')
          .leftJoinAndMapOne('requests.zone', Zone, 'zone', 'requests.Zone_Id = zone.id')
          .leftJoinAndMapOne('requests.subcontractor', Subcontractor, 'subcontractor', 'requests.Sub_Contractor_Id = subcontractor.id')
          .leftJoinAndMapOne('requests.activityRelation', Activity, 'activityRelation', 'requests.Type_Of_Activity_Id = activityRelation.id')
          .where('requests.status = :status', { status: 1 });

        // --- Date Filters ---
        if (searchDto.Date) {
          qb.andWhere('DATE(requests.Working_Date) = :date', { date: searchDto.Date });
        }
        if (searchDto.from_date && searchDto.to_date) {
          qb.andWhere('DATE(requests.Working_Date) BETWEEN :fromDate AND :toDate', {
            fromDate: searchDto.from_date,
            toDate: searchDto.to_date,
          });
        } else if (searchDto.from_date) {
          qb.andWhere('DATE(requests.Working_Date) >= :fromDate', {
            fromDate: searchDto.from_date,
          });
        } else if (searchDto.to_date) {
          qb.andWhere('DATE(requests.Working_Date) <= :toDate', {
            toDate: searchDto.to_date,
          });
        }

        // Only apply Year/Month if Week is NOT provided
        if (!searchDto.Week) {
          if (searchDto.Year) {
            qb.andWhere('YEAR(requests.Working_Date) = :year', { year: searchDto.Year });
          }
          if (searchDto.Month) {
            qb.andWhere('MONTH(requests.Working_Date) = :month', { month: searchDto.Month });
          }
        }

        // Week range filter
        if (weekStart && weekEnd) {
          qb.andWhere('DATE(requests.Working_Date) BETWEEN :weekStart AND :weekEnd', {
            weekStart,
            weekEnd,
          });
        }

        // --- Other Filters ---
        if (searchDto.Site_Id && Number(searchDto.Site_Id) !== 0) {
          qb.andWhere('requests.Site_Id = :siteId', { siteId: searchDto.Site_Id });
        }
        const planBuildingIds = this.parseIdList(searchDto.Building_Id);
        if (planBuildingIds.length > 1) {
          qb.andWhere('requests.Building_Id IN (:...planBuildingIds)', { planBuildingIds });
        } else if (planBuildingIds.length === 1) {
          qb.andWhere('requests.Building_Id = :buildingId', { buildingId: planBuildingIds[0] });
        }
        const planSubconIds = this.parseIdList(searchDto.Sub_Contractor_Id);
        if (planSubconIds.length > 1) {
          qb.andWhere('requests.Sub_Contractor_Id IN (:...planSubconIds)', { planSubconIds });
        } else if (planSubconIds.length === 1) {
          qb.andWhere('requests.Sub_Contractor_Id = :subContractorId', { subContractorId: planSubconIds[0] });
        } else if (subContractorId) {
          qb.andWhere('requests.Sub_Contractor_Id = :subContractorId', { subContractorId });
        }
        // Level / Floor filtering (supports single or multi-level, floor IDs or floor names, across old & new DB records)
        const planLevelRes = await this.resolveLevelFilters(searchDto.Floor_Id, searchDto.Room_Type);
        if (planLevelRes) {
          const { resolvedFloorIds, resolvedFloorNames, rawTerms } = planLevelRes;
          const allTerms = Array.from(new Set([...resolvedFloorNames, ...rawTerms]));
          if (resolvedFloorIds.length > 0 || allTerms.length > 0) {
            qb.andWhere(
              new Brackets((levelQb) => {
                let hasCondition = false;
                if (resolvedFloorIds.length > 0) {
                  levelQb.where('requests.Floor_Id IN (:...resolvedFloorIds)', { resolvedFloorIds });
                  hasCondition = true;
                }
                allTerms.forEach((fTerm, idx) => {
                  const paramName = `fTerm_${idx}`;
                  if (hasCondition) {
                    levelQb.orWhere(`requests.Room_Type LIKE :${paramName}`, { [paramName]: `%${fTerm}%` });
                  } else {
                    levelQb.where(`requests.Room_Type LIKE :${paramName}`, { [paramName]: `%${fTerm}%` });
                    hasCondition = true;
                  }
                });
              }),
            );
          } else {
            qb.andWhere('1 = 0');
          }
        }
        if (searchDto.start_time) {
          qb.andWhere('requests.Start_Time = :startTime', { startTime: searchDto.start_time });
        }
        if (searchDto.end_time) {
          qb.andWhere('requests.End_Time = :endTime', { endTime: searchDto.end_time });
        }
        const planRoomSearchVal = searchDto.Room_Nos !== undefined && searchDto.Room_Nos !== null && String(searchDto.Room_Nos).trim() !== ''
          ? String(searchDto.Room_Nos)
          : (searchDto.area !== undefined && searchDto.area !== null && String(searchDto.area).trim() !== '' ? String(searchDto.area) : '');

        if (planRoomSearchVal !== '' && planRoomSearchVal !== '0') {
          const roomTerms = await this.resolveRoomSearchTerms(planRoomSearchVal);
          if (roomTerms && roomTerms.length > 0) {
            const escapedTerms = roomTerms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
            const regexPattern = `(^|,[[:space:]]*)(${escapedTerms.join('|')})([[:space:]]*,|$)`;
            qb.andWhere(`requests.Room_Nos REGEXP :roomRegex`, { roomRegex: regexPattern });
          } else {
            qb.andWhere('1 = 0');
          }
        }
        if (searchDto.permit_type) {
          qb.andWhere('requests.permit_type = :permitType', { permitType: searchDto.permit_type });
        }
        if (searchDto.permit_under) {
          qb.andWhere('requests.permit_under = :permitUnder', { permitUnder: searchDto.permit_under });
        }
        if (
          searchDto.Type_Of_Activity_Id !== undefined &&
          searchDto.Type_Of_Activity_Id !== null &&
          Number(String(searchDto.Type_Of_Activity_Id).replace(/'/g, '').trim()) !== 0
        ) {
          qb.andWhere('requests.Type_Of_Activity_Id = :typeOfActivityId', {
            typeOfActivityId: Number(String(searchDto.Type_Of_Activity_Id).replace(/'/g, '').trim()),
          });
        }
        if (searchDto.PermitNo) {
          qb.andWhere('requests.PermitNo LIKE :permitNo', {
            permitNo: `%${searchDto.PermitNo}%`,
          });
        }
        if (searchDto.Activity) {
          qb.andWhere('requests.Activity LIKE :activityName', {
            activityName: `%${searchDto.Activity}%`,
          });
        }
        if (searchDto.night_shift !== undefined && searchDto.night_shift !== null && String(searchDto.night_shift).trim() !== '') {
          const nsVal = String(searchDto.night_shift).trim();
          if (nsVal === '1' || nsVal === 'true') {
            qb.andWhere('(requests.night_shift = :nsOne OR requests.night_shift = 1)', { nsOne: '1' });
          } else if (nsVal === '0' || nsVal === 'false') {
            qb.andWhere(
              '(requests.night_shift = :nsZero OR requests.night_shift = 0 OR requests.night_shift IS NULL OR requests.night_shift = :nsEmpty)',
              { nsZero: '0', nsEmpty: '' },
            );
          }
        }
        if (searchDto.new_date) {
          qb.andWhere('requests.new_date = :newDate', { newDate: searchDto.new_date });
        }
        if (searchDto.new_end_time) {
          qb.andWhere('requests.new_end_time = :newEndTime', { newEndTime: searchDto.new_end_time });
        }
        if (
          searchDto.hras !== undefined &&
          searchDto.hras !== null &&
          String(searchDto.hras).trim() !== ''
        ) {
          const hrasVal = Number(searchDto.hras);
          if (hrasVal === 0) {
            qb.andWhere(
              '(fireHotwork.Hot_work IS NULL OR fireHotwork.Hot_work = 0 OR fireHotwork.Hot_work = :zeroStr) ' +
              'AND (electrical.working_on_electrical_system IS NULL OR electrical.working_on_electrical_system = 0 OR electrical.working_on_electrical_system = :zeroStr) ' +
              'AND (chemical.working_hazardious_substen IS NULL OR chemical.working_hazardious_substen = 0 OR chemical.working_hazardious_substen = :zeroStr) ' +
              'AND (pressureTesting.pressure_testing_of_equipment IS NULL OR pressureTesting.pressure_testing_of_equipment = 0 OR pressureTesting.pressure_testing_of_equipment = :zeroStr) ' +
              'AND (height.working_at_height IS NULL OR height.working_at_height = 0 OR height.working_at_height = :zeroStr) ' +
              'AND (confined.working_confined_spaces IS NULL OR confined.working_confined_spaces = 0 OR confined.working_confined_spaces = :zeroStr) ' +
              'AND (excavation.excavation_works IS NULL OR excavation.excavation_works = 0 OR excavation.excavation_works = :zeroStr) ' +
              'AND (lifting.using_cranes_or_lifting IS NULL OR lifting.using_cranes_or_lifting = 0 OR lifting.using_cranes_or_lifting = :zeroStr) ' +
              'AND (energisingElectrical.power_on IS NULL OR energisingElectrical.power_on = 0 OR energisingElectrical.power_on = :zeroStr) ' +
              'AND (energisingMechanical.pressurization IS NULL OR energisingMechanical.pressurization = 0 OR energisingMechanical.pressurization = :zeroStr)',
              { zeroStr: '0' }
            );
          } else if (hrasVal === 1) {
            const hasSpecificHraFilter = [
              searchDto.Hot_work, searchDto.working_on_electrical_system, searchDto.working_hazardious_substen,
              searchDto.using_cranes_or_lifting, searchDto.pressure_tesing_of_equipment, searchDto.working_at_height,
              searchDto.working_confined_spaces, searchDto.power_on, searchDto.pressurization, searchDto.excavation_works
            ].some(v => v !== undefined && v !== null && Number(v) === 1);

            if (!hasSpecificHraFilter) {
              qb.andWhere(
                '(fireHotwork.Hot_work = 1 OR electrical.working_on_electrical_system = 1 OR ' +
                'chemical.working_hazardious_substen = 1 OR pressureTesting.pressure_testing_of_equipment = 1 OR ' +
                'height.working_at_height = 1 OR confined.working_confined_spaces = 1 OR ' +
                'excavation.excavation_works = 1 OR lifting.using_cranes_or_lifting = 1 OR ' +
                'energisingElectrical.power_on = 1 OR energisingMechanical.pressurization = 1)'
              );
            }
          }
        }
        if (searchDto.Request_status) {
          const rawStatus = String(searchDto.Request_status).replace(/'/g, '').trim();
          const statusList = rawStatus
            .split(',')
            .map((s) => s.trim().replace(/^'|'$/g, ''))
            .filter(Boolean);

          if (statusList.length > 0) {
            qb.andWhere(
              new Brackets((statusQb) => {
                statusList.forEach((st, idx) => {
                  const paramName = `reqPlanStatus_${idx}`;
                  const autoCancelMsgParam = `autoCancelPlanMsg_${idx}`;
                  if (st === 'Auto-Cancelled') {
                    const autoCancelCond = `(requests.Request_status = :${paramName} OR extraMisc.cancelReason = :${autoCancelMsgParam})`;
                    const params = {
                      [paramName]: 'Auto-Cancelled',
                      [autoCancelMsgParam]: 'Permit not opened so system cancelled automatically',
                    };
                    if (idx === 0) {
                      statusQb.where(autoCancelCond, params);
                    } else {
                      statusQb.orWhere(autoCancelCond, params);
                    }
                  } else if (st === 'Cancelled') {
                    const cancelCond = `(requests.Request_status = :${paramName} AND (extraMisc.cancelReason IS NULL OR extraMisc.cancelReason != :${autoCancelMsgParam}))`;
                    const params = {
                      [paramName]: 'Cancelled',
                      [autoCancelMsgParam]: 'Permit not opened so system cancelled automatically',
                    };
                    if (idx === 0) {
                      statusQb.where(cancelCond, params);
                    } else {
                      statusQb.orWhere(cancelCond, params);
                    }
                  } else {
                    const normalCond = `requests.Request_status = :${paramName}`;
                    const params = { [paramName]: st };
                    if (idx === 0) {
                      statusQb.where(normalCond, params);
                    } else {
                      statusQb.orWhere(normalCond, params);
                    }
                  }
                });
              }),
            );
          }
        }

        const planZoneRes = await this.resolveZoneFilters(searchDto.zoneIds, searchDto.Zone_Id, searchDto.zone);
        if (planZoneRes) {
          const { selectedZoneIds, zoneNames } = planZoneRes;
          if (selectedZoneIds.length > 0 || zoneNames.length > 0) {
            qb.andWhere(
              new Brackets((zoneQb) => {
                let hasCond = false;
                if (selectedZoneIds.length > 0) {
                  zoneQb.where('requests.Zone_Id IN (:...selectedZoneIds)', { selectedZoneIds });
                  hasCond = true;
                }

                zoneNames.forEach((zName, index) => {
                  const paramName = `zName_${index}`;
                  if (hasCond) {
                    zoneQb.orWhere(`requests.zone LIKE :${paramName}`, { [paramName]: `%${zName}%` });
                  } else {
                    zoneQb.where(`requests.zone LIKE :${paramName}`, { [paramName]: `%${zName}%` });
                    hasCond = true;
                  }
                });
              }),
            );
          } else {
            qb.andWhere('1 = 0');
          }
        }

        // --- Safety / PPE Filters ---
        if (searchDto.Hot_work && Number(searchDto.Hot_work) === 1) {
          qb.andWhere('fireHotwork.Hot_work = :hotWork', { hotWork: searchDto.Hot_work });
        }
        if (searchDto.working_on_electrical_system && Number(searchDto.working_on_electrical_system) === 1) {
          qb.andWhere('electrical.working_on_electrical_system = :workElec', { workElec: searchDto.working_on_electrical_system });
        }
        if (searchDto.working_hazardious_substen && Number(searchDto.working_hazardious_substen) === 1) {
          qb.andWhere('chemical.working_hazardious_substen = :workHaz', { workHaz: searchDto.working_hazardious_substen });
        }
        if (searchDto.using_cranes_or_lifting && Number(searchDto.using_cranes_or_lifting) === 1) {
          qb.andWhere('lifting.using_cranes_or_lifting = :useCrane', { useCrane: searchDto.using_cranes_or_lifting });
        }
        if (searchDto.pressure_tesing_of_equipment && Number(searchDto.pressure_tesing_of_equipment) === 1) {
          qb.andWhere('pressureTesting.pressure_testing_of_equipment = :pressTest', { pressTest: searchDto.pressure_tesing_of_equipment });
        }
        if (searchDto.working_at_height && Number(searchDto.working_at_height) === 1) {
          qb.andWhere('height.working_at_height = :workHeight', { workHeight: searchDto.working_at_height });
        }
        if (searchDto.working_confined_spaces && Number(searchDto.working_confined_spaces) === 1) {
          qb.andWhere('confined.working_confined_spaces = :workConf', { workConf: searchDto.working_confined_spaces });
        }
        if (searchDto.specific_gloves && Number(searchDto.specific_gloves) === 1) {
          qb.andWhere('ppe.specific_gloves = :specGloves', { specGloves: searchDto.specific_gloves });
        }
        if (searchDto.eye_protection && Number(searchDto.eye_protection) === 1) {
          qb.andWhere('ppe.eye_protection = :eyeProt', { eyeProt: searchDto.eye_protection });
        }
        if (searchDto.fall_protection && Number(searchDto.fall_protection) === 1) {
          qb.andWhere('ppe.fall_protection = :fallProt', { fallProt: searchDto.fall_protection });
        }
        if (searchDto.hearing_protection && Number(searchDto.hearing_protection) === 1) {
          qb.andWhere('ppe.hearing_protection = :hearProt', { hearProt: searchDto.hearing_protection });
        }
        if (searchDto.respiratory_protection && Number(searchDto.respiratory_protection) === 1) {
          qb.andWhere('ppe.respiratory_protection = :respProt', { respProt: searchDto.respiratory_protection });
        }
        if (searchDto.power_on && Number(searchDto.power_on) === 1) {
          qb.andWhere('energisingElectrical.power_on = :powerOn', { powerOn: searchDto.power_on });
        }
        if (searchDto.pressurization && Number(searchDto.pressurization) === 1) {
          qb.andWhere('energisingMechanical.pressurization = :pressur', { pressur: searchDto.pressurization });
        }

        // --- No pagination — fetch all records ---
        qb.orderBy('requests.id', 'DESC');
        const [rawRequests, totalCount] = await qb.getManyAndCount();

        // Build zone lookup for all zone IDs present in the search results
        const zoneLookupMap = new Map<number, string>();
        const allZoneIdsSet = new Set<number>();
        rawRequests.forEach((req) => {
          if (req.zoneId) {
            String(req.zoneId).split(',').forEach((id) => {
              const num = Number(id.trim());
              if (!isNaN(num) && num > 0) allZoneIdsSet.add(num);
            });
          }
        });
        if (allZoneIdsSet.size > 0) {
          const zoneEntities = await this.zoneRepo.findBy({ id: In([...allZoneIdsSet]) });
          zoneEntities.forEach((z) => zoneLookupMap.set(z.id, z.zone));
        }

        // --- Build flat response ---
        const dataList: any[] = [];
        for (const req of rawRequests) {
          const resolvedRooms = await this.resolveRoomNames(req.roomNos);

          // Resolve all zone names string
          let resolvedZoneNames = '';
          if (req.zoneId) {
            const names = String(req.zoneId)
              .split(',')
              .map((id) => zoneLookupMap.get(Number(id.trim())))
              .filter(Boolean);
            if (names.length > 0) {
              resolvedZoneNames = names.join(', ');
            }
          }
          if (!resolvedZoneNames && typeof req.zone === 'string') {
            resolvedZoneNames = req.zone;
          }
          if (!resolvedZoneNames && (req as any).zone?.zone) {
            resolvedZoneNames = (req as any).zone.zone;
          }

          const flatObj: any = {
            id: req.id,
            userId: req.userId || '',
            Company_Name: req.companyName || '',
            PermitNo: req.permitNo || '',
            Sub_Contractor_Id: req.subContractorId || '',
            subContractorName: (req as any).subcontractor?.subContractorName || '',
            Foreman: req.foreman || '',
            Foreman_Phone_Number: req.foremanPhoneNumber || '',
            Activity: req.activity || '',
            activityName: (req as any).activityRelation?.activityName || '',
            Type_Of_Activity_Id: req.typeOfActivityId || '',
            Request_Date: req.requestDate || '',
            Working_Date: req.workingDate || '',
            Start_Time: req.startTime || '',
            End_Time: req.endTime || '',
            Assign_Start_Time: req.assignStartTime || '',
            Assign_End_Time: req.assignEndTime || '',
            Assign_Start_Date: req.assignStartDate || '',
            Assign_End_Date: req.assignEndDate || '',
            Building_Id: req.buildingId || '',
            building_name: (req as any).building?.building_name || '',
            Floor_Id: req.floorId || '',
            floor_name: (req as any).floor?.floor_name || '',
            Plans_Id: req.plansId || '',
            Zone_Id: req.zoneId || '',
            zone_name: resolvedZoneNames || '',
            zone: resolvedZoneNames || '',
            Room_Nos: resolvedRooms || '',
            room_names: resolvedRooms,
            Room_Type: req.roomType || '',
            Number_Of_Workers: req.numberOfWorkers || '',
            Badge_Numbers: req.badgeNumbers || '',
            teamId: req.teamId || '',
            notes: req.notes || '',
            Request_status: req.requestStatus || '',
            status: req.status,
            createdTime: req.createdTime || '',
            Site_Id: req.siteId,
            permit_type: req.permitType || 'Construction',
            permit_under: req.permitUnder || 'Construction',
            new_date: req.newDate || '',
            new_end_time: req.newEndTime || '',
            night_shift: req.nightShift || '',
            Safety_Precautions: req.safetyPrecautions || '',
          };

          const mergeSub = (sub: any, repo: Repository<any>) => {
            if (!sub) return;
            for (const column of repo.metadata.columns) {
              if (column.propertyName !== 'requestId') {
                const val = sub[column.propertyName];
                flatObj[column.databaseName] = val !== undefined && val !== null ? val : '';
              }
            }
          };

          mergeSub((req as any).chemical, this.chemicalRepo);
          mergeSub((req as any).confined, this.confinedRepo);
          mergeSub((req as any).electrical, this.electricalRepo);
          mergeSub((req as any).energisingElectrical, this.energisingElecRepo);
          mergeSub((req as any).energisingMechanical, this.energisingMechRepo);
          mergeSub((req as any).excavation, this.excavationRepo);
          mergeSub((req as any).extraMisc, this.extraMiscRepo);
          mergeSub((req as any).fireHotwork, this.fireHotworkRepo);
          mergeSub((req as any).general, this.generalRepo);
          mergeSub((req as any).height, this.heightRepo);
          mergeSub((req as any).lifting, this.liftingRepo);
          mergeSub((req as any).ppe, this.ppeRepo);
          mergeSub((req as any).pressureTesting, this.pressureTestingRepo);

          if (flatObj.course_of_actions !== undefined) {
            flatObj.course_of_action = flatObj.course_of_actions;
          }

          const files = await this.ramsFileRepo.find({
            where: { requestId: req.id, status: 1 },
          });
          const notes = await this.noteRepo.find({
            where: { requestId: req.id },
            order: { createdTime: 'DESC' },
          });

          flatObj.files = files;
          flatObj.note = notes;

          if (flatObj.cancel_reason === 'Permit not opened so system cancelled automatically') {
            flatObj.Request_status = 'Auto-Cancelled';
          }

          dataList.push(flatObj);
        }

        return [
          { data: dataList },
          { count: totalCount },
        ];
  }

  // 1. Soft delete single request
  async softDelete(id: number): Promise<any> {
    await this.requestRepo.update(id, { status: 0 });
    await this.redisCacheService.deleteByPattern('requests:*');
    return { message: 'Role deleted' };
  }

  // 2. Soft delete multiple requests (bulk)
  async softDeleteMultiple(ids: number[]): Promise<any> {
    await this.requestRepo.update({ id: In(ids) }, { status: 0 });
    await this.redisCacheService.deleteByPattern('requests:*');
    return { status: true, message: 'Records deleted successfully' };
  }

  // 3. Selected status updates (deleteSelected.php)
  async deleteSelected(idStr: string, statusStr: string): Promise<any> {
    const ids = idStr
      .split(',')
      .map((id) => Number(id.trim()))
      .filter((id) => !isNaN(id));
    if (ids.length > 0) {
      await this.requestRepo.update(
        { id: In(ids) },
        { requestStatus: statusStr },
      );
      await this.redisCacheService.deleteByPattern('requests:*');
      return { status: 200, message: 'Request Updated' };
    }
    return { status: 202, message: 'Request not updated' };
  }

  // 4. Upload/Add RAMS file attachments for an existing request
  async addRamsFiles(
    requestId: number,
    files?: any[],
    userId?: number,
  ): Promise<any> {
    if (!requestId || isNaN(requestId)) {
      return {
        status: false,
        message: 'Invalid request ID',
      };
    }

    const request = await this.requestRepo.findOne({ where: { id: requestId } });
    if (!request) {
      return {
        status: false,
        message: `Request with ID ${requestId} not found`,
      };
    }

    if (files && files.length > 0) {
      for (const file of files) {
        const filePath = file.path.replace(/\\/g, '/');
        await this.ramsFileRepo.insert({
          requestId,
          ramsFile: filePath,
          status: 1,
          createdAt: new Date(),
          userId: userId || 0,
        });
      }
    }

    await this.redisCacheService.deleteByPattern('requests:*');

    const updatedFiles = await this.ramsFileRepo.find({
      where: { requestId, status: 1 },
      order: { ramsFileId: 'ASC' },
    });

    return {
      status: true,
      message: 'RAMS Files uploaded successfully',
      files: updatedFiles,
    };
  }

  // Soft delete RAMS file attachment
  async softDeleteRamsFile(ramsFileId: number): Promise<any> {
    await this.ramsFileRepo.update(ramsFileId, { status: 0 });
    await this.redisCacheService.deleteByPattern('requests:*');
    return { message: 'Rams File deleted' };
  }

  // Get RAMS file attachment details
  async getRamsFile(ramsFileId: number): Promise<RamsFile | null> {
    return await this.ramsFileRepo.findOne({ where: { ramsFileId } });
  }

  // 5. Add Notes (bulk)
  async addNotes(body: {
    request_id: string;
    permit_no: string;
    user_id?: number;
    username?: string;
    note?: string;
    createdTime?: string;
  }): Promise<any> {
    const requestIds = (body.request_id || '').split(',');
    const permitNos = (body.permit_no || '').split(',');
    if (requestIds.length !== permitNos.length) {
      return {
        status: 400,
        message: 'request_id and permit_no count mismatch',
      };
    }
    let successCount = 0;
    for (let i = 0; i < requestIds.length; i++) {
      const noteObj = this.noteRepo.create({
        requestId: Number(requestIds[i].trim()),
        permitNo: permitNos[i].trim(),
        userId: body.user_id || 0,
        username: body.username || 'System',
        note: body.note || '',
        createdTime: body.createdTime ? new Date(body.createdTime) : new Date(),
      });
      await this.noteRepo.save(noteObj);
      successCount++;
    }
    await this.redisCacheService.deleteByPattern('requests:*');
    return {
      status: 200,
      message: 'Notes created successfully',
      total_inserted: successCount,
    };
  }

  // Delete a single note by ID
  async deleteNote(id: number, userId?: number): Promise<any> {
    const note = await this.noteRepo.findOne({ where: { id } });
    if (!note) {
      return { status: 404, message: 'Note not found' };
    }

    const logUserId = userId || note.userId || 0;
    const now = new Date();

    await this.createLogs(
      note.requestId,
      logUserId,
      'Note Deleted',
      now,
      [
        {
          field_name: 'note',
          previous: note.note || '',
          present: 'Deleted',
        },
      ],
    );

    await this.noteRepo.delete({ id });
    await this.redisCacheService.deleteByPattern('requests:*');
    return { status: 200, message: 'Note deleted successfully' };
  }

  // Fetch logs for a specific permit_no (log.php equivalent)
  async getPermitLogs(permitNo: string): Promise<any> {
    const query = `
      SELECT 
        l.id,
        l.requestId,
        l.requestType,
        l.userId,
        l.createdTime,
        COALESCE(NULLIF(l.permitno, ''), r.PermitNo) AS PermitNo,
        l.system,
        u.username,
        u.userType,
        r.Company_Name,
        s.subContractorName
      FROM logs l
      LEFT JOIN requests r ON l.requestId = r.id
      LEFT JOIN users u ON l.userId = u.id
      LEFT JOIN subcontractors s ON r.Sub_Contractor_Id = s.id
      WHERE r.PermitNo = ? OR l.permitno = ?
      ORDER BY l.createdTime ASC
    `;

    const logs = await this.logRepo.query(query, [permitNo, permitNo]);

    if (logs.length === 0) {
      return { data: [], message: 'No Logs Found' };
    }

    const data: any[] = [];
    for (const row of logs) {
      const fields = await this.logDataRepo.find({
        where: { logId: Number(row.id) }
      });

      const systemFlag = Number(row.system);
      const logsusertype = systemFlag === 0 ? (row.userType ?? '') : 'System Auto Cancel';
      const logsubcontractor = systemFlag === 0 ? (row.subContractorName ?? '') : 'NA';
      const logusername = systemFlag === 0 ? (row.username ?? '') : 'NA';

      data.push({
        id: row.id ?? '',
        requestId: row.requestId ?? '',
        requestType: row.requestType ?? '',
        userId: row.userId ?? '',
        createdTime: row.createdTime ?? '',
        username: logusername,
        PermitNo: row.PermitNo ?? '',
        userType: logsusertype,
        Company_Name: row.Company_Name ?? '',
        contractor_name: logsubcontractor,
        fields: fields.map(f => ({
          logs_data_id: f.logsDataId,
          log_id: f.logId,
          field_name: f.fieldName,
          previous: f.previous,
          present: f.present,
          createdTime: f.createdTime
        }))
      });
    }

    return { data };
  }

  // 6. Fetch logs for a specific user
  async readLogs(userId: number): Promise<any> {
    const logs = await this.logRepo.find({
      where: { userId },
      order: { createdTime: 'DESC' },
    });
    const data = logs.map((l) => ({
      id: l.id,
      requestId: l.requestId,
      requestType: l.requestType || '',
      createdTime: l.createdTime,
      userId: l.userId,
      username: '',
    }));
    return { data };
  }

  // 7. Complete logs insertion
  async createCompleteLog(body: {
    id: number;
    PermitNo: string;
    status: string;
    module: string;
  }): Promise<any> {
    const logObj = this.completeLogRepo.create({
      id: Number(body.id),
      permitNo: body.PermitNo,
      status: body.status,
      module: body.module,
      createdTime: new Date(),
    });
    await this.completeLogRepo.save(logObj);
    return { status: 200, message: 'Log Created' };
  }

  // 10. Cron Expiration Check
  @Cron('*/5 * * * *')
  async triggerCron(): Promise<any> {
    const cphDate = new Date().toLocaleString('en-US', { timeZone: 'Europe/Copenhagen' });
    const nowCph = new Date(cphDate);
    const year = nowCph.getFullYear();
    const month = String(nowCph.getMonth() + 1).padStart(2, '0');
    const date = String(nowCph.getDate()).padStart(2, '0');
    const curDateStr = `${year}-${month}-${date}`;
    const hours = String(nowCph.getHours()).padStart(2, '0');
    const minutes = String(nowCph.getMinutes()).padStart(2, '0');
    const seconds = String(nowCph.getSeconds()).padStart(2, '0');
    const curDateTimeStr = `${curDateStr} ${hours}:${minutes}:${seconds}`;

    const query = `
      SELECT id FROM requests
      WHERE Request_status = 'Approved'
      AND Working_Date <= ?
      AND TIMESTAMP(Working_Date, Start_Time) + INTERVAL 4 HOUR <= ?
    `;
    const toCancel = await this.requestRepo.query(query, [
      curDateStr,
      curDateTimeStr,
    ]);
    const ids = toCancel.map((r) => Number(r.id));
    let affected = 0;
    if (ids.length > 0) {
      await this.requestRepo.update(
        { id: In(ids) },
        {
          requestStatus: 'Cancelled',
        },
      );
      affected = ids.length;

      for (const id of ids) {
        let ext = await this.extraMiscRepo.findOne({ where: { requestId: id } });
        if (!ext) {
          ext = this.extraMiscRepo.create({ requestId: id });
        }
        ext.cancelReason = 'Permit not opened so system cancelled automatically';
        await this.extraMiscRepo.save(ext);

        const log = this.logRepo.create({
          requestId: id,
          requestType: 'Cancelled',
          createdTime: nowCph,
          system: 1,
        });
        await this.logRepo.save(log);

        this.notificationsService.triggerNotification(
          id,
          'Approved',
          'Auto-Cancelled',
          0,
        ).catch((err) => console.error('Notification error on auto-cancel:', err));
      }
      await this.redisCacheService.deleteByPattern('requests:*');
    }
    return { status: 'success', cancelledCount: affected };
  }

  // 11. Read counts (readCounts.php)
  async readCounts(loggedInUserId?: number): Promise<any> {
    const user = loggedInUserId ? await this.userRepo.findOne({ where: { id: loggedInUserId } }) : null;
    const userTypes = (user?.userType || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    let subContractorId: number | null = null;
    let limitToUserId: number | null = null;

    if (user) {
      if (userTypes.includes('Subcontractor')) {
        subContractorId = user.typeId;
      } else if (
        userTypes.includes('Admin') ||
        userTypes.includes('SuperAdmin') ||
        userTypes.includes('Department') ||
        userTypes.includes('Department1') ||
        userTypes.includes('HSE') ||
        userTypes.includes('Observer')
      ) {
        // No filter for admin / department
      } else {
        limitToUserId = user.id;
      }
    }

    const cacheKey = subContractorId
      ? `requests:counts:subcon:${subContractorId}`
      : limitToUserId
      ? `requests:counts:user:${limitToUserId}`
      : 'requests:counts';

    return this.redisCacheService.getOrSet(
      cacheKey,
      async () => {
        const qb = this.requestRepo
          .createQueryBuilder('requests')
          .leftJoin(
            'request_extra_misc',
            'rem',
            'rem.request_id = requests.id',
          )
          .select('COUNT(*)', 'totalCount')
          .addSelect(
            "SUM(CASE WHEN requests.Request_status = 'Draft' THEN 1 ELSE 0 END)",
            'draftCount',
          )
          .addSelect(
            "SUM(CASE WHEN requests.Request_status = 'Hold' THEN 1 ELSE 0 END)",
            'holdCount',
          )
          .addSelect(
            "SUM(CASE WHEN requests.Request_status = 'Pre-Approved' THEN 1 ELSE 0 END)",
            'preApprovedCount',
          )
          .addSelect(
            "SUM(CASE WHEN requests.Request_status = 'Approved' THEN 1 ELSE 0 END)",
            'approvedCount',
          )
          .addSelect(
            "SUM(CASE WHEN requests.Request_status = 'Rejected' THEN 1 ELSE 0 END)",
            'rejectedCount',
          )
          .addSelect(
            "SUM(CASE WHEN requests.Request_status = 'Opened' THEN 1 ELSE 0 END)",
            'openedCount',
          )
          .addSelect(
            `SUM(CASE WHEN requests.Request_status = 'Cancelled' 
            AND (rem.cancel_reason IS NULL OR rem.cancel_reason != 'Permit not opened so system cancelled automatically') 
            THEN 1 ELSE 0 END)`,
            'cancelledCount',
          )
          .addSelect(
            `SUM(CASE WHEN requests.Request_status = 'Cancelled' 
            AND rem.cancel_reason = 'Permit not opened so system cancelled automatically' 
            THEN 1 ELSE 0 END)`,
            'autoCancelledCount',
          )
          .addSelect(
            "SUM(CASE WHEN requests.Request_status = 'Closed' THEN 1 ELSE 0 END)",
            'closedCount',
          )
          .where('requests.status = 1');

        if (subContractorId) {
          qb.andWhere('requests.Sub_Contractor_Id = :subContractorId', { subContractorId });
        } else if (limitToUserId) {
          qb.andWhere('requests.userId = :limitToUserId', { limitToUserId });
        }

        const counts = await qb.getRawOne();

        return {
          data: [
            {
              totalCount: Number(counts.totalCount || 0) - Number(counts.draftCount || 0),
              draftCount: Number(counts.draftCount || 0),
              holdCount: Number(counts.holdCount || 0),
              preApprovedCount: Number(counts.preApprovedCount || 0),
              approvedCount: Number(counts.approvedCount || 0),
              rejectedCount: Number(counts.rejectedCount || 0),
              openedCount: Number(counts.openedCount || 0),
              cancelledCount: Number(counts.cancelledCount || 0),
              autoCancelledCount: Number(counts.autoCancelledCount || 0),
              closedCount: Number(counts.closedCount || 0),
            },
          ],
        };
      },
      1000 * 60 * 5,
    );
  }

  // 12. Read single status count (readRequestCount.php)
  async readRequestCount(status: string, loggedInUserId?: number): Promise<any> {
    const user = loggedInUserId ? await this.userRepo.findOne({ where: { id: loggedInUserId } }) : null;
    const userTypes = (user?.userType || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    let subContractorId: number | null = null;
    let limitToUserId: number | null = null;

    if (user) {
      if (userTypes.includes('Subcontractor')) {
        subContractorId = user.typeId;
      } else if (
        userTypes.includes('Admin') ||
        userTypes.includes('SuperAdmin') ||
        userTypes.includes('Department') ||
        userTypes.includes('Department1') ||
        userTypes.includes('HSE') ||
        userTypes.includes('Observer')
      ) {
        // No filter
      } else {
        limitToUserId = user.id;
      }
    }

    const cacheKey = subContractorId
      ? `requests:counts:${status}:subcon:${subContractorId}`
      : limitToUserId
      ? `requests:counts:${status}:user:${limitToUserId}`
      : `requests:counts:${status}`;

    return this.redisCacheService.getOrSet(
      cacheKey,
      async () => {
        const whereClause: any = { requestStatus: status, status: 1 };
        if (subContractorId) {
          whereClause.subContractorId = subContractorId;
        } else if (limitToUserId) {
          whereClause.userId = limitToUserId;
        }
        const count = await this.requestRepo.count({
          where: whereClause,
        });
        return {
          data: [
            {
              requestCount: count,
            },
          ],
        };
      },
      1000 * 60 * 5,
    );
  }

  // 13. Read Graph counts per day (readGraph.php)
  async readGraph(WeekFirstday: string, WeekLastday: string, loggedInUserId?: number): Promise<any> {
    const user = loggedInUserId ? await this.userRepo.findOne({ where: { id: loggedInUserId } }) : null;
    const userTypes = (user?.userType || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    let subContractorId: number | null = null;
    let limitToUserId: number | null = null;

    if (user) {
      if (userTypes.includes('Subcontractor')) {
        subContractorId = user.typeId;
      } else if (
        userTypes.includes('Admin') ||
        userTypes.includes('SuperAdmin') ||
        userTypes.includes('Department') ||
        userTypes.includes('Department1') ||
        userTypes.includes('HSE') ||
        userTypes.includes('Observer')
      ) {
        // No filter
      } else {
        limitToUserId = user.id;
      }
    }

    const first = new Date(
      WeekFirstday.replace(' GMT+0530 (India Standard Time)', ''),
    );
    const last = new Date(
      WeekLastday.replace(' GMT+0530 (India Standard Time)', ''),
    );

    const datesList: string[] = [];
    const curr = new Date(first);
    while (curr <= last) {
      datesList.push(curr.toISOString().split('T')[0]);
      curr.setDate(curr.getDate() + 1);
    }

    const data: any[] = [];
    for (const d of datesList) {
      const qb = this.requestRepo
        .createQueryBuilder('requests')
        .select(
          "SUM(CASE WHEN requests.Request_status = 'Approved' THEN 1 ELSE 0 END)",
          'approveCount',
        )
        .addSelect(
          "SUM(CASE WHEN requests.Request_status = 'Rejected' THEN 1 ELSE 0 END)",
          'rejectCount',
        )
        .addSelect(
          "SUM(CASE WHEN requests.Request_status = 'Opened' THEN 1 ELSE 0 END)",
          'openCount',
        )
        .addSelect(
          "SUM(CASE WHEN requests.Request_status = 'Closed' THEN 1 ELSE 0 END)",
          'closeCount',
        )
        .where('requests.status = 1 AND requests.Working_Date = :date', {
          date: d,
        });

      if (subContractorId) {
        qb.andWhere('requests.Sub_Contractor_Id = :subContractorId', { subContractorId });
      } else if (limitToUserId) {
        qb.andWhere('requests.userId = :limitToUserId', { limitToUserId });
      }

      const counts = await qb.getRawOne();

      const dateObj = new Date(d);
      const dayNames = [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ];
      const dayName = dayNames[dateObj.getDay()];
      const formattedDate = ` ${dayName} ${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${String(dateObj.getFullYear()).slice(-2)}`;

      data.push({
        date: formattedDate,
        approveCount: Number(counts.approveCount || 0),
        rejectCount: Number(counts.rejectCount || 0),
        openCount: Number(counts.openCount || 0),
        closeCount: Number(counts.closeCount || 0),
      });
    }
    return { data };
  }

  // 14. Read Graph Counts summary today vs week (readGraphCounts.php)
  async readGraphCounts(loggedInUserId?: number): Promise<any> {
    const user = loggedInUserId ? await this.userRepo.findOne({ where: { id: loggedInUserId } }) : null;
    const userTypes = (user?.userType || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    let subContractorId: number | null = null;
    let limitToUserId: number | null = null;

    if (user) {
      if (userTypes.includes('Subcontractor')) {
        subContractorId = user.typeId;
      } else if (
        userTypes.includes('Admin') ||
        userTypes.includes('SuperAdmin') ||
        userTypes.includes('Department') ||
        userTypes.includes('Department1') ||
        userTypes.includes('HSE') ||
        userTypes.includes('Observer')
      ) {
        // Admin/HSE/Department sees all
      } else {
        limitToUserId = user.id;
      }
    }

    const cacheKey = subContractorId
      ? `requests:graph:counts:subcon:${subContractorId}`
      : limitToUserId
      ? `requests:graph:counts:user:${limitToUserId}`
      : 'requests:graph:counts';

    return this.redisCacheService.getOrSet(
      cacheKey,
      async () => {
        const todayQb = this.requestRepo
          .createQueryBuilder('requests')
          .leftJoin(
            'request_extra_misc',
            'rem',
            'rem.request_id = requests.id',
          )
          .select('COUNT(*)', 'totalCount')
          .addSelect(
            "SUM(CASE WHEN requests.night_shift = '1' THEN 1 ELSE 0 END)",
            'nightshiftCount',
          )
          .addSelect(
            "SUM(CASE WHEN requests.Request_status = 'Draft' THEN 1 ELSE 0 END)",
            'draftCount',
          )
          .addSelect(
            "SUM(CASE WHEN requests.Request_status = 'Hold' THEN 1 ELSE 0 END)",
            'holdCount',
          )
          .addSelect(
            "SUM(CASE WHEN requests.Request_status = 'Pre-Approved' THEN 1 ELSE 0 END)",
            'preApprovedCount',
          )
          .addSelect(
            "SUM(CASE WHEN requests.Request_status = 'Approved' THEN 1 ELSE 0 END)",
            'approvedCount',
          )
          .addSelect(
            "SUM(CASE WHEN requests.Request_status = 'Rejected' THEN 1 ELSE 0 END)",
            'rejectedCount',
          )
          .addSelect(
            "SUM(CASE WHEN requests.Request_status = 'Opened' THEN 1 ELSE 0 END)",
            'openedCount',
          )
          .addSelect(
            `SUM(CASE WHEN requests.Request_status = 'Cancelled' 
            AND (rem.cancel_reason IS NULL OR rem.cancel_reason != 'Permit not opened so system cancelled automatically') 
            THEN 1 ELSE 0 END)`,
            'cancelledCount',
          )
          .addSelect(
            `SUM(CASE WHEN requests.Request_status = 'Cancelled' 
            AND rem.cancel_reason = 'Permit not opened so system cancelled automatically' 
            THEN 1 ELSE 0 END)`,
            'autoCancelledCount',
          )
          .addSelect(
            "SUM(CASE WHEN requests.Request_status = 'Closed' THEN 1 ELSE 0 END)",
            'closedCount',
          )
          .where('requests.status = 1 AND requests.Working_Date = CURDATE()');

        if (subContractorId) {
          todayQb.andWhere('requests.Sub_Contractor_Id = :subContractorId', { subContractorId });
        } else if (limitToUserId) {
          todayQb.andWhere('requests.userId = :limitToUserId', { limitToUserId });
        }

        const todayCounts = await todayQb.getRawOne();

        const lastWeekQb = this.requestRepo
          .createQueryBuilder('requests')
          .leftJoin(
            'request_extra_misc',
            'rem',
            'rem.request_id = requests.id',
          )
          .select('COUNT(*)', 'totalCount')
          .addSelect(
            "SUM(CASE WHEN requests.night_shift = '1' THEN 1 ELSE 0 END)",
            'nightshiftCount',
          )
          .addSelect(
            "SUM(CASE WHEN requests.Request_status = 'Draft' THEN 1 ELSE 0 END)",
            'draftCount',
          )
          .addSelect(
            "SUM(CASE WHEN requests.Request_status = 'Hold' THEN 1 ELSE 0 END)",
            'holdCount',
          )
          .addSelect(
            "SUM(CASE WHEN requests.Request_status = 'Pre-Approved' THEN 1 ELSE 0 END)",
            'preApprovedCount',
          )
          .addSelect(
            "SUM(CASE WHEN requests.Request_status = 'Approved' THEN 1 ELSE 0 END)",
            'approvedCount',
          )
          .addSelect(
            "SUM(CASE WHEN requests.Request_status = 'Rejected' THEN 1 ELSE 0 END)",
            'rejectedCount',
          )
          .addSelect(
            "SUM(CASE WHEN requests.Request_status = 'Opened' THEN 1 ELSE 0 END)",
            'openedCount',
          )
          .addSelect(
            `SUM(CASE WHEN requests.Request_status = 'Cancelled' 
            AND (rem.cancel_reason IS NULL OR rem.cancel_reason != 'Permit not opened so system cancelled automatically') 
            THEN 1 ELSE 0 END)`,
            'cancelledCount',
          )
          .addSelect(
            `SUM(CASE WHEN requests.Request_status = 'Cancelled' 
            AND rem.cancel_reason = 'Permit not opened so system cancelled automatically' 
            THEN 1 ELSE 0 END)`,
            'autoCancelledCount',
          )
          .addSelect(
            "SUM(CASE WHEN requests.Request_status = 'Closed' THEN 1 ELSE 0 END)",
            'closedCount',
          )
          .where(
            'requests.status = 1 AND requests.Working_Date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)',
          );

        if (subContractorId) {
          lastWeekQb.andWhere('requests.Sub_Contractor_Id = :subContractorId', { subContractorId });
        } else if (limitToUserId) {
          lastWeekQb.andWhere('requests.userId = :limitToUserId', { limitToUserId });
        }

        const lastWeekCounts = await lastWeekQb.getRawOne();

        return {
          data: {
            day: [
              {
                totalCount: Number(todayCounts.totalCount || 0),
                nightshiftCount: Number(todayCounts.nightshiftCount || 0),
                draftCount: Number(todayCounts.draftCount || 0),
                holdCount: Number(todayCounts.holdCount || 0),
                preApprovedCount: Number(todayCounts.preApprovedCount || 0),
                approvedCount: Number(todayCounts.approvedCount || 0),
                rejectedCount: Number(todayCounts.rejectedCount || 0),
                openedCount: Number(todayCounts.openedCount || 0),
                cancelledCount: Number(todayCounts.cancelledCount || 0),
                autoCancelledCount: Number(todayCounts.autoCancelledCount || 0),
                closedCount: Number(todayCounts.closedCount || 0),
              },
            ],
            week: [
              {
                totalCount: Number(lastWeekCounts.totalCount || 0),
                nightshiftCount: Number(lastWeekCounts.nightshiftCount || 0),
                draftCount: Number(lastWeekCounts.draftCount || 0),
                holdCount: Number(lastWeekCounts.holdCount || 0),
                preApprovedCount: Number(lastWeekCounts.preApprovedCount || 0),
                approvedCount: Number(lastWeekCounts.approvedCount || 0),
                rejectedCount: Number(lastWeekCounts.rejectedCount || 0),
                openedCount: Number(lastWeekCounts.openedCount || 0),
                cancelledCount: Number(lastWeekCounts.cancelledCount || 0),
                autoCancelledCount: Number(lastWeekCounts.autoCancelledCount || 0),
                closedCount: Number(lastWeekCounts.closedCount || 0),
              },
            ],
          },
        };
      },
      1000 * 60 * 5,
    );
  }

  private async checkZoneStatusAndAssignPermitUnder(
    dto: CreateRequestDto | UpdateRequestDto,
    existingZoneId?: any,
  ) {
    let zoneIds: number[] = [];
    const zoneIdVal = dto.Zone_Id !== undefined ? dto.Zone_Id : existingZoneId;
    if (zoneIdVal !== undefined && zoneIdVal !== null) {
      if (Array.isArray(zoneIdVal)) {
        zoneIds = zoneIdVal
          .map((id) => Number(id))
          .filter((id) => !isNaN(id) && id > 0);
      } else if (typeof zoneIdVal === 'string') {
        zoneIds = String(zoneIdVal)
          .split(',')
          .map((id) => Number(id.trim()))
          .filter((id) => !isNaN(id) && id > 0);
      } else if (typeof zoneIdVal === 'number') {
        zoneIds = zoneIdVal > 0 ? [zoneIdVal] : [];
      }
    }

    if (zoneIds.length > 0) {
      const zones = await this.zoneRepo.find({
        where: { id: In(zoneIds) },
      });
      if (zones.length === 0) {
        throw new BadRequestException('Selected zones not found');
      }
      const statuses = zones.map((z) => (z.status || '').toUpperCase().trim());
      if (statuses.includes('HO')) {
        throw new BadRequestException(
          'Cannot create a permit if zone status is HO',
        );
      }
      const uniqueStatuses = Array.from(new Set(statuses));
      if (uniqueStatuses.length > 1) {
        throw new BadRequestException(
          'All selected zones must belong to the same status',
        );
      }
      const commonStatus = uniqueStatuses[0];
      if (commonStatus === 'UC') {
        dto.permit_under = 'Construction';
      } else if (commonStatus === 'C') {
        dto.permit_under = 'Commissioning';
      }
      dto.Zone_Id = zoneIds.join(',');
    }
  }

  private validateMandatoryFields(
    dto: CreateRequestDto | UpdateRequestDto,
    existing?: RequestEntity,
    subTables?: any,
  ) {
    const currentStatus = (existing?.requestStatus || '').toLowerCase().trim();
    const requestStatusVal =
      dto.Request_status !== undefined
        ? dto.Request_status
        : existing?.requestStatus;
    const newStatus = (requestStatusVal || '').toLowerCase().trim();

    // If new status is draft, skip all validations
    if (newStatus === 'draft') {
      return;
    }

    const errors: string[] = [];

    const getSubField = (dtoKey: string, dbField: any) => {
      if (dto && (dto as any)[dtoKey] !== undefined && (dto as any)[dtoKey] !== null) {
        return (dto as any)[dtoKey];
      }
      return dbField;
    };

    const checkRequiredSubField = (fieldName: string, value: any) => {
      if (value === undefined || value === null || String(value).trim() === '') {
        errors.push(`${fieldName} is required`);
        return false;
      }
      return true;
    };

    // Determine if we should run the base mandatory validations
    const isNewCreation = !existing;
    const isDraftToHold = existing && currentStatus === 'draft' && newStatus === 'hold';
    const runBaseMandatory = isNewCreation || isDraftToHold;

    if (runBaseMandatory) {
      const getValue = (dtoKey: string, dbField?: any) => {
        if (dto && (dto as any)[dtoKey] !== undefined && (dto as any)[dtoKey] !== null) {
          return (dto as any)[dtoKey];
        }
        return dbField;
      };

      const getMultiValue = (dtoKeys: string[], dbField?: any) => {
        for (const key of dtoKeys) {
          if (dto && (dto as any)[key] !== undefined && (dto as any)[key] !== null) {
            return (dto as any)[key];
          }
        }
        return dbField;
      };

      const checkRequired = (key: string, dbField: any) => {
        const val = getValue(key, dbField);
        if (val === undefined || val === null || val === '') {
          errors.push(`${key} is required`);
          return false;
        }
        return true;
      };

      const checkRequiredMulti = (keys: string[], dbField: any) => {
        const val = getMultiValue(keys, dbField);
        if (val === undefined || val === null || val === '') {
          errors.push(`${keys[0]} is required`);
          return false;
        }
        return true;
      };

      const checkCheckbox = (key: string, dbField: any) => {
        const val = getValue(key, dbField);
        if (val === undefined || val === null || val === '') {
          errors.push(`${key} must be checked`);
          return false;
        }
        return true;
      };

      // 1. Subcontractor logic
      const subContractorId = getValue(
        'Sub_Contractor_Id',
        existing?.subContractorId,
      );
      const newSubContractor = getValue(
        'new_sub_contractor',
        subTables?.ext?.newSubContractor,
      );
      if (!subContractorId && !newSubContractor) {
        errors.push(
          'Either Sub_Contractor_Id or new_sub_contractor must be provided',
        );
      }

      // 2. Base fields
      checkRequired('Company_Name', existing?.companyName);
      checkRequired('Foreman', existing?.foreman);
      checkRequired('Foreman_Phone_Number', existing?.foremanPhoneNumber);
      checkRequired('Activity', existing?.activity);
      checkRequired('Type_Of_Activity_Id', existing?.typeOfActivityId);
      checkRequired('Working_Date', existing?.workingDate);
      checkRequired('Start_Time', existing?.startTime);
      checkRequired('End_Time', existing?.endTime);
      checkRequired('Building_Id', existing?.buildingId);
      checkRequired('Floor_Id', existing?.floorId);
      checkRequired('Room_Nos', existing?.roomNos);
      checkRequired('Room_Type', existing?.roomType);
      checkRequired('Zone_Id', existing?.zoneId);
      checkRequired('Number_Of_Workers', existing?.numberOfWorkers);
      checkRequired('Request_status', existing?.requestStatus);
      checkRequired('Site_Id', existing?.siteId);
      checkRequired('permit_type', existing?.permitType);
      checkRequired('permit_under', existing?.permitUnder);

      // 3. Conditional validations based on parent keys
      const workingHazardous = getValue(
        'working_hazardious_substen',
        subTables?.chem?.workingHazardiousSubsten,
      );
      if (Number(workingHazardous) === 1) {
        checkCheckbox('relevant_mal', subTables?.chem?.relevantMal);
        checkCheckbox('msds', subTables?.chem?.msds);
        checkCheckbox(
          'equipment_taken_account',
          subTables?.chem?.equipmentTakenAccount,
        );
        checkCheckbox('ventilation', subTables?.chem?.ventilation);
        checkCheckbox(
          'hazardous_substances',
          subTables?.chem?.hazardousSubstances,
        );
        checkCheckbox(
          'storage_and_disposal',
          subTables?.chem?.storageAndDisposal,
        );
        checkCheckbox('reachable_case', subTables?.chem?.reachableCase);
        checkCheckbox(
          'checical_risk_assessment',
          subTables?.chem?.checicalRiskAssessment,
        );
      }

      const workingConfined = getValue(
        'working_confined_spaces',
        subTables?.conf?.workingConfinedSpaces,
      );
      if (Number(workingConfined) === 1) {
        checkCheckbox('vapours_gases', subTables?.conf?.vapoursGases);
        checkCheckbox('lel_measurement', subTables?.conf?.lelMeasurement);
        checkCheckbox('all_equipment', subTables?.conf?.allEquipment);
        checkCheckbox('exit_conditions', subTables?.conf?.exitConditions);
        checkCheckbox(
          'communication_emergency',
          subTables?.conf?.communicationEmergency,
        );
        checkCheckbox('rescue_equipments', subTables?.conf?.rescueEquipments);
        checkCheckbox('space_ventilation', subTables?.conf?.spaceVentilation);
        checkCheckbox('oxygen_meter', subTables?.conf?.oxygenMeter);
      }

      const workingElectrical = getValue(
        'working_on_electrical_system',
        subTables?.elec?.workingOnElectricalSystem,
      );
      if (Number(workingElectrical) === 1) {
        checkCheckbox(
          'responsible_for_the_informed',
          subTables?.elec?.responsibleForTheInformed,
        );
        checkCheckbox('de_energized', subTables?.elec?.deEnergized);
        checkCheckbox('if_not_loto', subTables?.elec?.ifNotLoto);
        checkCheckbox('do_risk_assessment', subTables?.elec?.doRiskAssessment);
        checkCheckbox(
          'electricity_have_isulation',
          subTables?.elec?.electricityHaveIsulation,
        );
      }

      // Only check Commissioning permit validations for power_on, pressurization, pressure_testing_of_equipment
      const permitTypeVal = String(
        getValue('permit_type', existing?.permitType) || '',
      )
        .toLowerCase()
        .trim();
      const isCommissioning = permitTypeVal === 'commissioning';

      if (isCommissioning) {
        const powerOn = getValue('power_on', subTables?.energElec?.powerOn);
        if (Number(powerOn) === 1) {
          const energisingEquipment = getValue(
            'energising_equipment',
            subTables?.energElec?.energisingEquipment,
          );
          if (Number(energisingEquipment) === 1) {
            checkRequired(
              'responsible_for_the_area',
              subTables?.energElec?.responsibleForTheArea,
            );
            checkCheckbox(
              'risk_assessment_done',
              subTables?.energElec?.riskAssessmentDone,
            );
            checkCheckbox(
              'barriers_signage',
              subTables?.energElec?.barriersSignage,
            );
            checkCheckbox('arc_flash', subTables?.energElec?.arcFlash);
            checkCheckbox(
              'energized_been_tested',
              subTables?.energElec?.energizedBeenTested,
            );
            checkCheckbox(
              'punches_been_closed',
              subTables?.energElec?.punchesBeenClosed,
            );
            checkCheckbox('toct_checklist', subTables?.energElec?.toctChecklist);
            checkCheckbox(
              'informed_aligned',
              subTables?.energElec?.informedAligned,
            );
          }

          const isolatingLive = getValue(
            'isolating_live',
            subTables?.energElec?.isolatingLive,
          );
          if (Number(isolatingLive) === 1) {
            const isolatingResponsibleVal = getMultiValue(
              ['isolating_responsible', 'isolating_resposible'],
              subTables?.energElec?.isolatingResponsible,
            );
            if (
              isolatingResponsibleVal === undefined ||
              isolatingResponsibleVal === null ||
              String(isolatingResponsibleVal).trim() === ''
            ) {
              errors.push('isolating_responsible must be checked');
            }
            checkCheckbox(
              'isolating_risk_assessment',
              subTables?.energElec?.isolatingRiskAssessment,
            );
            checkCheckbox('cq_informed', subTables?.energElec?.cqInformed);
            checkCheckbox('cq_provided', subTables?.energElec?.cqProvided);
            checkCheckbox(
              'de_energisation_request',
              subTables?.energElec?.deEnergisationRequest,
            );
            checkCheckbox('ppe_prepared', subTables?.energElec?.ppePrepared);
            checkCheckbox(
              'absence_of_voltage',
              subTables?.energElec?.absenceOfVoltage,
            );
            checkCheckbox('stored_energy', subTables?.energElec?.storedEnergy);
            checkCheckbox('backup_power', subTables?.energElec?.backupPower);
          }

          const workingNearLive = getValue(
            'working_near_live',
            subTables?.energElec?.workingNearLive,
          );
          if (Number(workingNearLive) === 1) {
            checkCheckbox('unavoidable', subTables?.energElec?.unavoidable);
            checkCheckbox(
              'reasonably_practicable',
              subTables?.energElec?.reasonablyPracticable,
            );
            checkCheckbox(
              'work_authorised',
              subTables?.energElec?.workAuthorised,
            );
            checkCheckbox(
              'working_risk_assessment',
              subTables?.energElec?.workingRiskAssessment,
            );
            checkCheckbox(
              'working_arc_boundary',
              subTables?.energElec?.workingArcBoundary,
            );
            checkCheckbox(
              'working_barriers',
              subTables?.energElec?.workingBarriers,
            );
            checkCheckbox(
              'insulated_tools',
              subTables?.energElec?.insulatedTools,
            );
            checkCheckbox(
              'event_of_emergency',
              subTables?.energElec?.eventOfEmergency,
            );
          }
        }

        const pressurization = getValue(
          'pressurization',
          subTables?.energMech?.pressurization,
        );
        if (Number(pressurization) === 1) {
          checkCheckbox(
            'performed_approved',
            subTables?.energMech?.performedApproved,
          );
          checkCheckbox(
            'flushing_approved',
            subTables?.energMech?.flushingApproved,
          );
          const mcApproved = checkCheckbox(
            'mc_approved',
            subTables?.energMech?.mcApproved,
          );
          if (mcApproved) {
            checkRequired('mc_number_text', subTables?.energMech?.mcNumberText);
          }
          checkCheckbox(
            'visual_inspection',
            subTables?.energMech?.visualInspection,
          );
          checkCheckbox(
            'loto_plan_approved',
            subTables?.energMech?.lotoPlanApproved,
          );
          checkCheckbox(
            'follow_media_code',
            subTables?.energMech?.followMediaCode,
          );
          checkCheckbox('cq_safety_signs', subTables?.energMech?.cqSafetySigns);
        }

        const pressureTestingOfEquipment = getValue(
          'pressure_testing_of_equipment',
          subTables?.press?.pressureTestingOfEquipment,
        );
        if (Number(pressureTestingOfEquipment) === 1) {
          checkCheckbox('line_walk', subTables?.press?.lineWalk);
          checkCheckbox(
            'pressure_test_coordinated',
            subTables?.press?.pressureTestCoordinated,
          );
          checkCheckbox('pipework_mic', subTables?.press?.pipeworkMic);
          checkCheckbox('loto_plan_attached', subTables?.press?.lotoPlanAttached);
          checkCheckbox(
            'exclusion_zone_calculated',
            subTables?.press?.exclusionZoneCalculated,
          );
          const pneumaticHydrostatic = getMultiValue(
            ['pneumatic_hydrostatic', 'pnematic_hydrostatic'],
            subTables?.press?.pnematicHydrostatic,
          );
          if (
            pneumaticHydrostatic === undefined ||
            pneumaticHydrostatic === null ||
            String(pneumaticHydrostatic).trim() === ''
          ) {
            errors.push('pneumatic_hydrostatic must be checked');
          } else {
            checkRequired(
              'pressure_pneumatic',
              subTables?.press?.pressurePneumatic,
            );
          }
          const pressureOfTheTest = getValue(
            'pressure_of_the_test',
            subTables?.press?.pressureOfTheTest,
          );
          if (
            pressureOfTheTest === undefined ||
            pressureOfTheTest === null ||
            pressureOfTheTest === ''
          ) {
            errors.push('pressure_of_the_test is required');
          } else if (
            Number(pressureOfTheTest) === 1 ||
            pressureOfTheTest === '1'
          ) {
            checkRequired(
              'pressure_hydrostatic',
              subTables?.press?.pressureHydrostatic,
            );
          }
          checkCheckbox(
            'safety_valves_calibrated',
            subTables?.press?.safetyValvesCalibrated,
          );
        }
      }

      const excavationWorks = getValue(
        'excavation_works',
        subTables?.exc?.excavationWorks,
      );
      if (Number(excavationWorks) === 1) {
        checkCheckbox(
          'excavation_segregated',
          subTables?.exc?.excavationSegregated,
        );
        checkCheckbox('nn_standards', subTables?.exc?.nnStandards);
        checkCheckbox('excavation_shoring', subTables?.exc?.excavationShoring);
        checkCheckbox('danish_regulation', subTables?.exc?.danishRegulation);
        checkCheckbox(
          'safe_access_and_egress',
          subTables?.exc?.safeAccessAndEgress,
        );
        checkCheckbox('correctly_sloped', subTables?.exc?.correctlySloped);
        checkCheckbox('inspection_dates', subTables?.exc?.inspectionDates);
        checkCheckbox('marked_drawings', subTables?.exc?.markedDrawings);
        checkCheckbox(
          'underground_areas_cleared',
          subTables?.exc?.undergroundAreasCleared,
        );
      }

      const hotWork = getValue('Hot_work', subTables?.fire?.hotWork);
      if (Number(hotWork) === 1) {
        checkCheckbox(
          'tasks_in_progress_in_the_area',
          subTables?.fire?.tasksInProgressInTheArea,
        );
        checkCheckbox(
          'lighting_sufficiently',
          subTables?.fire?.lightingSufficiently,
        );
        checkCheckbox(
          'specific_risks_based_on_task',
          subTables?.fire?.specificRisksBasedOnTask,
        );
        checkCheckbox(
          'work_environment_safety_ensured',
          subTables?.fire?.workEnvironmentSafetyEnsured,
        );
        checkCheckbox(
          'course_of_action_in_emergencies',
          subTables?.fire?.courseOfActionInEmergencies,
        );
        checkCheckbox(
          'fire_watch_establish',
          subTables?.fire?.fireWatchEstablish,
        );
        checkCheckbox(
          'combustible_material',
          subTables?.fire?.combustibleMaterial,
        );
        checkCheckbox('safety_measures', subTables?.fire?.safetyMeasures);
        checkCheckbox(
          'extinguishers_and_fire_blanket',
          subTables?.fire?.extinguishersAndFireBlanket,
        );
        const weldingActivity = getMultiValue(
          ['welding_activity', 'welding_activitiy'],
          subTables?.fire?.weldingActivity,
        );
        if (
          weldingActivity === undefined ||
          weldingActivity === null ||
          String(weldingActivity).trim() === ''
        ) {
          errors.push('welding_activity must be checked');
        } else {
          checkCheckbox('heat_treatment', subTables?.fire?.heatTreatment);
          checkCheckbox(
            'air_extraction_be_established',
            subTables?.fire?.airExtractionBeEstablished,
          );
        }
      }

      const workingAtHeight = getValue(
        'working_at_height',
        subTables?.hgt?.workingAtHeight,
      );
      if (Number(workingAtHeight) === 1) {
        checkCheckbox(
          'segragated_demarkated',
          subTables?.hgt?.segragatedDemarkated,
        );
        checkCheckbox('lanyard_attachments', subTables?.hgt?.lanyardAttachments);
        checkCheckbox('rescue_plan', subTables?.hgt?.rescuePlan);
        checkCheckbox('avoid_hazards', subTables?.hgt?.avoidHazards);
        checkCheckbox('height_training', subTables?.hgt?.heightTraining);
        checkCheckbox('supervision', subTables?.hgt?.supervision);
        checkCheckbox('shock_absorbing', subTables?.hgt?.shockAbsorbing);
        checkCheckbox('height_equipments', subTables?.hgt?.heightEquipments);
        checkCheckbox('vertical_life', subTables?.hgt?.verticalLife);
        checkCheckbox('secured_falling', subTables?.hgt?.securedFalling);
        checkCheckbox('dropped_objects', subTables?.hgt?.droppedObjects);
        checkCheckbox('safe_acces', subTables?.hgt?.safeAcces);
        checkCheckbox('weather_acceptable', subTables?.hgt?.weatherAcceptable);
      }

      const usingCranesOrLifting = getValue(
        'using_cranes_or_lifting',
        subTables?.lift?.usingCranesOrLifting,
      );
      if (Number(usingCranesOrLifting) === 1) {
        checkCheckbox('appointed_person', subTables?.lift?.appointedPerson);
        const vendorSupplier = getMultiValue(
          ['vendor_supplier', 'vendor_supplies'],
          subTables?.lift?.vendorSupplies,
        );
        if (
          vendorSupplier === undefined ||
          vendorSupplier === null ||
          String(vendorSupplier).trim() === ''
        ) {
          errors.push('vendor_supplier must be checked');
        }
        checkCheckbox('lift_plan', subTables?.lift?.liftPlan);
        checkCheckbox(
          'supplied_and_inspected',
          subTables?.lift?.suppliedAndInspected,
        );
        checkCheckbox(
          'legal_required_certificates',
          subTables?.lift?.legalRequiredCertificates,
        );
        checkCheckbox('prapared_lifting', subTables?.lift?.praparedLifting);
        checkCheckbox('lifting_task_fenced', subTables?.lift?.liftingTaskFenced);
        checkCheckbox('overhead_risks', subTables?.lift?.overheadRisks);
      }

      // 4. Other fields
      checkRequiredMulti(['Tools', 'tools'], subTables?.ext?.tools);
      checkRequiredMulti(['Machinery', 'machinery'], subTables?.ext?.machinery);
      checkRequired(
        'description_of_activity',
        subTables?.ext?.descriptionOfActivity,
      );
      // work_type is only required for Commissioning permit type
      const resolvedPermitType = String(
        dto.permit_type || (existing?.permitType) || '',
      ).toLowerCase().trim();
      if (resolvedPermitType === 'commissioning') {
        checkRequired('work_type', subTables?.ext?.workType);
      }

      const workTypeVal = String(
        getValue('work_type', subTables?.ext?.workType) || '',
      )
        .toLowerCase()
        .trim();
      if (workTypeVal.includes('mechanical') || workTypeVal.includes('both')) {
        checkRequired('mechanical_works', subTables?.ext?.mechanicalWorks);
      }
      if (workTypeVal.includes('electrical') || workTypeVal.includes('both')) {
        checkRequired('electrical_works', subTables?.ext?.electricalWorks);
      }
      const otherConditions = getValue(
        'other_conditions',
        subTables?.gen?.otherConditions,
      );
      if (Number(otherConditions) === 1) {
        checkRequired(
          'other_conditions_input',
          subTables?.gen?.otherConditionsInput,
        );
      }
      checkCheckbox('lighting_begin_work', subTables?.gen?.lightingBeginWork);
      checkCheckbox('specific_risks', subTables?.gen?.specificRisks);
      checkCheckbox('environment_ensured', subTables?.gen?.environmentEnsured);
      // course_of_action must be validated for ALL permit types.
      // A value of 0 (No) is a valid selection — only throw error when completely absent.
      const courseOfAction = getMultiValue(
        ['course_of_action', 'course_of_actions'],
        subTables?.gen?.courseOfActions,
      );
      if (courseOfAction === undefined || courseOfAction === null) {
        errors.push('course_of_action must be checked');
      }
      checkRequired('other_ppe', subTables?.ppe?.otherPpe);
    }

    // --- Specific Transition Validations (Always checked for status transitions, regardless of runBaseMandatory) ---
    const permitUnder = (
      dto.permit_under !== undefined
        ? dto.permit_under
        : existing?.permitUnder || 'Construction'
    ).toLowerCase().trim();

    const permitType = (
      dto.permit_type !== undefined
        ? dto.permit_type
        : existing?.permitType || ''
    ).toLowerCase().trim();

    if (newStatus === 'pre-approved') {
      if (permitUnder === 'construction' && permitType === 'commissioning') {
        const commInitials = getSubField('CoMM_initials', subTables?.ext?.coMMInitials);
        checkRequiredSubField('CoMM_initials', commInitials);
      } else if (permitUnder === 'commissioning' && permitType === 'construction') {
        const inmInitials = getSubField('ConM_initials', subTables?.ext?.conMInitials);
        checkRequiredSubField('ConM_initials', inmInitials);
      }
    } else if (newStatus === 'approved') {
      if (permitUnder === 'construction' && permitType === 'construction') {
        const inmInitials = getSubField('ConM_initials', subTables?.ext?.conMInitials);
        checkRequiredSubField('ConM_initials', inmInitials);
      } else if (permitUnder === 'commissioning' && permitType === 'commissioning') {
        const commInitials = getSubField('CoMM_initials', subTables?.ext?.coMMInitials);
        checkRequiredSubField('CoMM_initials', commInitials);
      } else if (permitUnder === 'construction' && permitType === 'commissioning') {
        const inmInitials = getSubField('ConM_initials', subTables?.ext?.conMInitials);
        checkRequiredSubField('ConM_initials', inmInitials);
      } else if (permitUnder === 'commissioning' && permitType === 'construction') {
        const commInitials = getSubField('CoMM_initials', subTables?.ext?.coMMInitials);
        checkRequiredSubField('CoMM_initials', commInitials);
      }
    } else if (newStatus === 'rejected') {
      const rejectReason = getSubField('reject_reason', subTables?.ext?.rejectReason);
      checkRequiredSubField('reject_reason', rejectReason);
    } else if (newStatus === 'opened') {
      const inmInitials1 = getSubField('ConM_initials1', subTables?.ext?.conMInitials1);
      checkRequiredSubField('ConM_initials1', inmInitials1);

      if (currentStatus === 'approved') {
        const workingDateVal = getSubField('Working_Date', existing?.workingDate);
        if (workingDateVal) {
          const getLocalDateString = (dateInput: any): string => {
            if (!dateInput) return '';
            if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
              return dateInput;
            }
            const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
            if (isNaN(d.getTime())) return '';
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${dd}`;
          };

          const today = new Date();
          const y = today.getFullYear();
          const m = String(today.getMonth() + 1).padStart(2, '0');
          const dd = String(today.getDate()).padStart(2, '0');
          const todayStr = `${y}-${m}-${dd}`;

          const workingDateStr = getLocalDateString(workingDateVal);
          if (workingDateStr !== todayStr) {
            errors.push("Working_Date needs to match with today's date to open the permit");
          }
        }
      }
    } else if (newStatus === 'cancelled') {
      const cancelReason = getSubField('cancel_reason', subTables?.ext?.cancelReason);
      checkRequiredSubField('cancel_reason', cancelReason);
    } else if (newStatus === 'closed') {
      const closeNote = getSubField('close_note', subTables?.ext?.closeNote);
      checkRequiredSubField('close_note', closeNote);
    }

    if (errors.length > 0) {
      throw new BadRequestException(`Validation failed: ${errors.join(', ')}`);
    }
  }

  // --- CREATE BY COUNT (mirrors createbycount.php) ---
  async createByCount(dto: CreateByCountDto): Promise<any> {
    // 0. User permission validation
    if (!dto.userId) {
      throw new BadRequestException('userId is required');
    }

    const user = await this.userRepo.findOne({ where: { id: dto.userId } });

    if (!user) {
      throw new BadRequestException(`User not found for ID: ${dto.userId}`);
    }

    const userTypes = (user.userType || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const allowedUserTypes = [
      'Admin',
      'Department1',
      'Department',
      'Subcontractor',
    ];

    const hasAccess = userTypes.some((ut) => allowedUserTypes.includes(ut));

    if (!hasAccess) {
      throw new ForbiddenException('Role not allowed to perform createbycount');
    }

    // 1. Basic input validation
    if (!dto.PermitNo) {
      throw new BadRequestException('PermitNo is required');
    }

    // zone can be an array of objects ({ Zone_Id, zone }), an array of zone IDs, or a string/number
    let zoneIds: number[] = [];
    let zoneNamesFromDto: string[] = [];

    const rawZone = dto.zone;
    if (Array.isArray(rawZone)) {
      rawZone.forEach((item) => {
        if (typeof item === 'object' && item !== null) {
          const zId = Number(item.Zone_Id ?? item.zone_id ?? item.id);
          const zName = item.zone ?? item.zone_name ?? item.name;
          if (zId && !isNaN(zId)) zoneIds.push(zId);
          if (zName) zoneNamesFromDto.push(String(zName));
        } else if (typeof item === 'number' || typeof item === 'string') {
          const num = Number(item);
          if (!isNaN(num) && num > 0) zoneIds.push(num);
        }
      });
    } else if (typeof rawZone === 'string') {
      rawZone.split(',').forEach((s) => {
        const num = Number(s.trim());
        if (!isNaN(num) && num > 0) zoneIds.push(num);
      });
    } else if (typeof rawZone === 'number' && rawZone > 0) {
      zoneIds.push(rawZone);
    }

    zoneIds = [...new Set(zoneIds)];

    if (zoneIds.length === 0) {
      throw new BadRequestException('Zone not provided');
    }

    // 2. Fetch the original permit (source to copy from)
    const originalRequest = await this.requestRepo.findOne({
      where: { permitNo: dto.PermitNo, status: 1 },
    });
    if (!originalRequest) {
      throw new BadRequestException('Permit number not found');
    }

    // 3. Validate zones exist and have consistent status (lookup by IDs)
    const zoneEntities = await this.zoneRepo.findBy({ id: In(zoneIds) });
    if (!zoneEntities || zoneEntities.length === 0) {
      throw new BadRequestException('Zone not found');
    }

    const statuses = [...new Set(zoneEntities.map((z) => (z.status || '').toUpperCase().trim()))];
    if (statuses.length > 1) {
      throw new BadRequestException('Zones have different status');
    }

    const zoneStatus = statuses[0];

    // 4. Determine permit type of original
    const permitType =
      (originalRequest.permitUnder || '').trim() === ''
        ? 'Construction'
        : (originalRequest.permitUnder || '').trim();

    if (zoneStatus === 'UC' && permitType === 'Commissioning') {
      throw new BadRequestException('Permit not allowed to copy');
    }
    if (zoneStatus === 'C' && permitType === 'Construction') {
      throw new BadRequestException('Permit not allowed to copy');
    }

    // 5. Fetch all sub-table data from original request
    const originalId = originalRequest.id;
    const [
      origChem, origConf, origElec, origEnergElec, origEnergMech,
      origExc, origExt, origFire, origGen, origHgt, origLift,
      origPpe, origPress, origRamsFiles,
    ] = await Promise.all([
      this.chemicalRepo.findOne({ where: { requestId: originalId } }),
      this.confinedRepo.findOne({ where: { requestId: originalId } }),
      this.electricalRepo.findOne({ where: { requestId: originalId } }),
      this.energisingElecRepo.findOne({ where: { requestId: originalId } }),
      this.energisingMechRepo.findOne({ where: { requestId: originalId } }),
      this.excavationRepo.findOne({ where: { requestId: originalId } }),
      this.extraMiscRepo.findOne({ where: { requestId: originalId } }),
      this.fireHotworkRepo.findOne({ where: { requestId: originalId } }),
      this.generalRepo.findOne({ where: { requestId: originalId } }),
      this.heightRepo.findOne({ where: { requestId: originalId } }),
      this.liftingRepo.findOne({ where: { requestId: originalId } }),
      this.ppeRepo.findOne({ where: { requestId: originalId } }),
      this.pressureTestingRepo.findOne({ where: { requestId: originalId } }),
      this.ramsFileRepo.find({ where: { requestId: originalId, status: 1 } }),
    ]);

    // 6. Resolve loop count and start date
    const assignStartDate = dto.Assign_Start_Date || new Date().toISOString().split('T')[0];
    const [sYear, sMonth, sDay] = assignStartDate.split('-').map(Number);
    let loopCount = dto.count && dto.count > 0 ? dto.count : 1;

    if (dto.Assign_Start_Date && dto.Assign_End_Date) {
      try {
        const [eYear, eMonth, eDay] = dto.Assign_End_Date.split('-').map(Number);
        const startUTC = Date.UTC(sYear, sMonth - 1, sDay);
        const endUTC = Date.UTC(eYear, eMonth - 1, eDay);
        const diffTime = endUTC - startUTC;
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays >= 0) {
          loopCount = diffDays + 1;
        }
      } catch (e) {
        // Fallback to loopCount
      }
    }

    const createdTime = dto.createdTime ? new Date(dto.createdTime.replace(',', '')) : new Date();

    // 7. Resolve zone and zoneId safely truncated to max 250 characters
    const resolvedZoneId = zoneIds.join(',').substring(0, 250);
    const fetchedZoneNames = zoneEntities.map((z) => z.zone).filter(Boolean);
    const combinedZoneNames = zoneNamesFromDto.length > 0 ? zoneNamesFromDto.join(',') : fetchedZoneNames.join(',');
    const resolvedZone = (combinedZoneNames || originalRequest.zone || '').substring(0, 250);

    const createdIds: number[] = [];

    for (let x = 0; x < loopCount; x++) {
      // Calculate the date for this iteration using UTC to avoid DST/timezone shifts
      const baseDate = new Date(Date.UTC(sYear, sMonth - 1, sDay));
      baseDate.setUTCDate(baseDate.getUTCDate() + x);
      const iterDate = baseDate.toISOString().split('T')[0];

      // Calculate next day date for night shift
      const nextDateObj = new Date(Date.UTC(sYear, sMonth - 1, sDay));
      nextDateObj.setUTCDate(nextDateObj.getUTCDate() + x + 1);
      const nextDayDate = nextDateObj.toISOString().split('T')[0];

      // Generate a unique PermitNo for each new request
      const newPermitNo = await this.generatePermitNo();

      const nightShiftVal = dto.night_shift !== undefined
        ? String(dto.night_shift)
        : String(originalRequest.nightShift || '0');
      const isNightShift = nightShiftVal === '1' || nightShiftVal === 'true';

      const resolvedNewDate = isNightShift
        ? (dto.new_date && dto.new_date !== 'none' ? dto.new_date : nextDayDate)
        : '';

      // Build the new request by copying fields from original + overrides from DTO
      const newRequest = this.requestRepo.create({
        userId: dto.userId ?? originalRequest.userId,
        companyName: dto.Company_Name ?? originalRequest.companyName,
        permitNo: newPermitNo,
        subContractorId: dto.Sub_Contractor_Id ?? originalRequest.subContractorId,
        foreman: dto.Foreman ?? originalRequest.foreman,
        foremanPhoneNumber: dto.Foreman_Phone_Number ?? originalRequest.foremanPhoneNumber,
        activity: dto.Activity ?? originalRequest.activity,
        typeOfActivityId: dto.Type_Of_Activity_Id ?? originalRequest.typeOfActivityId,
        requestDate: new Date().toISOString().split('T')[0],
        startTime: dto.Start_Time ?? originalRequest.startTime,
        endTime: dto.End_Time ?? originalRequest.endTime,
        assignStartTime: dto.Assign_Start_Time ?? originalRequest.assignStartTime,
        assignEndTime: dto.Assign_End_Time ?? originalRequest.assignEndTime,
        assignStartDate: iterDate,
        assignEndDate: dto.Assign_End_Date ?? originalRequest.assignEndDate,
        workingDate: iterDate,
        buildingId: dto.Building_Id ?? originalRequest.buildingId,
        floorId: dto.Floor_Id ?? originalRequest.floorId,
        zoneId: resolvedZoneId,
        zone: resolvedZone,
        roomNos: dto.Room_Nos ?? originalRequest.roomNos,
        roomType: dto.Room_Type ?? originalRequest.roomType,
        requestStatus: (originalRequest.requestStatus || '').toLowerCase().trim() === 'draft' ? 'Draft' : 'Hold',
        status: 1,
        createdTime,
        siteId: dto.Site_Id ?? originalRequest.siteId ?? 5,
        permitType: originalRequest.permitType,
        permitUnder: originalRequest.permitUnder || 'Construction',
        newDate: resolvedNewDate,
        newEndTime: dto.New_End_Time ?? originalRequest.newEndTime,
        nightShift: isNightShift ? '1' : '0',
        numberOfWorkers: dto.Number_Of_Workers ?? originalRequest.numberOfWorkers,
        safetyPrecautions: originalRequest.safetyPrecautions,
      });

      const saved = await this.requestRepo.save(newRequest);
      const requestId = saved.id;
      createdIds.push(requestId);

      if (saved.requestStatus) {
        this.notificationsService.triggerNotification(
          saved.id,
          null,
          saved.requestStatus,
          saved.userId ?? 0,
        ).catch((err) => console.error('Notification error:', err));
      }

      // Copy sub-tables from original
      if (origChem) {
        const { requestId: _rid, id: _id, ...chemData } = origChem as any;
        await this.chemicalRepo.save(this.chemicalRepo.create({ ...chemData, requestId }));
      } else {
        await this.chemicalRepo.save(this.chemicalRepo.create({ requestId }));
      }

      if (origConf) {
        const { requestId: _rid, id: _id, ...confData } = origConf as any;
        await this.confinedRepo.save(this.confinedRepo.create({ ...confData, requestId }));
      } else {
        await this.confinedRepo.save(this.confinedRepo.create({ requestId }));
      }

      if (origElec) {
        const { requestId: _rid, id: _id, ...elecData } = origElec as any;
        await this.electricalRepo.save(this.electricalRepo.create({ ...elecData, requestId }));
      } else {
        await this.electricalRepo.save(this.electricalRepo.create({ requestId }));
      }

      if (origEnergElec) {
        const { requestId: _rid, id: _id, ...eelecData } = origEnergElec as any;
        await this.energisingElecRepo.save(this.energisingElecRepo.create({ ...eelecData, requestId }));
      } else {
        await this.energisingElecRepo.save(this.energisingElecRepo.create({ requestId }));
      }

      if (origEnergMech) {
        const { requestId: _rid, id: _id, ...emechData } = origEnergMech as any;
        await this.energisingMechRepo.save(this.energisingMechRepo.create({ ...emechData, requestId }));
      } else {
        await this.energisingMechRepo.save(this.energisingMechRepo.create({ requestId }));
      }

      if (origExc) {
        const { requestId: _rid, id: _id, ...excData } = origExc as any;
        await this.excavationRepo.save(this.excavationRepo.create({ ...excData, requestId }));
      } else {
        await this.excavationRepo.save(this.excavationRepo.create({ requestId }));
      }

      if (origExt) {
        const { requestId: _rid, id: _id, ...extData } = origExt as any;
        await this.extraMiscRepo.save(this.extraMiscRepo.create({
          ...extData,
          conMInitials: null,
          conMInitials1: null,
          coMMInitials: null,
          rejectReason: null,
          cancelReason: null,
          closeNote: null,
          requestId
        }));
      } else {
        await this.extraMiscRepo.save(this.extraMiscRepo.create({ requestId }));
      }

      if (origFire) {
        const { requestId: _rid, id: _id, ...fireData } = origFire as any;
        await this.fireHotworkRepo.save(this.fireHotworkRepo.create({
          ...fireData,
          hHeatSource: null,
          hWorkplaceCheck: null,
          hFireDetectors: null,
          hStartTime: null,
          hEndTime: null,
          fireImage: null,
          requestId
        }));
      } else {
        await this.fireHotworkRepo.save(this.fireHotworkRepo.create({ requestId }));
      }

      if (origGen) {
        const { requestId: _rid, id: _id, ...genData } = origGen as any;
        await this.generalRepo.save(this.generalRepo.create({ ...genData, requestId }));
      } else {
        await this.generalRepo.save(this.generalRepo.create({ requestId }));
      }

      if (origHgt) {
        const { requestId: _rid, id: _id, ...hgtData } = origHgt as any;
        await this.heightRepo.save(this.heightRepo.create({ ...hgtData, requestId }));
      } else {
        await this.heightRepo.save(this.heightRepo.create({ requestId }));
      }

      if (origLift) {
        const { requestId: _rid, id: _id, ...liftData } = origLift as any;
        await this.liftingRepo.save(this.liftingRepo.create({ ...liftData, requestId }));
      } else {
        await this.liftingRepo.save(this.liftingRepo.create({ requestId }));
      }

      if (origPpe) {
        const { requestId: _rid, id: _id, ...ppeData } = origPpe as any;
        await this.ppeRepo.save(this.ppeRepo.create({ ...ppeData, requestId }));
      } else {
        await this.ppeRepo.save(this.ppeRepo.create({ requestId }));
      }

      if (origPress) {
        const { requestId: _rid, id: _id, ...pressData } = origPress as any;
        await this.pressureTestingRepo.save(this.pressureTestingRepo.create({ ...pressData, requestId }));
      } else {
        await this.pressureTestingRepo.save(this.pressureTestingRepo.create({ requestId }));
      }

      // Create log entry for this new request
      await this.createLogs(
        requestId,
        dto.userId ?? 0,
        newRequest.requestStatus ?? 'Hold',
        createdTime,
        [],
        0,
      );

      // Copy RAMS files from original
      if (origRamsFiles && origRamsFiles.length > 0) {
        for (const file of origRamsFiles) {
          if (file.ramsFile) {
            await this.ramsFileRepo.insert({
              requestId,
              ramsFile: file.ramsFile,
              status: 1,
              createdAt: new Date(),
              userId: dto.userId ?? 0,
            });
          }
        }
      }
    }

    await this.redisCacheService.deleteByPattern('requests:*');

    return {
      status: 200,
      message: 'Request Created Successfully',
      created_ids: createdIds,
    };
  }

  // --- NEW PERMIT AND LOG DATA METHODS ---

  private getRequestDetailsQueryBuilder() {
    return this.requestRepo
      .createQueryBuilder('requests')
      .leftJoinAndMapOne('requests.chemical', RequestChemicalHazard, 'chemical', 'requests.id = chemical.request_id')
      .leftJoinAndMapOne('requests.confined', RequestConfined, 'confined', 'requests.id = confined.request_id')
      .leftJoinAndMapOne('requests.electrical', RequestElectrical, 'electrical', 'requests.id = electrical.request_id')
      .leftJoinAndMapOne('requests.energisingElectrical', RequestEnergisingElectrical, 'energisingElectrical', 'requests.id = energisingElectrical.request_id')
      .leftJoinAndMapOne('requests.energisingMechanical', RequestEnergisingMechanical, 'energisingMechanical', 'requests.id = energisingMechanical.request_id')
      .leftJoinAndMapOne('requests.excavation', RequestExcavation, 'excavation', 'requests.id = excavation.request_id')
      .leftJoinAndMapOne('requests.extraMisc', RequestExtraMisc, 'extraMisc', 'requests.id = extraMisc.request_id')
      .leftJoinAndMapOne('requests.fireHotwork', RequestFireHotwork, 'fireHotwork', 'requests.id = fireHotwork.request_id')
      .leftJoinAndMapOne('requests.general', RequestGeneral, 'general', 'requests.id = general.request_id')
      .leftJoinAndMapOne('requests.height', RequestHeight, 'height', 'requests.id = height.request_id')
      .leftJoinAndMapOne('requests.lifting', RequestLifting, 'lifting', 'requests.id = lifting.request_id')
      .leftJoinAndMapOne('requests.ppe', RequestPpe, 'ppe', 'requests.id = ppe.request_id')
      .leftJoinAndMapOne('requests.pressureTesting', RequestPressureTesting, 'pressureTesting', 'requests.id = pressureTesting.request_id')
      .leftJoinAndMapOne('requests.building', Building, 'building', 'requests.Building_Id = building.build_id')
      .leftJoinAndMapOne('requests.floor', Floor, 'floor', 'requests.Floor_Id = floor.fl_id')
      .leftJoinAndMapOne('requests.zone', Zone, 'zone', 'requests.Zone_Id = zone.id')
      .leftJoinAndMapOne('requests.subcontractor', Subcontractor, 'subcontractor', 'requests.Sub_Contractor_Id = subcontractor.id')
      .leftJoinAndMapOne('requests.activityRelation', Activity, 'activityRelation', 'requests.Type_Of_Activity_Id = activityRelation.id')
      .leftJoinAndMapOne('requests.user', User, 'user', 'requests.userId = user.id');
  }

  async getRequestDetailsByPermitNo(permitNo: string): Promise<any> {
    const qb = this.getRequestDetailsQueryBuilder()
      .where('requests.permitNo = :permitNo AND requests.status = 1', { permitNo });
    return this.getRequestDetailsFromQueryBuilder(qb);
  }

  async getRequestDetailsById(id: number): Promise<any> {
    const qb = this.getRequestDetailsQueryBuilder()
      .where('requests.id = :id AND requests.status = 1', { id });
    return this.getRequestDetailsFromQueryBuilder(qb);
  }

  private async getRequestDetailsFromQueryBuilder(qb: any): Promise<any> {
    const req = await qb.getOne();
    if (!req) return null;

    const resolvedRooms = await this.resolveRoomNames(req.roomNos);

    // Resolve all zone names string for single or multi-zones
    let resolvedZoneNames = '';
    if (req.zoneId) {
      const ids = String(req.zoneId)
        .split(',')
        .map((id) => Number(id.trim()))
        .filter((id) => !isNaN(id) && id > 0);
      if (ids.length > 0) {
        try {
          const zoneEntities = await this.zoneRepo.findBy({ id: In(ids) });
          if (zoneEntities && zoneEntities.length > 0) {
            resolvedZoneNames = zoneEntities.map((z) => z.zone).filter(Boolean).join(', ');
          }
        } catch (e) {
          // ignore lookup error
        }
      }
    }
    if (!resolvedZoneNames && typeof req.zone === 'string') {
      resolvedZoneNames = req.zone;
    }
    if (!resolvedZoneNames && (req as any).zone?.zone) {
      resolvedZoneNames = (req as any).zone.zone;
    }

    const flatObj: any = {
      id: req.id,
      userId: req.userId || '',
      created_by_user: (req as any).user?.username || '',
      Company_Name: req.companyName || '',
      PermitNo: req.permitNo || '',
      Sub_Contractor_Id: req.subContractorId || '',
      subContractorName: (req as any).subcontractor?.subContractorName || '',
      Foreman: req.foreman || '',
      Foreman_Phone_Number: req.foremanPhoneNumber || '',
      Activity: req.activity || '',
      activityName: (req as any).activityRelation?.activityName || '',
      Type_Of_Activity_Id: req.typeOfActivityId || '',
      Request_Date: req.requestDate || '',
      Working_Date: req.workingDate || '',
      Start_Time: req.startTime || '',
      End_Time: req.endTime || '',
      Assign_Start_Time: req.assignStartTime || '',
      Assign_End_Time: req.assignEndTime || '',
      Assign_Start_Date: req.assignStartDate || '',
      Assign_End_Date: req.assignEndDate || '',
      Building_Id: req.buildingId || '',
      building_name: (req as any).building?.building_name || '',
      Floor_Id: req.floorId || '',
      floor_name: (req as any).floor?.floor_name || '',
      Plans_Id: req.plansId || '',
      Zone_Id: req.zoneId || '',
      zone_name: resolvedZoneNames || '',
      zone: resolvedZoneNames || '',
      Room_Nos: resolvedRooms || '',
      room_names: resolvedRooms,
      Room_Type: req.roomType || '',
      Number_Of_Workers: req.numberOfWorkers || '',
      Badge_Numbers: req.badgeNumbers || '',
      teamId: req.teamId || '',
      notes: req.notes || '',
      Request_status: req.requestStatus || '',
      status: req.status,
      createdTime: req.createdTime || '',
      Site_Id: req.siteId,
      permit_type: req.permitType || 'Construction',
      permit_under: req.permitUnder || 'Construction',
      new_date: req.newDate || '',
      new_end_time: req.newEndTime || '',
      night_shift: req.nightShift || '',
      Safety_Precautions: req.safetyPrecautions || '',
    };

    const mergeSub = (sub: any, repo: any) => {
      if (!sub) return;
      for (const column of repo.metadata.columns) {
        if (column.propertyName !== 'requestId') {
          let val = sub[column.propertyName];
          if (val === undefined) {
            val = sub[column.databaseName];
          }
          const finalVal = val !== undefined && val !== null ? val : '';
          flatObj[column.databaseName] = finalVal;
          flatObj[column.propertyName] = finalVal;
        }
      }
    };

    mergeSub((req as any).chemical, this.chemicalRepo);
    mergeSub((req as any).confined, this.confinedRepo);
    mergeSub((req as any).electrical, this.electricalRepo);
    mergeSub((req as any).energisingElectrical, this.energisingElecRepo);
    mergeSub((req as any).energisingMechanical, this.energisingMechRepo);
    mergeSub((req as any).excavation, this.excavationRepo);
    mergeSub((req as any).extraMisc, this.extraMiscRepo);
    mergeSub((req as any).fireHotwork, this.fireHotworkRepo);
    mergeSub((req as any).general, this.generalRepo);
    mergeSub((req as any).height, this.heightRepo);
    mergeSub((req as any).lifting, this.liftingRepo);
    mergeSub((req as any).ppe, this.ppeRepo);
    mergeSub((req as any).pressureTesting, this.pressureTestingRepo);

    if (flatObj.course_of_actions !== undefined) {
      flatObj.course_of_action = flatObj.course_of_actions;
    }
    if (flatObj.course_of_action !== undefined) {
      flatObj.course_of_actions = flatObj.course_of_action;
    }
    if (flatObj.hazardous_substances !== undefined) {
      flatObj.hazardaus_substances = flatObj.hazardous_substances;
    }
    if (flatObj.hazardaus_substances !== undefined) {
      flatObj.hazardous_substances = flatObj.hazardaus_substances;
    }
    if (flatObj.vendor_supplies !== undefined) {
      flatObj.vendor_supplier = flatObj.vendor_supplies;
    }
    if (flatObj.vendor_supplier !== undefined) {
      flatObj.vendor_supplies = flatObj.vendor_supplier;
    }
    if (flatObj.isolating_responsible !== undefined) {
      flatObj.isolating_resposible = flatObj.isolating_responsible;
    }
    if (flatObj.isolating_resposible !== undefined) {
      flatObj.isolating_responsible = flatObj.isolating_resposible;
    }
    if (flatObj.pnematic_hydrostatic !== undefined) {
      flatObj.pneumatic_hydrostatic = flatObj.pnematic_hydrostatic;
    }
    if (flatObj.pneumatic_hydrostatic !== undefined) {
      flatObj.pnematic_hydrostatic = flatObj.pneumatic_hydrostatic;
    }
    if (flatObj.specific_risks_based_on_task !== undefined) {
      flatObj.spesific_risks_based_on_task = flatObj.specific_risks_based_on_task;
    }
    if (flatObj.spesific_risks_based_on_task !== undefined) {
      flatObj.specific_risks_based_on_task = flatObj.spesific_risks_based_on_task;
    }

    // Fetch Opened (check-in) log
    const checkInLog = await this.logRepo
      .createQueryBuilder('log')
      .leftJoinAndMapOne('log.user', User, 'user', 'log.userId = user.id')
      .where('log.requestId = :requestId AND log.requestType = :type', { requestId: req.id, type: 'Opened' })
      .getOne();

    if (checkInLog) {
      flatObj.check_in_time = checkInLog.createdTime;
      flatObj.check_in_user = (checkInLog as any).user?.username || '';
    }

    // Fetch Closed (check-out) log
    const checkOutLog = await this.logRepo
      .createQueryBuilder('log')
      .leftJoinAndMapOne('log.user', User, 'user', 'log.userId = user.id')
      .where('log.requestId = :requestId AND log.requestType = :type', { requestId: req.id, type: 'Closed' })
      .getOne();

    if (checkOutLog) {
      flatObj.check_out_time = checkOutLog.createdTime;
      flatObj.check_out_user = (checkOutLog as any).user?.username || '';
    }

    // Fetch log records for status tracking
    flatObj.logs = await this.logRepo
      .createQueryBuilder('log')
      .leftJoinAndMapOne('log.user', User, 'user', 'log.userId = user.id')
      .where('log.requestId = :requestId', { requestId: req.id })
      .orderBy('log.id', 'ASC')
      .getMany();

    // Fetch attached files & notes
    flatObj.files = await this.ramsFileRepo.find({
      where: { requestId: req.id, status: 1 },
    });
    flatObj.note = await this.noteRepo.find({
      where: { requestId: req.id },
      order: { createdTime: 'DESC' },
    });

    // Fetch upload images
    flatObj.images = await this.uploadImageRepo.find({
      where: { requestId: req.id },
    });

    // Resolve Safety_Precautions
    let resolvedPrecautions: string[] = [];
    if (flatObj.Safety_Precautions) {
      const ids = flatObj.Safety_Precautions.split(',')
        .map((id) => parseInt(id.trim(), 10))
        .filter((id) => !isNaN(id));
      if (ids.length > 0) {
        const items = await this.precautionRepo.find({
          where: { id: In(ids) },
        });
        resolvedPrecautions = items.map((item) => item.precaution);
      }
    }
    flatObj.resolvedPrecautions = resolvedPrecautions;

    // Resolve mechanical_works
    let resolvedMechanicalWorks: string[] = [];
    if (flatObj.mechanical_works) {
      const ids = flatObj.mechanical_works.split(',')
        .map((id) => parseInt(id.trim(), 10))
        .filter((id) => !isNaN(id));
      if (ids.length > 0) {
        const items = await this.mechanicalWorkRepo.find({
          where: { id: In(ids) },
        });
        resolvedMechanicalWorks = items.map((item) => item.mechanical_works);
      }
    }
    flatObj.resolvedMechanicalWorks = resolvedMechanicalWorks;

    // Resolve electrical_works
    let resolvedPanelNumbers: string[] = [];
    let resolvedSystemNumbers: string[] = [];
    if (flatObj.electrical_works) {
      const ids = flatObj.electrical_works.split(',')
        .map((id) => parseInt(id.trim(), 10))
        .filter((id) => !isNaN(id));
      if (ids.length > 0) {
        const items = await this.electricalWorkRepo.find({
          where: { id: In(ids) },
        });
        resolvedPanelNumbers = items
          .filter((item) => item.module === 'Panel Numbers')
          .map((item) => item.electrical_works);
        resolvedSystemNumbers = items
          .filter((item) => item.module === 'System Numbers')
          .map((item) => item.electrical_works);
      }
    }
    flatObj.resolvedPanelNumbers = resolvedPanelNumbers;
    flatObj.resolvedSystemNumbers = resolvedSystemNumbers;

    if (flatObj.cancel_reason === 'Permit not opened so system cancelled automatically') {
      flatObj.Request_status = 'Auto-Cancelled';
    }

    return flatObj;
  }

  async getLogsDetailsByPermitNo(permitNo: string): Promise<any> {
    const request = await this.requestRepo.findOne({
      where: { permitNo, status: 1 },
    });
    if (!request) return null;

    const logs = await this.logRepo
      .createQueryBuilder('log')
      .leftJoinAndMapOne('log.user', User, 'user', 'log.userId = user.id')
      .leftJoinAndMapOne('log.request', RequestEntity, 'request', 'log.requestId = request.id')
      .leftJoinAndMapOne('request.subcontractor', Subcontractor, 'subcontractor', 'request.Sub_Contractor_Id = subcontractor.id')
      .where('log.requestId = :requestId', { requestId: request.id })
      .orderBy('log.id', 'ASC')
      .getMany();

    const logsWithData: any[] = [];
    for (const log of logs) {
      const changes = await this.logDataRepo.find({
        where: { logId: log.id },
        order: { createdTime: 'ASC' },
      });
      logsWithData.push({
        ...log,
        changes,
      });
    }

    const images = await this.uploadImageRepo
      .createQueryBuilder('ui')
      .leftJoinAndMapOne('ui.user', User, 'user', 'ui.userId = user.id')
      .where('ui.requestId = :requestId', { requestId: request.id })
      .getMany();

    return {
      permitNo: request.permitNo,
      request,
      logs: logsWithData,
      images,
    };
  }

  // ── Executive Dashboard APIs ──
  // ── Executive Dashboard APIs ──
  async getDashboardOverview(filterPayload?: any) {
    let rawBuilding = typeof filterPayload === 'string' ? filterPayload : (filterPayload?.building || filterPayload?.buildingId);
    let buildingIdVal = typeof filterPayload === 'object' ? (filterPayload?.buildingId || filterPayload?.building) : filterPayload;
    let bNum = Number(buildingIdVal);

    // status = 1 means active; status = 0 means soft-deleted — excluded by WHERE below
    const query = this.requestRepo.createQueryBuilder('req')
      .leftJoin('request_extra_misc', 'rem', 'rem.request_id = req.id')
      .addSelect('rem.cancel_reason', 'rem_cancelReason')
      .where('req.status = :st', { st: 1 });

    const fromDate = filterPayload?.fromDate;
    const toDate = filterPayload?.toDate;

    if (fromDate && fromDate.trim() !== '') {
      query.andWhere('req.Working_Date >= :fromDate', { fromDate });
    }
    if (toDate && toDate.trim() !== '') {
      query.andWhere('req.Working_Date <= :toDate', { toDate });
    }

    if (rawBuilding && String(rawBuilding).trim() !== '' && String(rawBuilding).toLowerCase() !== 'all') {
      if (!isNaN(bNum) && bNum > 0) {
        query.andWhere(
          '(req.buildingId = :bId OR req.roomType LIKE :bNameStr)',
          { bId: bNum, bNameStr: `%${rawBuilding}%` },
        );
      } else {
        query.andWhere(
          '(req.buildingId IN (SELECT b.build_id FROM buildings b WHERE b.building_name LIKE :bName) OR req.roomType LIKE :bNameStr)',
          { bName: `%${rawBuilding}%`, bNameStr: `%${rawBuilding}%` },
        );
      }
    }

    const rawResults = await query.getRawAndEntities();
    const allRequests = rawResults.entities.map((e, i) => ({
      ...e,
      _cancelReason: rawResults.raw[i]?.rem_cancelReason ?? null,
    }));

    const allSubcontractors = await this.subcontractorRepo.find();

    const subMap = new Map<number, Subcontractor>();
    allSubcontractors.forEach((s) => subMap.set(s.id, s));

    const total = allRequests.length;
    let opened = 0;
    let approved = 0;
    let hold = 0;
    let rejected = 0;
    let draft = 0;
    let autoCancel = 0;
    let cancelled = 0;
    let closed = 0;
    let preApproved = 0;
    let unknown = 0;

    // The exact cancel_reason string the system writes when auto-cancelling
    const AUTO_CANCEL_MSG = 'Permit not opened so system cancelled automatically';

    // Helper — normalise the status string from any DB column variation
    const normaliseStatus = (r: any): string =>
      (r.Request_status || r.requestStatus || '').toString().toLowerCase().trim();

    const classifyStatus = (st: string, cancelReason?: string | null) => {
      if (st === 'opened' || st === 'open' || st === 'pending') opened++;
      else if (st === 'pre-approved' || st === 'preapproved' || st === 'pre approved') preApproved++;
      else if (st === 'approved') approved++;
      else if (st === 'hold' || st === 'onhold' || st === 'on hold' || st === 'on-hold') hold++;
      else if (st === 'rejected' || st === 'reject') rejected++;
      else if (st === 'draft') draft++;
      else if (st === 'closed' || st === 'close') closed++;
      else if (st === 'cancelled' || st === 'cancel') {
        // Split by cancel_reason: system auto-cancel vs manual cancel
        if (cancelReason && cancelReason.trim() === AUTO_CANCEL_MSG) autoCancel++;
        else cancelled++;
      }
      else if (
        st === 'auto-cancelled' || st === 'autocancelled' || st === 'autocanceled' || st === 'auto cancel'
      ) autoCancel++;
      else unknown++; // do NOT fall back into opened
    };

    const companyStats = new Map<string, { name: string; code: string; permits: number; rooms: Set<string>; color: string }>();
    const palette = ['#e11d48', '#4b5563', '#15803d', '#b91c1c', '#be123c', '#0369a1', '#6b7280', '#d97706', '#991b1b', '#1e3a8a', '#0284c7', '#10b981', '#78350f', '#ea580c'];
    let colorIdx = 0;

    const roomCompanyMap = new Map<string, Set<string>>();

    allRequests.forEach((req) => {
      const st = normaliseStatus(req);
      classifyStatus(st, (req as any)._cancelReason);

      let compName = (req as any).Company_Name || req.companyName;
      const subId = (req as any).Sub_Contractor_Id || req.subContractorId;
      if (subId && subMap.has(Number(subId))) {
        compName = subMap.get(Number(subId))?.subContractorName || compName;
      }
      if (!compName) compName = 'Unknown';

      let code = compName.split(' ').map((w: string) => w[0]).join('').substring(0, 3).toUpperCase();
      if (!code) code = 'UNK';

      if (!companyStats.has(compName)) {
        companyStats.set(compName, {
          name: compName,
          code,
          permits: 0,
          rooms: new Set<string>(),
          color: palette[colorIdx % palette.length],
        });
        colorIdx++;
      }

      const compData = companyStats.get(compName)!;
      compData.permits++;

      const roomKey = (req as any).Room_Nos || req.roomNos || req.zone || 'General Area';
      if (roomKey) {
        compData.rooms.add(roomKey);
        if (!roomCompanyMap.has(roomKey)) {
          roomCompanyMap.set(roomKey, new Set<string>());
        }
        roomCompanyMap.get(roomKey)!.add(compName);
      }
    });

    let clashes = 0;
    roomCompanyMap.forEach((companies) => {
      if (companies.size > 1) clashes++;
    });

    const overviewCompanies = Array.from(companyStats.values())
      .filter((c) => c.permits > 0)
      .map((c) => {
        let companyClashes = 0;
        c.rooms.forEach((rKey) => {
          if ((roomCompanyMap.get(rKey)?.size || 0) > 1) {
            companyClashes++;
          }
        });
        return {
          name: c.name,
          code: c.code,
          permits: c.permits,
          rooms: c.rooms.size,
          clashes: companyClashes,
          color: c.color,
        };
      });

    const allFloors = await this.floorRepo.find();
    const allBuildings = await this.buildingRepo.find();
    const allRooms = await this.roomRepo.find();

    let targetBuildingId: number | null = !isNaN(bNum) && bNum > 0 ? bNum : null;
    if (!targetBuildingId && rawBuilding && String(rawBuilding).trim() !== '' && String(rawBuilding).toLowerCase() !== 'all') {
      const bObj = allBuildings.find(
        (b) => b.building_name.toLowerCase().trim().includes(String(rawBuilding).toLowerCase().trim())
      );
      if (bObj) {
        targetBuildingId = bObj.build_id;
      }
    }

    let assignedFloors: Floor[] = [];
    if (targetBuildingId) {
      assignedFloors = allFloors.filter((f) => Number(f.build_id) === Number(targetBuildingId));
    } else {
      assignedFloors = allFloors;
    }

    const floorStatsMap = new Map<string, {
      id: number | null;
      name: string;
      permits: number;
      roomsSet: Set<string>;
    }>();

    assignedFloors.forEach((fl) => {
      const normName = fl.floor_name.trim();
      floorStatsMap.set(normName.toLowerCase(), {
        id: fl.fl_id,
        name: normName,
        permits: 0,
        roomsSet: new Set<string>(),
      });
    });

    const resolveReqFloorName = (req: any): string | null => {
      const fId = Number((req as any).Floor_Id || req.floorId);
      if (!isNaN(fId) && fId > 0) {
        const matched = allFloors.find((f) => Number(f.fl_id) === fId);
        if (matched) return matched.floor_name.trim();
      }
      const rawRoomNos = (req as any).Room_Nos || req.roomNos || '';
      if (rawRoomNos) {
        const roomParts = String(rawRoomNos).split(',').map((s) => Number(s.trim())).filter((n) => !isNaN(n) && n > 0);
        for (const rId of roomParts) {
          const roomObj = allRooms.find((r) => Number(r.room_id) === rId);
          if (roomObj && roomObj.fl_id) {
            const matched = allFloors.find((f) => Number(f.fl_id) === Number(roomObj.fl_id));
            if (matched) return matched.floor_name.trim();
          }
        }
      }
      return null;
    };

    allRequests.forEach((req) => {
      const fName = resolveReqFloorName(req);
      if (fName) {
        const key = fName.toLowerCase();
        if (!floorStatsMap.has(key)) {
          floorStatsMap.set(key, {
            id: null,
            name: fName,
            permits: 0,
            roomsSet: new Set<string>(),
          });
        }
        const fStats = floorStatsMap.get(key)!;
        fStats.permits += 1;

        const roomKey = (req as any).Room_Nos || req.roomNos || req.zone || 'General Area';
        if (roomKey) fStats.roomsSet.add(roomKey);
      }
    });

    const floors = Array.from(floorStatsMap.values()).map((f) => {
      let status = 'gray';
      if (f.permits > 5) status = 'purple';
      else if (f.permits > 0) status = 'blue';

      let dbRoomCount = 0;
      if (f.id !== null) {
        dbRoomCount = allRooms.filter((r) => Number(r.fl_id) === Number(f.id)).length;
      }

      return {
        id: f.id,
        name: f.name,
        permits: f.permits,
        rooms: dbRoomCount > 0 ? dbRoomCount : f.roomsSet.size,
        status,
      };
    });

    return {
      metrics: {
        total,
        opened,
        preApproved,
        approved,
        hold,
        rejected,
        draft,
        cancelled,
        closed,
        autoCancel,
        unknown,
        activeRooms: roomCompanyMap.size,
        activeCompanies: overviewCompanies.length,
        clashes,
      },
      overviewCompanies,
      floors,
    };
  }

  async getDashboardBuilding(filterPayload?: any, floorNameParam?: string) {
    let rawBuilding = typeof filterPayload === 'string' ? filterPayload : (filterPayload?.building || filterPayload?.buildingId);
    let floorName = typeof filterPayload === 'string' ? floorNameParam : filterPayload?.floor || filterPayload?.floorId;
    let roomName = typeof filterPayload === 'object' ? (filterPayload?.room || filterPayload?.rooms) : undefined;
    let buildingIdVal = typeof filterPayload === 'object' ? (filterPayload?.buildingId || filterPayload?.building) : filterPayload;
    let bNum = Number(buildingIdVal);

    // status = 1 means active; status = 0 means soft-deleted — excluded by WHERE below
    const query = this.requestRepo.createQueryBuilder('req')
      .leftJoin('request_extra_misc', 'rem', 'rem.request_id = req.id')
      .addSelect('rem.cancel_reason', 'rem_cancelReason')
      .where('req.status = :st', { st: 1 });

    const fromDate = filterPayload?.fromDate;
    const toDate = filterPayload?.toDate;

    if (fromDate && fromDate.trim() !== '') {
      query.andWhere('req.Working_Date >= :fromDate', { fromDate });
    }
    if (toDate && toDate.trim() !== '') {
      query.andWhere('req.Working_Date <= :toDate', { toDate });
    }

    if (rawBuilding && String(rawBuilding).trim() !== '' && String(rawBuilding).toLowerCase() !== 'all') {
      if (!isNaN(bNum) && bNum > 0) {
        query.andWhere(
          '(req.buildingId = :bId OR req.roomType LIKE :bNameStr)',
          { bId: bNum, bNameStr: `%${rawBuilding}%` },
        );
      } else {
        query.andWhere(
          '(req.buildingId IN (SELECT b.build_id FROM buildings b WHERE b.building_name LIKE :bName) OR req.roomType LIKE :bNameStr)',
          { bName: `%${rawBuilding}%`, bNameStr: `%${rawBuilding}%` },
        );
      }
    }

    if (floorName && String(floorName).trim() !== '' && String(floorName).toLowerCase() !== 'overview') {
      const fNum = Number(floorName);
      if (!isNaN(fNum) && fNum > 0) {
        query.andWhere(
          '(req.floorId = :fId OR req.roomType LIKE :fNameStr)',
          { fId: fNum, fNameStr: `%${floorName}%` },
        );
      } else {
        query.andWhere(
          '(req.floorId IN (SELECT f.fl_id FROM floors f WHERE f.floor_name LIKE :fName) OR req.roomType LIKE :fNameStr)',
          { fName: `%${floorName}%`, fNameStr: `%${floorName}%` },
        );
      }
    }

    if (roomName && roomName.trim() !== '') {
      query.andWhere(
        '(req.roomNos LIKE :rName OR req.zone LIKE :rName)',
        { rName: `%${roomName}%` },
      );
    }

    const rawBuildingResults = await query.getRawAndEntities();
    const allRequests = rawBuildingResults.entities.map((e, i) => ({
      ...e,
      _cancelReason: rawBuildingResults.raw[i]?.rem_cancelReason ?? null,
    }));

    const allSubcontractors = await this.subcontractorRepo.find();
    const allRooms = await this.roomRepo.find();
    const allZones = await this.zoneRepo.find();
    const allFloors = await this.floorRepo.find();

    const roomLookup = new Map<number, { roomName: string; zoneName: string }>();
    const zoneLookup = new Map<number, string>();
    allZones.forEach((z) => zoneLookup.set(z.id, z.zone));

    allRooms.forEach((r) => {
      const zName = r.zone_id && zoneLookup.has(r.zone_id) ? zoneLookup.get(r.zone_id)! : '';
      roomLookup.set(r.room_id, {
        roomName: r.room_name,
        zoneName: zName,
      });
    });

    const getIndividualRoomDisplayNames = (req: any): string[] => {
      const rawRoomNos = (req as any).Room_Nos || req.roomNos || '';
      const rawZoneName = (req as any).zone_name || (req as any).zone?.zone || (typeof req.zone === 'string' ? req.zone : '') || '';

      if (rawRoomNos) {
        const parts = String(rawRoomNos).split(',').map((s) => s.trim()).filter(Boolean);
        const resolvedNames: string[] = [];

        parts.forEach((p) => {
          const rId = Number(p);
          if (!isNaN(rId) && roomLookup.has(rId)) {
            const rInfo = roomLookup.get(rId)!;
            const prefix = rInfo.zoneName ? `${rInfo.zoneName} - ` : (rawZoneName ? `${rawZoneName} - ` : '');
            resolvedNames.push(`${prefix}${rInfo.roomName}`);
          } else {
            const prefix = rawZoneName ? `${rawZoneName} - ` : '';
            resolvedNames.push(`${prefix}${p}`);
          }
        });

        if (resolvedNames.length > 0) {
          return resolvedNames;
        }
      }

      if (rawZoneName && rawZoneName !== 'ZONE 1') {
        return [rawZoneName];
      }

      return [(req as any).room_names || 'General Area'];
    };

    const subMap = new Map<number, Subcontractor>();
    const normSubMap = new Map<string, Subcontractor>();
    allSubcontractors.forEach((s) => {
      subMap.set(s.id, s);
      if (s.subContractorName) {
        normSubMap.set(s.subContractorName.trim().toLowerCase(), s);
      }
    });

    const getCanonicalCompany = (req: any): { name: string; code: string; logo?: string } => {
      const subId = (req as any).Sub_Contractor_Id || req.subContractorId;
      let subObj: Subcontractor | undefined;

      if (subId && subMap.has(Number(subId))) {
        subObj = subMap.get(Number(subId));
      }

      if (!subObj) {
        const rawName = ((req as any).Company_Name || req.companyName || '').toString().trim();
        if (rawName && normSubMap.has(rawName.toLowerCase())) {
          subObj = normSubMap.get(rawName.toLowerCase());
        }
      }

      if (subObj) {
        const cleanName = (subObj.subContractorName || '').trim();
        let code = cleanName.split(' ').map((w: string) => w[0]).join('').substring(0, 3).toUpperCase();
        if (!code) code = 'UNK';
        return {
          name: cleanName,
          code,
          logo: subObj.logo || undefined,
        };
      }

      const rawComp = ((req as any).Company_Name || req.companyName || 'Unknown').toString().trim();
      const cleanName = rawComp || 'Unknown';
      let code = cleanName.split(' ').map((w: string) => w[0]).join('').substring(0, 3).toUpperCase();
      if (!code) code = 'UNK';
      return {
        name: cleanName,
        code,
        logo: undefined,
      };
    };

    const getStatus = (r: any) => (r.Request_status || r.requestStatus || '').toString().toLowerCase().trim();
    const getPermitType = (r: any) => (r.permit_type || r.permitType || '').toString().toLowerCase().trim();
    const getCombinedActivity = (r: any) => {
      const act = (r.Activity || r.activity || r.activityName || '').toString().toLowerCase();
      const saf = (r.Safety_Precautions || r.safetyPrecautions || '').toString().toLowerCase();
      const desc = (r.description_of_activity || r.descriptionOfActivity || '').toString().toLowerCase();
      return `${act} ${saf} ${desc}`;
    };

    const isHW = (r: any, comb: string) => Number(r.Hot_work) === 1 || Number(r.hot_work) === 1 || comb.includes('hot work') || comb.includes('fire');
    const isElec = (r: any, comb: string) => Number(r.working_on_electrical_system) === 1 || comb.includes('electrical') || comb.includes('voltage');
    const isHaz = (r: any, comb: string) => Number(r.working_hazardious_substen) === 1 || Number(r.hazardous_substances) === 1 || comb.includes('chemical') || comb.includes('substance') || comb.includes('hazard');
    const isHeight = (r: any, comb: string) => Number(r.working_at_height) === 1 || comb.includes('height') || comb.includes('ladder') || comb.includes('scaffold');
    const isConf = (r: any, comb: string) => Number(r.working_confined_spaces) === 1 || comb.includes('confined');
    const isExc = (r: any, comb: string) => Number(r.excavation_works) === 1 || comb.includes('excavation') || comb.includes('digging');
    const isCrane = (r: any, comb: string) => Number(r.using_cranes_or_lifting) === 1 || comb.includes('crane') || comb.includes('lifting');
    const isPress = (r: any, comb: string) => Number(r.pressure_testing_of_equipment) === 1 || comb.includes('pressure') || comb.includes('testing');

    const filteredRequests = allRequests.filter((req) => {
      if (typeof filterPayload !== 'object' || !filterPayload) return true;

      if (filterPayload.permitTypes) {
        const pType = getPermitType(req);
        const isComm = pType.includes('commissioning');
        const isConst = !isComm;
        if (isComm && filterPayload.permitTypes.commissioning === false) return false;
        if (isConst && filterPayload.permitTypes.construction === false) return false;
      }

      if (filterPayload.permitStatuses) {
        const st = getStatus(req);
        const isOpen = st === 'opened' || st === 'open';
        const isAppr = st === 'approved' || st === 'pre-approved';
        const isRej = st === 'rejected' || st === 'reject';
        const isDraft = st === 'draft';
        const isAuto = st.includes('cancel');

        if (isOpen && filterPayload.permitStatuses.opened === false) return false;
        if (isAppr && filterPayload.permitStatuses.approved === false) return false;
        if (isRej && filterPayload.permitStatuses.rejected === false) return false;
        if (isDraft && filterPayload.permitStatuses.draft === false) return false;
        if (isAuto && filterPayload.permitStatuses.autoCancel === false) return false;
      }

      if (filterPayload.selectedCompanies && Array.isArray(filterPayload.selectedCompanies) && filterPayload.selectedCompanies.length > 0) {
        const canonical = getCanonicalCompany(req);
        const matches = filterPayload.selectedCompanies.some((sc: string) => {
          const scClean = String(sc).trim().toLowerCase();
          const nameClean = canonical.name.toLowerCase();
          const codeClean = canonical.code.toLowerCase();
          return nameClean === scClean || codeClean === scClean || nameClean.includes(scClean) || scClean.includes(nameClean);
        });
        if (!matches) return false;
      }

      if (filterPayload.activityRiskTypes) {
        const combined = getCombinedActivity(req);
        const isHotWork = isHW(req, combined);
        const isElectrical = isElec(req, combined);
        const isHazardous = isHaz(req, combined);
        const isWorkHeight = isHeight(req, combined);
        const isConfined = isConf(req, combined);
        const isExcavation = isExc(req, combined);
        const isCranes = isCrane(req, combined);
        const isPressure = isPress(req, combined);

        const isAnyHra = isHotWork || isElectrical || isHazardous || isWorkHeight || isConfined || isExcavation || isCranes || isPressure;

        if (isAnyHra) {
          if (filterPayload.activityRiskTypes.hra === false) return false;
          if (isHotWork && filterPayload.activityRiskTypes.hotWork === false) return false;
          if (isElectrical && filterPayload.activityRiskTypes.electrical === false) return false;
          if (isHazardous && filterPayload.activityRiskTypes.hazardousSubstances === false) return false;
          if (isWorkHeight && filterPayload.activityRiskTypes.workingAtHeight === false) return false;
          if (isConfined && filterPayload.activityRiskTypes.confinedSpaces === false) return false;
          if (isExcavation && filterPayload.activityRiskTypes.excavation === false) return false;
          if (isCranes && filterPayload.activityRiskTypes.cranesLifting === false) return false;
          if (isPressure && filterPayload.activityRiskTypes.pressureTesting === false) return false;
        } else {
          if (filterPayload.activityRiskTypes.nonHra === false) return false;
        }
      }

      return true;
    });

    const companyMap = new Map<string, { name: string; code: string; count: number; color: string; logo?: string }>();
    const palette = ['#e11d48', '#4b5563', '#15803d', '#b91c1c', '#be123c', '#0369a1', '#6b7280', '#d97706', '#991b1b', '#1e3a8a', '#0284c7', '#10b981', '#78350f', '#ea580c'];
    let colorIdx = 0;

    allSubcontractors.forEach((s) => {
      const cName = (s.subContractorName || '').trim();
      if (cName && !companyMap.has(cName)) {
        let code = cName.split(' ').map((w: string) => w[0]).join('').substring(0, 3).toUpperCase();
        if (!code) code = 'UNK';
        companyMap.set(cName, {
          name: cName,
          code,
          count: 0,
          color: palette[colorIdx % palette.length],
          logo: s.logo || undefined,
        });
        colorIdx++;
      }
    });

    allRequests.forEach((req) => {
      const canonical = getCanonicalCompany(req);
      if (canonical.name) {
        if (!companyMap.has(canonical.name)) {
          companyMap.set(canonical.name, {
            name: canonical.name,
            code: canonical.code,
            count: 0,
            color: palette[colorIdx % palette.length],
            logo: canonical.logo,
          });
          colorIdx++;
        }
        companyMap.get(canonical.name)!.count++;
      }
    });

    let commissioning = 0;
    let construction = 0;

    let opened = 0;
    let preApproved = 0;
    let approved = 0;
    let hold = 0;
    let rejected = 0;
    let draft = 0;
    let autoCancel = 0;
    let cancelled = 0;
    let closed = 0;
    let unknown = 0;

    const AUTO_CANCEL_MSG = 'Permit not opened so system cancelled automatically';

    const classifyBuildingStatus = (st: string, cancelReason?: string | null) => {
      if (st === 'opened' || st === 'open' || st === 'pending') opened++;
      else if (st === 'pre-approved' || st === 'preapproved' || st === 'pre approved') preApproved++;
      else if (st === 'approved') approved++;
      else if (st === 'hold' || st === 'onhold' || st === 'on hold' || st === 'on-hold') hold++;
      else if (st === 'rejected' || st === 'reject') rejected++;
      else if (st === 'draft') draft++;
      else if (st === 'closed' || st === 'close') closed++;
      else if (st === 'cancelled' || st === 'cancel') {
        if (cancelReason && cancelReason.trim() === AUTO_CANCEL_MSG) autoCancel++;
        else cancelled++;
      }
      else if (
        st === 'auto-cancelled' || st === 'autocancelled' || st === 'autocanceled' || st === 'auto cancel'
      ) autoCancel++;
      else unknown++;
    };

    let nonHra = 0;
    let hra = 0;
    let hotWork = 0;
    let electrical = 0;
    let hazardousSubstances = 0;
    let workingAtHeight = 0;
    let confinedSpaces = 0;
    let excavation = 0;
    let cranesLifting = 0;
    let pressureTesting = 0;

    const zoneMap = new Map<string, {
      zone: string;
      companies: Set<string>;
      clash: boolean;
      hra: boolean;
      onHold: boolean;
      preOk: number;
      permits: number;
      hraActivities: Set<string>;
    }>();

    allRequests.forEach((req) => {
      const pType = getPermitType(req);
      if (pType.includes('commissioning')) commissioning++;
      else construction++;

      const st = getStatus(req);
      classifyBuildingStatus(st, (req as any)._cancelReason);

      const combined = getCombinedActivity(req);
      const isHotWork = isHW(req, combined);
      const isElectrical = isElec(req, combined);
      const isHazardous = isHaz(req, combined);
      const isWorkHeight = isHeight(req, combined);
      const isConfined = isConf(req, combined);
      const isExcavation = isExc(req, combined);
      const isCranes = isCrane(req, combined);
      const isPressure = isPress(req, combined);

      if (isHotWork) hotWork++;
      if (isElectrical) electrical++;
      if (isHazardous) hazardousSubstances++;
      if (isWorkHeight) workingAtHeight++;
      if (isConfined) confinedSpaces++;
      if (isExcavation) excavation++;
      if (isCranes) cranesLifting++;
      if (isPressure) pressureTesting++;

      const isAnyHra = isHotWork || isElectrical || isHazardous || isWorkHeight || isConfined || isExcavation || isCranes || isPressure;
      if (isAnyHra) hra++;
      else nonHra++;
    });

    let targetFloorId: number | null = !isNaN(Number(floorName)) && Number(floorName) > 0 ? Number(floorName) : null;
    if (!targetFloorId && floorName && String(floorName).trim() !== '' && String(floorName).toLowerCase() !== 'overview') {
      const fObj = allFloors.find((f) => f.floor_name.toLowerCase().trim() === String(floorName).toLowerCase().trim());
      if (fObj) targetFloorId = fObj.fl_id;
    }

    let relevantDbRooms = targetFloorId
      ? allRooms.filter((r) => Number(r.fl_id) === Number(targetFloorId))
      : allRooms;

    let targetBuildingId: number | null = !isNaN(bNum) && bNum > 0 ? bNum : null;
    if (targetBuildingId && (!relevantDbRooms || relevantDbRooms.length === 0)) {
      relevantDbRooms = allRooms.filter((r) => Number(r.building_id) === Number(targetBuildingId));
    }

    const dbZoneMap = new Map<string, {
      zone: string;
      companies: Set<string>;
      clash: boolean;
      hra: boolean;
      onHold: boolean;
      preOk: number;
      permits: number;
      hraActivities: Set<string>;
    }>();

    const dbRoomKeyLookup = new Map<string, string>();

    relevantDbRooms.forEach((r) => {
      const rName = (r.room_name || '').trim();
      if (rName) {
        const zName = r.zone_id && zoneLookup.has(r.zone_id) ? `${zoneLookup.get(r.zone_id)!} - ${rName}` : rName;
        const mainKey = zName;

        if (!dbZoneMap.has(mainKey)) {
          dbZoneMap.set(mainKey, {
            zone: mainKey,
            companies: new Set<string>(),
            clash: false,
            hra: false,
            onHold: false,
            preOk: 0,
            permits: 0,
            hraActivities: new Set<string>(),
          });
        }

        dbRoomKeyLookup.set(String(r.room_id), mainKey);
        dbRoomKeyLookup.set(rName.toLowerCase(), mainKey);
        dbRoomKeyLookup.set(zName.toLowerCase(), mainKey);
      }
    });

    filteredRequests.forEach((req) => {
      const canonical = getCanonicalCompany(req);
      const st = getStatus(req);
      const combined = getCombinedActivity(req);
      const isHotWork = isHW(req, combined);
      const isElectrical = isElec(req, combined);
      const isHazardous = isHaz(req, combined);
      const isWorkHeight = isHeight(req, combined);
      const isConfined = isConf(req, combined);
      const isExcavation = isExc(req, combined);
      const isCranes = isCrane(req, combined);
      const isPressure = isPress(req, combined);
      const isAnyHra = isHotWork || isElectrical || isHazardous || isWorkHeight || isConfined || isExcavation || isCranes || isPressure;

      const rawRoomNos = (req as any).Room_Nos || req.roomNos || '';
      const matchedKeys = new Set<string>();

      if (rawRoomNos) {
        const parts = String(rawRoomNos).split(',').map((s) => s.trim()).filter(Boolean);
        parts.forEach((p) => {
          if (dbRoomKeyLookup.has(p.toLowerCase())) {
            matchedKeys.add(dbRoomKeyLookup.get(p.toLowerCase())!);
          }
        });
      }

      if (matchedKeys.size === 0) {
        const rType = ((req as any).room_names || req.roomType || req.zone || '').toString().trim().toLowerCase();
        if (rType && dbRoomKeyLookup.has(rType)) {
          matchedKeys.add(dbRoomKeyLookup.get(rType)!);
        }
      }

      matchedKeys.forEach((key) => {
        const zData = dbZoneMap.get(key);
        if (zData) {
          zData.companies.add(canonical.code);
          zData.permits++;
          if (isAnyHra) zData.hra = true;
          if (st === 'hold' || st === 'onhold' || st === 'on-hold') zData.onHold = true;
          if (st === 'approved' || st === 'pre-approved' || st === 'preapproved') zData.preOk++;

          if (isWorkHeight) zData.hraActivities.add('Working At Height');
          if (isHazardous) zData.hraActivities.add('Working Hazardous Substances');
          if (isCranes) zData.hraActivities.add('Using Cranes Or Lifting');
          if (isHotWork) zData.hraActivities.add('Hot Work');
          if (isConfined) zData.hraActivities.add('Working Confined Spaces');
          if (isElectrical) zData.hraActivities.add('Working On Electrical System');
        }
      });
    });

    const roomsToReview = Array.from(dbZoneMap.values()).map((z) => ({
      zone: z.zone,
      companies: Array.from(z.companies),
      clash: z.companies.size > 1,
      hra: z.hra,
      hraList: Array.from(z.hraActivities),
      hraText: Array.from(z.hraActivities).join(', '),
      onHold: z.onHold,
      preOk: z.preOk,
      permits: z.permits,
      sub: `${z.companies.size} companies | ${z.permits} permits`,
    }));

    const roomHoverData: Record<string, any> = {};
    dbZoneMap.forEach((z, zName) => {
      const hoverObj = z.permits > 0 ? {
        title: zName,
        subtitle: `Room / Area ${zName}`,
        clash: z.companies.size > 1 ? `Clash (${z.companies.size} companies)` : 'Clear (No Clash)',
        companies: `${z.companies.size} companies`,
        permits: `${z.permits} permits`,
        hra: z.hraActivities.size > 0 ? `HRA: ${Array.from(z.hraActivities).join(', ')}` : 'Non-HRA',
      } : {
        title: zName,
        subtitle: `Room / Area ${zName}`,
        clash: 'Clear (No Clash)',
        companies: '0 companies',
        permits: '0 permits',
        hra: 'No Work',
      };

      roomHoverData[zName] = hoverObj;
      const parts = zName.split(' - ');
      if (parts.length > 1) {
        roomHoverData[parts[parts.length - 1]] = hoverObj;
      }
    });

    const allBuildings = await this.buildingRepo.find();

    if (!targetBuildingId && rawBuilding && String(rawBuilding).trim() !== '' && String(rawBuilding).toLowerCase() !== 'all') {
      const bObj = allBuildings.find(
        (b) => b.building_name.toLowerCase().trim().includes(String(rawBuilding).toLowerCase().trim())
      );
      if (bObj) {
        targetBuildingId = bObj.build_id;
      }
    }

    let assignedFloors: Floor[] = [];
    if (targetBuildingId) {
      assignedFloors = allFloors.filter((f) => Number(f.build_id) === Number(targetBuildingId));
    } else {
      assignedFloors = allFloors;
    }

    const floorStatsMap = new Map<string, {
      id: number | null;
      name: string;
      permits: number;
      roomsSet: Set<string>;
    }>();

    assignedFloors.forEach((fl) => {
      const normName = fl.floor_name.trim();
      floorStatsMap.set(normName.toLowerCase(), {
        id: fl.fl_id,
        name: normName,
        permits: 0,
        roomsSet: new Set<string>(),
      });
    });

    const resolveReqFloorName = (req: any): string | null => {
      const fId = Number((req as any).Floor_Id || req.floorId);
      if (!isNaN(fId) && fId > 0) {
        const matched = allFloors.find((f) => Number(f.fl_id) === fId);
        if (matched) return matched.floor_name.trim();
      }
      const rawRoomNos = (req as any).Room_Nos || req.roomNos || '';
      if (rawRoomNos) {
        const roomParts = String(rawRoomNos).split(',').map((s) => Number(s.trim())).filter((n) => !isNaN(n) && n > 0);
        for (const rId of roomParts) {
          const roomObj = allRooms.find((r) => Number(r.room_id) === rId);
          if (roomObj && roomObj.fl_id) {
            const matched = allFloors.find((f) => Number(f.fl_id) === Number(roomObj.fl_id));
            if (matched) return matched.floor_name.trim();
          }
        }
      }
      return null;
    };

    allRequests.forEach((req) => {
      const fName = resolveReqFloorName(req);
      if (fName) {
        const key = fName.toLowerCase();
        if (!floorStatsMap.has(key)) {
          floorStatsMap.set(key, {
            id: null,
            name: fName,
            permits: 0,
            roomsSet: new Set<string>(),
          });
        }
        const fStats = floorStatsMap.get(key)!;
        fStats.permits += 1;

        const roomKey = (req as any).Room_Nos || req.roomNos || req.zone || 'General Area';
        if (roomKey) fStats.roomsSet.add(roomKey);
      }
    });

    const floors = Array.from(floorStatsMap.values()).map((f) => {
      let status = 'gray';
      if (f.permits > 5) status = 'purple';
      else if (f.permits > 0) status = 'blue';

      let dbRoomCount = 0;
      if (f.id !== null) {
        dbRoomCount = allRooms.filter((r) => Number(r.fl_id) === Number(f.id)).length;
      }

      return {
        id: f.id,
        name: f.name,
        permits: f.permits,
        rooms: dbRoomCount > 0 ? dbRoomCount : f.roomsSet.size,
        status,
      };
    });

    return {
      companies: Array.from(companyMap.values()).filter((c) => c.count > 0),
      counts: {
        permitTypes: {
          commissioning: commissioning,
          construction: construction,
        },
        permitStatuses: {
          opened,
          preApproved,
          approved,
          hold,
          rejected,
          draft,
          cancelled,
          closed,
          autoCancel,
          unknown,
        },
        activityRiskTypes: {
          nonHra: nonHra,
          hra: hra,
          hotWork: hotWork,
          electrical: electrical,
          hazardousSubstances: hazardousSubstances,
          workingAtHeight: workingAtHeight,
          confinedSpaces: confinedSpaces,
          excavation: excavation,
          cranesLifting: cranesLifting,
          pressureTesting: pressureTesting,
        },
      },
      roomsToReview,
      roomHoverData,
      floors,
    };
  }
}

