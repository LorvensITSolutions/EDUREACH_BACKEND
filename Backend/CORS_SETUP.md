# Backend CORS Configuration

## Environment Variable Setup

Add this to your backend `.env` file on the VPS server:

```env
FRONTEND_URL=http://localhost:5173,https://your-frontend-domain.com
```

**For your setup:**
- If your frontend is deployed at a specific domain, add it like: `https://edureachapp.com`
- You can add multiple domains separated by commas
- For local development, keep `http://localhost:5173`

## Example .env configuration:

```env
# Database
MONGO_URI=your-mongo-uri

# Frontend URLs (comma-separated for multiple)
FRONTEND_URL=http://localhost:5173,https://edureachapp.com

# Other environment variables...
```

## Notes

- The backend CORS is now configured to accept requests from the URLs specified in `FRONTEND_URL`
- If `FRONTEND_URL` is not set, it defaults to `http://localhost:5173` for development
- After updating `.env`, restart your backend server

## Restart Backend

```bash
# If using PM2
pm2 restart all

# If using systemd
sudo systemctl restart your-service-name

# If running directly
# Stop (Ctrl+C) and restart
npm start
```

