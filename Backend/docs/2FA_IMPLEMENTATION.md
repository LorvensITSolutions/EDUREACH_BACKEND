# TOTP/Google Authenticator MFA Implementation

## Overview
This implementation adds Time-based One-Time Password (TOTP) authentication using Google Authenticator or any compatible authenticator app.

## Features
- ✅ Generate QR codes for easy setup
- ✅ Verify 2FA codes during login
- ✅ Enable/Disable 2FA
- ✅ Secure secret storage
- ✅ Works offline (no SMS/Email required)

## API Endpoints

### 1. Generate 2FA Secret & QR Code
**POST** `/api/auth/2fa/generate`
- **Auth Required**: Yes
- **Description**: Generates a secret key and QR code for 2FA setup
- **Response**:
```json
{
  "success": true,
  "secret": "JBSWY3DPEHPK3PXP...",
  "qrCode": "data:image/png;base64,...",
  "manualEntryKey": "JBSWY3DPEHPK3PXP..."
}
```

### 2. Verify 2FA Setup
**POST** `/api/auth/2fa/verify-setup`
- **Auth Required**: Yes
- **Body**: `{ "code": "123456" }`
- **Description**: Verifies the 2FA code during initial setup and enables 2FA
- **Response**:
```json
{
  "success": true,
  "message": "2FA has been successfully enabled"
}
```

### 3. Verify 2FA Code (During Login)
**POST** `/api/auth/2fa/verify`
- **Auth Required**: No (used during login)
- **Body**: `{ "code": "123456", "userId": "..." }`
- **Description**: Verifies 2FA code and completes login
- **Response**:
```json
{
  "success": true,
  "message": "2FA verified successfully. Login complete.",
  "user": {
    "_id": "...",
    "name": "...",
    "email": "...",
    "role": "..."
  }
}
```

### 4. Disable 2FA
**POST** `/api/auth/2fa/disable`
- **Auth Required**: Yes
- **Body**: `{ "code": "123456" }` (optional but recommended)
- **Description**: Disables 2FA for the user
- **Response**:
```json
{
  "success": true,
  "message": "2FA has been successfully disabled"
}
```

### 5. Get 2FA Status
**GET** `/api/auth/2fa/status`
- **Auth Required**: Yes
- **Description**: Returns whether 2FA is enabled for the user
- **Response**:
```json
{
  "success": true,
  "twoFactorEnabled": true,
  "twoFactorVerified": true
}
```

## Login Flow with 2FA

### Step 1: Normal Login
**POST** `/api/auth/login`
- Body: `{ "email": "...", "password": "..." }`
- If 2FA is enabled, response will be:
```json
{
  "requires2FA": true,
  "userId": "...",
  "message": "Please enter your 2FA code to complete login"
}
```

### Step 2: Verify 2FA Code
**POST** `/api/auth/2fa/verify`
- Body: `{ "code": "123456", "userId": "..." }`
- On success, returns user data and sets authentication cookies

## User Model Changes

The User model now includes these fields:
```javascript
twoFactorSecret: String,        // TOTP secret key (encrypted in production)
twoFactorEnabled: Boolean,      // Whether 2FA is enabled
twoFactorVerified: Boolean,     // Whether setup is verified
tempTwoFactorSecret: String     // Temporary secret during setup
```

## Setup Flow

1. User calls `/api/auth/2fa/generate` → Gets QR code
2. User scans QR code with Google Authenticator app
3. User enters 6-digit code from app
4. User calls `/api/auth/2fa/verify-setup` with code
5. 2FA is enabled and verified ✅

## Security Features

- ✅ Secret keys stored in database
- ✅ Codes expire every 30 seconds
- ✅ Window of 2 time steps (60 seconds) for clock drift
- ✅ Requires code to disable 2FA (optional but recommended)
- ✅ Temporary secrets during setup (not active until verified)

## Dependencies

- `speakeasy`: TOTP secret generation and verification
- `qrcode`: QR code generation for easy setup

## Environment Variables

Add to `.env`:
```
APP_NAME=School Management System
```

## Frontend Integration Notes

1. **Login Flow**:
   - Check if `requires2FA: true` in login response
   - If yes, show 2FA code input field
   - Call `/api/auth/2fa/verify` with code

2. **Setup Flow**:
   - Call `/api/auth/2fa/generate` to get QR code
   - Display QR code image
   - Show 6-digit code input
   - Call `/api/auth/2fa/verify-setup` to complete setup

3. **Status Check**:
   - Call `/api/auth/2fa/status` to check if 2FA is enabled
   - Show enable/disable button accordingly

## Testing

1. Install Google Authenticator app on your phone
2. Enable 2FA for a test user
3. Scan QR code
4. Login with email/password
5. Enter 6-digit code from app
6. Should successfully log in ✅

