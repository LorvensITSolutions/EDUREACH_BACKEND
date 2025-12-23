import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';

import { connectDB } from './lib/db.js';
import authRoutes from './routes/auth.route.js';
import projectRoutes from './routes/project.route.js';
import admissionRoutes from './routes/admission.route.js';
import announcementRoutes from './routes/announcement.routes.js';
import eventRoutes from './routes/event.route.js';
import uploadRoutes from './routes/upload.route.js';
import studentRoutes from './routes/student.route.js';
import parentRoutes from './routes/parent.route.js';
import attendanceRoutes from './routes/attendance.route.js';
import teacherRoutes from './routes/teacher.route.js';
import assignmentRoutes from './routes/assignment.route.js';
import libraryRoutes from './routes/library.routes.js';
import analyticsRoutes from "./routes/analytics.route.js"; 
import createLibrarian from './routes/create.librarian.route.js';
import leaveRoutes from "./routes/leave.route.js";
import paymentRoutes from "./routes/payments.route.js";
import settingRoutes from "./routes/setting.route.js";
import { scheduleFeeReminderJob } from "./cron/feeReminderCron.js";
import timetableRoutes from "./routes/timetableRoutes.js";
import subjectRoutes from './routes/subjectRoutes.js';
import calendarRoutes from "./routes/calendar.routes.js";
import chatbotRoutes from "./routes/chatbot.route.js";
import schoolRoutes from "./routes/school.route.js";
import passwordResetRoutes from "./routes/passwordReset.route.js";
import dashboardRoutes from "./routes/dashboard.route.js";
import enhancedAnalyticsRoutes from "./routes/enhancedAnalytics.route.js";
import teacherAttendanceRoutes from "./routes/teacherAttendance.route.js";
import twoFactorRoutes from "./routes/twoFactor.route.js";
import email2FARoutes from "./routes/email2FA.route.js";
import sms2FARoutes from "./routes/sms2FA.route.js";
import deviceTrustRoutes from "./routes/deviceTrust.route.js";
import examSeatingRoutes from "./routes/examSeatingRoutes.js";


dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ✅ Resolve __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Serve the 'uploads' folder statically
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ✅ Middlewares
// Configure JSON parser to skip multipart/form-data requests
app.use(express.json({ 
  limit: "50mb",
  type: function (req) {
    // Only parse JSON content, skip multipart/form-data (handled by multer)
    const contentType = req.headers['content-type'] || '';
    return contentType.startsWith('application/json');
  }
}));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(cookieParser());
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
}));

// ✅ Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/admissions', admissionRoutes);
app.use('/api/announcements', announcementRoutes);
app.use("/api/events", eventRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/parents', parentRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/teachers', teacherRoutes); 
app.use('/api/assignments', assignmentRoutes);
app.use('/api/library', libraryRoutes); 
app.use("/api/analytics", analyticsRoutes);
app.use("/api/librarians", createLibrarian);
app.use("/api/leaves",leaveRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/settings", settingRoutes);
// Mount route
app.use("/api/timetable", timetableRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/calendar',calendarRoutes)
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/school', schoolRoutes);
app.use('/api/password-reset', passwordResetRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/enhanced-analytics', enhancedAnalyticsRoutes);
app.use('/api/teacher-attendance', teacherAttendanceRoutes);
app.use('/api/auth/2fa', twoFactorRoutes);
app.use('/api/auth/email-2fa', email2FARoutes);
app.use('/api/auth/sms-2fa', sms2FARoutes);
app.use('/api/auth/device-trust', deviceTrustRoutes);
app.use('/api/exam-seating', examSeatingRoutes);


// ✅ Start the server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running at http://localhost:${PORT}`);
  connectDB();
  // Start scheduled jobs
  scheduleFeeReminderJob();
});
