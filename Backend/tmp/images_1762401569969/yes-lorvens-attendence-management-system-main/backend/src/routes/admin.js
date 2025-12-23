const express = require("express");
const {
  getAllEmployees,
  getNextEmployeeId,
  getEmployeeDetails,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getAllAttendance,
  getTodayAttendance,
  createManualAttendance,
  updateAttendance,
  updateAttendanceStatus,
  getDashboardStats,
  getReports,
  exportReports,
  getLoggedInEmployees,
  getAutoPunchOutStatus,
  getEmployeesByAttendanceStatus,
  triggerEndOfDayStatusUpdate,
} = require("../controllers/adminController");

const { protect, requireAdmin, desktopOnly } = require("../middlewares/auth");

const {
  validateEmployeeCreation,
  validateEmployeeUpdate,
  validateEmployeeSearch,
  validateManualAttendanceEntry,
  validateDateRange,
  validateDateRangeLogic,
  validateObjectId,
} = require("../middlewares/validation");

const router = express.Router();

// Apply desktop-only middleware to all routes
router.use(desktopOnly);

// All routes require authentication and admin role
router.use(protect);
router.use(requireAdmin);

// Dashboard
router.get("/dashboard", getDashboardStats);

// Employee management
router.get("/employees", getAllEmployees);
router.get("/employees/next-id", getNextEmployeeId);
router.get("/employees/:id/details", validateObjectId, getEmployeeDetails);
router.post("/employees", validateEmployeeCreation, createEmployee);
router.put(
  "/employees/:id",
  validateObjectId,
  validateEmployeeUpdate,
  updateEmployee
);
router.delete("/employees/:id", validateObjectId, deleteEmployee);

// Attendance management
router.get(
  "/attendance",
  validateDateRange,
  validateDateRangeLogic,
  getAllAttendance
);
router.get("/attendance/today", getTodayAttendance);
router.get("/attendance/by-status", getEmployeesByAttendanceStatus);
router.post(
  "/attendance",
  validateManualAttendanceEntry,
  createManualAttendance
);
router.put("/attendance/:id", validateObjectId, updateAttendance);
router.post("/attendance/update-status", updateAttendanceStatus);

// Reports
router.get("/reports", validateDateRange, validateDateRangeLogic, getReports);
router.get(
  "/reports/export",
  validateDateRange,
  validateDateRangeLogic,
  exportReports
);

// Auto Punch-Out Management
router.get("/attendance/logged-in", getLoggedInEmployees);
router.get("/attendance/auto-punchout/status", getAutoPunchOutStatus);

// End-of-Day Management
router.post("/attendance/end-of-day-update", triggerEndOfDayStatusUpdate);

module.exports = router;
