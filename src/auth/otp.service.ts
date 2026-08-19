import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OtpService {
  private twilioClient: any;

  constructor(private configService: ConfigService) {
    try {
      const twilio = require('twilio');
      const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID')?.trim();
      const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN')?.trim();
      if (accountSid && authToken) {
        this.twilioClient = new twilio(accountSid, authToken);
      } else {
        console.warn('[Twilio] Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN in environment variables.');
      }
    } catch (error) {
      console.warn('[Twilio] Initialization error:', error.message);
    }
  }

  /**
   * Generate a random 6-digit OTP
   */
  generateOtp(): string {
    return String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
  }

  /**
   * Send OTP via SMS using Twilio
   */
  async sendOtpViaSms(phoneNumber: string, otp: string): Promise<boolean> {
    console.log(`[SMS Disabled] SMS sending is disabled in development. Suppressed SMS to: ${phoneNumber}`);
    return false;
  }

  /**
   * Validate OTP expiry (5 minutes)
   */
  isOtpValid(otpCreatedAt: Date): boolean {
    if (!otpCreatedAt) return false;
    const expiryTime = 5 * 60 * 1000; // 5 minutes
    return Date.now() - new Date(otpCreatedAt).getTime() < expiryTime;
  }
}
