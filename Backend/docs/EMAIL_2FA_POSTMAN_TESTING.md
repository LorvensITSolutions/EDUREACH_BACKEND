# Email 2FA Postman Testing Guide

This guide will help you test the Email 2FA implementation using Postman.

## Prerequisites

1. **Base URL**: `http://localhost:5000/api`
2. **Cookies**: Make sure to enable cookies in Postman (Settings → General → Cookies)
3. **User Account**: You need a user account with an email address

## Setup in Postman

1. Open Postman
2. Create a new Collection: "Email 2FA Testing"
3. Set collection variable: `baseUrl` = `http://localhost:5000/api`

---

## Step 1: Login (Get Authentication Cookie)

**Endpoint**: `POST {{baseUrl}}/auth/login`

**Headers**:
```
Content-Type: application/json
```

**Body** (raw JSON):
```json
{
  "email": "your-email@example.com",
  "password": "your-password"
}
```

**Expected Response** (200 OK):
```json
{
  "_id": "...",
  "name": "...",
  "email": "...",
  "role": "admin"
}
```

**Note**: This sets the authentication cookie needed for protected routes.

---

## Step 2: Check Email 2FA Status

**Endpoint**: `GET {{baseUrl}}/auth/email-2fa/status`

**Headers**:
```
Content-Type: application/json
Cookie: (automatically included from Step 1)
```

**Expected Response** (200 OK):
```json
{
  "success": true,
  "email2FAEnabled": false,
  "hasEmail": true
}
```

---

## Step 3: Enable Email 2FA

**Endpoint**: `POST {{baseUrl}}/auth/email-2fa/enable`

**Headers**:
```
Content-Type: application/json
Cookie: (automatically included from Step 1)
```

**Body**: (empty - no body needed)

**Expected Response** (200 OK):
```json
{
  "success": true,
  "message": "Email 2FA has been successfully enabled"
}
```

---

## Step 4: Test Login with Email 2FA (Password Verification)

**Endpoint**: `POST {{baseUrl}}/auth/login`

**Headers**:
```
Content-Type: application/json
```

**Body** (raw JSON):
```json
{
  "email": "your-email@example.com",
  "password": "your-password"
}
```

**Expected Response** (200 OK):
```json
{
  "requiresEmail2FA": true,
  "userId": "user-id-here",
  "message": "A verification code has been sent to your email. Please check your inbox."
}
```

**Important**: 
- Check your email inbox for the 6-digit code
- The code expires in 10 minutes
- Copy the code for the next step

---

## Step 5: Verify Email 2FA Code

**Endpoint**: `POST {{baseUrl}}/auth/email-2fa/verify`

**Headers**:
```
Content-Type: application/json
```

**Body** (raw JSON):
```json
{
  "code": "123456",
  "userId": "user-id-from-step-4"
}
```

**Expected Response** (200 OK):
```json
{
  "success": true,
  "message": "Email 2FA verified successfully. Login complete.",
  "user": {
    "_id": "...",
    "name": "...",
    "email": "...",
    "role": "admin",
    "mustChangePassword": false
  }
}
```

**Note**: This sets authentication cookies and completes the login.

---

## Step 6: Resend Email 2FA Code (Optional)

**Endpoint**: `POST {{baseUrl}}/auth/email-2fa/send`

**Headers**:
```
Content-Type: application/json
```

**Body** (raw JSON):
```json
{
  "email": "your-email@example.com",
  "password": "your-password"
}
```

**Expected Response** (200 OK):
```json
{
  "success": true,
  "message": "Verification code sent to your email",
  "userId": "user-id-here"
}
```

**Note**: Use this if you didn't receive the code or it expired.

---

## Step 7: Disable Email 2FA

**Endpoint**: `POST {{baseUrl}}/auth/email-2fa/disable`

**Headers**:
```
Content-Type: application/json
Cookie: (from Step 5 - you need to be logged in)
```

**Body**: (empty - no body needed)

**Expected Response** (200 OK):
```json
{
  "success": true,
  "message": "Email 2FA has been successfully disabled"
}
```

---

## Complete Test Flow

### Test Scenario 1: Full Login Flow with Email 2FA

1. **Login** → `POST /auth/login` (with email/password)
   - Should return `requiresEmail2FA: true`
   - Check email for code

2. **Verify Code** → `POST /auth/email-2fa/verify`
   - Use code from email
   - Should return user data and set cookies

3. **Access Protected Route** → `GET /auth/profile`
   - Should work with cookies from Step 2

### Test Scenario 2: Enable/Disable Email 2FA

1. **Login** → `POST /auth/login` (normal login)
2. **Check Status** → `GET /auth/email-2fa/status`
3. **Enable** → `POST /auth/email-2fa/enable`
4. **Check Status Again** → `GET /auth/email-2fa/status` (should show enabled)
5. **Disable** → `POST /auth/email-2fa/disable`
6. **Check Status Again** → `GET /auth/email-2fa/status` (should show disabled)

### Test Scenario 3: Error Cases

1. **Invalid Code**:
   - Login → Get code from email
   - Verify with wrong code → Should return 400 error

2. **Expired Code**:
   - Login → Wait 10+ minutes
   - Verify with old code → Should return 400 error

3. **No Email Address**:
   - Try to enable email 2FA for user without email → Should return 400 error

4. **Email 2FA Not Enabled**:
   - Try to verify code when email 2FA is disabled → Should return 400 error

---

## Postman Collection JSON

You can import this into Postman:

```json
{
  "info": {
    "name": "Email 2FA Testing",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "variable": [
    {
      "key": "baseUrl",
      "value": "http://localhost:5000/api"
    },
    {
      "key": "userId",
      "value": ""
    },
    {
      "key": "email",
      "value": "your-email@example.com"
    },
    {
      "key": "password",
      "value": "your-password"
    }
  ],
  "item": [
    {
      "name": "1. Login",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"email\": \"{{email}}\",\n  \"password\": \"{{password}}\"\n}"
        },
        "url": {
          "raw": "{{baseUrl}}/auth/login",
          "host": ["{{baseUrl}}"],
          "path": ["auth", "login"]
        }
      }
    },
    {
      "name": "2. Get Email 2FA Status",
      "request": {
        "method": "GET",
        "header": [],
        "url": {
          "raw": "{{baseUrl}}/auth/email-2fa/status",
          "host": ["{{baseUrl}}"],
          "path": ["auth", "email-2fa", "status"]
        }
      }
    },
    {
      "name": "3. Enable Email 2FA",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "url": {
          "raw": "{{baseUrl}}/auth/email-2fa/enable",
          "host": ["{{baseUrl}}"],
          "path": ["auth", "email-2fa", "enable"]
        }
      }
    },
    {
      "name": "4. Login with Email 2FA",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"email\": \"{{email}}\",\n  \"password\": \"{{password}}\"\n}"
        },
        "url": {
          "raw": "{{baseUrl}}/auth/login",
          "host": ["{{baseUrl}}"],
          "path": ["auth", "login"]
        }
      }
    },
    {
      "name": "5. Verify Email 2FA Code",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"code\": \"123456\",\n  \"userId\": \"{{userId}}\"\n}"
        },
        "url": {
          "raw": "{{baseUrl}}/auth/email-2fa/verify",
          "host": ["{{baseUrl}}"],
          "path": ["auth", "email-2fa", "verify"]
        }
      }
    },
    {
      "name": "6. Resend Email 2FA Code",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"email\": \"{{email}}\",\n  \"password\": \"{{password}}\"\n}"
        },
        "url": {
          "raw": "{{baseUrl}}/auth/email-2fa/send",
          "host": ["{{baseUrl}}"],
          "path": ["auth", "email-2fa", "send"]
        }
      }
    },
    {
      "name": "7. Disable Email 2FA",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "url": {
          "raw": "{{baseUrl}}/auth/email-2fa/disable",
          "host": ["{{baseUrl}}"],
          "path": ["auth", "email-2fa", "disable"]
        }
      }
    }
  ]
}
```

---

## Quick Testing Checklist

- [ ] Login works without email 2FA
- [ ] Enable email 2FA works
- [ ] Login with email 2FA sends code to email
- [ ] Verify code works with correct code
- [ ] Verify code fails with incorrect code
- [ ] Resend code works
- [ ] Code expires after 10 minutes
- [ ] Disable email 2FA works
- [ ] Status endpoint returns correct information
- [ ] Email 2FA takes priority over TOTP 2FA

---

## Troubleshooting

### Issue: Cookies not being sent
**Solution**: 
- In Postman, go to Settings → General → Enable "Automatically follow redirects"
- Make sure cookies are enabled in Postman settings

### Issue: 401 Unauthorized
**Solution**: 
- Make sure you're logged in first (Step 1)
- Check that cookies are being sent with the request

### Issue: Code not received in email
**Solution**:
- Check spam folder
- Verify email service is configured correctly in `.env`
- Check backend console logs for email sending errors

### Issue: Code expired
**Solution**:
- Codes expire after 10 minutes
- Use "Resend Code" endpoint to get a new code

---

## Environment Variables Needed

Make sure these are set in your `.env` file:

```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
EMAIL_FROM=your-email@gmail.com
```

**Note**: For Gmail, you need to use an "App Password" instead of your regular password.

