import express from "express";
import { 
  getAllParents, 
  countParents, 
  addChildToParent, 
  getParentWithChildren, 
  createParentWithChildren,
  updateParentPhone
} from "../controllers/parent.controller.js";

import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";
import { upload } from "../utils/multer.js";

const router = express.Router();

// Parent routes
router.get("/", protectRoute, adminRoute, getAllParents);
router.get("/count", protectRoute, adminRoute, countParents);

// Create parent with multiple children
router.post("/create-with-children", protectRoute, adminRoute, createParentWithChildren);

// Update parent phone number (must come before /:parentId route)
router.put("/:parentId/phone", protectRoute, adminRoute, updateParentPhone);

// Add child to existing parent (with optional image upload)
router.post("/:parentId/add-child", protectRoute, adminRoute, upload.single("image"), addChildToParent);

// Get parent with children (must come after more specific routes)
router.get("/:parentId", protectRoute, adminRoute, getParentWithChildren);

export default router;
