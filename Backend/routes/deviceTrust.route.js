import express from "express";
import {
  checkDeviceTrust,
  createDeviceTrust,
  getTrustedDevices,
  revokeDevice,
  revokeAllDevices,
} from "../controllers/deviceTrust.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

// Public routes (for checking device trust during login)
router.post("/check", checkDeviceTrust);

// Protected routes (require authentication)
router.post("/create", protectRoute, createDeviceTrust);
router.get("/devices", protectRoute, getTrustedDevices);
router.delete("/devices/:deviceId", protectRoute, revokeDevice);
router.delete("/devices", protectRoute, revokeAllDevices);

export default router;

