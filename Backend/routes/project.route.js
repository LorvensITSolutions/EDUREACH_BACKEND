import express from "express";
import {
  createProject,
  deleteProject,
  updateProject,
  getAllProjects
} from "../controllers/project.controller.js";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/", protectRoute, adminRoute, createProject);
router.delete("/:id", protectRoute, adminRoute, deleteProject);
router.patch("/:id", protectRoute, adminRoute, updateProject);
router.get("/", getAllProjects); 

export default router;
