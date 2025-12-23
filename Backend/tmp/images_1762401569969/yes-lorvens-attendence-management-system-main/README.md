# 🏢 X Company Attendance Management System

A comprehensive, secure web-based attendance management system designed exclusively for desktop/laptop access with role-based dashboards for employees and administrators.

## 🚀 Features

### 👥 Employee Features
- **Secure Authentication**: JWT-based login/registration with bcrypt password hashing
- **Punch In/Out**: Real-time attendance tracking with session enforcement
- **Attendance History**: View daily, weekly, and monthly attendance logs
- **Data Export**: Export personal attendance data in PDF/CSV formats
- **Profile Management**: Update personal information and change passwords
- **Dashboard**: Personal attendance statistics and recent activity

### 👨‍💼 Admin Features
- **Employee Management**: Complete CRUD operations for employee accounts
- **Attendance Oversight**: View and manage all employee attendance records
- **Manual Corrections**: Add/edit attendance entries with audit trail
- **Reports & Analytics**: Comprehensive reporting with export capabilities
- **Security Monitoring**: Real-time audit logs and user activity tracking
- **Bulk Operations**: Import/export employee data in bulk

### 🛡️ Security Features
- **JWT Authentication**: Secure token-based authentication
- **Role-Based Access**: Employee and admin role separation
- **Desktop-Only Access**: Automatic mobile/tablet access blocking
- **Rate Limiting**: API request throttling for security
- **Input Validation**: Comprehensive server-side validation
- **Password Security**: bcrypt hashing with configurable rounds
- **CORS Protection**: Cross-origin request security
- **Audit Logging**: Complete activity tracking for sensitive actions
- **Helmet Security**: HTTP security headers

## 🏗️ Architecture

### Frontend
- **Framework**: React.js 18 with functional components and hooks
- **Styling**: Tailwind CSS for responsive, modern UI
- **Routing**: React Router v6 with protected routes
- **State Management**: React Context API for authentication
- **HTTP Client**: Axios with interceptors for API communication
- **UI Components**: Custom components with React Icons
- **Charts**: Recharts for data visualization
- **Notifications**: React Hot Toast for user feedback

### Backend
- **Runtime**: Node.js with Express.js framework
- **Database**: MongoDB Atlas cloud database with Mongoose ODM
- **Authentication**: JWT tokens with refresh mechanism
- **Validation**: Express-validator for input sanitization
- **Security**: Helmet, CORS, rate limiting
- **Logging**: Winston for structured logging
- **Email**: Nodemailer for notifications
- **File Processing**: Multer for file uploads
- **Data Export**: PDFKit, ExcelJS, CSV-writer

### Database Schema
- **Users**: Employee and admin accounts with role-based permissions
- **Attendance**: Punch in/out records with location and device tracking
- **Audit Logs**: Complete activity trail for security monitoring

## 📁 Project Structure

```
attendance-system/
├── frontend/                 # React.js application
│   ├── public/              # Static assets
│   ├── src/
│   │   ├── components/      # Reusable UI components
│   │   │   ├── auth/        # Authentication components
│   │   │   └── common/      # Common UI components
│   │   ├── contexts/        # React contexts
│   │   ├── layouts/         # Page layouts
│   │   ├── pages/           # Page components
│   │   │   ├── admin/       # Admin pages
│   │   │   ├── auth/        # Authentication pages
│   │   │   └── employee/    # Employee pages
│   │   ├── services/        # API services
│   │   ├── utils/           # Utility functions
│   │   ├── App.jsx          # Main app component
│   │   └── index.js         # Entry point
│   ├── package.json         # Frontend dependencies
│   └── tailwind.config.js   # Tailwind configuration
├── backend/                  # Node.js API server
│   ├── src/
│   │   ├── config/          # Configuration files
│   │   ├── controllers/     # Route controllers
│   │   ├── middlewares/     # Express middlewares
│   │   ├── models/          # MongoDB models
│   │   ├── routes/          # API routes
│   │   ├── services/        # Business logic services
│   │   ├── utils/           # Utility functions
│   │   └── server.js        # Main server file
│   ├── package.json         # Backend dependencies
│   └── env.example          # Environment variables template
├── setup.sh                 # Automated setup script
├── README.md               # This file
└── DEPLOYMENT.md           # Deployment instructions
```

## 🚀 Quick Start

### Prerequisites
- **Node.js**: Version 16 or higher
- **npm**: Package manager
- **MongoDB Atlas**: Cloud database (already configured)

### Automated Setup (Recommended)

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd attendance-system
   ```

2. **Run the setup script**:
   ```bash
   ./setup.sh setup
   ```

3. **Start development servers**:
   ```bash
   ./setup.sh dev
   ```

### Manual Setup

#### Backend Setup
```bash
cd backend
npm install
# The setup script will automatically create .env with MongoDB Atlas connection
npm run dev
```

#### Frontend Setup
```bash
cd frontend
npm install
# Create .env file with REACT_APP_API_URL=http://localhost:5000/api
npm start
```

## ⚙️ Configuration

### Backend Environment Variables (.env)
```env
# Server Configuration
PORT=5000
NODE_ENV=development

# Database Configuration
MONGODB_URI=mongodb+srv://pavanlebaka60:Lp@123456@cluster0.bvz3rtc.mongodb.net/attendance-system

# JWT Configuration
JWT_SECRET=x-company-attendance-system-super-secret-jwt-key-2024
JWT_EXPIRES_IN=24h

# Security Configuration
BCRYPT_ROUNDS=12
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# CORS Configuration
FRONTEND_URL=http://localhost:3000

# Email Configuration (Optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@xcompany.com

# Logging Configuration
LOG_LEVEL=info
```

### Frontend Environment Variables (.env)
```env
REACT_APP_API_URL=http://localhost:5000/api
```

## 🔐 Default Admin Credentials
- **Email**: admin@xcompany.com
- **Password**: admin123

**⚠️ Important**: Change default credentials immediately after first login.

## 📱 Desktop-Only Access
The system automatically detects and blocks access from mobile devices and tablets, ensuring desktop-only usage as required by X Company policy.

### Detection Methods
- User agent string analysis
- Screen resolution checking
- Touch capability detection
- Responsive design enforcement

## 📊 API Documentation

### Authentication Endpoints
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/change-password` - Change password

### Employee Endpoints
- `GET /api/employee/profile` - Get profile
- `PUT /api/employee/profile` - Update profile
- `POST /api/employee/punch-in` - Punch in
- `POST /api/employee/punch-out` - Punch out
- `GET /api/employee/attendance` - Get attendance history
- `GET /api/employee/dashboard` - Get dashboard stats

### Admin Endpoints
- `GET /api/admin/employees` - Get all employees
- `POST /api/admin/employees` - Create employee
- `PUT /api/admin/employees/:id` - Update employee
- `DELETE /api/admin/employees/:id` - Delete employee
- `GET /api/admin/attendance` - Get all attendance
- `POST /api/admin/attendance` - Create manual attendance
- `GET /api/admin/reports` - Get reports
- `GET /api/admin/audit-logs` - Get audit logs

## 🛠️ Development

### Available Scripts

#### Backend
```bash
npm run dev      # Start development server with nodemon
npm start        # Start production server
npm test         # Run tests
```

#### Frontend
```bash
npm start        # Start development server
npm build        # Build for production
npm test         # Run tests
```

### Development URLs
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000/api
- **Health Check**: http://localhost:5000/health

## 📈 Features in Detail

### Employee Dashboard
- **Today's Status**: Current day attendance status
- **Recent Activity**: Last 5 attendance records
- **Monthly Summary**: Current month statistics
- **Quick Actions**: Punch in/out buttons

### Admin Dashboard
- **System Overview**: Total employees, active sessions
- **Attendance Summary**: Today's attendance statistics
- **Recent Activity**: Latest system activities
- **Quick Actions**: Common admin tasks

### Attendance Management
- **Real-time Tracking**: Live punch in/out with timestamps
- **Location Tracking**: IP address and user agent logging
- **Session Enforcement**: Single session per day policy
- **Manual Corrections**: Admin override with audit trail

### Reporting System
- **Attendance Reports**: Daily, weekly, monthly summaries
- **Employee Reports**: Individual attendance analysis
- **Department Reports**: Department-wise statistics
- **Export Options**: PDF, CSV, Excel formats

### Security Features
- **Audit Logging**: Complete activity trail
- **Role-based Access**: Granular permission system
- **Input Validation**: Server-side data validation
- **Rate Limiting**: API abuse prevention
- **CORS Protection**: Cross-origin security

## 🚀 Deployment

For production deployment instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md).

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📝 License

This project is proprietary software for X Company. All rights reserved.

## 🆘 Support

For technical support or questions:
- Create an issue in the repository
- Contact the development team
- Check the documentation

---

**Built with ❤️ for X Company** 