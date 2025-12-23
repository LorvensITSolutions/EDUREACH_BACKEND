# Complete Authentication and Multi-Factor Authentication (MFA) Documentation

## Table of Contents
1. [Overview](#overview)
2. [Authentication Flow](#authentication-flow)
3. [Multi-Factor Authentication Methods](#multi-factor-authentication-methods)
4. [Device Trust System](#device-trust-system)
5. [Backend Implementation](#backend-implementation)
6. [Frontend Implementation](#frontend-implementation)
7. [API Endpoints](#api-endpoints)
8. [Security Features](#security-features)
9. [Testing Guide](#testing-guide)
10. [Troubleshooting](#troubleshooting)

---

## Overview

This system implements a comprehensive multi-factor authentication (MFA) solution with three authentication methods and a device trust system to reduce friction for trusted devices.

### Key Features
- **Three MFA Methods**: TOTP (Google Authenticator), SMS, and Email
- **Priority-Based MFA**: TOTP → SMS → Email (highest to lowest priority)
- **Device Trust**: "Remember this device" for 30 days
- **Role-Based Access**: Admin, Teacher, Student, Parent, Librarian
- **Secure Token Management**: JWT with refresh tokens
- **Cookie-Based Sessions**: HttpOnly, Secure cookies

---

## Authentication Flow

### Standard Login Flow (Without Device Trust)

```
1. User enters username/email + password
2. Backend verifies password
3. Backend checks for enabled MFA methods (in priority order):
   a. TOTP 2FA (highest priority)
   b. SMS 2FA (second priority)
   c. Email 2FA (third priority)
4. If MFA enabled → User enters verification code
5. If MFA verified → Login successful → Generate tokens → Set cookies
6. Navigate to role-based dashboard
```

### Login Flow with Device Trust

```
1. User enters username/email + password
2. Backend verifies password
3. Backend checks for device token in cookies
4. If device token found and valid:
   → Skip MFA → Direct login → Generate tokens → Set cookies
5. If no device token or invalid:
   → Follow standard MFA flow
   → If user checks "Remember this device":
     → Create device trust → Store in DB → Set cookie (30 days)
```

---

## Multi-Factor Authentication Methods

### 1. TOTP 2FA (Google Authenticator) - Highest Priority

**How It Works:**
- Uses Time-based One-Time Password (TOTP) algorithm
- Generates 6-digit codes that change every 30 seconds
- Works offline once set up
- No internet or SMS/email required

**Setup Process:**
1. User enables TOTP 2FA in Security Settings
2. Backend generates a secret key
3. Frontend displays QR code
4. User scans QR code with Google Authenticator app
5. User enters verification code to confirm setup
6. TOTP 2FA is now enabled

**Login Process:**
1. User enters password
2. System detects TOTP 2FA is enabled
3. User enters 6-digit code from authenticator app
4. Backend verifies code using secret key
5. If valid → Login successful

**Files:**
- Backend: `Backend/controllers/twoFactor.controller.js`
- Backend: `Backend/routes/twoFactor.route.js`
- Frontend: `project/src/components/stores/useTwoFactorStore.js`
- Frontend: `project/src/components/Auth/TwoFactorSetup.jsx`
- Frontend: `project/src/components/Auth/TwoFactorVerify.jsx`

---

### 2. SMS 2FA - Second Priority

**How It Works:**
- Sends 6-digit OTP code via SMS using Twilio
- Code expires in 10 minutes
- One-time use only
- For students: Uses parent's phone number if student doesn't have one

**Setup Process:**
1. User enables SMS 2FA in Security Settings
2. User provides phone number (or uses existing)
3. Phone number is validated and formatted (E.164 format)
4. SMS 2FA is enabled

**Login Process:**
1. User enters password
2. System detects SMS 2FA is enabled (if TOTP not enabled)
3. Backend generates 6-digit code
4. Code sent to user's phone (or parent's phone for students)
5. User enters code
6. Backend verifies code from Redis
7. If valid → Login successful

**Special Features:**
- **Student Support**: Automatically uses parent's phone number if student doesn't have one
- **Phone Formatting**: Automatically formats to E.164 format (+1234567890)
- **Masked Display**: Shows masked phone number (e.g., +1234****)

**Files:**
- Backend: `Backend/controllers/sms2FA.controller.js`
- Backend: `Backend/routes/sms2FA.route.js`
- Backend: `Backend/utils/smsService.js`
- Frontend: `project/src/components/stores/useSMS2FAStore.js`
- Frontend: `project/src/components/Auth/SMS2FAVerify.jsx`

**Environment Variables Required:**
```env
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=your_twilio_phone_number
```

---

### 3. Email 2FA - Third Priority

**How It Works:**
- Sends 6-digit OTP code via email
- Code expires in 10 minutes
- One-time use only
- Requires valid email address

**Setup Process:**
1. User enables Email 2FA in Security Settings
2. System checks if user has email address
3. Email 2FA is enabled

**Login Process:**
1. User enters password
2. System detects Email 2FA is enabled (if TOTP and SMS not enabled)
3. Backend generates 6-digit code
4. Code sent to user's email
5. User enters code
6. Backend verifies code from Redis
7. If valid → Login successful

**Files:**
- Backend: `Backend/controllers/email2FA.controller.js`
- Backend: `Backend/routes/email2FA.route.js`
- Frontend: `project/src/components/stores/useEmail2FAStore.js`
- Frontend: `project/src/components/Auth/Email2FAVerify.jsx`

---

## Device Trust System

### Overview

The Device Trust system allows users to skip 2FA verification on trusted devices for 30 days, reducing login friction while maintaining security.

### How It Works

1. **Device Trust Creation:**
   - User completes 2FA verification
   - User checks "Remember this device for 30 days"
   - Backend generates cryptographically secure device token
   - Device fingerprint created (browser, OS, screen, timezone)
   - Device trust record stored in database
   - Device token stored in httpOnly cookie (30 days)

2. **Device Trust Check:**
   - On login, backend checks for device token in cookies
   - If token found, queries database for valid device trust
   - If valid and not expired → Skip 2FA → Direct login
   - If invalid or expired → Require 2FA

3. **Device Management:**
   - Users can view all trusted devices in Security Settings
   - Shows device info: Browser, OS, IP, last used, expiration
   - Users can revoke individual devices
   - Users can revoke all devices at once

### Security Features

- **Cryptographically Secure Tokens**: 32-byte random tokens
- **Device Fingerprinting**: Browser, OS, screen resolution, timezone
- **Automatic Expiration**: 30 days (MongoDB TTL index)
- **HttpOnly Cookies**: Prevents XSS attacks
- **Email Notifications**: Alerts when new device is trusted
- **User Control**: Can revoke devices anytime

### Files

**Backend:**
- `Backend/models/deviceTrust.model.js` - Device trust schema
- `Backend/utils/deviceFingerprint.js` - Device fingerprinting utilities
- `Backend/controllers/deviceTrust.controller.js` - Device trust operations
- `Backend/routes/deviceTrust.route.js` - Device trust routes

**Frontend:**
- `project/src/components/stores/useDeviceTrustStore.js` - Device trust state management
- `project/src/components/admin/SecuritySettings.jsx` - Device management UI

---

## Backend Implementation

### Database Models

#### User Model (`Backend/models/user.model.js`)
```javascript
{
  // 2FA/MFA fields
  twoFactorSecret: String,           // TOTP secret key
  twoFactorEnabled: Boolean,         // TOTP 2FA enabled
  twoFactorVerified: Boolean,         // TOTP setup verified
  tempTwoFactorSecret: String,       // Temporary secret during setup
  email2FAEnabled: Boolean,          // Email 2FA enabled
  sms2FAEnabled: Boolean,            // SMS 2FA enabled
  phone: String,                     // Phone number (E.164 format)
}
```

#### Device Trust Model (`Backend/models/deviceTrust.model.js`)
```javascript
{
  userId: ObjectId,                  // Reference to User
  deviceToken: String,               // Unique device token
  deviceFingerprint: String,         // SHA-256 hash of device characteristics
  deviceInfo: {
    browser: String,
    os: String,
    platform: String,
    userAgent: String
  },
  ipAddress: String,
  lastUsed: Date,
  expiresAt: Date,                   // Auto-delete after expiration (TTL)
  isActive: Boolean
}
```

### Authentication Controller (`Backend/controllers/auth.controller.js`)

**Login Flow:**
1. Verify password
2. Check for trusted device (if device token in cookies)
3. If trusted → Skip 2FA → Login
4. If not trusted → Check MFA methods in priority:
   - TOTP 2FA (highest)
   - SMS 2FA (second)
   - Email 2FA (third)
5. Return appropriate response

**Key Functions:**
- `login()` - Main login handler with device trust and MFA checks
- `getUserPhoneNumber()` - Helper to get phone (user's or parent's for students)

### 2FA Controllers

#### TOTP 2FA (`Backend/controllers/twoFactor.controller.js`)
- `generate2FA()` - Generate secret and QR code
- `verify2FASetup()` - Verify setup code
- `verify2FACode()` - Verify login code (with device trust support)
- `disable2FA()` - Disable TOTP 2FA
- `get2FAStatus()` - Get TOTP 2FA status

#### SMS 2FA (`Backend/controllers/sms2FA.controller.js`)
- `sendSMS2FACode()` - Send SMS code
- `verifySMS2FACode()` - Verify SMS code (with device trust support)
- `enableSMS2FA()` - Enable SMS 2FA
- `disableSMS2FA()` - Disable SMS 2FA
- `getSMS2FAStatus()` - Get SMS 2FA status
- `updatePhoneNumber()` - Update phone number

#### Email 2FA (`Backend/controllers/email2FA.controller.js`)
- `sendEmail2FACode()` - Send email code
- `verifyEmail2FACode()` - Verify email code (with device trust support)
- `enableEmail2FA()` - Enable Email 2FA
- `disableEmail2FA()` - Disable Email 2FA
- `getEmail2FAStatus()` - Get Email 2FA status

### Device Trust Controller (`Backend/controllers/deviceTrust.controller.js`)

- `checkDeviceTrust()` - Check if device is trusted (public route)
- `createDeviceTrust()` - Create device trust (protected)
- `getTrustedDevices()` - Get all trusted devices (protected)
- `revokeDevice()` - Revoke specific device (protected)
- `revokeAllDevices()` - Revoke all devices (protected)

### Utilities

#### Device Fingerprinting (`Backend/utils/deviceFingerprint.js`)
- `generateDeviceFingerprint(req)` - Generate SHA-256 hash of device characteristics
- `parseDeviceInfo(userAgent)` - Parse browser, OS, platform from user agent
- `generateDeviceToken()` - Generate cryptographically secure token

#### SMS Service (`Backend/utils/smsService.js`)
- `sendSMS(phoneNumber, message)` - Send SMS via Twilio
- `formatPhoneNumber(phone)` - Format to E.164 format

---

## Frontend Implementation

### Stores (Zustand)

#### useTwoFactorStore (`project/src/components/stores/useTwoFactorStore.js`)
```javascript
{
  generate2FA: async () => {...},
  verify2FASetup: async (code) => {...},
  verify2FACode: async (code, userId, rememberDevice, screenResolution, timezone) => {...},
  disable2FA: async (code) => {...},
  get2FAStatus: async () => {...}
}
```

#### useSMS2FAStore (`project/src/components/stores/useSMS2FAStore.js`)
```javascript
{
  sendSMS2FACode: async (email, password) => {...},
  verifySMS2FACode: async (code, userId, rememberDevice, screenResolution, timezone) => {...},
  enableSMS2FA: async (phone) => {...},
  disableSMS2FA: async () => {...},
  getSMS2FAStatus: async () => {...},
  updatePhoneNumber: async (phone) => {...}
}
```

#### useEmail2FAStore (`project/src/components/stores/useEmail2FAStore.js`)
```javascript
{
  sendEmail2FACode: async (email, password) => {...},
  verifyEmail2FACode: async (code, userId, rememberDevice, screenResolution, timezone) => {...},
  enableEmail2FA: async () => {...},
  disableEmail2FA: async () => {...},
  getEmail2FAStatus: async () => {...}
}
```

#### useDeviceTrustStore (`project/src/components/stores/useDeviceTrustStore.js`)
```javascript
{
  getTrustedDevices: async () => {...},
  revokeDevice: async (deviceId) => {...},
  revokeAllDevices: async () => {...}
}
```

### Components

#### Login (`project/src/components/Auth/Login.jsx`)
- Handles login flow
- Checks for device-trusted login
- Routes to appropriate 2FA verification component
- Handles role-based navigation

#### 2FA Verification Components
- `TwoFactorVerify.jsx` - TOTP 2FA verification with "Remember device" checkbox
- `SMS2FAVerify.jsx` - SMS 2FA verification with "Remember device" checkbox
- `Email2FAVerify.jsx` - Email 2FA verification with "Remember device" checkbox

#### Security Settings (`project/src/components/admin/SecuritySettings.jsx`)
- Available in all dashboards (Admin, Teacher, Parent, Student, Librarian)
- TOTP 2FA management (enable/disable)
- SMS 2FA management (enable/disable, phone number)
- Email 2FA management (enable/disable)
- Device trust management (view, revoke devices)

---

## API Endpoints

### Authentication

#### POST `/api/auth/login`
**Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (Device Trusted):**
```json
{
  "_id": "...",
  "name": "User Name",
  "email": "user@example.com",
  "role": "admin",
  "deviceTrusted": true,
  "requires2FA": false,
  "requiresSMS2FA": false,
  "requiresEmail2FA": false
}
```

**Response (2FA Required):**
```json
{
  "requires2FA": true,
  "userId": "...",
  "message": "Please enter your 2FA code to complete login"
}
```

---

### TOTP 2FA

#### POST `/api/auth/2fa/generate`
Generate secret and QR code (requires authentication)

#### POST `/api/auth/2fa/verify-setup`
Verify setup code (requires authentication)
```json
{
  "code": "123456"
}
```

#### POST `/api/auth/2fa/verify`
Verify login code
```json
{
  "code": "123456",
  "userId": "...",
  "rememberDevice": true,
  "screenResolution": "1920x1080",
  "timezone": "America/New_York"
}
```

#### POST `/api/auth/2fa/disable`
Disable TOTP 2FA (requires authentication)
```json
{
  "code": "123456"
}
```

#### GET `/api/auth/2fa/status`
Get TOTP 2FA status (requires authentication)

---

### SMS 2FA

#### POST `/api/auth/sms-2fa/send`
Send SMS code
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

#### POST `/api/auth/sms-2fa/verify`
Verify SMS code
```json
{
  "code": "123456",
  "userId": "...",
  "rememberDevice": true,
  "screenResolution": "1920x1080",
  "timezone": "America/New_York"
}
```

#### POST `/api/auth/sms-2fa/enable`
Enable SMS 2FA (requires authentication)
```json
{
  "phone": "+1234567890"  // Optional
}
```

#### POST `/api/auth/sms-2fa/disable`
Disable SMS 2FA (requires authentication)

#### GET `/api/auth/sms-2fa/status`
Get SMS 2FA status (requires authentication)

#### PUT `/api/auth/sms-2fa/phone`
Update phone number (requires authentication)
```json
{
  "phone": "+1234567890"
}
```

---

### Email 2FA

#### POST `/api/auth/email-2fa/send`
Send email code
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

#### POST `/api/auth/email-2fa/verify`
Verify email code
```json
{
  "code": "123456",
  "userId": "...",
  "rememberDevice": true,
  "screenResolution": "1920x1080",
  "timezone": "America/New_York"
}
```

#### POST `/api/auth/email-2fa/enable`
Enable Email 2FA (requires authentication)

#### POST `/api/auth/email-2fa/disable`
Disable Email 2FA (requires authentication)

#### GET `/api/auth/email-2fa/status`
Get Email 2FA status (requires authentication)

---

### Device Trust

#### POST `/api/auth/device-trust/check`
Check if device is trusted (public route)
```json
{
  "userId": "...",
  "deviceToken": "..."  // Optional, also checked in cookies
}
```

#### POST `/api/auth/device-trust/create`
Create device trust (requires authentication)
```json
{
  "rememberDevice": true,
  "screenResolution": "1920x1080",
  "timezone": "America/New_York"
}
```

#### GET `/api/auth/device-trust/devices`
Get all trusted devices (requires authentication)

#### DELETE `/api/auth/device-trust/devices/:deviceId`
Revoke specific device (requires authentication)

#### DELETE `/api/auth/device-trust/devices`
Revoke all devices (requires authentication)

---

## Security Features

### Token Security
- **JWT Tokens**: Access token (2 hours), Refresh token (7 days)
- **HttpOnly Cookies**: Prevents XSS attacks
- **Secure Cookies**: HTTPS only in production
- **SameSite**: "lax" in development, "strict" in production

### Device Trust Security
- **Cryptographically Secure Tokens**: 32-byte random tokens
- **Device Fingerprinting**: Multiple device characteristics
- **Automatic Expiration**: 30 days (MongoDB TTL)
- **Email Notifications**: Alerts for new trusted devices
- **User Control**: Can revoke devices anytime

### 2FA Security
- **TOTP**: Time-based, 30-second window, clock drift tolerance
- **SMS/Email**: 6-digit codes, 10-minute expiration, one-time use
- **Redis Storage**: Temporary code storage with expiration
- **Priority System**: TOTP → SMS → Email (highest to lowest)

### Password Security
- **Bcrypt Hashing**: 10 rounds
- **Password Change Requirement**: Can force password change on first login
- **Session Management**: Automatic token refresh

---

## Testing Guide

### Testing TOTP 2FA

1. **Enable TOTP 2FA:**
   - Go to Security Settings
   - Click "Enable TOTP 2FA"
   - Scan QR code with Google Authenticator
   - Enter verification code
   - ✅ TOTP 2FA enabled

2. **Login with TOTP:**
   - Enter username and password
   - Enter 6-digit code from authenticator
   - Check "Remember this device" (optional)
   - ✅ Login successful

### Testing SMS 2FA

1. **Enable SMS 2FA:**
   - Go to Security Settings
   - Click "Enable SMS 2FA"
   - Enter phone number (if not already set)
   - ✅ SMS 2FA enabled

2. **Login with SMS:**
   - Enter username and password
   - Receive SMS code
   - Enter 6-digit code
   - Check "Remember this device" (optional)
   - ✅ Login successful

3. **Student SMS 2FA:**
   - Student enables SMS 2FA
   - System uses parent's phone number automatically
   - ✅ Works with parent's phone

### Testing Email 2FA

1. **Enable Email 2FA:**
   - Go to Security Settings
   - Click "Enable Email 2FA"
   - ✅ Email 2FA enabled (requires email address)

2. **Login with Email:**
   - Enter username and password
   - Receive email code
   - Enter 6-digit code
   - Check "Remember this device" (optional)
   - ✅ Login successful

### Testing Device Trust

1. **Create Device Trust:**
   - Login with 2FA
   - Check "Remember this device for 30 days"
   - Complete 2FA verification
   - ✅ Device trust created (check backend logs)

2. **Test Trusted Device Login:**
   - Logout
   - Login again with same password
   - ✅ Should skip 2FA and go directly to dashboard

3. **Test Device Management:**
   - Go to Security Settings
   - View "Trusted Devices" section
   - See device info (browser, OS, IP, last used)
   - Revoke a device
   - ✅ Device revoked, 2FA required on next login

### Testing Priority System

1. **Enable All 3 MFA Methods:**
   - Enable TOTP 2FA
   - Enable SMS 2FA
   - Enable Email 2FA

2. **Login:**
   - Enter username and password
   - ✅ Should only ask for TOTP 2FA (highest priority)
   - ✅ Should NOT ask for SMS or Email

3. **Disable TOTP, Keep SMS and Email:**
   - Disable TOTP 2FA
   - Login again
   - ✅ Should ask for SMS 2FA (second priority)
   - ✅ Should NOT ask for Email

---

## Troubleshooting

### Device Trust Not Working

**Symptoms:**
- Device trust created but 2FA still required on next login

**Solutions:**
1. Check backend console logs for device trust check
2. Verify cookie is set: Check browser DevTools → Application → Cookies
3. Verify cookie path is "/"
4. Check if cookie has `sameSite: "lax"` in development
5. Verify device trust exists in database
6. Check if device trust is expired

**Debug Commands:**
```javascript
// Check device trust in database
db.devicetrusts.find({ userId: ObjectId("...") })

// Check if cookie is being sent
// Look for: hasDeviceTokenCookie: true in backend logs
```

### 2FA Code Not Working

**TOTP Issues:**
- Ensure device time is synchronized
- Try entering code within 30 seconds
- Verify QR code was scanned correctly
- Check backend logs for verification details

**SMS Issues:**
- Verify Twilio credentials are set
- Check phone number format (E.164)
- Verify SMS service is working
- Check Redis for stored code

**Email Issues:**
- Verify email service is configured
- Check spam folder
- Verify email address is correct
- Check Redis for stored code

### Cookie Issues

**Cookie Not Persisting:**
- Check cookie path is "/"
- Verify `sameSite` setting (should be "lax" in development)
- Check if browser blocks third-party cookies
- Verify `withCredentials: true` in axios config

**Cookie Not Being Sent:**
- Check CORS configuration (`credentials: true`)
- Verify axios instance has `withCredentials: true`
- Check browser DevTools → Network → Request Headers

---

## Environment Variables

### Required for SMS 2FA
```env
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=your_twilio_phone_number
```

### Required for Email 2FA
```env
# Email service configuration (check emailService.js)
SMTP_HOST=your_smtp_host
SMTP_PORT=587
SMTP_USER=your_email
SMTP_PASS=your_password
```

### Required for JWT
```env
ACCESS_TOKEN_SECRET=your_access_token_secret
REFRESH_TOKEN_SECRET=your_refresh_token_secret
```

### Required for Redis
```env
REDIS_URL=your_redis_url
# or
REDIS_HOST=localhost
REDIS_PORT=6379
```

---

## Database Indexes

### Device Trust Indexes
```javascript
// Auto-created by Mongoose
deviceTrustSchema.index({ userId: 1, deviceToken: 1 });
deviceTrustSchema.index({ userId: 1, isActive: 1 });
deviceTrustSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL
```

---

## Security Best Practices

1. **Always use HTTPS in production**
2. **Keep JWT secrets secure and rotate regularly**
3. **Monitor device trust activity for suspicious patterns**
4. **Send email notifications for new trusted devices**
5. **Allow users to revoke all devices if account is compromised**
6. **Implement rate limiting on login attempts**
7. **Log all authentication events for audit**
8. **Use strong password requirements**
9. **Encourage users to enable MFA**
10. **Regular security audits**

---

## Support and Maintenance

### Monitoring
- Monitor failed login attempts
- Track device trust creation/revocation
- Monitor 2FA verification success rates
- Alert on suspicious device activity

### Maintenance Tasks
- Clean up expired device trusts (automatic via TTL)
- Rotate JWT secrets periodically
- Update dependencies regularly
- Review and update security policies

---

## Version History

- **v1.0** - Initial MFA implementation (TOTP only)
- **v2.0** - Added Email 2FA
- **v3.0** - Added SMS 2FA
- **v4.0** - Added Device Trust system
- **v4.1** - Fixed device trust cookie issues
- **v4.2** - Added student parent phone support for SMS 2FA

---

## Contact and Support

For issues or questions:
1. Check backend console logs
2. Check browser console for frontend errors
3. Review this documentation
4. Check database for device trust records
5. Verify environment variables are set correctly

---

**Last Updated:** November 6, 2025
**Version:** 4.2

