import express from "express";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";
import {
  getComprehensiveDashboardAnalytics,
  getRealTimeDashboardUpdates,
  getIncomeExpenseData,
  getFeeCollectionStatusData,
  getPaymentMethodsData,
  getAttendanceInspectionData,
  getAnnualFeeSummary,
  getTeacherPerformanceAnalytics,
  getRealTimeAlerts,
  getPerformanceTrends,
  getStudentAttendanceAnalytics,
  getTeacherAttendanceAnalytics,
  getAttendanceComparativeAnalytics,
  invalidateAnalyticsCache
} from "../controllers/enhancedAnalytics.controller.js";

const router = express.Router();

// ===========================================
// ENHANCED ANALYTICS ROUTES
// ===========================================

// Get comprehensive dashboard analytics
router.get("/comprehensive", protectRoute, adminRoute, getComprehensiveDashboardAnalytics);

// Get real-time dashboard updates
router.get("/real-time", protectRoute, adminRoute, getRealTimeDashboardUpdates);

// Get income vs expense data
router.get("/income-expense", protectRoute, adminRoute, getIncomeExpenseData);

// Get fee collection status data (amount due vs amount paid)
router.get("/fee-collection-status", protectRoute, adminRoute, getFeeCollectionStatusData);

// Get payment methods analysis data
router.get("/payment-methods", protectRoute, adminRoute, getPaymentMethodsData);

// Get attendance inspection data
router.get("/attendance-inspection", protectRoute, adminRoute, getAttendanceInspectionData);

// Get annual fee summary
router.get("/annual-fee-summary", protectRoute, adminRoute, getAnnualFeeSummary);

// Get teacher performance analytics
router.get("/teacher-performance", protectRoute, adminRoute, getTeacherPerformanceAnalytics);

// Get real-time alerts and notifications
router.get("/real-time-alerts", protectRoute, adminRoute, getRealTimeAlerts);

// Get performance trends analytics
router.get("/performance-trends", protectRoute, adminRoute, getPerformanceTrends);

// ===========================================
// ATTENDANCE ANALYTICS ROUTES
// ===========================================

// Get student attendance analytics with comprehensive filters
router.get("/student-attendance", protectRoute, adminRoute, getStudentAttendanceAnalytics);

// Get teacher attendance analytics with comprehensive filters
router.get("/teacher-attendance", protectRoute, adminRoute, getTeacherAttendanceAnalytics);

// Get comparative attendance analytics (current vs previous periods)
router.get("/attendance-comparative", protectRoute, adminRoute, getAttendanceComparativeAnalytics);

// ===========================================
// CACHE MANAGEMENT ROUTES
// ===========================================

// Invalidate analytics cache
router.post("/invalidate-cache", protectRoute, adminRoute, async (req, res) => {
  try {
    const { type = 'all', academicYear = '' } = req.body;
    const success = await invalidateAnalyticsCache(type, academicYear);
    
    res.status(200).json({
      success,
      message: `Analytics cache invalidated successfully for type: ${type}`,
      type,
      academicYear
    });
  } catch (error) {
    console.error("Cache invalidation error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to invalidate analytics cache",
      error: error.message
    });
  }
});

export default router;
