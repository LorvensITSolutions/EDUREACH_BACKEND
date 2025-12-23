// routes/setting.routes.js
import express from "express";
import { getAllSettings, updateLateFee, updateFeeReminderTime, updateFeeReminderDays } from "../controllers/setting.controller.js";
import { adminRoute, protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

// POST /api/admin/settings/late-fee
router.post("/late-fee", protectRoute,adminRoute, updateLateFee)
router.get("/", protectRoute, adminRoute, getAllSettings);
router.post("/reminder-time", protectRoute, adminRoute, updateFeeReminderTime);
router.post("/reminder-days", protectRoute, adminRoute, updateFeeReminderDays);

export default router;
