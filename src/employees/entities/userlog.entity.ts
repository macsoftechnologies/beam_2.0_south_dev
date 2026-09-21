import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('newuserlogs')
export class UserLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  action: string;

  @Column({ type: 'longtext', nullable: true })
  body: string;

  @Column({ nullable: true })
  method: string;

  @Column({ nullable: true })
  url: string;

  @Column({ nullable: true })
  status: string;

  @Column({ nullable: true })
  user: string;

  @CreateDateColumn({ name: 'timestamp', type: 'datetime', nullable: true })
  timestamp: Date;
}