import Teacher from "../models/teacher.model.js";
import User from "../models/user.model.js";
import Student from "../models/student.model.js";
import Parent from "../models/parent.model.js";
import Attendance from "../models/attendance.model.js";
import FeePayment from "../models/feePayment.model.js";
import TeacherAttendance from "../models/TeacherAttendance.js";
import { generateTeacherId, generateTeacherCredentials } from "../utils/credentialGenerator.js";
import { cache, cacheKeys, invalidateCache } from "../lib/redis.js";
import { validateTeacherAssignment, validateTeacherData, checkDuplicateAssignment } from "../utils/teacherValidation.js";
import { getCurrentAcademicYear, getPreviousAcademicYear } from "../utils/academicYear.js";
import xlsx from "xlsx";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import unzipper from "unzipper";
import cloudinary from "../lib/cloudinary.js";

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper: Upload local image to Cloudinary
const uploadImageToCloudinary = async (filePath, teacherId) => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: "teachers",
      public_id: teacherId,
    });
    return { public_id: result.public_id, url: result.secure_url };
  } catch (err) {
    console.error(`Cloudinary upload failed for ${filePath}`, err.message);
    return null;
  }
};

// ✅ Upload teachers from Excel
export const uploadTeachers = async (req, res) => {
  try {
    if (!req.files || !req.files.excel || !req.files.excel[0]) {
      return res.status(400).json({ message: "Excel file is required" });
    }

    const excelFilePath = req.files.excel[0].path;
    const imagesZipPath =
      req.files.imagesZip && req.files.imagesZip[0]
        ? req.files.imagesZip[0].path
        : null;

    // Extract ZIP images if provided
    let tempDir = null;
    if (imagesZipPath) {
      tempDir = path.join(__dirname, "../tmp", `images_${Date.now()}`);
      fs.mkdirSync(tempDir, { recursive: true });
      await fs
        .createReadStream(imagesZipPath)
        .pipe(unzipper.Extract({ path: tempDir }))
        .promise();
    }

    // Read Excel
    const workbook = xlsx.readFile(excelFilePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData = xlsx.utils.sheet_to_json(sheet);

    // Validate rows
    const validationErrors = [];
    rawData.forEach((row, index) => {
      if (!row.teacherId) validationErrors.push(`Row ${index + 2}: Teacher ID required`);
      if (!row.name) validationErrors.push(`Row ${index + 2}: Teacher name required`);
    });

    if (validationErrors.length > 0) {
      return res.status(400).json({ message: "Validation errors", errors: validationErrors });
    }

    // Check duplicates
    const teacherIds = rawData.map((r) => r.teacherId);
    const duplicateIds = teacherIds.filter((id, i) => teacherIds.indexOf(id) !== i);
    if (duplicateIds.length > 0) {
      return res.status(400).json({
        message: "Duplicate teacher IDs in Excel",
        duplicateIds: [...new Set(duplicateIds)],
      });
    }

    // Check DB for existing IDs
    const existingTeachers = await Teacher.find({ teacherId: { $in: teacherIds } });
    if (existingTeachers.length > 0) {
      const existingIds = existingTeachers.map((t) => t.teacherId);
      return res.status(400).json({
        message: "Some teacher IDs already exist in DB",
        existingIds,
      });
    }

    const insertedTeachers = [];

    for (const row of rawData) {
      if (!row.name || !row.teacherId) {
        console.warn("Skipping row due to missing name or teacherId:", row);
        continue;
      }

      const teacherId = row.teacherId.trim();
      
      // Generate teacher credentials
      const teacherCredentials = await generateTeacherCredentials(teacherId);

      // Check if teacher ID already exists
      const existingTeacher = await Teacher.findOne({ teacherId });
      if (existingTeacher) continue;

      // 📸 Upload image if exists
      let imageData = null;
      if (tempDir) {
        for (const ext of [".jpg", ".jpeg", ".png"]) {
          const possiblePath = path.join(tempDir, `${teacherId}${ext}`);
          if (fs.existsSync(possiblePath)) {
            imageData = await uploadImageToCloudinary(possiblePath, teacherId);
            break;
          }
        }
      }

      // Step 1: Create User (password hashed via pre-save hook)
      const user = await User.create({
        name: row.name.trim(),
        password: teacherCredentials.password,
        role: "teacher",
        mustChangePassword: true, // ✅ Force change at first login
      });

      // Step 2: Create Teacher
      const teacher = await Teacher.create({
        teacherId,
        name: row.name.trim(),
        phone: row.phone || "",
        qualification: row.qualification || "",
        subject: row.subject || "",
        image: imageData,
        userId: user._id,
        generatedCredentials: {
          username: teacherCredentials.username,
          password: teacherCredentials.password
        }
      });

      // Step 3: Link teacherId in User
      user.teacherId = teacher._id;
      await user.save();

      insertedTeachers.push(teacher);
    }

    // Cleanup
    fs.unlinkSync(excelFilePath);
    if (imagesZipPath) fs.unlinkSync(imagesZipPath);
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });

    // Invalidate teacher caches
    await invalidateCache.teachers();

    res.status(201).json({ 
      message: "Teachers uploaded successfully", 
      count: insertedTeachers.length,
      teachers: insertedTeachers.map(t => ({
        teacherId: t.teacherId,
        name: t.name,
        credentials: t.generatedCredentials
      }))
    });
  } catch (error) {
    console.error("Upload teachers error:", error);
    res.status(500).json({ message: "Upload failed", error: error.message });
  }
};

export const addSingleTeacher = async (req, res) => {
  try {
    const { teacherId, name, phone, qualification, subject } = req.body;

    // Validate input using utility function
    const validation = validateTeacherData({ teacherId, name, phone, qualification, subject });
    
    if (!validation.isValid) {
      return res.status(400).json({ 
        message: "Validation failed",
        errors: validation.errors,
        warnings: validation.warnings
      });
    }

    const { sanitizedData } = validation;

    // Check if teacher ID already exists
    const existingTeacher = await Teacher.findOne({ teacherId: sanitizedData.teacherId });
    if (existingTeacher) {
      return res.status(400).json({ message: `Teacher ID ${sanitizedData.teacherId} already exists` });
    }

    // 📸 Image if uploaded
    let imageData = null;
    if (req.file) {
      imageData = await uploadImageToCloudinary(req.file.path, sanitizedData.teacherId);
      fs.unlinkSync(req.file.path);
    }

    // Generate teacher credentials
    const teacherCredentials = await generateTeacherCredentials(sanitizedData.teacherId);

    // ✅ Step 1: Create User (basic info + role)
    const user = await User.create({
      name: sanitizedData.name,
      password: teacherCredentials.password,
      role: "teacher",
      mustChangePassword: true, // 🔒 Force password update on first login
    });

    // ✅ Step 2: Create Teacher (but no sectionAssignments yet)
    const teacher = await Teacher.create({
      teacherId: sanitizedData.teacherId,
      name: sanitizedData.name,
      phone: sanitizedData.phone || "",
      qualification: sanitizedData.qualification || "",
      subject: sanitizedData.subject || "",
      image: imageData,
      userId: user._id,
      generatedCredentials: {
        username: teacherCredentials.username,
        password: teacherCredentials.password
      },
      sectionAssignments: [], // 🔒 Initially no sections assigned
    });

    // ✅ Step 3: Link teacherId in user
    user.teacherId = teacher._id;
    await user.save();

    // Invalidate teacher caches
    await invalidateCache.teachers();

    res.status(201).json({
      message: "Teacher created successfully",
      teacher: {
        teacherId: teacher.teacherId,
        name: teacher.name,
        credentials: teacher.generatedCredentials
      },
      warnings: validation.warnings.length > 0 ? validation.warnings : undefined
    });
  } catch (error) {
    console.error("Add single teacher error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ✅ Assign class & section to a teacher
export const assignSectionToTeacher = async (req, res) => {
  try {
    const { teacherId, className, section } = req.body;

    console.log("Assignment request:", { teacherId, className, section });

    // Validate input using utility function
    const validation = validateTeacherAssignment({ teacherId, className, section });
    
    if (!validation.isValid) {
      return res.status(400).json({ 
        message: "Validation failed",
        errors: validation.errors,
        warnings: validation.warnings,
        received: { teacherId, className, section }
      });
    }

    const { sanitizedData } = validation;

    // Find by MongoDB _id
    const teacher = await Teacher.findById(sanitizedData.teacherId);
    if (!teacher) {
      return res.status(404).json({ 
        message: "Teacher not found",
        searchedTeacherId: sanitizedData.teacherId 
      });
    }

    console.log("Found teacher:", teacher.name, "Teacher ID:", teacher.teacherId, "Current assignments:", teacher.sectionAssignments);

    // Check for duplicate assignments
    const newAssignment = { 
      className: sanitizedData.className, 
      section: sanitizedData.section 
    };
    
    if (checkDuplicateAssignment(teacher.sectionAssignments, newAssignment)) {
      return res.status(400).json({ 
        message: `Section ${sanitizedData.className}-${sanitizedData.section} is already assigned to this teacher`,
        teacher: teacher.name
      });
    }

    // Handle missing teacherId by generating one
    if (!teacher.teacherId) {
      console.log("Teacher ID is missing, generating one for:", teacher.name);
      try {
        const newTeacherId = await generateTeacherId();
        teacher.teacherId = newTeacherId;
        await teacher.save();
        console.log("Generated teacherId:", newTeacherId, "for teacher:", teacher.name);
      } catch (generateError) {
        console.error("Failed to generate teacherId:", generateError);
        return res.status(500).json({ 
          message: "Failed to generate teacherId for teacher",
          teacherId: teacher._id
        });
      }
    }

    // Add the new assignment
    teacher.sectionAssignments.push(newAssignment);
    
    // Use updateOne instead of save to avoid re-validation issues
    let updatedTeacher;
    try {
      const updateResult = await Teacher.updateOne(
        { _id: sanitizedData.teacherId },
        { $push: { sectionAssignments: newAssignment } }
      );

      if (updateResult.modifiedCount === 0) {
        return res.status(500).json({ 
          message: "Failed to update teacher assignments"
        });
      }

      // Fetch the updated teacher for response
      updatedTeacher = await Teacher.findById(sanitizedData.teacherId);
      
      if (!updatedTeacher) {
        return res.status(500).json({ 
          message: "Failed to fetch updated teacher"
        });
      }

      console.log("Updated teacher:", updatedTeacher.name, "Teacher ID:", updatedTeacher.teacherId);
    } catch (updateError) {
      console.error("Update error:", updateError);
      return res.status(500).json({ 
        message: "Failed to update teacher assignments",
        error: updateError.message
      });
    }

    console.log("Assignment successful:", updatedTeacher.sectionAssignments);

    // ✅ Invalidate teacher caches to ensure fresh data on next fetch
    await invalidateCache.teachers();

    res.status(200).json({
      message: "Section assigned successfully",
      teacher: {
        _id: updatedTeacher._id,
        teacherId: updatedTeacher.teacherId || "Generated during assignment",
        name: updatedTeacher.name,
        sectionAssignments: updatedTeacher.sectionAssignments
      },
      warnings: validation.warnings.length > 0 ? validation.warnings : undefined
    });
  } catch (error) {
    console.error("Assign error:", error);
    res.status(500).json({ 
      message: "Server error", 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// ✅ Remove section assignment from a teacher
export const removeSectionFromTeacher = async (req, res) => {
  try {
    const { teacherId, className, section } = req.body;

    console.log("Remove section request:", { teacherId, className, section });

    if (!teacherId || !className || !section) {
      return res.status(400).json({ 
        message: "Teacher ID, class name, and section are required"
      });
    }

    // Find teacher by MongoDB _id
    const teacher = await Teacher.findById(teacherId);
    if (!teacher) {
      return res.status(404).json({ 
        message: "Teacher not found"
      });
    }

    // Check if the assignment exists
    const assignmentIndex = teacher.sectionAssignments.findIndex(
      assignment => assignment.className === className && assignment.section === section
    );

    if (assignmentIndex === -1) {
      return res.status(404).json({ 
        message: `Section ${className}-${section} is not assigned to this teacher`
      });
    }

    // Remove the assignment
    const updateResult = await Teacher.updateOne(
      { _id: teacherId },
      { $pull: { sectionAssignments: { className, section } } }
    );

    if (updateResult.modifiedCount === 0) {
      return res.status(500).json({ 
        message: "Failed to remove section assignment"
      });
    }

    // Fetch the updated teacher for response
    const updatedTeacher = await Teacher.findById(teacherId);
    
    if (!updatedTeacher) {
      return res.status(500).json({ 
        message: "Failed to fetch updated teacher"
      });
    }

    console.log("Section removed successfully:", updatedTeacher.sectionAssignments);

    // ✅ Invalidate teacher caches
    await invalidateCache.teachers();

    res.status(200).json({
      message: "Section removed successfully",
      teacher: {
        _id: updatedTeacher._id,
        teacherId: updatedTeacher.teacherId,
        name: updatedTeacher.name,
        sectionAssignments: updatedTeacher.sectionAssignments
      }
    });
  } catch (error) {
    console.error("Remove section error:", error);
    res.status(500).json({ 
      message: "Server error", 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};


// ✅ Get students and their attendance assigned to logged-in teacher
export const getAssignedStudentsWithAttendance = async (req, res) => {
  try {
    const user = req.user;
    if (user.role !== "teacher") return res.status(403).json({ message: "Access denied" });

    const teacher = await Teacher.findById(user.teacherId);
    if (!teacher) return res.status(404).json({ message: "Teacher not found" });

    const sectionQueries = teacher.sectionAssignments.map(({ className, section }) => ({
      class: className,
      section,
    }));

    // Get assigned classes list for frontend dropdown (ensures all assigned classes appear)
    const assignedClasses = teacher.sectionAssignments.map(sa => `${sa.className}-${sa.section}`);

    // Get current academic year to check promotion history
    const currentAcademicYear = getCurrentAcademicYear();

    // Build query to find students:
    // 1. Students whose current database class matches assigned classes
    // 2. Students who were in assigned classes during current academic year (based on promotion history)
    const promotionQueries = teacher.sectionAssignments.map(({ className, section }) => ({
      promotionHistory: {
        $elemMatch: {
          academicYear: currentAcademicYear,
          promotionType: 'promoted',
          fromClass: className,
          fromSection: section,
          reverted: { $ne: true }
        }
      }
    }));

    // Combine both queries: current class OR was in this class during current academic year
    const combinedQueries = [
      ...sectionQueries, // Students currently in assigned classes
      ...promotionQueries // Students who were in assigned classes this year (before promotion)
    ];

    // Fetch students with promotion history included
    // Use lean() for better performance, but ensure promotionHistory is included
    const students = await Student.find({ $or: combinedQueries })
      .select('name studentId class section parent promotionHistory')
      .lean();
    
    // Debug: Log assigned classes to ensure all are included
    console.log(`Teacher ${teacher.name} assigned to ${assignedClasses.length} class-sections:`, 
      assignedClasses.join(', '));
    console.log(`Found ${students.length} students across all assigned classes`);
    const studentIds = students.map((s) => s._id);

    const { date } = req.query;
    let attendanceQuery = { student: { $in: studentIds } };
    let targetDate = null;

    if (date) {
      targetDate = new Date(date);
      attendanceQuery.date = {
        $gte: new Date(targetDate.setHours(0, 0, 0, 0)),
        $lte: new Date(targetDate.setHours(23, 59, 59, 999)),
      };
    }

    const attendanceRecords = await Attendance.find(attendanceQuery)
      .populate("student", "name class section");

    // ✅ Tag students with attendance status
    const submittedMap = new Map();
    attendanceRecords.forEach((record) => {
      submittedMap.set(record.student._id.toString(), true);
    });

    // Since we used .lean(), students are already plain objects, no need for .toObject()
    const enrichedStudents = students.map((student) => ({
      ...student,
      isSubmitted: submittedMap.has(student._id.toString()),
    }));

    res.status(200).json({
      students: enrichedStudents,
      attendance: attendanceRecords,
      assignedClasses: assignedClasses, // Include assigned classes for frontend dropdown
    });
  } catch (error) {
    console.error("Assigned student error:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ✅ Get all teachers for attendance management (simple list)
export const getTeachers = async (req, res) => {
  try {
    const teachers = await Teacher.find({})
      .select("teacherId name phone qualification subject image userId")
      .populate({
        path: "userId",
        select: "name email role",
      })
      .sort({ name: 1 });

console.log("teachers", teachers);
    res.status(200).json({
      message: "Teachers fetched successfully",
      teachers
    });
  } catch (error) {
    console.error("Get teachers error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ✅ Get all teachers[admin] with caching
export const getAllTeachers = async (req, res) => {
  try {
    const { search, subject, qualification, page = 1, limit = 10 } = req.query;
    
    const filter = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { teacherId: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }
    if (subject) filter.subject = subject;
    if (qualification) filter.qualification = qualification;

    // Convert page and limit to numbers
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Create cache key based on filters
    const cacheKey = cacheKeys.teachers.list({ search, subject, qualification, page: pageNum, limit: limitNum });

    // Try to get from cache first
    const cachedData = await cache.get(cacheKey);
    if (cachedData) {
      return res.status(200).json(cachedData);
    }

    // Get total count for pagination
    const totalTeachers = await Teacher.countDocuments(filter);
    const totalPages = Math.ceil(totalTeachers / limitNum);

    // Get teachers with pagination
    const teachers = await Teacher.find(filter)
      .select("teacherId name phone qualification subject image sectionAssignments generatedCredentials userId")
      .populate({
        path: "userId",
        select: "name email role",
      })
      .sort({ name: 1 })
      .skip(skip)
      .limit(limitNum);

      console.log("total teachers",teachers)
    const responseData = {
      message: "Teachers fetched successfully",
      teachers,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalTeachers,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
        limit: limitNum
      }
    };

    // Cache the response for 5 minutes
    await cache.set(cacheKey, responseData, 300);

    res.status(200).json(responseData);
  } catch (error) {
    console.error("Get all teachers error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Helper function to get previous class teachers based on promotion history
const getPreviousClassTeachers = async (student) => {
  const promotionHistory = student.promotionHistory || [];
  const currentAcademicYear = getCurrentAcademicYear();
  
  // Collect unique previous class-section combinations from promotion history
  const previousClasses = new Map(); // key: "class-section", value: { class, section, academicYear }
  
  promotionHistory.forEach((promotion) => {
    // Only consider non-reverted promotions
    if (promotion.promotionType === 'promoted' && !promotion.reverted) {
      // Store the "fromClass" as a previous class
      const key = `${promotion.fromClass}-${promotion.fromSection}`;
      if (!previousClasses.has(key)) {
        previousClasses.set(key, {
          class: promotion.fromClass,
          section: promotion.fromSection,
          academicYear: promotion.academicYear,
        });
      }
    }
  });
  
  // Fetch teachers for all previous classes
  const previousTeachersData = [];
  
  for (const [key, classInfo] of previousClasses) {
    const teachers = await Teacher.find({
      sectionAssignments: {
        $elemMatch: {
          className: classInfo.class,
          section: classInfo.section,
        },
      },
    }).select("name phone email subject qualification image");
    
    if (teachers.length > 0) {
      const teacherDetails = teachers.map((t) => ({
        name: t.name,
        phone: t.phone,
        email: t.email,
        subject: t.subject,
        qualification: t.qualification,
        image: t.image,
        whatsappLink: t.phone ? `https://wa.me/${t.phone}` : null,
      }));
      
      previousTeachersData.push({
        class: classInfo.class,
        section: classInfo.section,
        academicYear: classInfo.academicYear,
        teachers: teacherDetails,
      });
    }
  }
  
  return previousTeachersData;
};

// ✅ Get class teacher(s) for logged-in student or parent
export const getClassTeachersForStudent = async (req, res) => {
  try {
    const user = req.user;

    // Allow only students and parents
    if (user.role !== "student" && user.role !== "parent") {
      return res.status(403).json({ message: "Access denied" });
    }

    // For students: return teachers for that student only
    if (user.role === "student") {
      const student = await Student.findOne({ userId: user._id });
      
      if (!student) {
        return res.status(404).json({ message: "Student record not found" });
      }

      // Find class teachers for the student's current class and section
      const currentTeachers = await Teacher.find({
        sectionAssignments: {
          $elemMatch: {
            className: student.class,
            section: student.section,
          },
        },
      }).select("name phone email subject qualification image");

      // Add WhatsApp links for current teachers
      const currentTeacherDetails = currentTeachers.map((t) => ({
        name: t.name,
        phone: t.phone,
        email: t.email,
        subject: t.subject,
        qualification: t.qualification,
        image: t.image,
        whatsappLink: t.phone ? `https://wa.me/${t.phone}` : null,
      }));

      // Get previous class teachers
      const previousTeachersData = await getPreviousClassTeachers(student);

      return res.status(200).json({
        message: "Class teachers fetched",
        student: {
          name: student.name,
          class: student.class,
          section: student.section,
        },
        teachers: currentTeacherDetails,
        previousClassTeachers: previousTeachersData,
      });
    }

    // For parents: return teachers for all children
    if (user.role === "parent") {
      if (!user.parentId) {
        return res.status(400).json({ message: "Parent ID missing from user profile" });
      }

      // Get all children for the parent
      const children = await Student.find({ parent: user.parentId });

      if (!children || children.length === 0) {
        return res.status(404).json({ message: "No children found for this parent" });
      }

      // Get teachers for each child (including previous class teachers)
      const childrenWithTeachers = await Promise.all(
        children.map(async (child) => {
          // Get current class teachers
          const currentTeachers = await Teacher.find({
            sectionAssignments: {
              $elemMatch: {
                className: child.class,
                section: child.section,
              },
            },
          }).select("name phone email subject qualification image");

          // Add WhatsApp links for current teachers
          const currentTeacherDetails = currentTeachers.map((t) => ({
            name: t.name,
            phone: t.phone,
            email: t.email,
            subject: t.subject,
            qualification: t.qualification,
            image: t.image,
            whatsappLink: t.phone ? `https://wa.me/${t.phone}` : null,
          }));

          // Get previous class teachers
          const previousTeachersData = await getPreviousClassTeachers(child);

          return {
            student: {
              _id: child._id,
              name: child.name,
              class: child.class,
              section: child.section,
              promotionHistory: child.promotionHistory || [], // Include promotion history
            },
            teachers: currentTeacherDetails,
            previousClassTeachers: previousTeachersData,
          };
        })
      );
console.log("childrenWithTeachers", childrenWithTeachers);
      // If only one child, return in the old format for backward compatibility
      if (childrenWithTeachers.length === 1) {
        return res.status(200).json({
          message: "Class teachers fetched",
          student: childrenWithTeachers[0].student,
          teachers: childrenWithTeachers[0].teachers,
        });
      }

      // Multiple children: return array format
      return res.status(200).json({
        message: "Class teachers fetched for all children",
        children: childrenWithTeachers,
      });
    }
  } catch (error) {
    console.error("Get class teachers error:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ✅ Get student info by parent (for LMS, attendance, etc.)
export const getStudentByParent = async (req, res) => {
  try {
    const parentId = req.user.parentId; // stored in the User model

    if (!parentId) {
      return res.status(400).json({ message: "Parent ID missing in user profile" });
    }

    const student = await Student.findById(parentId).select("name class section _id");

    if (!student) {
      return res.status(404).json({ message: "Student not found for this parent" });
    }

    res.status(200).json(student);
  } catch (error) {
    console.error("Error fetching student for parent:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};


// ✅ Update teacher images from ZIP file
export const updateTeacherImages = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "ZIP file is required" });
    }

    const imagesZipPath = req.file.path;
    let tempDir = null;

    try {
      // Extract ZIP images
      tempDir = path.join(__dirname, "../tmp", `images_${Date.now()}`);
      fs.mkdirSync(tempDir, { recursive: true });
      await fs
        .createReadStream(imagesZipPath)
        .pipe(unzipper.Extract({ path: tempDir }))
        .promise();

      // Get all image files from the extracted directory
      const imageFiles = fs.readdirSync(tempDir).filter(file => 
        /\.(jpg|jpeg|png)$/i.test(file)
      );

      if (imageFiles.length === 0) {
        return res.status(400).json({ message: "No valid image files found in ZIP" });
      }

      const updatedTeachers = [];
      const notFoundTeachers = [];
      const errors = [];

      // Process each image file
      for (const imageFile of imageFiles) {
        try {
          // Extract teacher ID from filename (remove extension)
          const teacherId = path.parse(imageFile).name;
          const imagePath = path.join(tempDir, imageFile);

          // Find teacher by ID
          const teacher = await Teacher.findOne({ teacherId });
          if (!teacher) {
            notFoundTeachers.push(teacherId);
            continue;
          }

          // Delete old image from Cloudinary if exists
          if (teacher.image?.public_id) {
            try {
              await cloudinary.uploader.destroy(teacher.image.public_id);
            } catch (cloudinaryError) {
              console.warn(`Failed to delete old image for ${teacherId}:`, cloudinaryError.message);
            }
          }

          // Upload new image to Cloudinary
          const imageData = await uploadImageToCloudinary(imagePath, teacherId);
          if (!imageData) {
            errors.push(`Failed to upload image for ${teacherId}`);
            continue;
          }

          // Update teacher with new image
          teacher.image = imageData;
          await teacher.save();

          updatedTeachers.push({
            teacherId: teacher.teacherId,
            name: teacher.name,
            imageUrl: imageData.url
          });

        } catch (error) {
          console.error(`Error processing image ${imageFile}:`, error);
          errors.push(`Error processing ${imageFile}: ${error.message}`);
        }
      }

      // Cleanup
      fs.unlinkSync(imagesZipPath);
      if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });

      // Invalidate teacher caches
      await invalidateCache.teachers();

      res.status(200).json({
        message: "Teacher images updated successfully",
        updated: updatedTeachers.length,
        notFound: notFoundTeachers.length,
        errors: errors.length,
        details: {
          updatedTeachers,
          notFoundTeachers,
          errors
        }
      });

    } catch (error) {
      // Cleanup on error
      if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
      if (imagesZipPath) fs.unlinkSync(imagesZipPath);
      
      console.error("Update teacher images error:", error);
      res.status(500).json({ message: "Failed to update images", error: error.message });
    }
  } catch (error) {
    console.error("Update teacher images error:", error);
    res.status(500).json({ message: "Update failed", error: error.message });
  }
};

// ✅ Delete teacher and linked user
export const deleteTeacher = async (req, res) => {
  try {
    const { teacherId } = req.params;

    // 1. Find the teacher
    const teacher = await Teacher.findById(teacherId);
    if (!teacher) {
      return res.status(404).json({ message: "Teacher not found" });
    }

    // 2. Delete linked user
    await User.findByIdAndDelete(teacher.userId);

    // 3. Delete the teacher
    await Teacher.findByIdAndDelete(teacherId);

    // 4. Invalidate teacher caches
    await invalidateCache.teachers();

    res.status(200).json({ message: "Teacher deleted successfully" });
  } catch (error) {
    console.error("Delete teacher error:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ✅ Get detailed teacher profile for admin (by teacher _id)
export const getTeacherProfileForAdmin = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const user = req.user;

    // Check if user is admin or teacher
    if (user.role !== "admin" && user.role !== "teacher") {
      return res.status(403).json({ message: "Access denied" });
    }

    // Find teacher by _id and populate all related data
    const teacher = await Teacher.findById(teacherId)
      .populate("userId", "email role")
      .select("-__v");

    if (!teacher) {
      return res.status(404).json({ message: "Teacher not found" });
    }

    // Calculate attendance statistics for this teacher (teacher's own attendance)
    const currentDate = new Date();
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59, 999);

    console.log("📊 Fetching teacher attendance for:", {
      teacherId,
      teacherName: teacher.name,
      startOfMonth: startOfMonth.toISOString(),
      endOfMonth: endOfMonth.toISOString()
    });

    // Get teacher's own attendance records for the current month
    // Try multiple query strategies to find records
    let attendanceRecords = [];
    
    // Strategy 1: Query with ObjectId and isActive filter
    attendanceRecords = await TeacherAttendance.find({
      teacher: teacherId,
      date: { $gte: startOfMonth, $lte: endOfMonth },
      isActive: { $ne: false }
    }).lean();

    // Strategy 2: If no records, try without isActive filter
    if (attendanceRecords.length === 0) {
      console.log("📊 No records with isActive filter, trying without filter...");
      attendanceRecords = await TeacherAttendance.find({
        teacher: teacherId,
        date: { $gte: startOfMonth, $lte: endOfMonth }
      }).lean();
    }

    // Strategy 3: If still no records, try with teacherId string field
    if (attendanceRecords.length === 0 && teacher.teacherId) {
      console.log("📊 No records with teacher ObjectId, trying with teacherId string:", teacher.teacherId);
      attendanceRecords = await TeacherAttendance.find({
        teacherId: teacher.teacherId,
        date: { $gte: startOfMonth, $lte: endOfMonth }
      }).lean();
    }

    // Strategy 4: Check if there are ANY records for this teacher (for debugging)
    const allTeacherRecords = await TeacherAttendance.find({
      $or: [
        { teacher: teacherId },
        { teacherId: teacher.teacherId }
      ]
    }).limit(1).lean();
    
    console.log("📊 Found attendance records for current month:", attendanceRecords.length);
    console.log("📊 Total records for this teacher (any date):", allTeacherRecords.length);
    if (attendanceRecords.length > 0) {
      console.log("📊 Sample record:", JSON.stringify(attendanceRecords[0], null, 2));
    }

    const attendanceStats = {
      present: attendanceRecords.filter(record => record.status === 'present').length,
      absent: attendanceRecords.filter(record => record.status === 'absent').length,
      total: attendanceRecords.length
    };

    // Calculate attendance percentage
    const attendancePercentage = attendanceStats.total > 0 
      ? Math.round((attendanceStats.present / attendanceStats.total) * 100)
      : 0;

    // Get recent teacher attendance records (last 10)
    // Try multiple query strategies
    let recentAttendance = [];
    
    // Strategy 1: Query with ObjectId and isActive filter
    recentAttendance = await TeacherAttendance.find({
      teacher: teacherId,
      isActive: { $ne: false }
    })
    .sort({ date: -1 })
    .limit(10)
    .select('date status reason teacherName teacherId subject')
    .lean();

    // Strategy 2: If no records, try without isActive filter
    if (recentAttendance.length === 0) {
      console.log("📊 No recent records with isActive filter, trying without filter...");
      recentAttendance = await TeacherAttendance.find({
        teacher: teacherId
      })
      .sort({ date: -1 })
      .limit(10)
      .select('date status reason teacherName teacherId subject')
      .lean();
    }

    // Strategy 3: If still no records, try with teacherId string field
    if (recentAttendance.length === 0 && teacher.teacherId) {
      console.log("📊 No recent records with teacher ObjectId, trying with teacherId string:", teacher.teacherId);
      recentAttendance = await TeacherAttendance.find({
        teacherId: teacher.teacherId
      })
      .sort({ date: -1 })
      .limit(10)
      .select('date status reason teacherName teacherId subject')
      .lean();
    }

    console.log("📊 Recent attendance records:", recentAttendance.length);
    if (recentAttendance.length > 0) {
      console.log("📊 Sample recent record:", JSON.stringify(recentAttendance[0], null, 2));
    }

    // Get students count for this teacher (for display purposes)
    const students = await Student.find({
      $or: teacher.sectionAssignments.map(assignment => ({
        class: assignment.className,
        section: assignment.section
      }))
    }).select('_id');
    
    const studentsCount = students.length;

    // Prepare comprehensive teacher data with teacher attendance
    const teacherData = {
      ...teacher.toObject(),
      attendanceStats: attendanceStats || { present: 0, absent: 0, total: 0 },
      attendancePercentage: attendancePercentage || 0,
      recentAttendance: recentAttendance.map(record => ({
        date: record.date,
        status: record.status,
        reason: record.reason || "",
        teacherName: record.teacherName || teacher.name,
        teacherId: record.teacherId || teacher.teacherId,
        subject: record.subject || teacher.subject || "N/A"
      })) || [],
      studentsCount: studentsCount || 0
    };

    console.log("📊 Returning teacher data with attendance:", {
      attendanceStats: teacherData.attendanceStats,
      attendancePercentage: teacherData.attendancePercentage,
      recentAttendanceCount: teacherData.recentAttendance.length,
      studentsCount: teacherData.studentsCount
    });

    res.status(200).json(teacherData);
  } catch (error) {
    console.error("getTeacherProfileForAdmin error:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ✅ Update single teacher image
export const updateTeacherImage = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const user = req.user;

    // Check if user is admin or teacher
    if (user.role !== "admin" && user.role !== "teacher") {
      return res.status(403).json({ message: "Access denied" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "Image file is required" });
    }

    // Find teacher
    const teacher = await Teacher.findById(teacherId);
    if (!teacher) {
      return res.status(404).json({ message: "Teacher not found" });
    }

    // Delete old image from Cloudinary if exists
    if (teacher.image?.public_id) {
      try {
        await cloudinary.uploader.destroy(teacher.image.public_id);
      } catch (cloudinaryError) {
        console.warn(`Failed to delete old image for ${teacher.teacherId}:`, cloudinaryError.message);
      }
    }

    // Upload new image to Cloudinary
    const imageData = await uploadImageToCloudinary(req.file.path, teacher.teacherId);
    if (!imageData) {
      return res.status(500).json({ message: "Failed to upload image" });
    }

    // Update teacher with new image
    teacher.image = imageData;
    await teacher.save();

    // Cleanup uploaded file
    fs.unlinkSync(req.file.path);

    // Invalidate teacher caches
    await invalidateCache.teachers();

    res.status(200).json({
      message: "Teacher image updated successfully",
      image: imageData
    });

  } catch (error) {
    console.error("Update teacher image error:", error);
    res.status(500).json({ message: "Update failed", error: error.message });
  }
};
