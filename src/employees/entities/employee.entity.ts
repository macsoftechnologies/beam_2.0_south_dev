import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('employees')
export class Employee {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: false })
  roleId: number;

  // @Column({ nullable: true })
  // typeId: number;

  // @Column({ nullable: true })
  // type: string;

  @Column({ nullable: true })
  departId: number;

  @Column({ nullable: true })
  subContId: number;

  @Column({ nullable: true })
  obserId: number;

  @Column({ nullable: true })
  badgeId: string;

  @Column({ nullable: false })
  employeeName: string;

  @Column({ nullable: true })
  companyName: string;


  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  designation: string;

  @Column({ nullable: true })
  phonenumber: string;

  @Column({ nullable: true })
  access: string;

  @Column({ name: 'module_access', nullable: true })
  moduleAccess: string;

  @Column({ nullable: true })
  username: string;

  /**
   * Stored as base64 in the legacy system.
   * Kept as-is for compatibility; consider migrating to bcrypt.
   */
  @Column({ nullable: true })
  password: string;

  // @Column({ nullable: true })
  // userType: string;

  // @Column({ nullable: true })
  // otp: string;

  @CreateDateColumn({ name: 'createdTime' })
  createdTime: Date;
}