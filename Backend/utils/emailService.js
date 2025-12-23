// // Email service utility
// // In production, integrate with services like SendGrid, AWS SES, or Nodemailer

// export const sendEmail = async ({ to, subject, html }) => {
//   // TODO: Implement actual email sending
//   // For now, just log the email content
//   console.log("📧 Email would be sent:");
//   console.log("To:", to);
//   console.log("Subject:", subject);
//   console.log("HTML:", html);
  
//   // In production, replace with actual email service:
//   // const nodemailer = require('nodemailer');
//   // const transporter = nodemailer.createTransporter({
//   //   service: 'gmail', // or your email service
//   //   auth: {
//   //     user: process.env.EMAIL_USER,
//   //     pass: process.env.EMAIL_PASS
//   //   }
//   // });
//   // 
//   // return await transporter.sendMail({
//   //   from: process.env.EMAIL_FROM,
//   //   to,
//   //   subject,
//   //   html
//   // });
  
//   return { success: true, messageId: 'mock-message-id' };
// };

// // Send absence alert email to parents
// export const sendAbsenceAlertEmail = async ({ to, studentName, date, reason }) => {
//   const subject = `Absence Alert - ${studentName}`;
//   const html = `
//     <h2>Absence Alert</h2>
//     <p>Dear Parent/Guardian,</p>
//     <p>This is to inform you that <strong>${studentName}</strong> was absent on <strong>${date}</strong>.</p>
    
//     ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
    
//     <p>Please ensure your child attends school regularly for their academic progress.</p>
    
//     <p style="color: #666; font-size: 14px;">
//       For any questions, please contact the school office.
//     </p>
    
//     <br/>
//     <p>Best regards,<br/>School Administration</p>
//   `;

//   return await sendEmail({ to, subject, html });
// };

// // Send basic email (simple text version)
// export const sendBasicEmail = async ({ to, subject, text }) => {
//   const html = `
//     <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
//       <div style="white-space: pre-line;">${text}</div>
//     </div>
//   `;
  
//   return await sendEmail({ to, subject, html });
// };


import nodemailer from "nodemailer";

// Create a reusable transporter using environment variables
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || "smtp.gmail.com",
  port: process.env.EMAIL_PORT || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Generic sendEmail function
export const sendEmail = async ({ to, subject, html, attachments = [] }) => {
  if (!to) throw new Error("Recipient email required");

  const info = await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to,
    subject,
    html,
    attachments, // optional array of { filename, path }
  });

  console.log("✅ Email sent:", info.messageId);
  return info;
};

// Absence alert email
export const sendAbsenceAlertEmail = async ({ to, studentName, date, reason }) => {
  const subject = `Absence Alert - ${studentName}`;
  const html = `
    <h2>Absence Alert</h2>
    <p>Dear Parent/Guardian,</p>
    <p>This is to inform you that <strong>${studentName}</strong> was absent on <strong>${date}</strong>.</p>
    ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
    <p>Please ensure your child attends school regularly for their academic progress.</p>
    <p style="color: #666; font-size: 14px;">For any questions, please contact the school office.</p>
    <br/>
    <p>Best regards,<br/>School Administration</p>
  `;

  return await sendEmail({ to, subject, html });
};

// Basic text email
export const sendBasicEmail = async ({ to, subject, text }) => {
  const html = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <div style="white-space: pre-line;">${text}</div>
  </div>`;
  
  return await sendEmail({ to, subject, html });
};

