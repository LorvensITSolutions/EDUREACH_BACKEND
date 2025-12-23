# Super Admin Setup

This document explains how to create the initial super admin user for the Attendance Management System.

## Automatic Setup

The super admin user is automatically created when the server starts if no users exist in the database.

### Super Admin Credentials:
- **Email**: `superadmin@yopmail.com`
- **Password**: `Admin@123`
- **Employee ID**: `SUPER001`
- **Role**: `admin`
- **Department**: `IT`
- **Status**: `active`

## Manual Setup

If you need to create the super admin manually, you can use the provided script:

### Option 1: Using npm script
```bash
cd backend
npm run create-super-admin
```

### Option 2: Running the script directly
```bash
cd backend
node scripts/createSuperAdmin.js
```

### Option 3: Using the API endpoint
```bash
curl -X POST http://localhost:5000/api/auth/create-super-admin
```

## Important Notes

1. **Database Must Be Empty**: The super admin can only be created if no users exist in the database.

2. **One-Time Setup**: This is designed for initial system setup only. Once users exist, the super admin cannot be created automatically.

3. **Security**: The super admin has full administrative privileges. Change the password after first login.

4. **Email Verification**: The super admin account is automatically verified and ready to use.

## Server Startup

When you start the server, you'll see output like this:

```
✅ Connected to MongoDB
No users found in database. Creating super admin...
✅ Super admin created successfully:
   Email: superadmin@yopmail.com
   Password: Admin@123
   Employee ID: SUPER001
   Role: admin
✅ Cron service initialized
🚀 Server running on port 5000
📧 Super Admin Email: superadmin@yopmail.com
🔑 Super Admin Password: Admin@123
```

## First Login

1. Start the server: `npm run dev`
2. Open the frontend application
3. Navigate to the login page
4. Use the credentials:
   - Email: `superadmin@yopmail.com`
   - Password: `Admin@123`

## Security Recommendations

1. **Change Password**: Immediately change the super admin password after first login
2. **Remove Script**: Consider removing the create-super-admin script in production
3. **Monitor Access**: Keep track of super admin account usage
4. **Backup**: Ensure you have backups of the super admin credentials

## Troubleshooting

### "Users already exist" error
If you get this error, it means there are already users in the database. You cannot create a super admin when users exist.

### "MongoDB connection error"
Make sure your MongoDB is running and the connection string in `.env` is correct.

### "Permission denied" error
Make sure you have write permissions to the database and the application can create users. 