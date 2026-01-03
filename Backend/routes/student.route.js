import express from "express";
import {
  getMyStudents,
  getAllStudents,
  getAllStudentsForCredentials,
  deleteStudent,
  countStudents,
  fetchStudentInfo,
  getStudentProfile,
  getStudentProfileForAdmin,
  getUniqueValues,
  updateStudentImage,
  updateStudentImages,
  searchStudentByStudentId,
} from "../controllers/student.controller.js";
import { upload } from "../utils/multer.js";
import { adminRoute, protectRoute } from "../middleware/auth.middleware.js";
import { createSingleStudent, uploadStudents } from "../controllers/upload.controller.js";

const router = express.Router();

/**
 * Bulk upload: Excel + ZIP images
 * Use multer.fields to accept two files: 
 *  - excel: Excel sheet
 *  - imagesZip: ZIP file with student images
 */
router.post(
  "/upload",
  protectRoute,
  adminRoute,
  upload.fields([
    { name: "excel", maxCount: 1 },
    { name: "imagesZip", maxCount: 1 },
  ]),
  uploadStudents
);

/**
 * Single student creation
 * Optional image upload via "image" field
 */
router.post(
  "/create-single",
  protectRoute,
  adminRoute,
  upload.single("image"),
  createSingleStudent
);

/**
 * Update student images from ZIP file
 * Images should be named with student IDs (e.g., S24001.jpg, S24002.png)
 */
router.post(
  "/update-images",
  protectRoute,
  adminRoute,
  upload.single("imagesZip"),
  updateStudentImages
);

// Fetch students for logged-in teacher/admin
router.get("/my-students", protectRoute, getMyStudents);

// Fetch all students (admin only)
router.get("/all", protectRoute, adminRoute, getAllStudents);

// Fetch all students for credentials management (no pagination)
router.get("/all-for-credentials", protectRoute, adminRoute, getAllStudentsForCredentials);

// Get unique classes and sections for filter dropdowns (public access for parent forms)
router.get("/unique-values", getUniqueValues);

// Count total students
router.get("/count-students", countStudents);

// Fetch student info by parent (for parent dashboard)
router.get("/by-parent", protectRoute, fetchStudentInfo);

// Get student profile by ID (for student dashboard)
router.get("/profile/:studentId", protectRoute, getStudentProfile);

// Get detailed student profile for admin (by student _id)
router.get("/admin-profile/:studentId", protectRoute, adminRoute, getStudentProfileForAdmin);

// Search student by studentId (for validation)
router.get("/search/:studentId", protectRoute, adminRoute, searchStudentByStudentId);

// Update single student image
router.put("/update-image/:studentId", protectRoute, adminRoute, upload.single("image"), updateStudentImage);

// Delete a student (admin only)
router.delete("/:studentId", protectRoute, adminRoute, deleteStudent);

export default router;
