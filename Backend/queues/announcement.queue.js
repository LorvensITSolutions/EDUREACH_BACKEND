import Queue from 'bull';
import twilio from 'twilio';

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const TWILIO_WHATSAPP_NUMBER = 'whatsapp:' + process.env.TWILIO_WHATSAPP_NUMBER;

export const announcementQueue = new Queue('announcementQueue', {
  redis: { host: '127.0.0.1', port: 6379 }
});

announcementQueue.process(async (job) => {
  const { phone, messageText } = job.data;
  await client.messages.create({
    from: TWILIO_WHATSAPP_NUMBER,
    to: 'whatsapp:' + phone,
    body: messageText
  });
});
