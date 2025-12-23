import express from "express";
import {
  requestPasswordReset,
  validateResetToken,
  resetPassword,
  adminResetPassword
} from "../controllers/passwordReset.controller.js";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

// Public routes (no authentication required)
router.post("/request", requestPasswordReset);
router.post("/validate-token", validateResetToken);
router.post("/reset", resetPassword);

// Admin only route
router.post("/admin-reset", protectRoute, adminRoute, adminResetPassword);

export default router;
