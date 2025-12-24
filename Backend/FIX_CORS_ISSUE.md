# Fix CORS Issue - Why Mobile Works But Web Doesn't

## 🔍 The Problem

**Mobile app works** ✅ but **web frontend doesn't** ❌

### Why Mobile Works:
- Mobile apps don't send an `Origin` header (or send a different one)
- The backend CORS allows requests with `!origin` (no origin header)
- So mobile requests pass through

### Why Web Doesn't Work:
- Web browsers **always** send an `Origin` header
- When you visit `http://localhost:5173`, browser sends `Origin: http://localhost:5173`
- Backend checks if this origin is in the allowed list
- If `FRONTEND_URL` is not set on VPS, or doesn't include `localhost:5173`, it gets blocked

---

## ✅ Solution

### Step 1: Update Backend Code (Already Done)

I've updated `server.js` to:
1. Always include `http://localhost:5173` in allowed origins (for development)
2. Add better logging to see what origins are being blocked
3. Support more HTTP methods and headers

### Step 2: Update Backend .env on VPS

SSH into your VPS and update the `.env` file:

```bash
ssh your-username@api.edureachapp.com
cd /path/to/your/backend
nano .env
```

**Add or update this line:**

```env
FRONTEND_URL=http://localhost:5173,https://your-frontend-domain.com
```

**Important:** Include `http://localhost:5173` for local development!

**Example:**
```env
FRONTEND_URL=http://localhost:5173,https://edureachapp.com,https://www.edureachapp.com
```

### Step 3: Restart Backend on VPS

```bash
# If using PM2
pm2 restart all

# If using systemd
sudo systemctl restart your-service-name

# If running directly
# Stop (Ctrl+C) and restart:
npm start
```

### Step 4: Check Backend Logs

After restarting, check the logs. You should see:

```
🌐 CORS Allowed Origins: [ 'http://localhost:5173', 'https://your-frontend-domain.com' ]
```

---

## 🧪 Test It

1. **Open your frontend** at `http://localhost:5173`
2. **Open browser console** (F12)
3. **Try to log in**
4. **Check Network tab** - you should see:
   - ✅ Status: 200 (not 401 CORS error)
   - ✅ Response headers include `Access-Control-Allow-Origin: http://localhost:5173`

---

## 🔍 Debugging

### If Still Not Working:

1. **Check backend logs** on VPS:
   ```bash
   # If using PM2
   pm2 logs
   
   # Look for CORS warnings
   ```

2. **Check browser console** for CORS errors:
   - Look for: `Access to XMLHttpRequest has been blocked by CORS policy`
   - This means the origin is still not allowed

3. **Verify FRONTEND_URL** is set correctly:
   ```bash
   # On VPS, check environment variable
   node -e "require('dotenv').config(); console.log(process.env.FRONTEND_URL);"
   ```

4. **Test CORS directly:**
   ```bash
   # From your local machine
   curl -H "Origin: http://localhost:5173" \
        -H "Access-Control-Request-Method: POST" \
        -H "Access-Control-Request-Headers: Content-Type" \
        -X OPTIONS \
        https://api.edureachapp.com/api/auth/login \
        -v
   ```

   Should return headers like:
   ```
   Access-Control-Allow-Origin: http://localhost:5173
   Access-Control-Allow-Credentials: true
   ```

---

## 📝 Quick Checklist

- [x] Backend code updated (always allows localhost:5173)
- [ ] `FRONTEND_URL` added to backend `.env` on VPS
- [ ] Backend restarted on VPS
- [ ] Check backend logs for "CORS Allowed Origins"
- [ ] Test login from frontend
- [ ] Verify no CORS errors in browser console

---

## 🎯 Key Points

1. **Mobile apps don't have CORS** - they work because they don't send Origin header
2. **Web browsers enforce CORS** - they always send Origin header
3. **Backend must explicitly allow** the frontend origin
4. **localhost:5173 must be in allowed origins** for local development
5. **Production frontend domain** must also be in allowed origins

---

Once you update the `.env` file on VPS and restart, it should work! 🎉

