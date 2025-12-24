import crypto from "crypto";
import { redis } from "../lib/redis.js";
import User from "../models/user.model.js";
import Student from "../models/student.model.js";
import Parent from "../models/parent.model.js";
import { sendSMS, formatPhoneNumber } from "../utils/smsService.js";
import jwt from "jsonwebtoken";

/**
 * Helper function to get phone number for a user
 * For students, returns parent's phone number if user doesn't have one
 * @param {Object} user - User document
 * @returns {Promise<string|null>} - Phone number or null
 */
async function getUserPhoneNumber(user) {
  // If user has a phone number, use it
  if (user.phone) {
    return user.phone;
  }

  // For students, get parent's phone number
  if (user.role === "student" && user.studentId) {
    try {
      const student = await Student.findById(user.studentId).populate("parent");
      if (student && student.parent && student.parent.phone) {
        return student.parent.phone;
      }
    } catch (error) {
      console.error("Error fetching parent phone for student:", error);
    }
  }

  return null;
}

/**
 * Send SMS 2FA code after password verification
 * POST /api/auth/sms-2fa/send
 * Body: { email: "...", password: "..." }
 */
export const sendSMS2FACode = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    // Find user by email
    const user = await User.findOne({ email }).select("+password +sms2FAEnabled +phone");
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid password" });
    }

    // Check if SMS 2FA is enabled
    if (!user.sms2FAEnabled) {
      return res.status(400).json({ message: "SMS 2FA is not enabled for this account" });
    }

    // Get phone number (user's phone or parent's phone for students)
    const phoneNumber = await getUserPhoneNumber(user);
    if (!phoneNumber) {
      return res.status(400).json({ 
        message: user.role === "student" 
          ? "No phone number found. Please ensure your parent has a phone number registered." 
          : "No phone number associated with this account" 
      });
    }

    // Generate 6-digit code
    const code = crypto.randomInt(100000, 999999).toString();
    
    // Store code in Redis with 10 minutes expiration
    const codeKey = `sms_2fa:${user._id}`;
    await redis.set(codeKey, code, "EX", 10 * 60); // 10 minutes

    // Format phone number to E.164 format
    const formattedPhone = formatPhoneNumber(phoneNumber);
    if (!formattedPhone) {
      return res.status(400).json({ message: "Invalid phone number format" });
    }

    // Send SMS with code
    const smsMessage = `Your login verification code is: ${code}. This code will expire in 10 minutes. Do not share this code with anyone.`;

    try {
      await sendSMS(formattedPhone, smsMessage);

      console.log(`✅ SMS 2FA code sent to ${formattedPhone} for user ${user._id}`);

      // Mask phone number in response (show only last 4 digits)
      const maskedPhone = formattedPhone.slice(0, -4) + "****";

      res.status(200).json({
        success: true,
        message: "Verification code sent to your phone",
        userId: user._id.toString(),
        phoneMasked: maskedPhone, // Show masked phone for user confirmation
        // Don't send the code in response for security
      });
    } catch (smsError) {
      console.error("Failed to send SMS 2FA code:", smsError);
      // Delete the code from Redis if SMS fails
      await redis.del(codeKey);
      return res.status(500).json({ 
        message: "Failed to send verification code. Please check your phone number and try again later." 
      });
    }
  } catch (error) {
    console.error("Send SMS 2FA code error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Verify SMS 2FA code and complete login
 * POST /api/auth/sms-2fa/verify
 * Body: { code: "123456", userId: "..." }
 */
export const verifySMS2FACode = async (req, res) => {
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

    if (!user.sms2FAEnabled) {
      return res.status(400).json({ message: "SMS 2FA is not enabled for this account" });
    }

    // Get stored code from Redis
    const codeKey = `sms_2fa:${user._id}`;
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
      secure: true, // Required for sameSite: 'none'
      sameSite: "none", // Allow cookies in cross-origin requests
      maxAge: 2 * 60 * 60 * 1000, // 2 hours
      path: "/",
    });
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: true, // Required for sameSite: 'none'
      sameSite: "none", // Allow cookies in cross-origin requests
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Create device trust if requested
    let deviceToken = null;
    if (rememberDevice) {
      console.log("🔐 Creating device trust for user (SMS 2FA):", user._id.toString());
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
        
        console.log("✅ Device trust created (SMS 2FA):", {
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
        
        console.log("🍪 Device token cookie set (SMS 2FA)");
      } catch (deviceError) {
        console.error("❌ Failed to create device trust (SMS 2FA):", deviceError);
        // Don't fail the login if device trust creation fails
      }
    }

    console.log(`✅ SMS 2FA verified successfully for user ${user._id}`);

    res.status(200).json({
      success: true,
      message: "SMS 2FA verified successfully. Login complete.",
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
    console.error("Verify SMS 2FA code error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Enable SMS 2FA for a user
 * POST /api/auth/sms-2fa/enable
 * Body: { phone: "+1234567890" } (optional - uses existing phone if not provided)
 * Requires authentication
 */
export const enableSMS2FA = async (req, res) => {
  try {
    const userId = req.user?._id;
    const { phone } = req.body;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // If phone is provided, update it (only for non-students or if explicitly provided)
    if (phone) {
      const formattedPhone = formatPhoneNumber(phone);
      if (!formattedPhone) {
        return res.status(400).json({ 
          message: "Invalid phone number format. Please use E.164 format (e.g., +1234567890)" 
        });
      }
      user.phone = formattedPhone;
    }

    // Get phone number (user's phone or parent's phone for students)
    const phoneNumber = await getUserPhoneNumber(user);
    if (!phoneNumber) {
      return res.status(400).json({ 
        message: user.role === "student"
          ? "No phone number found. Please ensure your parent has a phone number registered, or contact an administrator."
          : "No phone number found. Please provide a phone number to enable SMS 2FA." 
      });
    }

    if (user.sms2FAEnabled) {
      return res.status(400).json({ message: "SMS 2FA is already enabled" });
    }

    user.sms2FAEnabled = true;
    await user.save();

    // Mask phone number in response
    const maskedPhone = phoneNumber.slice(0, -4) + "****";
    const isParentPhone = user.role === "student" && !user.phone;

    res.status(200).json({
      success: true,
      message: "SMS 2FA has been successfully enabled",
      phoneMasked: maskedPhone,
      isParentPhone: isParentPhone, // Indicate if using parent's phone
    });
  } catch (error) {
    console.error("Enable SMS 2FA error:", error);
    res.status(500).json({ message: "Failed to enable SMS 2FA", error: error.message });
  }
};

/**
 * Disable SMS 2FA for a user
 * POST /api/auth/sms-2fa/disable
 * Requires authentication
 */
export const disableSMS2FA = async (req, res) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.sms2FAEnabled) {
      return res.status(400).json({ message: "SMS 2FA is not enabled for this account" });
    }

    user.sms2FAEnabled = false;
    await user.save();

    // Clean up any pending codes
    const codeKey = `sms_2fa:${user._id}`;
    await redis.del(codeKey);

    res.status(200).json({
      success: true,
      message: "SMS 2FA has been successfully disabled",
    });
  } catch (error) {
    console.error("Disable SMS 2FA error:", error);
    res.status(500).json({ message: "Failed to disable SMS 2FA", error: error.message });
  }
};

/**
 * Get SMS 2FA status
 * GET /api/auth/sms-2fa/status
 * Requires authentication
 */
export const getSMS2FAStatus = async (req, res) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await User.findById(userId).select("sms2FAEnabled phone role studentId");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Get phone number (user's phone or parent's phone for students)
    const phoneNumber = await getUserPhoneNumber(user);
    const isParentPhone = user.role === "student" && !user.phone && !!phoneNumber;

    // Mask phone number if present
    let phoneMasked = null;
    if (phoneNumber) {
      phoneMasked = phoneNumber.slice(0, -4) + "****";
    }

    res.status(200).json({
      success: true,
      sms2FAEnabled: user.sms2FAEnabled || false,
      hasPhone: !!phoneNumber,
      phoneMasked: phoneMasked,
      isParentPhone: isParentPhone, // Indicate if using parent's phone
    });
  } catch (error) {
    console.error("Get SMS 2FA status error:", error);
    res.status(500).json({ message: "Failed to get SMS 2FA status", error: error.message });
  }
};

/**
 * Update phone number for SMS 2FA
 * PUT /api/auth/sms-2fa/phone
 * Body: { phone: "+1234567890" }
 * Requires authentication
 */
export const updatePhoneNumber = async (req, res) => {
  try {
    const userId = req.user?._id;
    const { phone } = req.body;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!phone) {
      return res.status(400).json({ message: "Phone number is required" });
    }

    const formattedPhone = formatPhoneNumber(phone);
    if (!formattedPhone) {
      return res.status(400).json({ 
        message: "Invalid phone number format. Please use E.164 format (e.g., +1234567890)" 
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.phone = formattedPhone;
    await user.save();

    // Mask phone number in response
    const maskedPhone = formattedPhone.slice(0, -4) + "****";

    res.status(200).json({
      success: true,
      message: "Phone number updated successfully",
      phoneMasked: maskedPhone,
    });
  } catch (error) {
    console.error("Update phone number error:", error);
    res.status(500).json({ message: "Failed to update phone number", error: error.message });
  }
};

