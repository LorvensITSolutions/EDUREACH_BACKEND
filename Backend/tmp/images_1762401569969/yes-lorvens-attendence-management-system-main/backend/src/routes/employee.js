const express = require("express");
const {
  punchIn,
  punchOut,
  getTodayStatus,
  getAttendanceLogs,
  getAttendanceStats,
  getProfile,
  updateProfile,
  getDashboard,
} = require("../controllers/employeeController");

const {
  protect,
  requireEmployee,
  desktopOnly,
} = require("../middlewares/auth");

const {
  validateAttendanceAction,
  validateProfileUpdate,
} = require("../middlewares/validation");

const router = express.Router();

// Apply desktop-only middleware to all routes (temporarily disabled for testing)
// router.use(desktopOnly);

// All routes require authentication
router.use(protect);
router.use(requireEmployee);

// Dashboard
router.get("/dashboard", getDashboard);

// Attendance actions
router.post("/punch-in", validateAttendanceAction, punchIn);
router.post("/punch-out", validateAttendanceAction, punchOut);

// Get today's status
router.get("/today", getTodayStatus);

// Get attendance logs (both routes for compatibility)
router.get("/attendance", getAttendanceLogs);
router.get("/attendance-logs", getAttendanceLogs);

// Get attendance statistics
router.get("/attendance-stats", getAttendanceStats);

// Profile management
router.get("/profile", getProfile);
router.put("/profile", validateProfileUpdate, updateProfile);

module.exports = router;
