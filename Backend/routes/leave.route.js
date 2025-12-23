import express from "express";
import {
  applyLeave,
  getParentChildren,
  getLeavesByParent,
  getAllLeaves,
  getTeacherLeaves,
  updateLeaveStatus,
} from "../controllers/leave.controller.js";
import { parentRoute, protectRoute, teacherRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

// ✅ Get parent's children for leave application
router.get("/children", protectRoute, parentRoute, getParentChildren); // role: parent

// ✅ Parent submits leave for their child
router.post("/apply", protectRoute,parentRoute, applyLeave); // role: parent

// ✅ Parent views all leaves submitted by them
router.get("/my-leaves", protectRoute,parentRoute, getLeavesByParent); // role: parent

// ✅ Admin/Teacher views all leave applications
router.get("/all", protectRoute,teacherRoute, getAllLeaves); // role: admin/teacher

// ✅ Teacher views only their assigned students' leave applications
router.get("/my-students", protectRoute, teacherRoute, getTeacherLeaves); // role: teacher

// ✅ Admin/Teacher updates leave status (approve/reject)
router.patch("/update-status/:leaveId", protectRoute,teacherRoute, updateLeaveStatus); // role: admin/teacher

export default router;

