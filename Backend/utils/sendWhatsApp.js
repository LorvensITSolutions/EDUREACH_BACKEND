import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromWhatsAppNumber = process.env.TWILIO_WHATSAPP_NUMBER; // e.g. "+14155238886" (without whatsapp: prefix)

const client = twilio(accountSid, authToken);

export const sendWhatsApp = async ({ to, message }) => {
  return client.messages.create({
    from: fromWhatsAppNumber.startsWith('whatsapp:') ? fromWhatsAppNumber : `whatsapp:${fromWhatsAppNumber}`,
    to: `whatsapp:${to}`,
    body: message,
  });
};
