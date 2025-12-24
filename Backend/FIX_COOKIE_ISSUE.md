# Fix Cookie Issue - Cross-Origin Authentication

## 🔍 The Problem

After login, you're getting `401 (Unauthorized)` when fetching `/api/auth/profile`. This happens because:

1. **Frontend**: `http://localhost:5173` (different origin)
2. **Backend**: `https://api.edureachapp.com` (different origin)
3. **Cookies**: Were set with `sameSite: "strict"` which blocks cross-origin cookie sending

## ✅ The Solution

I've updated all cookie settings to use:
- `sameSite: "none"` - Allows cookies in cross-origin requests
- `secure: true` - Required when using `sameSite: "none"` (even works with HTTP localhost → HTTPS backend)

## 📝 Files Updated

1. ✅ `controllers/auth.controller.js` - Main login cookie function
2. ✅ `controllers/twoFactor.controller.js` - 2FA verification cookies
3. ✅ `controllers/email2FA.controller.js` - Email 2FA cookies
4. ✅ `controllers/sms2FA.controller.js` - SMS 2FA cookies

## 🚀 Deploy the Fix

### Step 1: Commit and Push Changes

```bash
cd /var/www/EDUREACH_BACKEND/Backend
git add .
git commit -m "Fix cookie settings for cross-origin authentication"
git push origin main
```

### Step 2: Pull on VPS

```bash
# SSH into VPS
ssh your-username@api.edureachapp.com
cd /var/www/EDUREACH_BACKEND/Backend
git pull origin main
```

### Step 3: Restart Backend

```bash
pm2 restart edureach-backend --update-env
```

### Step 4: Test Login

1. Open `http://localhost:5173/login`
2. Enter credentials and click "Sign In"
3. Check browser console - should see:
   - ✅ Login successful
   - ✅ Profile fetched successfully (200 OK)
   - ✅ No 401 errors

## 🔍 Verify Cookies Are Set

After login, check browser DevTools:

1. Open DevTools (F12)
2. Go to **Application** tab → **Cookies**
3. Select `https://api.edureachapp.com`
4. You should see:
   - `accessToken` cookie (HttpOnly, Secure, SameSite=None)
   - `refreshToken` cookie (HttpOnly, Secure, SameSite=None)

## ⚠️ Important Notes

- **SameSite: "none"** requires **Secure: true**
- This works even when frontend is HTTP localhost → HTTPS backend (modern browsers allow this)
- For production, when both frontend and backend are HTTPS, this works perfectly
- Cookies are still secure because:
  - `httpOnly: true` - Prevents JavaScript access (XSS protection)
  - `secure: true` - Only sent over HTTPS connections

## 🎯 Expected Behavior After Fix

**Before Login:**
- ✅ 401 on `/api/auth/profile` (normal - no session)

**After Login:**
- ✅ Login request succeeds
- ✅ Cookies are set with `SameSite=None; Secure`
- ✅ `/api/auth/profile` returns 200 OK with user data
- ✅ User is redirected to dashboard
- ✅ All subsequent API calls work with cookies

---

**After deploying this fix, login should work perfectly!** 🎉

