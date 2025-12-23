import express from "express";
import { 
  getAllParents, 
  countParents, 
  addChildToParent, 
  getParentWithChildren, 
  createParentWithChildren 
} from "../controllers/parent.controller.js";

import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";
import { upload } from "../utils/multer.js";

const router = express.Router();

// Parent routes
router.get("/", protectRoute, adminRoute, getAllParents);
router.get("/count", protectRoute, adminRoute, countParents);
router.get("/:parentId", protectRoute, adminRoute, getParentWithChildren);

// Create parent with multiple children
router.post("/create-with-children", protectRoute, adminRoute, createParentWithChildren);

// Add child to existing parent (with optional image upload)
router.post("/:parentId/add-child", protectRoute, adminRoute, upload.single("image"), addChildToParent);

export default router;
