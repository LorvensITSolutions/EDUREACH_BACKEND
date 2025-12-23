import express from "express";
import {
  sendSMS2FACode,
  verifySMS2FACode,
  enableSMS2FA,
  disableSMS2FA,
  getSMS2FAStatus,
  updatePhoneNumber,
} from "../controllers/sms2FA.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

// Public routes (used during login)
router.post("/send", sendSMS2FACode); // Send code after password verification
router.post("/verify", verifySMS2FACode); // Verify code and complete login

// Protected routes (require authentication)
router.post("/enable", protectRoute, enableSMS2FA);
router.post("/disable", protectRoute, disableSMS2FA);
router.get("/status", protectRoute, getSMS2FAStatus);
router.put("/phone", protectRoute, updatePhoneNumber); // Update phone number

export default router;

