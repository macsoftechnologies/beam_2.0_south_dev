import {
  IsString,
  IsNumber,
  IsOptional,
  IsNotEmpty,
  IsEmail,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from 'src/redis/dtos/pagination.dto';

// ─── CREATE EMPLOYEE (generic / main) ────────────────────────────────────────

export class CreateEmployeeDto {
  @IsOptional() @IsNumber() roleId?: number;
  @IsOptional() @IsNumber() departId?: number;
  @IsOptional() @IsNumber() subContId?: number;
  @IsOptional() @IsNumber() obserId?: number;
  @IsOptional() @IsString() badgeId?: string;

  @IsNotEmpty()
  @IsString()
  employeeName: string;

  @IsOptional() @IsString() companyName?: string;
  @IsOptional() @IsString() designation?: string;
  @IsOptional() @IsString() phonenumber?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() access?: string;
  @IsOptional() @IsString() moduleAccess?: string;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() password?: string;
  @IsOptional() @IsString() userType?: string;
  @IsOptional() @IsString() otp?: string;
}

// ─── CREATE DEP EMPLOYEE ─────────────────────────────────────────────────────

export class CreateDepEmployeeDto {
  @IsOptional() @IsNumber() roleId?: number;
  @IsOptional() @IsNumber() departId?: number;
  @IsOptional() @IsString() badgeId?: string;

  @IsNotEmpty()
  @IsString()
  employeeName: string;

  @IsOptional() @IsString() designation?: string;
  @IsOptional() @IsString() phonenumber?: string;
  @IsOptional() @IsString() access?: string;
  @IsOptional() @IsString() moduleAccess?: string;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() password?: string;
  @IsOptional() @IsString() otp?: string;
}

// ─── CREATE SUB-CONTRACTOR EMPLOYEE ──────────────────────────────────────────

export class CreateSubEmployeeDto {
  @IsOptional() @IsNumber() roleId?: number;
  @IsOptional() @IsNumber() subContId?: number;
  @IsOptional() @IsNumber() departId?: number;
  @IsOptional() @IsString() badgeId?: string;

  @IsNotEmpty()
  @IsString()
  employeeName: string;

  @IsOptional() @IsString() companyName?: string;
  @IsOptional() @IsString() designation?: string;
  @IsOptional() @IsString() phonenumber?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() access?: string;
  @IsOptional() @IsString() moduleAccess?: string;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() password?: string;
}

// ─── CREATE EMP (type-aware) ──────────────────────────────────────────────────

export class CreateEmpDto {
  @IsOptional() @IsNumber() roleId?: number;
  // @IsOptional() @IsNumber() typeId?: number
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() badgeId?: string;

  @IsNotEmpty()
  @IsString()
  employeeName: string;

  @IsOptional() @IsString() designation?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() companyName?: string;
  @IsOptional() @IsString() phonenumber?: string;
  @IsOptional() @IsString() access?: string;
  @IsOptional() @IsString() moduleAccess?: string;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() password?: string;
}

// ─── UPDATE EMPLOYEE (generic / main) ────────────────────────────────────────

export class UpdateEmployeeDto {
  @IsNotEmpty() @IsNumber() id: number;
  @IsOptional() @IsNumber() roleId?: number;
  @IsOptional() @IsNumber() departId?: number;
  @IsOptional() @IsNumber() subContId?: number;
  @IsOptional() @IsNumber() obserId?: number;
  @IsOptional() @IsString() badgeId?: string;
  @IsOptional() @IsString() employeeName?: string;
  @IsOptional() @IsString() companyName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() designation?: string;
  @IsOptional() @IsString() phonenumber?: string;
  @IsOptional() @IsString() access?: string;
  @IsOptional() @IsString() moduleAccess?: string;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() password?: string;
  @IsOptional() @IsString() userType?: string;
  @IsOptional() @IsString() otp?: string;
}

// ─── UPDATE DEP EMPLOYEE ─────────────────────────────────────────────────────

export class UpdateDepEmployeeDto {
  @IsNotEmpty() @IsNumber() id: number;
  @IsOptional() @IsNumber() roleId?: number;
  @IsOptional() @IsNumber() departId?: number;
  @IsOptional() @IsString() badgeId?: string;
  @IsOptional() @IsString() employeeName?: string;
  @IsOptional() @IsString() designation?: string;
  @IsOptional() @IsString() phonenumber?: string;
  @IsOptional() @IsString() access?: string;
  @IsOptional() @IsString() moduleAccess?: string;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() password?: string;
}

// ─── UPDATE SUB EMPLOYEE ─────────────────────────────────────────────────────

export class UpdateSubEmployeeDto {
  @IsNotEmpty() @IsNumber() id: number;
  @IsOptional() @IsNumber() roleId?: number;
  @IsOptional() @IsNumber() subContId?: number;
  @IsOptional() @IsString() badgeId?: string;
  @IsOptional() @IsString() employeeName?: string;
  @IsOptional() @IsString() designation?: string;
  @IsOptional() @IsString() phonenumber?: string;
  @IsOptional() @IsString() access?: string;
  @IsOptional() @IsString() moduleAccess?: string;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() password?: string;
}

// ─── UPDATE EMP (type-aware) ──────────────────────────────────────────────────

export class UpdateEmpDto {
  @IsNotEmpty() @IsNumber() id: number;
  @IsOptional() @IsNumber() roleId?: number;
  @IsOptional() @IsNumber() typeId?: number;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() badgeId?: string;
  @IsOptional() @IsString() employeeName?: string;
  @IsOptional() @IsString() designation?: string;
  @IsOptional() @IsString() phonenumber?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() companyName?: string;
  @IsOptional() @IsString() access?: string;
  @IsOptional() @IsString() moduleAccess?: string;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() password?: string;
}

// ─── DELETE EMPLOYEE ──────────────────────────────────────────────────────────

export class DeleteEmployeeDto {
  @IsNotEmpty() @IsNumber() id: number;
}

// ─── READ BY DEPARTMENT ───────────────────────────────────────────────────────

export class EmpListByDeptDto extends PaginationQueryDto {
  @IsNotEmpty() @IsNumber() departId: number;
}

// ─── CHECK USERNAME ───────────────────────────────────────────────────────────

export class ReadUsernameDto {
  @IsNotEmpty() @IsString() username: string;
}

// ─── SEARCH / PAGINATE ────────────────────────────────────────────────────────

export class SearchEmployeeDto extends PaginationQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() companyName?: string;
}

// ─── USER LOG ─────────────────────────────────────────────────────────────────

export class CreateUserLogDto {
  @IsOptional() @IsString() action?: string;
  @IsOptional() @IsString() body?: string;
  @IsOptional() @IsString() method?: string;
  @IsOptional() @IsString() url?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() user?: string;
  @IsOptional() @IsString() timestamp?: string;
}

export class LogsReportsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() user?: string;
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() searchDate?: string;
}

export class SubContEmployeesQueryDto extends PaginationQueryDto {
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  subcont: number;
}