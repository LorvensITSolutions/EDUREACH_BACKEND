import express from "express";
import {
  // Admin functions
  markTeacherAttendance,
  getAllTeachersAttendance,
  updateTeacherAttendance,
  deleteTeacherAttendance,
  getTeachersWithoutAttendance,
  getMonthlyAttendanceReport,
  getDailyTeacherAttendanceSummary,
  getAttendanceSummary,
  getAttendanceStatistics,
  
  // Teacher functions
  getTeacherAttendanceHistory,
  getTeacherAttendanceSummary,
  getTodayAttendanceStatus
} from "../controllers/teacherAttendance.controller.js";
import { protectRoute, adminRoute, teacherRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

// ===========================================
// ADMIN ROUTES (Manage All Teachers' Attendance)
// ===========================================

// Mark teacher attendance (admin only) - handles both single and bulk
router.post("/admin/mark", protectRoute, adminRoute, markTeacherAttendance);

// Get all teachers' attendance (admin only)
router.get("/admin/all", protectRoute, adminRoute, getAllTeachersAttendance);

// Update teacher attendance (admin only)
router.put("/admin/update/:attendanceId", protectRoute, adminRoute, updateTeacherAttendance);

// Delete teacher attendance (admin only)
router.delete("/admin/delete/:attendanceId", protectRoute, adminRoute, deleteTeacherAttendance);

// Get teachers without attendance for a specific date (admin only)
router.get("/admin/without-attendance", protectRoute, adminRoute, getTeachersWithoutAttendance);

// Get monthly attendance report for all teachers (admin only)
router.get("/admin/monthly-report", protectRoute, adminRoute, getMonthlyAttendanceReport);

// Get daily teacher attendance summary (admin only)
router.get("/admin/daily-summary", protectRoute, adminRoute, getDailyTeacherAttendanceSummary);

// Get attendance summary for admin dashboard (admin only)
router.get("/admin/summary", protectRoute, adminRoute, getAttendanceSummary);

// Get attendance statistics for dashboard (admin only)
router.get("/admin/statistics", protectRoute, adminRoute, getAttendanceStatistics);

// ===========================================
// TEACHER ROUTES (View Own Attendance)
// ===========================================

// Get teacher's own attendance history
router.get("/teacher/history", protectRoute, teacherRoute, getTeacherAttendanceHistory);

// Get teacher's own attendance summary
router.get("/teacher/summary", protectRoute, teacherRoute, getTeacherAttendanceSummary);

// Get today's attendance status for a teacher
router.get("/teacher/today", protectRoute, teacherRoute, getTodayAttendanceStatus);

// ===========================================
// SHARED ROUTES (Both Admin and Teacher can access)
// ===========================================

// Get attendance statistics (both admin and teacher)
router.get("/statistics", protectRoute, getAttendanceStatistics);

export default router;
