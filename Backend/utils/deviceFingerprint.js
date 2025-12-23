import crypto from "crypto";

/**
 * Generate a device fingerprint from request headers and user agent
 * @param {Object} req - Express request object
 * @returns {string} - Device fingerprint hash
 */
export function generateDeviceFingerprint(req) {
  // Safely access headers with fallback
  const headers = req?.headers || {};
  const body = req?.body || {};
  
  // Primary identifiers from frontend (most reliable for React Native)
  // Check both nested deviceInfo object and direct properties for maximum compatibility
  const screenResolution = body.deviceInfo?.screenResolution || body.screenResolution || headers["x-screen-resolution"] || "";
  const timezone = body.deviceInfo?.timezone || body.timezone || headers["x-timezone"] || "";
  const platform = body.deviceInfo?.platform || body.platform || "";
  const deviceType = body.deviceInfo?.deviceType || body.deviceType || "";
  const userAgent = body.deviceInfo?.userAgent || body.userAgent || headers["user-agent"] || "";
  
  // Secondary identifiers from headers (may not be present in React Native)
  const acceptLanguage = headers["accept-language"] || "";
  const acceptEncoding = headers["accept-encoding"] || "";
  const connection = headers["connection"] || "";
  
  // Normalize values to ensure consistency (remove extra spaces, convert to lowercase where appropriate)
  const normalizedScreenResolution = screenResolution.trim().toLowerCase();
  const normalizedTimezone = timezone.trim();
  const normalizedPlatform = platform.trim().toLowerCase();
  const normalizedDeviceType = deviceType.trim();
  const normalizedUserAgent = userAgent.trim();
  
  // Combine device characteristics - prioritize frontend-sent data
  // This ensures consistency between login and 2FA verification
  // Order matters for hash consistency - keep this order fixed
  const deviceString = [
    normalizedScreenResolution,  // Primary: screen resolution
    normalizedTimezone,           // Primary: timezone
    normalizedPlatform,           // Primary: platform (ios/android)
    normalizedDeviceType,         // Primary: device type
    normalizedUserAgent,          // Primary: user agent from frontend
    acceptLanguage,               // Secondary: language
    acceptEncoding,               // Secondary: encoding
    connection,                   // Secondary: connection
  ].join("|");
  
  // Generate SHA-256 hash
  const fingerprint = crypto.createHash("sha256").update(deviceString).digest("hex");
  
  // Debug logging (can be removed in production)
  console.log("🔐 Generated device fingerprint:", {
    fingerprint: fingerprint.substring(0, 16) + "...",
    screenResolution: normalizedScreenResolution,
    timezone: normalizedTimezone,
    platform: normalizedPlatform,
    deviceType: normalizedDeviceType,
  });
  
  return fingerprint;
}

/**
 * Extract device information from user agent
 * @param {string} userAgent - User agent string
 * @returns {Object} - Device information
 */
export function parseDeviceInfo(userAgent) {
  const ua = userAgent || "";
  
  // Simple browser detection
  let browser = "Unknown";
  if (ua.includes("Chrome") && !ua.includes("Edg")) browser = "Chrome";
  else if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari";
  else if (ua.includes("Edg")) browser = "Edge";
  else if (ua.includes("Opera") || ua.includes("OPR")) browser = "Opera";
  
  // Simple OS detection
  let os = "Unknown";
  if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac OS X") || ua.includes("Macintosh")) os = "macOS";
  else if (ua.includes("Linux")) os = "Linux";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iOS") || ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";
  
  // Platform
  let platform = "Desktop";
  if (ua.includes("Mobile") || ua.includes("Android") || ua.includes("iPhone") || ua.includes("iPad")) {
    platform = "Mobile";
  } else if (ua.includes("Tablet")) {
    platform = "Tablet";
  }
  
  return {
    browser,
    os,
    platform,
    userAgent: ua.substring(0, 200), // Limit length
  };
}

/**
 * Generate a cryptographically secure device token
 * @returns {string} - Random device token
 */
export function generateDeviceToken() {
  return crypto.randomBytes(32).toString("hex");
}

