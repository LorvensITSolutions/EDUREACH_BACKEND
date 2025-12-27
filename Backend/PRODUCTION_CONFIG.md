# Backend Production Configuration Guide

## 🎯 Production URLs

- **Backend API:** https://api.edureachapp.com/api
- **Frontend:** https://edureachapp.com

---

## 📝 Environment Variables Setup

### Required Environment Variables

Create or update `.env` file in your backend root directory:

```env
# Server Configuration
NODE_ENV=production
PORT=5000

# Frontend URLs (for CORS) - IMPORTANT!
FRONTEND_URL=https://edureachapp.com,https://www.edureachapp.com

# Database
MONGODB_URI=your_mongodb_connection_string

# JWT Secrets
ACCESS_TOKEN_SECRET=your_secure_access_token_secret_here
REFRESH_TOKEN_SECRET=your_secure_refresh_token_secret_here

# Email Configuration (if using)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password

# SMS Configuration (if using)
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=your_twilio_number

# Redis (if using)
REDIS_HOST=localhost
REDIS_PORT=6379

# Other configurations...
```

### Setting Environment Variables

**Option 1: Using .env file (Recommended)**

```bash
cd /path/to/EDUREACH_BACKEND/Backend
nano .env
# Add all environment variables
```

**Option 2: Using export (Temporary)**

```bash
export FRONTEND_URL=https://edureachapp.com,https://www.edureachapp.com
export NODE_ENV=production
```

**Option 3: Using PM2 ecosystem file**

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'edureach-backend',
    script: './server.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 5000,
      FRONTEND_URL: 'https://edureachapp.com,https://www.edureachapp.com',
      MONGODB_URI: 'your_mongodb_uri',
      // ... other env vars
    }
  }]
};
```

---

## 🔧 CORS Configuration

### Current CORS Setup

Your `server.js` already has CORS configuration. Ensure it reads from `FRONTEND_URL`:

```javascript
const allowedOrigins = process.env.FRONTEND_URL 
  ? process.env.FRONTEND_URL.split(',').map(url => url.trim())
  : ['http://localhost:5173'];

// Always include localhost:5173 for development
if (process.env.NODE_ENV !== 'production' && !allowedOrigins.includes('http://localhost:5173')) {
  allowedOrigins.push('http://localhost:5173');
}

// Ensure production frontend is included
if (process.env.NODE_ENV === 'production') {
  if (!allowedOrigins.includes('https://edureachapp.com')) {
    allowedOrigins.push('https://edureachapp.com');
  }
  if (!allowedOrigins.includes('https://www.edureachapp.com')) {
    allowedOrigins.push('https://www.edureachapp.com');
  }
}
```

### Verify CORS is Working

Test from browser console on https://edureachapp.com:

```javascript
fetch('https://api.edureachapp.com/api', {
  method: 'GET',
  credentials: 'include'
})
.then(r => r.json())
.then(data => {
  console.log('✅ CORS Working:', data);
  console.log('Access-Control-Allow-Origin:', r.headers.get('Access-Control-Allow-Origin'));
})
.catch(err => console.error('❌ CORS Error:', err));
```

---

## 🚀 Deployment Steps

### 1. Update Environment Variables

```bash
cd /path/to/EDUREACH_BACKEND/Backend
nano .env
# Add: FRONTEND_URL=https://edureachapp.com,https://www.edureachapp.com
```

### 2. Restart Backend Server

**Using PM2:**
```bash
pm2 restart edureach-backend
# or
pm2 restart all
```

**Using systemd:**
```bash
sudo systemctl restart edureach-backend
```

**Manual restart:**
```bash
# Stop current process
pm2 stop edureach-backend
# or kill the process

# Start again
pm2 start server.js --name edureach-backend
# or
node server.js
```

### 3. Verify Backend is Running

```bash
# Check if backend responds
curl https://api.edureachapp.com/api

# Should return:
# {"success":true,"message":"EduReach Backend API is running","version":"1.0.0"}
```

### 4. Check CORS Headers

```bash
curl -H "Origin: https://edureachapp.com" \
     -H "Access-Control-Request-Method: GET" \
     -H "Access-Control-Request-Headers: Content-Type" \
     -X OPTIONS \
     https://api.edureachapp.com/api/auth/profile \
     -v
```

Look for:
```
Access-Control-Allow-Origin: https://edureachapp.com
Access-Control-Allow-Credentials: true
```

---

## 🔍 Troubleshooting

### Issue: CORS errors from frontend

**Symptoms:**
```
Access to fetch at 'https://api.edureachapp.com/api/...' from origin 'https://edureachapp.com' has been blocked by CORS policy
```

**Solutions:**
1. Verify `FRONTEND_URL` includes `https://edureachapp.com`
2. Check backend logs: `pm2 logs edureach-backend`
3. Restart backend after changing environment variables
4. Verify CORS configuration in `server.js`

### Issue: Backend not accessible

**Check:**
1. Server is running: `pm2 list` or `systemctl status edureach-backend`
2. Port is open: `netstat -tulpn | grep 5000`
3. Firewall allows traffic: `sudo ufw status`
4. SSL certificate is valid
5. Domain DNS points to correct server

### Issue: Cookies not working

**Check:**
1. Cookie settings in backend (secure, sameSite)
2. Frontend is using HTTPS
3. `withCredentials: true` in axios config
4. CORS allows credentials

---

## 📋 Production Checklist

- [ ] `.env` file created with all required variables
- [ ] `FRONTEND_URL` includes production frontend domain
- [ ] `NODE_ENV=production` is set
- [ ] Backend server restarted after env changes
- [ ] Backend accessible at https://api.edureachapp.com/api
- [ ] CORS allows requests from https://edureachapp.com
- [ ] SSL certificate is valid
- [ ] Database connection working
- [ ] All API endpoints responding correctly
- [ ] Logs are being monitored

---

## 🔐 Security Best Practices

1. **Never commit `.env` file** - Already in `.gitignore`
2. **Use strong secrets** - Generate secure random strings for JWT secrets
3. **HTTPS only** - All production traffic should use HTTPS
4. **CORS restrictions** - Only allow your frontend domain, not `*`
5. **Rate limiting** - Consider adding rate limiting for API endpoints
6. **Input validation** - Validate all user inputs
7. **Error handling** - Don't expose sensitive error details in production

---

## 📞 Verification Commands

```bash
# Check environment variables
pm2 env edureach-backend

# Check backend logs
pm2 logs edureach-backend --lines 50

# Test API endpoint
curl https://api.edureachapp.com/api

# Check CORS
curl -H "Origin: https://edureachapp.com" \
     -X OPTIONS \
     https://api.edureachapp.com/api/auth/profile \
     -v

# Check if server is running
pm2 status
# or
systemctl status edureach-backend
```

---

**Last Updated:** December 2025  
**Version:** 1.0.0

