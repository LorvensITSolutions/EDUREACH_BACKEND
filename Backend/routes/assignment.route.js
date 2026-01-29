import express from "express";
import {
  uploadAssignment,
  evaluateAssignment,
  getStudentAssignments,
  getSingleAssignment,
  submitAssignment,
  getSubmissions,
  getSubmissionFile,
  getTeacherAssignments,
  updateAssignmentDueDate,
  updateAssignment,
  deleteAssignment,
} from "../controllers/assignment.controller.js";
import { getChildAssignments } from "../controllers/assignment.controller.js";

import { parentRoute, protectRoute, studentRoute, teacherRoute } from "../middleware/auth.middleware.js";
import { upload, assignmentFileUpload } from "../utils/multer.js";

const router = express.Router();

// Only run multer for multipart (FormData with files). Skip for JSON. Accepts PDF + images.
const maybeUploadPdfs = (req, res, next) => {
  const ct = (req.headers["content-type"] || "").toLowerCase();
  if (ct.startsWith("multipart/form-data")) return assignmentFileUpload.array("pdfs", 3)(req, res, next);
  next();
};

// ✅ Upload assignment - TEACHER (PDF + images)
router.post(
  "/upload",
  protectRoute,
  teacherRoute,
  assignmentFileUpload.array("pdfs", 3),
  uploadAssignment
);

router.patch("/:id/update-due-date", protectRoute, teacherRoute, updateAssignmentDueDate);
router.patch("/:id/update", protectRoute, teacherRoute, maybeUploadPdfs, updateAssignment);

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

// ✅ Submit assignment - STUDENT (PDF + images)
router.post(
  "/submit/:assignmentId",
  protectRoute,
  studentRoute,
  assignmentFileUpload.single("file"),
  submitAssignment
); 

// ✅ Get submissions for specific assignment (keep last)
router.get(
  "/:id/submissions",
  protectRoute,
  teacherRoute,
  getSubmissions
);

// ✅ Get submission file for download (PDF/image) — ?studentId=...
router.get(
  "/:id/submission-file",
  protectRoute,
  teacherRoute,
  getSubmissionFile
);

export default router;
