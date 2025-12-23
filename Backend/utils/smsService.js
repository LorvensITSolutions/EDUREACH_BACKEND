// smsService.js - Single SMS sending for 2FA
import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

// Initialize Twilio client
const client = twilio(accountSid, authToken);

/**
 * Send a single SMS message
 * @param {string} to - Phone number to send to (E.164 format: +1234567890)
 * @param {string} message - SMS message content
 * @returns {Promise<Object>} Twilio message object
 */
export async function sendSMS(to, message) {
  try {
    // Validate phone number format (should be E.164 format)
    if (!to || !to.startsWith('+')) {
      throw new Error("Phone number must be in E.164 format (e.g., +1234567890)");
    }

    // Validate Twilio credentials
    if (!accountSid || !authToken || !twilioPhone) {
      throw new Error("Twilio credentials not configured. Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER in .env");
    }

    const messageResult = await client.messages.create({
      body: message,
      from: twilioPhone,
      to: to,
    });

    console.log(`✅ SMS sent successfully to ${to}. Message SID: ${messageResult.sid}`);
    return messageResult;
  } catch (error) {
    console.error(`❌ Failed to send SMS to ${to}:`, error.message);
    throw error;
  }
}

/**
 * Format phone number to E.164 format
 * @param {string} phone - Phone number in any format
 * @returns {string} Phone number in E.164 format
 */
export function formatPhoneNumber(phone) {
  if (!phone) return null;
  
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');
  
  // If it starts with country code, add +
  if (digits.length >= 10) {
    // For Indian numbers (10 digits), add +91
    if (digits.length === 10) {
      return `+91${digits}`;
    }
    // For numbers with country code, add +
    if (digits.length > 10) {
      return `+${digits}`;
    }
  }
  
  return null;
}

