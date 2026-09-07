import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private readonly fromEmail: string;

  constructor(private readonly configService: ConfigService) {
    const rawHost = this.configService.get<string>('SMTP_HOST') || this.configService.get<string>('MAIL_HOST') || process.env.SMTP_HOST || process.env.MAIL_HOST;
    const rawPort = this.configService.get<number | string>('SMTP_PORT') || this.configService.get<number | string>('MAIL_PORT') || process.env.SMTP_PORT || process.env.MAIL_PORT || 587;
    const rawUser = this.configService.get<string>('SMTP_USER') || this.configService.get<string>('MAIL_USER') || process.env.SMTP_USER || process.env.MAIL_USER;
    const rawPass = this.configService.get<string>('SMTP_PASS') || this.configService.get<string>('MAIL_PASS') || process.env.SMTP_PASS || process.env.MAIL_PASS;
    const rawFrom = this.configService.get<string>('SMTP_FROM') || this.configService.get<string>('MAIL_FROM') || process.env.SMTP_FROM || process.env.MAIL_FROM || 'helpdesk@safesiteworks.com';

    const host = rawHost ? rawHost.trim() : '';
    const port = Number(typeof rawPort === 'string' ? rawPort.trim() : rawPort);
    const user = rawUser ? rawUser.trim() : '';
    const pass = rawPass ? rawPass.trim() : '';
    this.fromEmail = rawFrom ? rawFrom.trim() : 'helpdesk@safesiteworks.com';

    if (host && user && pass) {
      try {
        this.transporter = nodemailer.createTransport({
          host,
          port,
          secure: port === 465,
          auth: { user, pass },
        });
        this.logger.log(`[EmailService] Initialized SMTP transporter on ${host}:${port} (from: ${this.fromEmail})`);
      } catch (err: any) {
        this.logger.warn(`[EmailService] Failed to initialize SMTP transporter: ${err.message}`);
      }
    } else {
      this.logger.warn(`[EmailService] SMTP credentials not fully configured in .env (host=${host ? 'yes' : 'no'}, user=${user ? 'yes' : 'no'}, pass=${pass ? 'yes' : 'no'}). Emails will be logged to console in development.`);
    }
  }

  /**
   * Send an email to a single or multiple recipients.
   */
  async sendEmail(options: {
    to: string | string[];
    subject: string;
    text: string;
    html?: string;
  }): Promise<boolean> {
    const { to, subject, text, html } = options;
    const recipients = Array.isArray(to) ? to.join(', ') : to;

    if (!recipients || !recipients.trim()) {
      this.logger.warn(`[EmailService] No recipient email address provided. Skipping email.`);
      return false;
    }

    if (!this.transporter) {
      this.logger.log(`[Email Dispatched (Dev Fallback Log)] To: ${recipients} | Subject: "${subject}" | Content: ${text}`);
      return true;
    }

    try {
      this.logger.log(`[EmailService] Dispatching email to: ${recipients} | Subject: "${subject}"`);
      const info = await this.transporter.sendMail({
        from: `"BEAM Incident Alerts" <${this.fromEmail}>`,
        to: recipients,
        subject,
        text,
        html: html || `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b;"><p>${text}</p></div>`,
      });
      this.logger.log(`[EmailService] Email sent successfully to ${recipients}. Response: ${info.response || info.messageId}`);
      return true;
    } catch (err: any) {
      this.logger.error(`[EmailService] Failed to send email to ${recipients}: ${err.message}`, err.stack);
      return false;
    }
  }
}

