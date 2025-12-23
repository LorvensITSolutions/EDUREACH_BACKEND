const nodemailer = require("nodemailer");

class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  initializeTransporter() {
    // Create transporter for development (using ethereal email)
    if (
      process.env.NODE_ENV === "development" &&
      (!process.env.SMTP_USER ||
        process.env.SMTP_USER === "your-email@gmail.com")
    ) {
      // Use Ethereal Email for development when SMTP is not configured
      this.transporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: {
          user: "test@ethereal.email",
          pass: "test123",
        },
      });
    } else {
      // Production email configuration or configured development
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: process.env.SMTP_PORT || 587,
        secure: process.env.SMTP_SECURE === "true",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    }
  }

  async sendEmail(options) {
    try {
      const mailOptions = {
        from: process.env.SMTP_FROM || "noreply@xcompany.com",
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      };

      const info = await this.transporter.sendMail(mailOptions);

      if (process.env.NODE_ENV === "development") {
        // Preview URL for development
      }

      return info;
    } catch (error) {
      // Provide more helpful error messages
      if (error.code === "EAUTH") {
        // SMTP Authentication failed
      } else if (error.code === "ECONNECTION") {
        // SMTP Connection failed
      }

      throw error;
    }
  }

  async sendPasswordResetEmail(user, resetToken) {
    const resetURL = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Password Reset Request</h2>
        <p>Hello ${user.name},</p>
        <p>You requested a password reset for your X Company attendance account.</p>
        <p>Click the button below to reset your password:</p>
        <a href="${resetURL}" style="display: inline-block; background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 20px 0;">
          Reset Password
        </a>
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #666;">${resetURL}</p>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request this password reset, please ignore this email.</p>
        <p>Best regards,<br>X Company IT Team</p>
      </div>
    `;

    const text = `
      Password Reset Request
      
      Hello ${user.name},
      
      You requested a password reset for your X Company attendance account.
      
      Click the link below to reset your password:
      ${resetURL}
      
      This link will expire in 1 hour.
      
      If you didn't request this password reset, please ignore this email.
      
      Best regards,
      X Company IT Team
    `;

    return this.sendEmail({
      to: user.email,
      subject: "Password Reset Request - X Company",
      html,
      text,
    });
  }

  async sendWelcomeEmail(user) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Welcome to X Company!</h2>
        <p>Hello ${user.name},</p>
        <p>Welcome to the X Company attendance management system!</p>
        <p>Your account has been successfully created with the following details:</p>
        <ul>
          <li><strong>Employee ID:</strong> ${user.employeeId}</li>
          <li><strong>Department:</strong> ${user.department}</li>
          <li><strong>Email:</strong> ${user.email}</li>
        </ul>
        <p>You can now log in to the system and start using the attendance features.</p>
        <p>If you have any questions, please contact your administrator.</p>
        <p>Best regards,<br>X Company IT Team</p>
      </div>
    `;

    const text = `
      Welcome to X Company!
      
      Hello ${user.name},
      
      Welcome to the X Company attendance management system!
      
      Your account has been successfully created with the following details:
      - Employee ID: ${user.employeeId}
      - Department: ${user.department}
      - Email: ${user.email}
      
      You can now log in to the system and start using the attendance features.
      
      If you have any questions, please contact your administrator.
      
      Best regards,
      X Company IT Team
    `;

    return this.sendEmail({
      to: user.email,
      subject: "Welcome to X Company - Account Created",
      html,
      text,
    });
  }

  async sendAccountDeactivationEmail(user) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #d32f2f;">Account Deactivated</h2>
        <p>Hello ${user.name},</p>
        <p>Your X Company attendance account has been deactivated by an administrator.</p>
        <p>You will no longer be able to access the attendance system.</p>
        <p>If you believe this is an error, please contact your administrator immediately.</p>
        <p>Best regards,<br>X Company IT Team</p>
      </div>
    `;

    const text = `
      Account Deactivated
      
      Hello ${user.name},
      
      Your X Company attendance account has been deactivated by an administrator.
      
      You will no longer be able to access the attendance system.
      
      If you believe this is an error, please contact your administrator immediately.
      
      Best regards,
      X Company IT Team
    `;

    return this.sendEmail({
      to: user.email,
      subject: "Account Deactivated - X Company",
      html,
      text,
    });
  }

  async sendAccountActivationEmail(user) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #388e3c;">Account Activated</h2>
        <p>Hello ${user.name},</p>
        <p>Your X Company attendance account has been activated by an administrator.</p>
        <p>You can now log in to the attendance system and start using all features.</p>
        <p>If you have any questions, please contact your administrator.</p>
        <p>Best regards,<br>X Company IT Team</p>
      </div>
    `;

    const text = `
      Account Activated
      
      Hello ${user.name},
      
      Your X Company attendance account has been activated by an administrator.
      
      You can now log in to the attendance system and start using all features.
      
      If you have any questions, please contact your administrator.
      
      Best regards,
      X Company IT Team
    `;

    return this.sendEmail({
      to: user.email,
      subject: "Account Activated - X Company",
      html,
      text,
    });
  }

  async sendSecurityAlert(user, action, details) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #f57c00;">Security Alert</h2>
        <p>Hello ${user.name},</p>
        <p>We detected a security-related action on your X Company attendance account:</p>
        <p><strong>Action:</strong> ${action}</p>
        <p><strong>Details:</strong> ${details}</p>
        <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
        <p>If you did not perform this action, please contact your administrator immediately.</p>
        <p>Best regards,<br>X Company IT Team</p>
      </div>
    `;

    const text = `
      Security Alert
      
      Hello ${user.name},
      
      We detected a security-related action on your X Company attendance account:
      
      Action: ${action}
      Details: ${details}
      Time: ${new Date().toLocaleString()}
      
      If you did not perform this action, please contact your administrator immediately.
      
      Best regards,
      X Company IT Team
    `;

    return this.sendEmail({
      to: user.email,
      subject: "Security Alert - X Company",
      html,
      text,
    });
  }

  async sendNewEmployeeNotification(user, adminName, password) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">New Employee Account Created</h2>
        <p>Hello ${user.name},</p>
        <p>Your X Company attendance account has been created by ${adminName}.</p>
        <p>Here are your login credentials:</p>
        <ul>
          <li><strong>Email:</strong> ${user.email}</li>
          <li><strong>Temporary Password:</strong> ${password}</li>
          </ul>
        <p><strong>Important:</strong> Please change your password after your first login for security purposes.</p>
        <p>You can now log in to the attendance system and start using all features.</p>
        <p>If you have any questions, please contact your administrator.</p>
        <p>Best regards,<br>X Company IT Team</p>
      </div>
    `;

    const text = `
      New Employee Account Created
      
      Hello ${user.name},
      
      Your X Company attendance account has been created by ${adminName}.
      
      Here are your login credentials:
      - Email: ${user.email}
      - Temporary Password: ${password}
      
      Important: Please change your password after your first login for security purposes.

      You can now log in to the attendance system and start using all features.
      
      If you have any questions, please contact your administrator.
      
      Best regards,
      X Company IT Team
    `;

    return this.sendEmail({
      to: user.email,
      subject: "New Employee Account - X Company",
      html,
      text,
    });
  }

  async sendEmployeeInvitation(user, adminName, invitationToken) {
    const invitationURL = `${process.env.FRONTEND_URL}/verify-invitation/${invitationToken}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">You're Invited to Join X Company!</h2>
        <p>Hello ${user.name},</p>
        <p>You have been invited by ${adminName} to join the X Company attendance management system.</p>
        <p>Your account details:</p>
        <ul>
          <li><strong>Employee ID:</strong> ${user.employeeId}</li>
          <li><strong>Department:</strong> ${user.department}</li>
          <li><strong>Email:</strong> ${user.email}</li>
          </ul>
        <p>Click the button below to verify your invitation and set up your account:</p>
        <a href="${invitationURL}" style="display: inline-block; background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 20px 0;">
          Verify Invitation
        </a>
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #666;">${invitationURL}</p>
        <p>This invitation will expire in 24 hours.</p>
        <p>If you have any questions, please contact your administrator.</p>
        <p>Best regards,<br>X Company IT Team</p>
      </div>
    `;

    const text = `
      You're Invited to Join X Company!
      
      Hello ${user.name},
      
      You have been invited by ${adminName} to join the X Company attendance management system.
      
      Your account details:
      - Employee ID: ${user.employeeId}
      - Department: ${user.department}
      - Email: ${user.email}
      
      Click the link below to verify your invitation and set up your account:
      ${invitationURL}
      
      This invitation will expire in 24 hours.
      
      If you have any questions, please contact your administrator.
      
      Best regards,
      X Company IT Team
    `;

    return this.sendEmail({
      to: user.email,
      subject: "Invitation to Join X Company",
      html,
      text,
    });
  }

  async sendAdminInvitation(adminUser, invitedByName) {
  const loginURL = `${process.env.FRONTEND_URL}/login`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">You're Invited to Join X Company as an Admin!</h2>
      <p>Hello ${adminUser.name},</p>
      <p>You have been invited by ${invitedByName} to join the X Company attendance management system as an administrator.</p>
      <p>Click the button below to log in and get started:</p>
      <a href="${loginURL}" style="display: inline-block; background-color: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 20px 0;">
        Go to Login
      </a>
      <p>If the button doesn't work, copy and paste this link into your browser:</p>
      <p style="word-break: break-all; color: #666;">${loginURL}</p>
      <p>If you have any questions, please contact your system administrator.</p>
      <p>Best regards,<br>X Company IT Team</p>
    </div>
  `;

  const text = `
    You're Invited to Join X Company as an Admin!
    
    Hello ${adminUser.name},
    
    You have been invited by ${invitedByName} to join the X Company attendance management system as an administrator.

    Click the link below to log in and get started:
    ${loginURL}

    If you have any questions, please contact your system administrator.

    Best regards,
    X Company IT Team
  `;

  return this.sendEmail({
    to: adminUser.email,
    subject: "Admin Invitation to Join X Company",
    html,
    text,
  });
}


  async sendEmailVerification(user, verificationToken) {
    const verificationURL = `${process.env.FRONTEND_URL}/verify-email/${verificationToken}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Verify Your Email Address</h2>
        <p>Hello ${user.name},</p>
        <p>Thank you for registering with X Company! To complete your registration, please verify your email address.</p>
        <p>Click the button below to verify your email:</p>
        <a href="${verificationURL}" style="display: inline-block; background-color: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 20px 0;">
          Verify Email
        </a>
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #666;">${verificationURL}</p>
        <p>This verification link will expire in 24 hours.</p>
        <p>If you didn't create an account with us, please ignore this email.</p>
        <p>Best regards,<br>X Company IT Team</p>
      </div>
    `;

    const text = `
      Verify Your Email Address
      
      Hello ${user.name},
      
      Thank you for registering with X Company! To complete your registration, please verify your email address.
      
      Click the link below to verify your email:
      ${verificationURL}
      
      This verification link will expire in 24 hours.
      
      If you didn't create an account with us, please ignore this email.
      
      Best regards,
      X Company IT Team
    `;

    return this.sendEmail({
      to: user.email,
      subject: "Verify Your Email - X Company",
      html,
      text,
    });
  }
}

module.exports = new EmailService();
