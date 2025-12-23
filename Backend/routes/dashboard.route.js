import express from "express";
import { 
  getDashboardAnalytics, 
  getIncomeExpenseData, 
  getAttendanceInspectionData, 
  getAnnualFeeSummary 
} from "../controllers/dashboard.controller.js";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

// Dashboard analytics routes
router.get("/analytics", protectRoute, adminRoute, getDashboardAnalytics);
router.get("/income-expense", protectRoute, adminRoute, getIncomeExpenseData);
router.get("/attendance-inspection", protectRoute, adminRoute, getAttendanceInspectionData);
router.get("/annual-fee-summary", protectRoute, adminRoute, getAnnualFeeSummary);

export default router;
