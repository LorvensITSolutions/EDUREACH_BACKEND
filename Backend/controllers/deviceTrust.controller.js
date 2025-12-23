import DeviceTrust from "../models/deviceTrust.model.js";
import { generateDeviceFingerprint, parseDeviceInfo, generateDeviceToken } from "../utils/deviceFingerprint.js";
import { sendEmail } from "../utils/emailService.js";
import User from "../models/user.model.js";

/**
 * Check if device is trusted for a user
 * GET /api/auth/device-trust/check
 * Headers: device-token (optional)
 */
export const checkDeviceTrust = async (req, res) => {
  try {
    const userId = req.user?._id || req.body?.userId;
    const deviceToken = req.headers["device-token"] || req.cookies?.deviceToken || req.body?.deviceToken;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    if (!deviceToken) {
      return res.status(200).json({ isTrusted: false, message: "No device token provided" });
    }

    // Find trusted device
    const trustedDevice = await DeviceTrust.findOne({
      userId,
      deviceToken,
      isActive: true,
      expiresAt: { $gt: new Date() },
    });

    if (!trustedDevice) {
      return res.status(200).json({ isTrusted: false, message: "Device not trusted or expired" });
    }

    // Update last used timestamp
    trustedDevice.lastUsed = new Date();
    await trustedDevice.save();

    return res.status(200).json({
      isTrusted: true,
      deviceInfo: trustedDevice.deviceInfo,
      expiresAt: trustedDevice.expiresAt,
    });
  } catch (error) {
    console.error("Check device trust error:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Create a trusted device after successful 2FA
 * POST /api/auth/device-trust/create
 * Body: { rememberDevice: true, screenResolution, timezone }
 */
export const createDeviceTrust = async (req, res) => {
  try {
    const userId = req.user?._id || req.body?.userId;
    const { rememberDevice, screenResolution, timezone } = req.body;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    if (!rememberDevice) {
      return res.status(200).json({ message: "Device trust not requested" });
    }

    // Generate device token and fingerprint
    const deviceToken = generateDeviceToken();
    const deviceFingerprint = generateDeviceFingerprint({
      ...req,
      body: { ...req.body, screenResolution, timezone },
    });
    const deviceInfo = parseDeviceInfo(req.headers["user-agent"]);

    // Get IP address
    const ipAddress = req.ip || req.connection.remoteAddress || req.headers["x-forwarded-for"]?.split(",")[0] || "unknown";

    // Set expiration (30 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    // Create device trust record
    const trustedDevice = await DeviceTrust.create({
      userId,
      deviceToken,
      deviceFingerprint,
      deviceInfo,
      ipAddress,
      expiresAt,
      isActive: true,
    });

    // Get user for email notification
    const user = await User.findById(userId).select("name email");
    if (user && user.email) {
      try {
        await sendEmail({
          to: user.email,
          subject: "New Device Trusted - Security Alert",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #333;">New Device Trusted</h2>
              <p>Hello ${user.name},</p>
              <p>A new device has been trusted for your account:</p>
              <div style="background-color: #f4f4f4; padding: 15px; margin: 20px 0; border-radius: 5px;">
                <p><strong>Browser:</strong> ${deviceInfo.browser}</p>
                <p><strong>Operating System:</strong> ${deviceInfo.os}</p>
                <p><strong>Platform:</strong> ${deviceInfo.platform}</p>
                <p><strong>IP Address:</strong> ${ipAddress}</p>
                <p><strong>Trusted Until:</strong> ${expiresAt.toLocaleDateString()}</p>
              </div>
              <p>If you did not authorize this device, please revoke it immediately from your Security Settings.</p>
              <p style="color: #666; font-size: 12px; margin-top: 20px;">This is an automated security notification.</p>
            </div>
          `,
        });
      } catch (emailError) {
        console.error("Failed to send device trust email:", emailError);
        // Don't fail the request if email fails
      }
    }

    // Set device token in httpOnly cookie
    res.cookie("deviceToken", deviceToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax", // Use "lax" in development for better compatibility
      path: "/", // Make cookie available for all paths
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    return res.status(201).json({
      success: true,
      message: "Device trusted successfully",
      deviceToken,
      expiresAt,
    });
  } catch (error) {
    console.error("Create device trust error:", error);
    return res.status(500).json({ message: "Failed to trust device", error: error.message });
  }
};

/**
 * Get all trusted devices for a user
 * GET /api/auth/device-trust/devices
 */
export const getTrustedDevices = async (req, res) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const trustedDevices = await DeviceTrust.find({
      userId,
      isActive: true,
      expiresAt: { $gt: new Date() },
    })
      .sort({ lastUsed: -1 })
      .select("-deviceToken -deviceFingerprint -__v");

    return res.status(200).json({
      success: true,
      devices: trustedDevices,
    });
  } catch (error) {
    console.error("Get trusted devices error:", error);
    return res.status(500).json({ message: "Failed to get trusted devices", error: error.message });
  }
};

/**
 * Revoke a specific trusted device
 * DELETE /api/auth/device-trust/devices/:deviceId
 */
export const revokeDevice = async (req, res) => {
  try {
    const userId = req.user?._id;
    const { deviceId } = req.params;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const device = await DeviceTrust.findOne({
      _id: deviceId,
      userId,
    });

    if (!device) {
      return res.status(404).json({ message: "Device not found" });
    }

    device.isActive = false;
    await device.save();

    return res.status(200).json({
      success: true,
      message: "Device revoked successfully",
    });
  } catch (error) {
    console.error("Revoke device error:", error);
    return res.status(500).json({ message: "Failed to revoke device", error: error.message });
  }
};

/**
 * Revoke all trusted devices for a user
 * DELETE /api/auth/device-trust/devices
 */
export const revokeAllDevices = async (req, res) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    await DeviceTrust.updateMany(
      { userId, isActive: true },
      { isActive: false }
    );

    // Clear device token cookie
    res.clearCookie("deviceToken");

    return res.status(200).json({
      success: true,
      message: "All devices revoked successfully",
    });
  } catch (error) {
    console.error("Revoke all devices error:", error);
    return res.status(500).json({ message: "Failed to revoke devices", error: error.message });
  }
};

