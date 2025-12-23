// smsSender.js
import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

const client = twilio(accountSid, authToken);

// Function to pause between batches
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Send SMS in batches to avoid rate limits
 * @param {string[]} numbers - List of phone numbers
 * @param {string} message - SMS message content
 * @param {number} batchSize - Numbers per batch
 * @param {number} delayMs - Delay between batches in ms
 */
export async function sendBulkSMS(numbers, message, batchSize = 50, delayMs = 1000) {
  console.log(`📢 Sending SMS to ${numbers.length} recipients...`);

  for (let i = 0; i < numbers.length; i += batchSize) {
    const batch = numbers.slice(i, i + batchSize);
    console.log(`📦 Sending batch ${i / batchSize + 1} (${batch.length} numbers)...`);

    await Promise.all(
      batch.map(async (num) => {
        try {
          await client.messages.create({
            body: message,
            from: twilioPhone,
            to: num,
          });
          console.log(`✅ Sent to ${num}`);
        } catch (err) {
          console.error(`❌ Failed to send to ${num}:`, err.message);
        }
      })
    );

    if (i + batchSize < numbers.length) {
      console.log(`⏳ Waiting ${delayMs}ms before next batch...`);
      await sleep(delayMs);
    }
  }

  console.log("🎉 All messages sent!");
}
