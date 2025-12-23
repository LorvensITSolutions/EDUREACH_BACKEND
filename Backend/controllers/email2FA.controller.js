import crypto from "crypto";
import { redis } from "../lib/redis.js";
import User from "../models/user.model.js";
import { sendEmail } from "../utils/emailService.js";
import jwt from "jsonwebtoken";

/**
 * Send email 2FA code after password verification
 * POST /api/auth/email-2fa/send
 * Body: { email: "...", password: "..." }
 */
export const sendEmail2FACode = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    // Find user by email
    const user = await User.findOne({ email }).select("+password +email2FAEnabled +email");
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid password" });
    }

    // Check if email 2FA is enabled
    if (!user.email2FAEnabled) {
      return res.status(400).json({ message: "Email 2FA is not enabled for this account" });
    }

    // Check if user has an email
    if (!user.email) {
      return res.status(400).json({ message: "No email address associated with this account" });
    }

    // Generate 6-digit code
    const code = crypto.randomInt(100000, 999999).toString();
    
    // Store code in Redis with 10 minutes expiration
    const codeKey = `email_2fa:${user._id}`;
    await redis.set(codeKey, code, "EX", 10 * 60); // 10 minutes

    // Send email with code
    const emailSubject = "Your Login Verification Code";
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #333;">Login Verification Code</h2>
        <p>Hello ${user.name},</p>
        <p>You have requested to log in to your account. Please use the following verification code:</p>
        <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0; border-radius: 5px;">
          <h1 style="color: #007bff; font-size: 32px; margin: 0; letter-spacing: 5px;">${code}</h1>
        </div>
        <p>This code will expire in <strong>10 minutes</strong>.</p>
        <p>If you didn't request this code, please ignore this email or contact support if you have concerns.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #666; font-size: 12px;">This is an automated message. Please do not reply to this email.</p>
      </div>
    `;

    try {
      await sendEmail({
        to: user.email,
        subject: emailSubject,
        html: emailHtml,
      });

      console.log(`✅ Email 2FA code sent to ${user.email} for user ${user._id}`);

      res.status(200).json({
        success: true,
        message: "Verification code sent to your email",
        userId: user._id.toString(),
        // Don't send the code in response for security
      });
    } catch (emailError) {
      console.error("Failed to send email 2FA code:", emailError);
      // Delete the code from Redis if email fails
      await redis.del(codeKey);
      return res.status(500).json({ 
        message: "Failed to send verification code. Please try again later." 
      });
    }
  } catch (error) {
    console.error("Send email 2FA code error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Verify email 2FA code and complete login
 * POST /api/auth/email-2fa/verify
 * Body: { code: "123456", userId: "..." }
 */
export const verifyEmail2FACode = async (req, res) => {
  try {
    const { code, userId, rememberDevice, screenResolution, timezone } = req.body;

    if (!code || !userId) {
      return res.status(400).json({ message: "Code and userId are required" });
    }

    // Ensure code is a string and exactly 6 digits
    const codeString = String(code).trim();
    if (!codeString || codeString.length !== 6 || !/^\d{6}$/.test(codeString)) {
      return res.status(400).json({ message: "Please enter a valid 6-digit code" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.email2FAEnabled) {
      return res.status(400).json({ message: "Email 2FA is not enabled for this account" });
    }

    // Get stored code from Redis
    const codeKey = `email_2fa:${user._id}`;
    const storedCode = await redis.get(codeKey);

    if (!storedCode) {
      return res.status(400).json({ 
        message: "Code expired or invalid. Please request a new code." 
      });
    }

    // Verify code
    if (storedCode !== codeString) {
      return res.status(400).json({ message: "Invalid code. Please try again." });
    }

    // Code is valid - delete it from Redis (one-time use)
    await redis.del(codeKey);

    // Generate tokens and complete login
    const accessToken = jwt.sign({ userId: user._id }, process.env.ACCESS_TOKEN_SECRET, {
      expiresIn: "2h",
    });

    const refreshToken = jwt.sign({ userId: user._id }, process.env.REFRESH_TOKEN_SECRET, {
      expiresIn: "7d",
    });

    // Store refresh token
    await redis.set(`refresh_token:${user._id}`, refreshToken, "EX", 7 * 24 * 60 * 60);

    // Set cookies
    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 2 * 60 * 60 * 1000, // 2 hours
    });
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Create device trust if requested
    let deviceToken = null;
    if (rememberDevice) {
      console.log("🔐 Creating device trust for user (Email 2FA):", user._id.toString());
      try {
        const DeviceTrust = (await import("../models/deviceTrust.model.js")).default;
        const { generateDeviceToken, generateDeviceFingerprint, parseDeviceInfo } = await import("../utils/deviceFingerprint.js");
        
        deviceToken = generateDeviceToken();
        // Pass req directly and merge body data
        const reqWithDeviceInfo = {
          ...req,
          headers: req.headers || {},
          body: { ...req.body, screenResolution, timezone },
        };
        const deviceFingerprint = generateDeviceFingerprint(reqWithDeviceInfo);
        const deviceInfo = parseDeviceInfo(req.headers?.["user-agent"] || "");
        const ipAddress = req.ip || req.connection.remoteAddress || req.headers["x-forwarded-for"]?.split(",")[0] || "unknown";
        
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);
        
        const trustedDevice = await DeviceTrust.create({
          userId: user._id,
          deviceToken,
          deviceFingerprint,
          deviceInfo,
          ipAddress,
          expiresAt,
          isActive: true,
        });
        
        console.log("✅ Device trust created (Email 2FA):", {
          deviceId: trustedDevice._id.toString(),
          userId: user._id.toString(),
        });
        
        // Set device token in cookie
        res.cookie("deviceToken", deviceToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax", // Use "lax" in development for better compatibility
          path: "/", // Make cookie available for all paths
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        });
        
        console.log("🍪 Device token cookie set (Email 2FA)");
      } catch (deviceError) {
        console.error("❌ Failed to create device trust (Email 2FA):", deviceError);
        // Don't fail the login if device trust creation fails
      }
    }

    console.log(`✅ Email 2FA verified successfully for user ${user._id}`);

    res.status(200).json({
      success: true,
      message: "Email 2FA verified successfully. Login complete.",
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
      deviceToken, // Return device token if created
    });
  } catch (error) {
    console.error("Verify email 2FA code error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Enable email 2FA for a user
 * POST /api/auth/email-2fa/enable
 * Requires authentication
 */
export const enableEmail2FA = async (req, res) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.email) {
      return res.status(400).json({ 
        message: "No email address associated with your account. Please add an email first." 
      });
    }

    if (user.email2FAEnabled) {
      return res.status(400).json({ message: "Email 2FA is already enabled" });
    }

    user.email2FAEnabled = true;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Email 2FA has been successfully enabled",
    });
  } catch (error) {
    console.error("Enable email 2FA error:", error);
    res.status(500).json({ message: "Failed to enable email 2FA", error: error.message });
  }
};

/**
 * Disable email 2FA for a user
 * POST /api/auth/email-2fa/disable
 * Requires authentication
 */
export const disableEmail2FA = async (req, res) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.email2FAEnabled) {
      return res.status(400).json({ message: "Email 2FA is not enabled for this account" });
    }

    user.email2FAEnabled = false;
    await user.save();

    // Clean up any pending codes
    const codeKey = `email_2fa:${user._id}`;
    await redis.del(codeKey);

    res.status(200).json({
      success: true,
      message: "Email 2FA has been successfully disabled",
    });
  } catch (error) {
    console.error("Disable email 2FA error:", error);
    res.status(500).json({ message: "Failed to disable email 2FA", error: error.message });
  }
};

/**
 * Get email 2FA status
 * GET /api/auth/email-2fa/status
 * Requires authentication
 */
export const getEmail2FAStatus = async (req, res) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await User.findById(userId).select("email2FAEnabled email");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      success: true,
      email2FAEnabled: user.email2FAEnabled || false,
      hasEmail: !!user.email,
    });
  } catch (error) {
    console.error("Get email 2FA status error:", error);
    res.status(500).json({ message: "Failed to get email 2FA status", error: error.message });
  }
};

