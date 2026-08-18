import { BadRequestException } from '@nestjs/common';
import { RequestsService } from './requests.service';
import { CreateRequestDto } from './dtos/create-request.dto';

describe('RequestsService - Validation and Zone Logic', () => {
  let service: RequestsService;
  let mockZoneRepo: any;
  let mockRedisCacheService: any;
  let mockUserRepo: any;
  let mockEmployeeRepo: any;
  let mockDepartmentRepo: any;
  let mockRequestRepo: any;

  beforeEach(() => {
    mockZoneRepo = {
      find: jest.fn(),
    };

    mockRedisCacheService = {
      getOrSet: jest.fn((key, cb) => cb()),
      deleteByPattern: jest.fn(),
    };

    mockUserRepo = {
      findOne: jest.fn(),
    };

    mockEmployeeRepo = {
      findOne: jest.fn(),
    };

    mockDepartmentRepo = {
      findOne: jest.fn(),
    };

    mockRequestRepo = {
      findOne: jest.fn(),
      update: jest.fn(),
      save: jest.fn(),
    };

    // Create a minimal instantiation of RequestsService with mocked repositories
    service = new RequestsService(
      mockRequestRepo, // requestRepo
      {} as any, // chemicalRepo
      {} as any, // confinedRepo
      {} as any, // electricalRepo
      {} as any, // energisingElecRepo
      {} as any, // energisingMechRepo
      {} as any, // excavationRepo
      {} as any, // extraMiscRepo
      {} as any, // fireHotworkRepo
      {} as any, // generalRepo
      {} as any, // heightRepo
      {} as any, // liftingRepo
      {} as any, // ppeRepo
      {} as any, // pressureTestingRepo
      {} as any, // ramsFileRepo
      {} as any, // noteRepo
      {} as any, // uploadImageRepo
      {} as any, // logRepo
      {} as any, // logDataRepo
      {} as any, // completeLogRepo
      {} as any, // buildingRepo
      {} as any, // floorRepo
      mockZoneRepo, // zoneRepo
      {} as any, // roomRepo
      {} as any, // subcontractorRepo
      {} as any, // activityRepo
      mockUserRepo, // userRepo
      mockEmployeeRepo, // employeeRepo
      mockDepartmentRepo, // departmentRepo
      {} as any, // precautionRepo
      {} as any, // mechanicalWorkRepo
      {} as any, // electricalWorkRepo
      mockRedisCacheService, // redisCacheService
      { triggerNotification: jest.fn().mockResolvedValue(undefined) } as any, // notificationsService
    );
  });

  describe('checkZoneStatusAndAssignPermitUnder', () => {
    it('should throw BadRequestException if selected zones are not found', async () => {
      mockZoneRepo.find.mockResolvedValue([]);
      const dto: CreateRequestDto = { Zone_Id: 999 };

      await expect(
        service['checkZoneStatusAndAssignPermitUnder'](dto),
      ).rejects.toThrow(new BadRequestException('Selected zones not found'));
    });

    it('should throw BadRequestException if zone status is HO', async () => {
      mockZoneRepo.find.mockResolvedValue([{ id: 1, status: 'HO' }]);
      const dto: CreateRequestDto = { Zone_Id: 1 };

      await expect(
        service['checkZoneStatusAndAssignPermitUnder'](dto),
      ).rejects.toThrow(
        new BadRequestException('Cannot create a permit if zone status is HO'),
      );
    });

    it('should throw BadRequestException if selected zones have mixed statuses', async () => {
      mockZoneRepo.find.mockResolvedValue([
        { id: 1, status: 'UC' },
        { id: 2, status: 'C' },
      ]);
      const dto: CreateRequestDto = { Zone_Id: '1,2' };

      await expect(
        service['checkZoneStatusAndAssignPermitUnder'](dto),
      ).rejects.toThrow(
        new BadRequestException(
          'All selected zones must belong to the same status',
        ),
      );
    });

    it('should assign permit_under to Construction if status is UC', async () => {
      mockZoneRepo.find.mockResolvedValue([{ id: 3, status: 'UC' }]);
      const dto: CreateRequestDto = { Zone_Id: 3 };

      await service['checkZoneStatusAndAssignPermitUnder'](dto);
      expect(dto.permit_under).toBe('Construction');
      expect(dto.Zone_Id).toBe('3');
    });

    it('should assign permit_under to Commissioning if status is C', async () => {
      mockZoneRepo.find.mockResolvedValue([{ id: 4, status: 'C' }]);
      const dto: CreateRequestDto = { Zone_Id: 4 };

      await service['checkZoneStatusAndAssignPermitUnder'](dto);
      expect(dto.permit_under).toBe('Commissioning');
      expect(dto.Zone_Id).toBe('4');
    });

    it('should ignore zone ID if it is 0 or non-positive', async () => {
      const dto: CreateRequestDto = { Zone_Id: 0 };
      await expect(
        service['checkZoneStatusAndAssignPermitUnder'](dto),
      ).resolves.not.toThrow();
      expect(dto.permit_under).toBeUndefined();
    });
  });

  describe('validateMandatoryFields', () => {
    it('should skip validation if status is draft', () => {
      const dto: CreateRequestDto = { Request_status: 'draft' };
      expect(() => service['validateMandatoryFields'](dto)).not.toThrow();
    });

    it('should throw validation error if mandatory fields are missing', () => {
      const dto: CreateRequestDto = { Request_status: 'Pending' };
      expect(() => service['validateMandatoryFields'](dto)).toThrow(
        /Validation failed/,
      );
    });

    it('should validate chemical hazard sub-fields if working_hazardious_substen is 1', () => {
      const dto: CreateRequestDto = {
        Request_status: 'Pending',
        Sub_Contractor_Id: 1,
        Company_Name: 'Test Inc',
        Foreman: 'John Doe',
        Foreman_Phone_Number: '12345678',
        Activity: 'Test Activity',
        Type_Of_Activity_Id: 'A1',
        Working_Date: '2026-06-05',
        Start_Time: '08:00',
        End_Time: '17:00',
        Building_Id: 1,
        Floor_Id: 1,
        Plans_Id: 1,
        Room_Nos: '101',
        Room_Type: 'Office',
        Zone_Id: 1,
        Number_Of_Workers: '5',
        Site_Id: 1,
        permit_type: 'Construction',
        permit_under: 'Construction',
        working_hazardious_substen: 1,
        // missing checklist fields like relevant_mal
        Tools: 'Screwdriver',
        Machinery: 'None',
        description_of_activity: 'Working',
        mechanical_works: 'None',
        electrical_works: 'None',
        work_type: 'General',
        affecting_other_contractors: 1,
        other_conditions: 0,
        lighting_begin_work: 1,
        specific_risks: 1,
        environment_ensured: 1,
        course_of_action: 1,
        eye_protection: 1,
        fall_protection: 1,
        hearing_protection: 1,
        respiratory_protection: 1,
        other_ppe: 'Gloves',
      };

      expect(() => service['validateMandatoryFields'](dto)).toThrow(
        /relevant_mal must be checked/,
      );
    });

    it('should skip base validations if not draft to hold and not new creation', () => {
      const existing = { requestStatus: 'Hold' } as any;
      const dto = { Request_status: 'Hold' };
      // This would normally fail if base validations ran because Floor_Id is missing.
      // But since it skips, it should not throw any error.
      expect(() =>
        service['validateMandatoryFields'](dto, existing),
      ).not.toThrow();
    });

    it('should validate CoMM_initials when transitioning to Pre-Approved under Construction/Commissioning', () => {
      const existing = {
        requestStatus: 'Hold',
        permitUnder: 'Construction',
        permitType: 'Commissioning',
      } as any;
      const dto = { Request_status: 'Pre-Approved' };

      expect(() =>
        service['validateMandatoryFields'](dto, existing, { ext: {} }),
      ).toThrow(/CoMM_initials is required/);

      // Should pass if CoMM_initials is present
      const dtoWithInitials = {
        Request_status: 'Pre-Approved',
        CoMM_initials: 'CQ_USER',
      };
      expect(() =>
        service['validateMandatoryFields'](dtoWithInitials, existing, { ext: {} }),
      ).not.toThrow();
    });

    it('should validate reject_reason when transitioning to Rejected', () => {
      const existing = { requestStatus: 'Hold' } as any;
      const dto = { Request_status: 'Rejected' };

      expect(() =>
        service['validateMandatoryFields'](dto, existing, { ext: {} }),
      ).toThrow(/reject_reason is required/);
    });

    it('should validate ConM_initials1 and Working_Date matching today when transitioning to Opened from Approved', () => {
      const existing = {
        requestStatus: 'Approved',
        workingDate: '2026-06-05', // not today
      } as any;
      const dto = { Request_status: 'Opened' };

      // 1. Missing ConM_initials1 -> should fail on ConM_initials1
      expect(() =>
        service['validateMandatoryFields'](dto, existing, { ext: {} }),
      ).toThrow(/ConM_initials1 is required/);

      // 2. ConM_initials1 present but workingDate is not today -> should fail on Working_Date
      const dtoWithInitials = {
        Request_status: 'Opened',
        ConM_initials1: 'CONM_USER',
      };
      expect(() =>
        service['validateMandatoryFields'](dtoWithInitials, existing, { ext: {} }),
      ).toThrow(/Working_Date needs to match with today's date/);

      // 3. ConM_initials1 present and workingDate is today -> should pass
      const today = new Date();
      const y = today.getFullYear();
      const m = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const todayStr = `${y}-${m}-${dd}`;

      const existingToday = {
        requestStatus: 'Approved',
        workingDate: todayStr,
      } as any;
      expect(() =>
        service['validateMandatoryFields'](dtoWithInitials, existingToday, { ext: {} }),
      ).not.toThrow();
    });

    it('should validate cancel_reason when transitioning to Cancelled', () => {
      const existing = { requestStatus: 'Hold' } as any;
      const dto = { Request_status: 'Cancelled' };

      expect(() =>
        service['validateMandatoryFields'](dto, existing, { ext: {} }),
      ).toThrow(/cancel_reason is required/);
    });

    it('should validate close_note when transitioning to Closed', () => {
      const existing = { requestStatus: 'Opened' } as any;
      const dto = { Request_status: 'Closed' };

      expect(() =>
        service['validateMandatoryFields'](dto, existing, { ext: {} }),
      ).toThrow(/close_note is required/);
    });
  });

  describe('areEqual helper method', () => {
    it('should treat null, undefined, and empty string as equal', () => {
      expect(service['areEqual'](null, undefined)).toBe(true);
      expect(service['areEqual'](null, '')).toBe(true);
      expect(service['areEqual']('', undefined)).toBe(true);
      expect(service['areEqual']('   ', null)).toBe(true);
    });

    it('should treat different empty and non-empty values as not equal', () => {
      expect(service['areEqual'](null, 0)).toBe(false);
      expect(service['areEqual'](undefined, 'value')).toBe(false);
      expect(service['areEqual']('', false)).toBe(false);
    });

    it('should treat numbers and equivalent string numbers as equal', () => {
      expect(service['areEqual'](1, '1')).toBe(true);
      expect(service['areEqual']('0', 0)).toBe(true);
      expect(service['areEqual'](123.45, '123.45')).toBe(true);
    });

    it('should treat booleans and equivalent numeric values as equal', () => {
      expect(service['areEqual'](true, 1)).toBe(true);
      expect(service['areEqual'](false, 0)).toBe(true);
      expect(service['areEqual'](true, '1')).toBe(true);
    });

    it('should treat equivalent Date objects and date strings as equal', () => {
      const dateObj = new Date('2026-06-16');
      expect(service['areEqual'](dateObj, '2026-06-16')).toBe(true);
      expect(
        service['areEqual']('2026-06-16T00:00:00.000Z', '2026-06-16'),
      ).toBe(true);
    });

    it('should treat non-equivalent strings/numbers as not equal', () => {
      expect(service['areEqual']('Approved', 'Pending')).toBe(false);
      expect(service['areEqual'](1, 2)).toBe(false);
      expect(service['areEqual']('2026-06-16', '2026-06-17')).toBe(false);
    });
  });

  describe('validateStatusTransitionAndRole', () => {
    let mockRequest: any;

    beforeEach(() => {
      mockRequest = {
        id: 1,
        permitUnder: 'Construction',
        permitType: 'Construction',
        requestStatus: 'draft',
      };
    });

    it('should throw BadRequestException if actorUserId is not provided', async () => {
      await expect(
        service['validateStatusTransitionAndRole'](mockRequest, 'hold', 0),
      ).rejects.toThrow(new BadRequestException('Actor userId is required for status updates'));
    });

    it('should throw BadRequestException if user is not found', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);
      await expect(
        service['validateStatusTransitionAndRole'](mockRequest, 'hold', 999),
      ).rejects.toThrow(new BadRequestException('User not found for ID: 999'));
    });

    it('should allow hold -> draft transition', async () => {
      mockRequest.requestStatus = 'hold';
      mockUserRepo.findOne.mockResolvedValue({ id: 1, userType: 'Admin' });
      await expect(
        service['validateStatusTransitionAndRole'](mockRequest, 'draft', 1),
      ).resolves.not.toThrow();
    });

    it('should throw exception when trying to revert status to lower level', async () => {
      mockRequest.requestStatus = 'approved';
      mockUserRepo.findOne.mockResolvedValue({ id: 1, userType: 'Admin' });
      await expect(
        service['validateStatusTransitionAndRole'](mockRequest, 'pre-approved', 1),
      ).rejects.toThrow(/Status cannot be reverted/);
    });

    it('should throw exception when transitioning from terminal states', async () => {
      mockRequest.requestStatus = 'rejected';
      mockUserRepo.findOne.mockResolvedValue({ id: 1, userType: 'Admin' });
      await expect(
        service['validateStatusTransitionAndRole'](mockRequest, 'approved', 1),
      ).rejects.toThrow(/Cannot change status from terminal state/);
    });

    it('should restrict contractor from approving/pre-approving', async () => {
      mockRequest.requestStatus = 'draft';
      // Contractor (Subcontractor) user
      mockUserRepo.findOne.mockResolvedValue({ id: 2, userType: 'Subcontractor' });
      
      await expect(
        service['validateStatusTransitionAndRole'](mockRequest, 'pre-approved', 2),
      ).rejects.toThrow(/Contractor is not authorized/);

      await expect(
        service['validateStatusTransitionAndRole'](mockRequest, 'approved', 2),
      ).rejects.toThrow(/Contractor is not authorized/);
    });

    it('should allow contractor to change draft <-> hold, approved -> opened -> closed, and cancel/reject active permits', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 2, userType: 'Subcontractor' });
      
      // draft -> hold (allowed)
      mockRequest.requestStatus = 'draft';
      await expect(
        service['validateStatusTransitionAndRole'](mockRequest, 'hold', 2),
      ).resolves.not.toThrow();

      // approved -> opened (allowed)
      mockRequest.requestStatus = 'approved';
      await expect(
        service['validateStatusTransitionAndRole'](mockRequest, 'opened', 2),
      ).resolves.not.toThrow();

      // opened -> closed (allowed)
      mockRequest.requestStatus = 'opened';
      await expect(
        service['validateStatusTransitionAndRole'](mockRequest, 'closed', 2),
      ).resolves.not.toThrow();

      // approved -> cancelled (allowed)
      mockRequest.requestStatus = 'approved';
      await expect(
        service['validateStatusTransitionAndRole'](mockRequest, 'cancelled', 2),
      ).resolves.not.toThrow();

      // draft -> rejected (allowed for contractor)
      mockRequest.requestStatus = 'draft';
      await expect(
        service['validateStatusTransitionAndRole'](mockRequest, 'rejected', 2),
      ).resolves.not.toThrow();

      // approved -> rejected (restricted for contractor, allowed only for final approving dept/admin)
      mockRequest.requestStatus = 'approved';
      await expect(
        service['validateStatusTransitionAndRole'](mockRequest, 'rejected', 2),
      ).rejects.toThrow(/Contractor is not authorized/);
    });

    it('should validate department specific pre-approval and final approval rules', async () => {
      // 1. Both Construction -> approved directly by ConM
      mockRequest.permitUnder = 'Construction';
      mockRequest.permitType = 'Construction';
      mockRequest.requestStatus = 'hold';

      // ConM user: Department type, empId 10
      // C&Q user: Department type, empId 11
      // Set up mocks:
      mockUserRepo.findOne.mockImplementation(async (query: any) => {
        if (query.where.id === 3) return { id: 3, userType: 'Department', empId: 10 };
        if (query.where.id === 4) return { id: 4, userType: 'Department', empId: 11 };
        return null;
      });

      mockEmployeeRepo.findOne.mockImplementation(async (query: any) => {
        if (query.where.id === 10) return { id: 10, departId: 5 };
        if (query.where.id === 11) return { id: 11, departId: 6 };
        return null;
      });

      mockDepartmentRepo.findOne.mockImplementation(async (query: any) => {
        if (query.where.id === 5) return { id: 5, departmentName: 'CoNM Dept' };
        if (query.where.id === 6) return { id: 6, departmentName: 'C&Q Dept' };
        return null;
      });

      // Test ConM approval for Construction-only permit (allowed)
      await expect(
        service['validateStatusTransitionAndRole'](mockRequest, 'approved', 3), // userId 3 is ConM
      ).resolves.not.toThrow();

      // Test C&Q approval for Construction-only permit (should throw)
      await expect(
        service['validateStatusTransitionAndRole'](mockRequest, 'approved', 4), // userId 4 is C&Q
      ).rejects.toThrow(/Final approval for Construction-only permits must be done by a ConM/);

      // 2. Both Commissioning -> approved directly by C&Q
      mockRequest.permitUnder = 'Commissioning';
      mockRequest.permitType = 'Commissioning';
      mockRequest.requestStatus = 'hold';

      // Test C&Q approval for Commissioning-only permit (allowed)
      await expect(
        service['validateStatusTransitionAndRole'](mockRequest, 'approved', 4), // userId 4 is C&Q
      ).resolves.not.toThrow();

      // Test ConM approval for Commissioning-only permit (should throw)
      await expect(
        service['validateStatusTransitionAndRole'](mockRequest, 'approved', 3), // userId 3 is ConM
      ).rejects.toThrow(/Final approval for Commissioning-only permits must be done by a C&Q/);

      // 3. Construction under Commissioning -> pre-approval C&Q, final approval ConM
      mockRequest.permitUnder = 'Construction';
      mockRequest.permitType = 'Commissioning';
      mockRequest.requestStatus = 'hold';

      // Pre-approval by C&Q (allowed)
      await expect(
        service['validateStatusTransitionAndRole'](mockRequest, 'pre-approved', 4), // C&Q
      ).resolves.not.toThrow();

      // Pre-approval by ConM (should throw)
      await expect(
        service['validateStatusTransitionAndRole'](mockRequest, 'pre-approved', 3), // ConM
      ).rejects.toThrow(/Pre-approval for Construction under Commissioning must be done by a C&Q/);

      // Final approval needs pre-approved first
      await expect(
        service['validateStatusTransitionAndRole'](mockRequest, 'approved', 3), // ConM
      ).rejects.toThrow(/must be pre-approved before final approval/);

      // Final approval by ConM when status is pre-approved (allowed)
      mockRequest.requestStatus = 'pre-approved';
      await expect(
        service['validateStatusTransitionAndRole'](mockRequest, 'approved', 3), // ConM
      ).resolves.not.toThrow();

      // Final approval by C&Q when status is pre-approved (should throw)
      await expect(
        service['validateStatusTransitionAndRole'](mockRequest, 'approved', 4), // C&Q
      ).rejects.toThrow(/Final approval for Construction under Commissioning permits must be done by a ConM/);
    });
  });
});
