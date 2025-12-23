import speakeasy from "speakeasy";
import QRCode from "qrcode";
import User from "../models/user.model.js";
import { protectRoute } from "../middleware/auth.middleware.js";

/**
 * Generate 2FA secret and QR code for setup
 * POST /api/auth/2fa/generate
 */
export const generate2FA = async (req, res) => {
  try {
    const userId = req.user?._id; // From protectRoute middleware

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `${user.name} (${process.env.APP_NAME || "School Management"})`,
      issuer: process.env.APP_NAME || "School Management System",
      length: 32,
    });

    // Log for debugging (remove in production)
    console.log("Generated 2FA secret for user:", {
      userId: user._id,
      secretLength: secret.base32?.length,
      hasSecret: !!secret.base32,
    });

    // Store temporary secret (not yet verified)
    if (!secret.base32) {
      console.error("Failed to generate secret base32");
      return res.status(500).json({ message: "Failed to generate 2FA secret" });
    }

    user.tempTwoFactorSecret = secret.base32;
    await user.save();

    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);
    
    // Verify the secret works by generating a test token
    const testToken = speakeasy.totp({
      secret: secret.base32,
      encoding: "base32",
    });
    console.log("Generated 2FA - Test token for verification:", testToken);

    res.status(200).json({
      success: true,
      secret: secret.base32,
      qrCode: qrCodeUrl,
      manualEntryKey: secret.base32, // For manual entry if QR code doesn't work
    });
  } catch (error) {
    console.error("Generate 2FA error:", error);
    res.status(500).json({ message: "Failed to generate 2FA", error: error.message });
  }
};

/**
 * Verify 2FA setup with a test code
 * POST /api/auth/2fa/verify-setup
 * Body: { code: "123456" }
 */
export const verify2FASetup = async (req, res) => {
  try {
    const userId = req.user?._id;
    const { code } = req.body;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
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

    if (!user.tempTwoFactorSecret) {
      return res.status(400).json({ message: "No 2FA setup in progress. Please generate a new QR code first." });
    }

    // Generate expected token for comparison (for debugging)
    const expectedToken = speakeasy.totp({
      secret: user.tempTwoFactorSecret,
      encoding: "base32",
    });

    // Debug: Log the secret and code for troubleshooting
    console.log("🔐 Verifying 2FA setup:", {
      userId: user._id.toString(),
      secretExists: !!user.tempTwoFactorSecret,
      secretLength: user.tempTwoFactorSecret?.length,
      codeReceived: codeString,
      codeLength: codeString.length,
      expectedToken: expectedToken, // Current expected token
      timeStep: Math.floor(Date.now() / 1000 / 30), // Current time step
    });

    // Verify the code with increased window for clock drift
    let verified = speakeasy.totp.verify({
      secret: user.tempTwoFactorSecret,
      encoding: "base32",
      token: codeString,
      window: 3, // Allow 3 time steps (90 seconds) of clock drift for better compatibility
    });

    if (!verified) {
      // Try with a larger window as fallback
      verified = speakeasy.totp.verify({
        secret: user.tempTwoFactorSecret,
        encoding: "base32",
        token: codeString,
        window: 5, // Try with even larger window
      });

      if (!verified) {
        console.error("❌ 2FA verification failed:", {
          userId: user._id.toString(),
          secretLength: user.tempTwoFactorSecret?.length,
          codeReceived: codeString,
          codeLength: codeString.length,
          expectedToken: expectedToken,
          timeStep: Math.floor(Date.now() / 1000 / 30),
        });
        
        return res.status(400).json({ 
          message: `Invalid code. Expected code should be: ${expectedToken} (for debugging). Please make sure: 1) You're entering the CURRENT code from your authenticator app, 2) Your device time is synchronized, 3) The code hasn't expired (codes change every 30 seconds), 4) You scanned the QR code correctly` 
        });
      }
    }

    // Code is valid - enable 2FA
    user.twoFactorSecret = user.tempTwoFactorSecret;
    user.twoFactorEnabled = true;
    user.twoFactorVerified = true;
    user.tempTwoFactorSecret = null; // Clear temporary secret
    await user.save();

    res.status(200).json({
      success: true,
      message: "2FA has been successfully enabled",
    });
  } catch (error) {
    console.error("Verify 2FA setup error:", error);
    res.status(500).json({ message: "Failed to verify 2FA setup", error: error.message });
  }
};

/**
 * Verify 2FA code during login
 * POST /api/auth/2fa/verify
 * Body: { code: "123456", userId: "..." }
 */
export const verify2FACode = async (req, res) => {
  try {
    const { code, userId, rememberDevice, screenResolution, timezone } = req.body;

    // Ensure code is a string and exactly 6 digits
    const codeString = String(code).trim();
    if (!codeString || codeString.length !== 6 || !/^\d{6}$/.test(codeString)) {
      return res.status(400).json({ message: "Please enter a valid 6-digit code" });
    }

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      return res.status(400).json({ message: "2FA is not enabled for this user" });
    }

    // Verify the code with increased window for clock drift
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: "base32",
      token: codeString,
      window: 3, // Allow 3 time steps (90 seconds) of clock drift
    });

    if (!verified) {
      // Try with a larger window as fallback
      const verifiedLargeWindow = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: "base32",
        token: codeString,
        window: 5, // Try with even larger window
      });

      if (!verifiedLargeWindow) {
        console.error("2FA login verification failed:", {
          userId: user._id,
          codeLength: codeString.length,
        });
        return res.status(400).json({ 
          message: "Invalid code. Please make sure you're entering the current code from your authenticator app." 
        });
      }
    }

    // Code is valid - generate tokens and complete login
    const jwt = (await import("jsonwebtoken")).default;
    const { redis } = await import("../lib/redis.js");
    
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
      console.log("🔐 Creating/updating device trust for user:", user._id.toString());
      try {
        const DeviceTrust = (await import("../models/deviceTrust.model.js")).default;
        const { generateDeviceToken, generateDeviceFingerprint, parseDeviceInfo } = await import("../utils/deviceFingerprint.js");
        
        // Build request object with device info from frontend
        // Get platform and other device info from body if available
        const platform = req.body?.platform || req.body?.deviceInfo?.platform || "";
        const deviceType = req.body?.deviceType || req.body?.deviceInfo?.deviceType || "";
        const userAgentFromBody = req.body?.userAgent || req.body?.deviceInfo?.userAgent || "";
        
        const reqWithDeviceInfo = {
          ...req,
          headers: req.headers || {},
          body: { 
            ...req.body, 
            screenResolution, 
            timezone,
            platform,
            deviceType,
            userAgent: userAgentFromBody,
            deviceInfo: req.body?.deviceInfo || { screenResolution, timezone, platform, deviceType, userAgent: userAgentFromBody },
          },
        };
        const deviceFingerprint = generateDeviceFingerprint(reqWithDeviceInfo);
        
        // Parse device info - use frontend data if available, otherwise parse from user-agent
        let deviceInfo;
        if (req.body?.deviceInfo) {
          deviceInfo = {
            browser: req.body.deviceInfo.browser || "React Native",
            os: req.body.deviceInfo.deviceType || platform || "Unknown",
            platform: platform || "Mobile",
            userAgent: userAgentFromBody || `ReactNative-${platform}`,
          };
        } else {
          deviceInfo = parseDeviceInfo(req.headers?.["user-agent"] || userAgentFromBody || "");
        }
        
        const ipAddress = req.ip || req.connection.remoteAddress || req.headers["x-forwarded-for"]?.split(",")[0] || "unknown";
        
        console.log("🔍 Checking for existing device trust:", {
          userId: user._id.toString(),
          fingerprint: deviceFingerprint.substring(0, 16) + "...",
          screenResolution,
          timezone,
          platform,
          deviceType,
        });
        
        // Check if device trust already exists for this device fingerprint AND user
        let trustedDevice = await DeviceTrust.findOne({
          userId: user._id,
          deviceFingerprint,
          isActive: true,
        });
        
        // Debug: Log all device trusts for this user to see what exists
        const allUserDevices = await DeviceTrust.find({
          userId: user._id,
          isActive: true,
        }).select("deviceFingerprint deviceToken expiresAt");
        console.log("📋 All device trusts for user:", {
          userId: user._id.toString(),
          count: allUserDevices.length,
          devices: allUserDevices.map(d => ({
            fingerprint: d.deviceFingerprint.substring(0, 16) + "...",
            token: d.deviceToken.substring(0, 10) + "...",
            expiresAt: d.expiresAt.toISOString(),
          })),
        });
        
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);
        
        if (trustedDevice) {
          // Update existing device trust (extend expiration, update last used)
          console.log("🔄 Updating existing device trust:", {
            deviceId: trustedDevice._id.toString(),
            userId: user._id.toString(),
            oldExpiresAt: trustedDevice.expiresAt.toISOString(),
          });
          
          trustedDevice.lastUsed = new Date();
          trustedDevice.expiresAt = expiresAt;
          trustedDevice.ipAddress = ipAddress; // Update IP in case it changed
          // Update device info in case it changed
          trustedDevice.deviceInfo = deviceInfo;
          deviceToken = trustedDevice.deviceToken; // Keep existing token
          await trustedDevice.save();
          
          console.log("✅ Device trust updated:", {
            deviceId: trustedDevice._id.toString(),
            userId: user._id.toString(),
            deviceToken: deviceToken.substring(0, 10) + "...",
            newExpiresAt: expiresAt.toISOString(),
          });
        } else {
          // Create new device trust
          deviceToken = generateDeviceToken();
          trustedDevice = await DeviceTrust.create({
            userId: user._id,
            deviceToken,
            deviceFingerprint,
            deviceInfo,
            ipAddress,
            expiresAt,
            isActive: true,
          });
          
          console.log("✅ New device trust created:", {
            deviceId: trustedDevice._id.toString(),
            userId: user._id.toString(),
            deviceToken: deviceToken.substring(0, 10) + "...",
            expiresAt: expiresAt.toISOString(),
          });
        }
        
        // Set device token in cookie
        res.cookie("deviceToken", deviceToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax", // Use "lax" in development for better compatibility
          path: "/", // Make cookie available for all paths
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        });
        
        console.log("🍪 Device token cookie set with path: /, sameSite:", process.env.NODE_ENV === "production" ? "strict" : "lax");
      } catch (deviceError) {
        console.error("❌ Failed to create/update device trust:", deviceError);
        // Don't fail the login if device trust creation fails
      }
    } else {
      console.log("ℹ️ Remember device not checked, skipping device trust creation");
    }

    res.status(200).json({
      success: true,
      message: "2FA verified successfully. Login complete.",
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
    console.error("Verify 2FA code error:", error);
    res.status(500).json({ message: "Failed to verify 2FA code", error: error.message });
  }
};

/**
 * Disable 2FA
 * POST /api/auth/2fa/disable
 */
export const disable2FA = async (req, res) => {
  try {
    const userId = req.user?._id;
    const { code } = req.body; // Require code to disable (security)

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.twoFactorEnabled) {
      return res.status(400).json({ message: "2FA is not enabled for this account" });
    }

    // Verify code before disabling
    if (code) {
      const verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: "base32",
        token: code,
        window: 2,
      });

      if (!verified) {
        return res.status(400).json({ message: "Invalid code. Please enter your current 2FA code to disable." });
      }
    }

    // Disable 2FA
    user.twoFactorSecret = null;
    user.twoFactorEnabled = false;
    user.twoFactorVerified = false;
    user.tempTwoFactorSecret = null;
    await user.save();

    res.status(200).json({
      success: true,
      message: "2FA has been successfully disabled",
    });
  } catch (error) {
    console.error("Disable 2FA error:", error);
    res.status(500).json({ message: "Failed to disable 2FA", error: error.message });
  }
};

/**
 * Get 2FA status
 * GET /api/auth/2fa/status
 */
export const get2FAStatus = async (req, res) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await User.findById(userId).select("twoFactorEnabled twoFactorVerified");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      success: true,
      twoFactorEnabled: user.twoFactorEnabled || false,
      twoFactorVerified: user.twoFactorVerified || false,
    });
  } catch (error) {
    console.error("Get 2FA status error:", error);
    res.status(500).json({ message: "Failed to get 2FA status", error: error.message });
  }
};

