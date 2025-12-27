import express from "express";
import {
  getStudentsForPromotion,
  promoteStudents,
  issueTransferCertificate,
  getPromotionHistory,
  bulkPromoteByClass,
  getStudentAttendanceForYear,
  updateAllStudentsAcademicYear
} from "../controllers/promotion.controller.js";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

// Get students for promotion (with attendance stats)
router.get(
  "/students",
  protectRoute,
  adminRoute,
  getStudentsForPromotion
);

// Promote students
router.post(
  "/promote",
  protectRoute,
  adminRoute,
  promoteStudents
);

// Bulk promote by class
router.post(
  "/bulk-promote",
  protectRoute,
  adminRoute,
  bulkPromoteByClass
);

// Issue Transfer Certificate
router.post(
  "/issue-tc",
  protectRoute,
  adminRoute,
  issueTransferCertificate
);

// Get student attendance for academic year
router.get(
  "/attendance",
  protectRoute,
  adminRoute,
  getStudentAttendanceForYear
);

// Update all students with current academic year
router.post(
  "/update-academic-year",
  protectRoute,
  adminRoute,
  updateAllStudentsAcademicYear
);

// Get promotion history for a student
router.get(
  "/history/:studentId",
  protectRoute,
  getPromotionHistory
);

export default router;

