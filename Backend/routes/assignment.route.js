import express from "express";
import {
  uploadAssignment,
  evaluateAssignment,
  getStudentAssignments,
  getSingleAssignment,
  submitAssignment,
  getSubmissions,
  getTeacherAssignments,
  updateAssignmentDueDate,
  deleteAssignment,
} from "../controllers/assignment.controller.js";
import { getChildAssignments } from "../controllers/assignment.controller.js";

import { parentRoute, protectRoute, studentRoute, teacherRoute } from "../middleware/auth.middleware.js";
import { upload } from "../utils/multer.js";

const router = express.Router();

// ✅ Upload assignment - TEACHER
router.post(
  "/upload",
  protectRoute,
  teacherRoute,
  upload.array("pdfs", 3),
  uploadAssignment
);

router.patch("/:id/update-due-date", protectRoute, teacherRoute,updateAssignmentDueDate);

// ✅ Evaluate assignment - TEACHER
router.post(
  "/evaluate",
  protectRoute,
  teacherRoute,
  evaluateAssignment
);

// ✅ Get teacher's uploaded assignments
router.get(
  "/teacher",
  protectRoute,
  teacherRoute,
  getTeacherAssignments
);

router.delete("/:id", protectRoute,teacherRoute, deleteAssignment);

router.get("/parent/student", protectRoute, parentRoute, getChildAssignments);

// ✅ Get assignments for student
router.get(
  "/student",
  protectRoute,
  studentRoute,
  getStudentAssignments
);

// ✅ Get single assignment for student
router.get(
  "/:id",
  protectRoute,
  studentRoute,
  getSingleAssignment
);

router.post(
  "/submit/:assignmentId",
  protectRoute,
  studentRoute, // ✅ ADD THIS LINE
  upload.single("file"),
  submitAssignment
); 

// ✅ Get submissions for specific assignment (keep last)
router.get(
  "/:id/submissions",
  protectRoute,
  teacherRoute,
  getSubmissions
);


export default router;
