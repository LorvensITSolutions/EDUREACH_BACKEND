import express from "express";
import {
  generate2FA,
  verify2FASetup,
  verify2FACode,
  disable2FA,
  get2FAStatus,
} from "../controllers/twoFactor.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

// All 2FA routes require authentication except verify2FACode (used during login)
router.post("/generate", protectRoute, generate2FA);
router.post("/verify-setup", protectRoute, verify2FASetup);
router.post("/verify", verify2FACode); // No auth required - used during login
router.post("/disable", protectRoute, disable2FA);
router.get("/status", protectRoute, get2FAStatus);

export default router;

