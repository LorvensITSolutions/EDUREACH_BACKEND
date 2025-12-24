# Verify CORS Setup on VPS

## ✅ Code is Updated and Restarted!

You've successfully:
- ✅ Pulled the latest code with CORS fixes
- ✅ Restarted the backend with PM2

## 🔍 Now Verify Everything is Working

### Step 1: Check Backend Logs

Run this command to see the CORS configuration:

```bash
pm2 logs edureach-backend --lines 50
```

**Look for this line:**
```
🌐 CORS Allowed Origins: [ 'http://localhost:5173', ... ]
```

If you see this, CORS is configured correctly!

### Step 2: Verify FRONTEND_URL Environment Variable

Check if FRONTEND_URL is set in your .env file:

```bash
cd /var/www/EDUREACH_BACKEND/Backend
cat .env | grep FRONTEND_URL
```

**If it's not set, add it:**

```bash
nano .env
```

Add this line (include your production frontend domain too):
```env
FRONTEND_URL=http://localhost:5173,https://your-frontend-domain.com
```

Save and exit (`Ctrl+X`, then `Y`, then `Enter`)

Then restart:
```bash
pm2 restart edureach-backend --update-env
```

### Step 3: Test CORS from Your Local Machine

Open a new terminal on your local machine and test:

```bash
curl -H "Origin: http://localhost:5173" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: Content-Type" \
     -X OPTIONS \
     https://api.edureachapp.com/api/auth/login \
     -v
```

**You should see:**
```
< HTTP/1.1 204 No Content
< Access-Control-Allow-Origin: http://localhost:5173
< Access-Control-Allow-Credentials: true
< Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS
```

### Step 4: Test in Browser

1. Open your frontend at `http://localhost:5173`
2. Open browser console (F12)
3. Try to log in
4. Check Network tab - you should see:
   - ✅ Status: 200 or 401 (not CORS error)
   - ✅ Response headers include `Access-Control-Allow-Origin: http://localhost:5173`

## 🔧 If Still Not Working

### Check PM2 Environment Variables

```bash
pm2 env 2
```

This shows all environment variables for process ID 2 (edureach-backend).

### Check if server.js has the latest code

```bash
cd /var/www/EDUREACH_BACKEND/Backend
grep -n "CORS Allowed Origins" server.js
```

Should show line number with the console.log statement.

### Manual Test from VPS

```bash
cd /var/www/EDUREACH_BACKEND/Backend
node -e "require('dotenv').config(); console.log('FRONTEND_URL:', process.env.FRONTEND_URL);"
```

## 📋 Quick Checklist

- [ ] Backend logs show "🌐 CORS Allowed Origins"
- [ ] FRONTEND_URL is set in .env (or defaults to localhost:5173)
- [ ] PM2 restarted with --update-env flag
- [ ] curl test shows Access-Control-Allow-Origin header
- [ ] Browser test shows no CORS errors

## 🎯 Expected Result

After these steps, when you:
1. Open `http://localhost:5173` in your browser
2. Try to log in
3. The request should reach the backend
4. You should get a 401 (Unauthorized) if credentials are wrong, or 200 if correct
5. **NOT a CORS error!**

---

**The key difference:**
- ❌ **CORS Error**: `Access to XMLHttpRequest has been blocked by CORS policy`
- ✅ **401 Unauthorized**: This is normal - it means CORS is working, you just need to log in!

