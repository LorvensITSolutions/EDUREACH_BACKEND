import express from "express";
import {
  sendEmail2FACode,
  verifyEmail2FACode,
  enableEmail2FA,
  disableEmail2FA,
  getEmail2FAStatus,
} from "../controllers/email2FA.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

// Public routes (used during login)
router.post("/send", sendEmail2FACode); // Send code after password verification
router.post("/verify", verifyEmail2FACode); // Verify code and complete login

// Protected routes (require authentication)
router.post("/enable", protectRoute, enableEmail2FA);
router.post("/disable", protectRoute, disableEmail2FA);
router.get("/status", protectRoute, getEmail2FAStatus);

export default router;

