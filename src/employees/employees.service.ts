import {
  HttpStatus,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, FindOptionsWhere } from 'typeorm';
import { Employee } from './entities/employee.entity';
import { CreateDepEmployeeDto, CreateEmpDto, CreateEmployeeDto, CreateSubEmployeeDto, CreateUserLogDto, SearchEmployeeDto, UpdateDepEmployeeDto, UpdateEmpDto, UpdateEmployeeDto, UpdateSubEmployeeDto, SubContEmployeesQueryDto, EmpListByDeptDto } from './dtos/employee.dto';
import { UserLog } from './entities/userlog.entity';
import { User } from '../users/entities/user.entity';
import { Subcontractor } from '../subcontractor/entities/subcontractor.entity';
import { RedisCacheService } from 'src/redis/redid-cache.service';
import { PaginationQueryDto } from 'src/redis/dtos/pagination.dto';

const encodePassword = (plain: string): string =>
  plain ? Buffer.from(plain).toString('base64') : '';

const decodePassword = (encoded: string): string => {
  if (!encoded) return '';
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    if (!decoded.includes('\uFFFD') && /^[\x20-\x7E]*$/.test(decoded)) {
      return decoded;
    }
  } catch {
    // Return original
  }
  return encoded;
};

const TTL = {
  ALL: 1000 * 60 * 5,
  SINGLE: 1000 * 60 * 10,
  BY_DEPT: 1000 * 60 * 5,
  BY_SUBCONT: 1000 * 60 * 5,
  SEARCH: 1000 * 60 * 2,
  USERNAME: 1000 * 60 * 10,
} as const;

const CACHE_KEYS = {
  all: () => 'employees:all',
  single: (id: number) => `employees:id:${id}`,
  byDept: (id: number) => `employees:dept:${id}`,
  bySubCont: (id: number) => `employees:subcont:${id}`,
  search: (dto: SearchEmployeeDto) =>
    `employees:search:${dto.search ?? ''}:${dto.companyName ?? ''}:${dto.isExport ?? false}:${dto.page ?? 1}:${dto.limit ?? 10}`,
  username: (u: string) => `employees:username:${u}`,
};

@Injectable()
export class EmployeesService {
  private readonly logger = new Logger(EmployeesService.name);

  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,

    @InjectRepository(UserLog)
    private readonly userLogRepo: Repository<UserLog>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(Subcontractor)
    private readonly subContRepo: Repository<Subcontractor>,

    private readonly cache: RedisCacheService,
  ) { }

  private async invalidateAfterWrite(options: {
    employeeId?: number;
    departId?: number;
    subContId?: number;
    username?: string;
  } = {}): Promise<void> {
    await this.cache.deleteByPattern('employees:*');
  }

  private async getSubContIdForUser(userId?: number): Promise<number | null> {
    if (!userId) return null;
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (user && user.userType === 'Subcontractor') {
      return user.typeId;
    }
    return null;
  }

  private async mapSubContractorAndUserType(employees: Employee[]): Promise<any[]> {
    const subContractors = await this.subContRepo.find();
    const subContMap = new Map(subContractors.map(sc => [sc.id, sc.subContractorName]));

    const users = await this.userRepo.find();
    const userMap = new Map(users.map(u => [u.empId, u.userType]));

    return employees.map(emp => ({
      ...emp,
      subContractorName: emp.subContId ? (subContMap.get(emp.subContId) ?? null) : null,
      userType: userMap.get(emp.id) ?? null,
      password: decodePassword(emp.password),
    }));
  }

  private applyEmployeeFields(existing: Employee, dto: any) {
    if (dto.roleId !== undefined && dto.roleId !== null) existing.roleId = Number(dto.roleId);
    if (dto.departId !== undefined) existing.departId = dto.departId ? Number(dto.departId) : null as any;
    if (dto.subContId !== undefined) existing.subContId = dto.subContId ? Number(dto.subContId) : null as any;
    if (dto.obserId !== undefined) existing.obserId = dto.obserId ? Number(dto.obserId) : null as any;
    if (dto.badgeId !== undefined) existing.badgeId = dto.badgeId;
    if (dto.employeeName !== undefined && dto.employeeName !== null) existing.employeeName = dto.employeeName;
    if (dto.companyName !== undefined) existing.companyName = dto.companyName;
    if (dto.email !== undefined) existing.email = dto.email;
    if (dto.designation !== undefined) existing.designation = dto.designation;
    if (dto.access !== undefined) existing.access = dto.access;
    if (dto.moduleAccess !== undefined) {
      existing.moduleAccess = Array.isArray(dto.moduleAccess)
        ? dto.moduleAccess.join(',')
        : dto.moduleAccess;
    }
    if (dto.username !== undefined) existing.username = dto.username;

    if (dto.phonenumber !== undefined && dto.phonenumber !== null) {
      const rawPhone = String(dto.phonenumber).replace(/^\++/, '');
      existing.phonenumber = rawPhone ? `+${rawPhone}` : '';
    }

    if (dto.password && typeof dto.password === 'string' && dto.password.trim() !== '') {
      const raw = dto.password.trim();
      if (!raw.includes('\uFFFD') && raw !== decodePassword(existing.password) && raw !== existing.password) {
        existing.password = encodePassword(raw);
      }
    }
  }

  private async syncUserForEmployee(employee: Employee, dto: any, userType?: string) {
    try {
      if (dto.username || dto.password || userType || dto.departId || dto.subContId || dto.obserId) {
        let user = await this.userRepo.findOne({ where: { empId: employee.id } });
        if (!user) {
          user = this.userRepo.create({
            empId: employee.id,
            created: new Date(),
            otp: dto.otp ?? '',
          });
        }
        if (dto.username) user.username = dto.username;
        if (dto.password && typeof dto.password === 'string' && dto.password.trim() !== '') {
          const raw = dto.password.trim();
          if (!raw.includes('\uFFFD') && raw !== decodePassword(user.password || '') && raw !== user.password) {
            user.password = encodePassword(raw);
          }
        }
        if (userType) user.userType = userType;
        if (dto.departId) user.typeId = dto.departId;
        else if (dto.subContId) user.typeId = dto.subContId;
        else if (dto.obserId) user.typeId = dto.obserId;
        if (dto.otp) user.otp = dto.otp;
        await this.userRepo.save(user);
      }
    } catch (err) {
      console.error('Error syncing user for employee:', err);
    }
  }

  async findAll(query: PaginationQueryDto, loggedInUserId?: number): Promise<any> {
    const { page = 1, limit = 10, isExport = false } = query;
    const subContId = await this.getSubContIdForUser(loggedInUserId);
    const cacheKey = subContId 
      ? `employees:list:all:${isExport}:${page}:${limit}:subcon:${subContId}`
      : `employees:list:all:${isExport}:${page}:${limit}`;
    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const findOptions: any = {
          order: { createdTime: 'DESC' },
        };
        if (subContId) {
          findOptions.where = { subContId };
        }
        if (!isExport) {
          findOptions.take = limit;
          findOptions.skip = (page - 1) * limit;
        }
        const [employees, total] = await this.employeeRepo.findAndCount(findOptions);
        const mappedData = await this.mapSubContractorAndUserType(employees);
        if (mappedData.length > 0) {
          return {
            statusCode: HttpStatus.OK,
            message: "Employees fetched successfully",
            data: mappedData,
            total,
            page: isExport ? 1 : page,
            limit: isExport ? total : limit,
            totalPages: isExport ? 1 : Math.ceil(total / limit),
          };
        }
        return {
          statusCode: HttpStatus.NOT_FOUND,
          message: "Employees not found",
        };
      },
      TTL.ALL,
    );
  }

  async findOne(id: number): Promise<any> {
    return this.cache.getOrSet(
      `employees:detail:${id}`,
      async () => {
        const employee = await this.employeeRepo.findOne({ where: { id } });
        if (!employee) {
          throw new NotFoundException(`Employee with id ${id} not found`);
        }
        const mapped = await this.mapSubContractorAndUserType([employee]);
        if (mapped.length > 0) {
          return {
            statusCode: HttpStatus.OK,
            message: "Employee fetched successfully",
            data: mapped[0],
          };
        } else {
          return {
            statusCode: HttpStatus.NOT_FOUND,
            message: "Employee not found",
          };
        }
      },
      TTL.SINGLE,
    );
  }

  async findBySubCont(query: SubContEmployeesQueryDto, loggedInUserId?: number): Promise<any> {
    const { subcont, page = 1, limit = 10, isExport = false } = query;
    const loggedInSubContId = await this.getSubContIdForUser(loggedInUserId);
    const subContId = loggedInSubContId ?? subcont;
    return this.cache.getOrSet(
      `employees:list:subcont:${subContId}:${isExport}:${page}:${limit}`,
      async () => {
        const findOptions: any = {
          where: { subContId },
          order: { createdTime: 'DESC' },
        };
        if (!isExport) {
          findOptions.take = limit;
          findOptions.skip = (page - 1) * limit;
        }
        const [employees, total] = await this.employeeRepo.findAndCount(findOptions);
        const mappedData = await this.mapSubContractorAndUserType(employees);
        if (mappedData.length > 0) {
          return {
            statusCode: HttpStatus.OK,
            message: "Employees fetched by company successfully",
            data: mappedData,
            total,
            page: isExport ? 1 : page,
            limit: isExport ? total : limit,
            totalPages: isExport ? 1 : Math.ceil(total / limit),
          };
        } else {
          return {
            statusCode: HttpStatus.NOT_FOUND,
            message: "Employees not found",
          };
        }
      },
      TTL.BY_SUBCONT,
    );
  }

  async findByDepartment(dto: EmpListByDeptDto): Promise<any> {
    const { departId, page = 1, limit = 10, isExport = false } = dto;
    return this.cache.getOrSet(
      `employees:list:dept:${departId}:${isExport}:${page}:${limit}`,
      async () => {
        const findOptions: any = {
          where: { departId },
          order: { createdTime: 'DESC' },
        };
        if (!isExport) {
          findOptions.take = limit;
          findOptions.skip = (page - 1) * limit;
        }
        const [employees, total] = await this.employeeRepo.findAndCount(findOptions);
        const mappedData = await this.mapSubContractorAndUserType(employees);
        if (mappedData.length > 0) {
          return {
            statusCode: HttpStatus.OK,
            message: "Employees fetched by department successfully",
            data: mappedData,
            total,
            page: isExport ? 1 : page,
            limit: isExport ? total : limit,
            totalPages: isExport ? 1 : Math.ceil(total / limit),
          };
        } else {
          return {
            statusCode: HttpStatus.NOT_FOUND,
            message: "Employees not found",
          };
        }
      },
      TTL.BY_DEPT,
    );
  }

  private async isUsernameTaken(username: string, excludeEmployeeId?: number): Promise<boolean> {
    if (!username || typeof username !== 'string' || !username.trim()) return false;
    const trimmed = username.trim();

    // Check in users table
    const qbUser = this.userRepo.createQueryBuilder('user')
      .where('LOWER(user.username) = LOWER(:username)', { username: trimmed });
    if (excludeEmployeeId) {
      qbUser.andWhere('(user.empId IS NULL OR user.empId != :excludeId)', { excludeId: excludeEmployeeId });
    }
    const userCount = await qbUser.getCount();
    if (userCount > 0) return true;

    // Check in employees table
    const qbEmp = this.employeeRepo.createQueryBuilder('emp')
      .where('LOWER(emp.username) = LOWER(:username)', { username: trimmed });
    if (excludeEmployeeId) {
      qbEmp.andWhere('emp.id != :excludeId', { excludeId: excludeEmployeeId });
    }
    const empCount = await qbEmp.getCount();
    return empCount > 0;
  }

  async checkUsername(
    username: string,
  ): Promise<{ statusCode: HttpStatus; message: string }> {
    const isTaken = await this.isUsernameTaken(username);
    return isTaken
      ? { statusCode: HttpStatus.CONFLICT, message: 'Username Exists' }
      : { statusCode: HttpStatus.OK, message: 'Username not Exists' };
  }

  async search(
    dto: SearchEmployeeDto,
    loggedInUserId?: number,
  ): Promise<any> {
    const subContId = await this.getSubContIdForUser(loggedInUserId);
    const cacheKey = subContId
      ? `${CACHE_KEYS.search(dto)}:subcon:${subContId}`
      : CACHE_KEYS.search(dto);
    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const { page = 1, limit = 10, isExport = false } = dto;
        const skip = (page - 1) * limit;

        let where: FindOptionsWhere<Employee> | FindOptionsWhere<Employee>[];

        if (dto.search) {
          const searchPattern = Like(`%${dto.search}%`);
          if (subContId) {
            where = [
              { employeeName: searchPattern, subContId },
              { email: searchPattern, subContId },
              { badgeId: searchPattern, subContId },
              { username: searchPattern, subContId },
              { companyName: searchPattern, subContId },
              { designation: searchPattern, subContId },
            ];
          } else {
            where = [
              { employeeName: searchPattern },
              { email: searchPattern },
              { badgeId: searchPattern },
              { username: searchPattern },
              { companyName: searchPattern },
              { designation: searchPattern },
            ];
          }
          if (dto.companyName) {
            if (Array.isArray(where)) {
              where = where.map(w => ({ ...w, companyName: dto.companyName }));
            }
          }
        } else {
          const baseWhere: any = {};
          if (subContId) baseWhere.subContId = subContId;
          if (dto.companyName) baseWhere.companyName = dto.companyName;
          where = baseWhere;
        }

        const findOptions: any = {
          where,
          order: { createdTime: 'DESC' },
        };

        if (!isExport) {
          findOptions.take = limit;
          findOptions.skip = skip;
        }

        const [data, total] = await this.employeeRepo.findAndCount(findOptions);

        const mappedData = await this.mapSubContractorAndUserType(data);
        if (mappedData.length > 0) {
          return {
            statusCode: HttpStatus.OK,
            message: "Employees fetched successfully",
            data: mappedData,
            total,
            page: isExport ? 1 : page,
            limit: isExport ? total : limit,
            totalPages: isExport ? 1 : Math.ceil(total / limit),
          };
        } else {
          return {
            statusCode: HttpStatus.NOT_FOUND,
            message: "Employees not found",
          };
        }
      },
      TTL.SEARCH,
    );
  }

  async create(dto: CreateEmployeeDto): Promise<{ statusCode: HttpStatus; message: string }> {
    if (!dto.employeeName) {
      return { statusCode: HttpStatus.NO_CONTENT, message: 'Empty Employee' };
    }

    if (!dto.userType || dto.userType.trim() === '') {
      return { statusCode: HttpStatus.BAD_REQUEST, message: 'Employee Type is required' };
    }

    if (dto.username && (await this.isUsernameTaken(dto.username))) {
      return { statusCode: HttpStatus.CONFLICT, message: 'Username already exists' };
    }

    const employee = this.employeeRepo.create({
      ...dto,
      phonenumber: dto.phonenumber ? `+${dto.phonenumber}` : undefined,
      password: dto.password ? encodePassword(dto.password) : undefined,
    } as any) as any as Employee;

    await this.employeeRepo.save(employee);

    // Sync with User table
    let userType = dto.userType;
    if (!userType) {
      if (dto.subContId) userType = 'Subcontractor';
      else if (dto.departId) userType = 'Department';
      else if (dto.obserId) userType = 'Observer';
      else userType = 'Admin';
    }

    await this.syncUserForEmployee(employee, dto, userType);

    await this.invalidateAfterWrite({
      departId: dto.departId,
      subContId: dto.subContId,
      username: dto.username,
    });

    return { statusCode: HttpStatus.OK, message: 'Employee Created' };
  }

  async createDepEmployee(
    dto: CreateDepEmployeeDto,
  ): Promise<{ statusCode: HttpStatus; message: string }> {
    if (!dto.employeeName) {
      return { statusCode: HttpStatus.NO_CONTENT, message: 'Empty Employee' };
    }

    if (dto.username && (await this.isUsernameTaken(dto.username))) {
      return { statusCode: HttpStatus.CONFLICT, message: 'Username already exists' };
    }

    const otp = dto.otp ?? String(Math.floor(100000 + Math.random() * 900000));

    const employee = this.employeeRepo.create({
      ...dto,
      password: dto.password ? encodePassword(dto.password) : undefined,
    } as any) as any as Employee;

    await this.employeeRepo.save(employee);

    // Sync with User table as Department user
    await this.syncUserForEmployee(employee, { ...dto, otp }, 'Department');

    await this.invalidateAfterWrite({
      departId: dto.departId,
      username: dto.username,
    });

    return { statusCode: HttpStatus.OK, message: 'Employee Created' };
  }

  async createSubEmployee(
    dto: CreateSubEmployeeDto,
  ): Promise<{ statusCode: HttpStatus; message: string }> {
    if (!dto.employeeName) {
      return { statusCode: HttpStatus.NO_CONTENT, message: 'Empty Employee' };
    }

    if (dto.username && (await this.isUsernameTaken(dto.username))) {
      return { statusCode: HttpStatus.CONFLICT, message: 'Username already exists' };
    }

    const employee = this.employeeRepo.create({
      ...dto,
      departId: dto.departId ?? 0,
      password: dto.password ? encodePassword(dto.password) : undefined,
    } as any) as any as Employee;

    await this.employeeRepo.save(employee);

    // Sync with User table as Subcontractor user
    await this.syncUserForEmployee(employee, dto, 'Subcontractor');

    await this.invalidateAfterWrite({
      subContId: dto.subContId,
      username: dto.username,
    });

    return { statusCode: HttpStatus.OK, message: 'Employee Created' };
  }

  async createEmp(dto: CreateEmpDto): Promise<{ statusCode: HttpStatus; message: string }> {
    if (!dto.employeeName) {
      return { statusCode: HttpStatus.NO_CONTENT, message: 'Empty Employee' };
    }

    if (dto.username && (await this.isUsernameTaken(dto.username))) {
      return { statusCode: HttpStatus.CONFLICT, message: 'Username already exists' };
    }

    const employee = this.employeeRepo.create({
      ...dto,
      password: dto.password ? encodePassword(dto.password) : undefined,
    } as any) as any as Employee;

    await this.employeeRepo.save(employee);

    // Sync with User table
    await this.syncUserForEmployee(employee, dto, dto.type ?? 'Admin');

    await this.invalidateAfterWrite({ username: dto.username });

    return { statusCode: HttpStatus.OK, message: 'Employee Created' };
  }

  async update(dto: UpdateEmployeeDto): Promise<{ statusCode: HttpStatus; message: string }> {
    try {
      if (!dto.userType || dto.userType.trim() === '') {
        return { statusCode: HttpStatus.BAD_REQUEST, message: 'Employee Type is required' };
      }
      if (dto.username && (await this.isUsernameTaken(dto.username, dto.id))) {
        return { statusCode: HttpStatus.CONFLICT, message: 'Username already exists' };
      }
      const existing = await this.employeeRepo.findOne({ where: { id: dto.id } });
      if (!existing) {
        return { statusCode: HttpStatus.NOT_FOUND, message: 'Employee not found' };
      }

      this.applyEmployeeFields(existing, dto);
      await this.employeeRepo.save(existing);

      let userType = dto.userType;
      if (!userType) {
        if (dto.subContId) userType = 'Subcontractor';
        else if (dto.departId) userType = 'Department';
        else if (dto.obserId) userType = 'Observer';
        else userType = 'Admin';
      }

      await this.syncUserForEmployee(existing, dto, userType);

      await this.invalidateAfterWrite({
        employeeId: dto.id,
        departId: dto.departId,
        subContId: dto.subContId,
        username: dto.username,
      });

      return { statusCode: HttpStatus.OK, message: 'Employee Updated' };
    } catch (err) {
      console.error('Error updating employee:', err);
      return { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Employee not updated' };
    }
  }

  async updateDepEmployee(
    dto: UpdateDepEmployeeDto,
  ): Promise<{ statusCode: HttpStatus; message: string }> {
    try {
      const existing = await this.employeeRepo.findOne({ where: { id: dto.id } });
      if (!existing) {
        return { statusCode: HttpStatus.NOT_FOUND, message: 'Employee not found' };
      }

      if (dto.username && (await this.isUsernameTaken(dto.username, dto.id))) {
        return { statusCode: HttpStatus.CONFLICT, message: 'Username already exists' };
      }

      this.applyEmployeeFields(existing, dto);
      await this.employeeRepo.save(existing);

      await this.syncUserForEmployee(existing, dto, 'Department');

      await this.invalidateAfterWrite({
        employeeId: dto.id,
        departId: dto.departId,
        username: dto.username,
      });

      return { statusCode: HttpStatus.OK, message: 'Employee Updated' };
    } catch (err) {
      console.error('Error updating department employee:', err);
      return { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Employee not updated' };
    }
  }

  async updateSubEmployee(
    dto: UpdateSubEmployeeDto,
  ): Promise<{ statusCode: HttpStatus; message: string }> {
    try {
      const existing = await this.employeeRepo.findOne({ where: { id: dto.id } });
      if (!existing) {
        return { statusCode: HttpStatus.NOT_FOUND, message: 'Employee not found' };
      }

      if (dto.username && (await this.isUsernameTaken(dto.username, dto.id))) {
        return { statusCode: HttpStatus.CONFLICT, message: 'Username already exists' };
      }

      this.applyEmployeeFields(existing, dto);
      await this.employeeRepo.save(existing);

      await this.syncUserForEmployee(existing, dto, 'Subcontractor');

      await this.invalidateAfterWrite({
        employeeId: dto.id,
        subContId: dto.subContId,
        username: dto.username,
      });

      return { statusCode: HttpStatus.OK, message: 'Employee Updated' };
    } catch (err) {
      console.error('Error updating sub employee:', err);
      return { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Employee not updated' };
    }
  }

  async updateEmp(dto: UpdateEmpDto): Promise<{ statusCode: HttpStatus; message: string }> {
    try {
      const existing = await this.employeeRepo.findOne({ where: { id: dto.id } });
      if (!existing) {
        return { statusCode: HttpStatus.NOT_FOUND, message: 'Employee not found' };
      }

      if (dto.username && (await this.isUsernameTaken(dto.username, dto.id))) {
        return { statusCode: HttpStatus.CONFLICT, message: 'Username already exists' };
      }

      this.applyEmployeeFields(existing, dto);
      await this.employeeRepo.save(existing);

      await this.syncUserForEmployee(existing, dto, dto.type);

      await this.invalidateAfterWrite({
        employeeId: dto.id,
        username: dto.username,
      });

      return { statusCode: HttpStatus.OK, message: 'Employee Updated' };
    } catch (err) {
      console.error('Error updating emp:', err);
      return { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Employee not updated' };
    }
  }

  async delete(id: number): Promise<{ statusCode: HttpStatus; message: string }> {
    const existing = await this.employeeRepo.findOne({ where: { id } });

    const result = await this.employeeRepo.delete(id);
    if (!result.affected) {
      return { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Employee not deleted' };
    }

    // Also delete user record
    await this.userRepo.delete({ empId: id });

    await this.invalidateAfterWrite({
      employeeId: id,
      departId: existing?.departId,
      subContId: existing?.subContId,
      username: existing?.username,
    });

    return { statusCode: HttpStatus.OK, message: 'Employee deleted' };
  }

  async createUserLog(
    dto: CreateUserLogDto,
  ): Promise<{ statusCode: HttpStatus; message: string }> {
    try {
      const log = this.userLogRepo.create(dto);
      await this.userLogRepo.save(log);
      return { statusCode: HttpStatus.OK, message: 'User Log Created' };
    } catch (err: any) {
      this.logger.warn(`Failed to create user log: ${err?.message || err}`);
      return { statusCode: HttpStatus.OK, message: 'User Log processed with warning' };
    }
  }

  async getUserLogs(
    query: any,
  ): Promise<{ statusCode: HttpStatus; data: UserLog[]; total: number; page: number; limit: number; totalPages: number }> {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 20);
    const skip = (page - 1) * limit;
    const searchUser = query.username || query.search || query.user || '';
    const searchDate = query.date || query.searchDate || '';

    const qb = this.userLogRepo.createQueryBuilder('log')
      .orderBy('log.timestamp', 'DESC')
      .skip(skip)
      .take(limit);

    if (searchUser && String(searchUser).trim() !== '') {
      qb.andWhere('log.user LIKE :searchUser', { searchUser: `%${String(searchUser).trim()}%` });
    }

    if (searchDate && String(searchDate).trim() !== '') {
      qb.andWhere('log.timestamp LIKE :searchDate', { searchDate: `${String(searchDate).trim()}%` });
    }

    const [data, total] = await qb.getManyAndCount();

    return {
      statusCode: HttpStatus.OK,
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getEmployeeCounts(): Promise<any> {
    return this.cache.getOrSet(
      'employees:analytics:counts',
      async () => {
        const counts = await this.employeeRepo
          .createQueryBuilder('employees')
          .leftJoin(User, 'u', 'u.empId = employees.id')
          .select(
            "SUM(CASE WHEN employees.departId IS NOT NULL AND employees.departId != 0 THEN 1 ELSE 0 END)",
            'departmentCount',
          )
          .addSelect(
            "SUM(CASE WHEN employees.subContId IS NOT NULL AND employees.subContId != 0 THEN 1 ELSE 0 END)",
            'contractorCount',
          )
          .addSelect(
            "SUM(CASE WHEN employees.obserId IS NOT NULL AND employees.obserId != 0 THEN 1 ELSE 0 END)",
            'observerCount',
          )
          .addSelect(
            "SUM(CASE WHEN u.userType IS NULL OR (LOWER(u.userType) NOT LIKE '%admin%' AND LOWER(u.userType) NOT LIKE '%superadmin%') THEN 1 ELSE 0 END)",
            'totalCount',
          )
          .getRawOne();

        return {
          statusCode: HttpStatus.OK,
          data: {
            departments: Number(counts.departmentCount || 0),
            contractors: Number(counts.contractorCount || 0),
            observers: Number(counts.observerCount || 0),
            total: Number(counts.totalCount || 0),
          },
        };
      },
      1000 * 60 * 5,
    );
  }
}