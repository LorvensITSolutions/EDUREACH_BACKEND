import express from "express";
import { 
  getSchoolConfiguration, 
  updateSchoolConfiguration, 
  resetStudentCounter 
} from "../controllers/school.controller.js";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

// All routes require authentication and admin access
router.use(protectRoute);
router.use(adminRoute);

// Get school configuration
router.get("/", getSchoolConfiguration);

// Update school configuration
router.put("/", updateSchoolConfiguration);

// Reset student counter for new academic year
router.post("/reset-counter", resetStudentCounter);

export default router;
