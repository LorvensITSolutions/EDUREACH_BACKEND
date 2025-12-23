// routes/attendance.route.js
import express from 'express';
import { getAttendanceForParent, getDailyAttendanceSummary, getMonthlyAttendanceSummary, getStudentAttendance, markAttendance, downloadStudentAttendancePDF, downloadParentAttendancePDF } from '../controllers/attendance.controller.js';
import { parentRoute, protectRoute, studentRoute, teacherRoute } from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/mark', protectRoute, teacherRoute, markAttendance);
router.get('/summary',protectRoute, getMonthlyAttendanceSummary);
router.get('/daily-summary', protectRoute, teacherRoute, getDailyAttendanceSummary);
router.get('/students-attendance',protectRoute,studentRoute,getStudentAttendance);
router.get("/parent/student-attendance", protectRoute, parentRoute,getAttendanceForParent);
router.get('/students-attendance/pdf', protectRoute, studentRoute, downloadStudentAttendancePDF);
router.get('/parent/student-attendance/pdf', protectRoute, parentRoute, downloadParentAttendancePDF);

export default router;
