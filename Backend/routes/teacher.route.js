import express from "express";
import { assignSectionToTeacher,uploadTeachers,getTeachers,getAllTeachers, getClassTeachersForStudent, getStudentByParent, addSingleTeacher, deleteTeacher, updateTeacherImages, getTeacherProfileForAdmin, updateTeacherImage} from "../controllers/teacher.controller.js";
import { protectRoute, adminRoute,teacherRoute, studentRoute,allowRoles, parentRoute} from "../middleware/auth.middleware.js";
import { upload } from "../utils/multer.js";
import { getAssignedStudentsWithAttendance } from "../controllers/teacher.controller.js";

const router = express.Router();

router.post("/assign-section", protectRoute, adminRoute, assignSectionToTeacher);

router.post(
  "/upload-bulk",
  protectRoute,
  adminRoute,
  upload.fields([
    { name: "excel", maxCount: 1 },
    { name: "imagesZip", maxCount: 1 },
  ]),
  uploadTeachers);

router.post(
  "/create", 
  protectRoute,
  adminRoute,
  upload.single("image"),
  addSingleTeacher
); // 👈 single teacher route

router.post(
  "/update-images",
  protectRoute,
  adminRoute,
  upload.single("imagesZip"),
  updateTeacherImages
); // 👈 update teacher images route

  router.get("/", protectRoute, adminRoute, getTeachers);
  router.get("/all", protectRoute, adminRoute, getAllTeachers);
  router.get("/students", protectRoute, teacherRoute,getAssignedStudentsWithAttendance);
  router.get("/class-teachers", protectRoute, allowRoles("student", "parent"), getClassTeachersForStudent);
  router.get("/by-parent", protectRoute, parentRoute, getStudentByParent);
  
  // Get detailed teacher profile for admin (by teacher _id)
  router.get("/admin-profile/:teacherId", protectRoute, adminRoute, getTeacherProfileForAdmin);
  
  // Update single teacher image
  router.put("/update-image/:teacherId", protectRoute, adminRoute, upload.single("image"), updateTeacherImage);
  
  router.delete("/:teacherId", protectRoute, adminRoute, deleteTeacher); // ✅ DELETE route

export default router;

