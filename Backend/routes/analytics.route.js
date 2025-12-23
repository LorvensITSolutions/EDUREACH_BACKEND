import express from "express";
import { 
  // Student Analytics
  getStudentsByClass,
  getStudentsBySection,
  getAdmissionTrends,
  getAttendancePatterns,
  getAttendanceSummary,
  
  // Financial Analytics
  getFeeCollectionRates,
  getOutstandingPayments,
  getPaymentMethodsAnalysis,
  getFeeStructureByClass,
  getLateFeeAnalytics,
  
  // Academic Performance
  getAssignmentCompletionRates,
  getTeacherWorkload,
  
  // Real-time KPIs
  getActiveStudentsCount,
  getPendingAdmissionsCount,
  getUpcomingEvents,
  getDashboardSummary,
  
  // Teacher Analytics
  getTeacherAnalyticsDashboard,

} from "../controllers/analytics.controller.js";
import { protectRoute, teacherRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

// ===========================================
// STUDENT ANALYTICS ROUTES
// ===========================================
router.get("/students-by-class", getStudentsByClass);
router.get("/students-by-section", getStudentsBySection);
router.get("/admission-trends", getAdmissionTrends);
router.get("/attendance-patterns", getAttendancePatterns);
router.get("/attendance-summary", getAttendanceSummary);

// ===========================================
// FINANCIAL ANALYTICS ROUTES
// ===========================================
router.get("/fee-collection-rates", getFeeCollectionRates);
router.get("/outstanding-payments", getOutstandingPayments);
router.get("/payment-methods-analysis", getPaymentMethodsAnalysis);
router.get("/fee-structure-by-class", getFeeStructureByClass);
router.get("/late-fee-analytics", getLateFeeAnalytics);

// ===========================================
// ACADEMIC PERFORMANCE ROUTES
// ===========================================
router.get("/assignment-completion-rates", getAssignmentCompletionRates);
router.get("/teacher-workload", getTeacherWorkload);

// ===========================================
// REAL-TIME KPIs ROUTES
// ===========================================
router.get("/active-students-count", getActiveStudentsCount);
router.get("/pending-admissions-count", getPendingAdmissionsCount);
router.get("/upcoming-events", getUpcomingEvents);
router.get("/dashboard-summary", getDashboardSummary);

// ===========================================
// TEACHER ANALYTICS ROUTES
// ===========================================
router.get("/teacher-dashboard", protectRoute, teacherRoute, getTeacherAnalyticsDashboard);




export default router;
