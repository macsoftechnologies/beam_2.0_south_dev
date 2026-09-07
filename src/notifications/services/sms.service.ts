import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private twilioClient: any = null;
  private readonly messagingServiceSid: string;

  constructor(private readonly configService: ConfigService) {
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID')?.trim();
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN')?.trim();
    this.messagingServiceSid = this.configService.get<string>('TWILIO_MESSAGING_SERVICE_SID')?.trim() || 'MGb53b30d757d11e8a4d038c1948ec8991';

    if (accountSid && authToken) {
      try {
        const twilio = require('twilio');
        this.twilioClient = new twilio(accountSid, authToken);
        this.logger.log(`[SmsService] Initialized Twilio client successfully.`);
      } catch (err: any) {
        this.logger.warn(`[SmsService] Failed to initialize Twilio client: ${err.message}`);
      }
    } else {
      this.logger.warn(`[SmsService] Twilio credentials missing in .env. SMS will be logged to console.`);
    }
  }

  /**
   * Format phone number to international E.164
   */
  private formatPhoneNumber(phoneNumber: string): string {
    let clean = String(phoneNumber || '').trim();
    if (!clean) return '';

    if (clean.startsWith('00')) {
      return '+' + clean.slice(2);
    } else if (clean.startsWith('+')) {
      return clean;
    } else {
      const onlyDigits = clean.replace(/\D/g, '');
      if (onlyDigits.length === 8) {
        return '+45' + onlyDigits; // Default Danish country code
      } else {
        return '+' + onlyDigits;
      }
    }
  }

  /**
   * Send SMS via Twilio
   */
  async sendSms(phoneNumber: string, messageBody: string): Promise<boolean> {
    const to = this.formatPhoneNumber(phoneNumber);
    if (!to) {
      this.logger.warn(`[SmsService] Invalid or empty phone number provided. Skipping SMS.`);
      return false;
    }

    if (!this.twilioClient) {
      this.logger.log(`[SMS Dispatched (Dev Log)] To: ${to} | Message: "${messageBody}"`);
      return true;
    }

    try {
      const message = await this.twilioClient.messages.create({
        messagingServiceSid: this.messagingServiceSid,
        body: messageBody,
        to,
      });
      this.logger.log(`[SmsService] SMS sent successfully to ${to}, SID: ${message.sid}`);
      return true;
    } catch (err: any) {
      this.logger.error(`[SmsService] Failed to send SMS to ${to}: ${err.code ? `[Code ${err.code}] ` : ''}${err.message}`);
      return false;
    }
  }
}
