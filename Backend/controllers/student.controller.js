import xlsx from "xlsx";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import unzipper from "unzipper";
import cloudinary from "../lib/cloudinary.js";
import Student from "../models/student.model.js";
import Parent from "../models/parent.model.js";
import Teacher from "../models/teacher.model.js"
import User from "../models/user.model.js";
import Attendance from "../models/attendance.model.js";
import FeePayment from "../models/feePayment.model.js";
import { cache, cacheKeys, invalidateCache } from "../lib/redis.js";
import {
  getCurrentAcademicYear,
  getAcademicYearDateRange,
  getPreviousAcademicYear
} from "../utils/academicYear.js";

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper: Upload local image to Cloudinary
const uploadImageToCloudinary = async (filePath, studentId) => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: "students",
      public_id: studentId,
    });
    return { public_id: result.public_id, url: result.secure_url };
  } catch (err) {
    console.error(`Cloudinary upload failed for ${filePath}`, err.message);
    return null;
  }
};



// GET STUDENTS ASSIGNED TO LOGGED-IN TEACHER
export const getMyStudents = async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.user.teacherId); // 🔑 from auth
    if (!teacher) return res.status(404).json({ message: "Teacher not found" });

    const students = await Student.find({
      $or: teacher.sectionAssignments.map(({ className, section }) => ({
        class: className,
        section,
      })),
    }).populate("parent", "name phone");

    res.json(students);
  } catch (error) {
    console.error("Fetch teacher's students error:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get all students for credentials management (no pagination)
export const getAllStudentsForCredentials = async (req, res) => {
  try {
    const { class: classQuery, section } = req.query;

    const filter = {};
    if (classQuery) filter.class = classQuery;
    if (section) filter.section = section;

    // Get all students without pagination
    const students = await Student.find(filter)
      .populate("parent", "name phone")
      .sort({ studentId: 1 });

    res.json({
      success: true,
      students,
      total: students.length
    });
  } catch (error) {
    console.error("Fetch all students for credentials error:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get unique classes, sections and academic years for filter dropdowns
export const getUniqueValues = async (req, res) => {
  try {
    // Get unique classes
    const uniqueClasses = await Student.distinct("class");
    
    // Get unique sections
    const uniqueSections = await Student.distinct("section");

    // Get unique academic years from students (currentAcademicYear)
    const rawAcademicYears = await Student.distinct("currentAcademicYear");

    // Filter out empty / invalid entries and sort by start year (descending)
    const academicYears = (rawAcademicYears || [])
      .filter((year) => typeof year === "string" && year.includes("-"))
      .sort((a, b) => {
        const [aStart] = a.split("-").map((y) => parseInt(y, 10));
        const [bStart] = b.split("-").map((y) => parseInt(y, 10));
        if (isNaN(aStart) || isNaN(bStart)) {
          return b.localeCompare(a);
        }
        return bStart - aStart; // Newest first
      });
    
    // Sort classes numerically (I, II, III, etc.)
    const sortedClasses = uniqueClasses.sort((a, b) => {
      const classOrder = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
      return classOrder.indexOf(a) - classOrder.indexOf(b);
    });
    
    // Sort sections alphabetically
    const sortedSections = uniqueSections.sort();
    
    res.status(200).json({
      message: "Unique values fetched successfully",
      classes: sortedClasses,
      sections: sortedSections,
      academicYears
    });
  } catch (error) {
    console.error("Get unique values error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const getAllStudents = async (req, res) => {
  try {
    const { class: classQuery, section, studentId, search, academicYear, page = 1, limit = 10 } = req.query;

    console.log("🔍 Backend received query params:", { classQuery, section, studentId, search, academicYear, page, limit });

    // Helper function to determine which class a student should appear in for the selected academic year
    const getStudentClassForAcademicYear = (student, targetAcademicYear) => {
      const promotionHistory = student.promotionHistory || [];
      
      // Check if there's a revert record for this academic year (takes precedence)
      const revertRecord = promotionHistory.find(
        p => p.academicYear === targetAcademicYear && p.promotionType === 'reverted'
      );
      
      // Check if student was promoted IN this academic year (and not reverted)
      const promotionInThisYear = promotionHistory.find(
        p => p.academicYear === targetAcademicYear && 
             p.promotionType === 'promoted' && 
             !p.reverted
      );
      
      if (revertRecord) {
        return {
          displayClass: revertRecord.toClass,
          displaySection: revertRecord.toSection
        };
      }
      
      if (promotionInThisYear) {
        // Student was promoted in this year - show them in their OLD class (fromClass)
        return {
          displayClass: promotionInThisYear.fromClass,
          displaySection: promotionInThisYear.fromSection
        };
      }
      
      // Check if student was promoted in the PREVIOUS academic year (affects this year)
      const previousAcademicYear = getPreviousAcademicYear(targetAcademicYear);
      const revertInPreviousYear = promotionHistory.find(
        p => p.academicYear === previousAcademicYear && p.promotionType === 'reverted'
      );
      
      if (revertInPreviousYear) {
        return {
          displayClass: revertInPreviousYear.toClass,
          displaySection: revertInPreviousYear.toSection
        };
      }
      
      const promotionInPreviousYear = promotionHistory.find(
        p => p.academicYear === previousAcademicYear && 
             p.promotionType === 'promoted' && 
             !p.reverted
      );
      
      if (promotionInPreviousYear) {
        // Student was promoted in previous year - show them in their NEW class (toClass) for this year
        return {
          displayClass: promotionInPreviousYear.toClass,
          displaySection: promotionInPreviousYear.toSection
        };
      }
      
      // No promotion affecting this year - use current class
      return {
        displayClass: student.class,
        displaySection: student.section
      };
    };

    // Base filter (without academic year consideration)
    const baseFilter = {};
    if (studentId) baseFilter.studentId = studentId;
    if (search) {
      baseFilter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { studentId: { $regex: search, $options: 'i' } },
        { 'parent.name': { $regex: search, $options: 'i' } }
      ];
    }

    console.log("🔍 Backend base filter object:", baseFilter);

    // Convert page and limit to numbers
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Create cache key based on filters (include academicYear)
    const cacheKey = cacheKeys.students.list({ class: classQuery, section, studentId, search, academicYear, page: pageNum, limit: limitNum });

    // Try to get from cache first
    const cachedData = await cache.get(cacheKey);
    if (cachedData) {
      console.log('📦 Serving students from cache');
      return res.status(200).json(cachedData);
    }

    // Get all students matching base filter (we'll filter by academic year after)
    let allStudents = await Student.find(baseFilter)
      .populate("parent", "name phone")
      .lean();

    // If academic year is provided, filter and transform students based on promotion history
    if (academicYear) {
      // Helper: check if student actually belongs to this academic year
      const studentHasAcademicYear = (student, targetYear) => {
        if (student.currentAcademicYear === targetYear) return true;
        const history = student.promotionHistory || [];
        return history.some(p => p.academicYear === targetYear);
      };

      const studentsWithDisplayClass = allStudents
        .filter(student => studentHasAcademicYear(student, academicYear))
        .map(student => {
          const classInfo = getStudentClassForAcademicYear(student, academicYear);
          return {
            ...student,
            displayClass: classInfo.displayClass,
            displaySection: classInfo.displaySection
          };
        });

      // Filter by class and section if provided (using displayClass/displaySection)
      let filteredStudents = studentsWithDisplayClass;
      if (classQuery) {
        filteredStudents = filteredStudents.filter(s => s.displayClass === classQuery);
      }
      if (section) {
        filteredStudents = filteredStudents.filter(s => s.displaySection === section);
      }

      // Get total count for pagination
      const totalStudents = filteredStudents.length;
      const totalPages = Math.ceil(totalStudents / limitNum);

      // Apply pagination
      const paginatedStudents = filteredStudents
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(skip, skip + limitNum)
        .map(student => ({
          ...student,
          class: student.displayClass, // Override class with displayClass
          section: student.displaySection, // Override section with displaySection
          originalClass: student.class, // Keep original for reference
          originalSection: student.section
        }));

      const responseData = {
        message: "Students fetched successfully",
        students: paginatedStudents,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalStudents,
          hasNextPage: pageNum < totalPages,
          hasPrevPage: pageNum > 1,
          limit: limitNum
        }
      };

      // Cache the response for 5 minutes
      await cache.set(cacheKey, responseData, 300);

      return res.status(200).json(responseData);
    }

    // No academic year filter - use original logic
    const filter = { ...baseFilter };
    if (classQuery) filter.class = classQuery;
    if (section) filter.section = section;

    // Get total count for pagination
    const totalStudents = await Student.countDocuments(filter);
    const totalPages = Math.ceil(totalStudents / limitNum);

    // Get students with pagination
    const students = await Student.find(filter)
      .populate("parent", "name phone")
      .sort({ name: 1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    console.log("🔍 Backend found students:", students.length);
    console.log("🔍 First student sample:", students[0]);

    const responseData = {
      message: "Students fetched successfully",
      students,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalStudents,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
        limit: limitNum
      }
    };

    // Cache the response for 5 minutes
    await cache.set(cacheKey, responseData, 300);

    res.status(200).json(responseData);
  } catch (error) {
    console.error("Get all students error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const deleteStudent = async (req, res) => {
  try {
    const { studentId } = req.params;

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    // 1. Remove student reference from parent
    if (student.parent) {
      await Parent.findByIdAndUpdate(student.parent, {
        $pull: { children: student._id },
      });

      // Optional: Delete parent if no more children
      const updatedParent = await Parent.findById(student.parent);
      if (updatedParent.children.length === 0) {
        await User.findByIdAndDelete(updatedParent.userId);
        await Parent.findByIdAndDelete(student.parent);
      }
    }

    // 2. Delete student's user login
    await User.findByIdAndDelete(student.userId);

    // 3. Delete student
    await Student.findByIdAndDelete(studentId);

    // 4. Invalidate related caches
    await invalidateCache.student(studentId);

    res.status(200).json({ message: "Student deleted successfully" });
  } catch (error) {
    console.error("Delete student error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const countStudents = async (req, res) => {
  try {
    const { class: classQuery, section } = req.query;

    const filter = {};
    if (classQuery) filter.class = classQuery;
    if (section) filter.section = section;

    const count = await Student.countDocuments(filter);

    res.status(200).json({
      message: "Student count fetched successfully",
      count,
    });
  } catch (error) {
    console.error("Count students error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ✅ Get student info by parent (used in leave application form)
export const fetchStudentInfo = async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== "parent") {
      return res.status(403).json({ message: "Only parents can access this" });
    }

    const parent = await Parent.findById(user.parentId);
    if (!parent) {
      return res.status(404).json({ message: "Parent not found" });
    }

    // For now, assume one child per parent
    const student = await Student.findOne({ parent: parent._id }).select("name class section _id");

    if (!student) {
      return res.status(404).json({ message: "Student not found for this parent" });
    }

    res.status(200).json(student);
  } catch (error) {
    console.error("fetchStudentInfo error:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ✅ Get student profile by student ID (for student dashboard)
export const getStudentProfile = async (req, res) => {
  try {
    const { studentId } = req.params;
    const user = req.user;

    // Check if user is the student themselves or has permission
    if (user.role === "student" && user.studentId?.toString() !== studentId) {
      return res.status(403).json({ message: "Access denied" });
    }

    const student = await Student.findById(studentId)
      .populate("parent", "name phone")
      .populate("assignedTeacher", "name");

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    res.status(200).json(student);
  } catch (error) {
    console.error("getStudentProfile error:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ✅ Get detailed student profile for admin (by student _id)
export const getStudentProfileForAdmin = async (req, res) => {
  try {
    const { studentId } = req.params;
    const user = req.user;

    // Check if user is admin or teacher
    if (user.role !== "admin" && user.role !== "teacher") {
      return res.status(403).json({ message: "Access denied" });
    }

    // Find student by _id and populate all related data
    const student = await Student.findById(studentId)
      .populate("parent", "name phone email address")
      .populate("assignedTeacher", "name subject phone")
      .select("-__v");

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    // Calculate real attendance statistics for the entire academic year
    const currentAcademicYear = getCurrentAcademicYear();
    const { startDate, endDate } = getAcademicYearDateRange(currentAcademicYear);

    // Get all attendance records for the current academic year
    const attendanceRecords = await Attendance.find({
      student: student._id,
      date: { $gte: startDate, $lte: endDate }
    }).sort({ date: -1 });

    const attendanceStats = {
      present: attendanceRecords.filter(record => record.status === 'present').length,
      absent: attendanceRecords.filter(record => record.status === 'absent').length,
      total: attendanceRecords.length
    };

    // Calculate attendance percentage
    const attendancePercentage = attendanceStats.total > 0 
      ? Math.round((attendanceStats.present / attendanceStats.total) * 100)
      : 0;

    // Calculate real payment statistics
    // Use the same currentAcademicYear from above
    const paymentRecords = await FeePayment.find({
      student: student._id,
      academicYear: currentAcademicYear
    });

    const paidAmount = paymentRecords
      .filter(payment => payment.status === 'paid')
      .reduce((sum, payment) => sum + (payment.amountPaid || 0) + (payment.lateFee || 0), 0);

    const pendingAmount = paymentRecords
      .filter(payment => payment.status === 'pending')
      .reduce((sum, payment) => sum + (payment.amountPaid || 0) + (payment.lateFee || 0), 0);

    const totalAmount = paymentRecords
      .reduce((sum, payment) => sum + (payment.amountPaid || 0) + (payment.lateFee || 0), 0);

    const paymentStats = {
      paid: paidAmount,
      pending: pendingAmount,
      total: totalAmount
    };

    // Get all attendance records for the academic year (sorted by date, newest first)
    const recentAttendance = attendanceRecords
      .map(record => ({
        date: record.date,
        status: record.status,
        reason: record.reason || null
      }))
      .slice(0, 50); // Show last 50 records instead of just 10

    // Get recent payment records (last 10)
    const recentPayments = await FeePayment.find({
      student: student._id,
      academicYear: currentAcademicYear
    })
    .sort({ createdAt: -1 })
    .limit(10)
    .select('amountPaid lateFee status paidAt paymentMethod receiptUrl');

    // Prepare comprehensive student data
    const studentData = {
      ...student.toObject(),
      attendanceStats,
      attendancePercentage,
      paymentStats,
      recentAttendance,
      recentPayments,
      // Add any additional computed fields here
    };

    res.status(200).json(studentData);
  } catch (error) {
    console.error("getStudentProfileForAdmin error:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Search student by studentId (string like "S25153") for validation
 */
export const searchStudentByStudentId = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { academicYear } = req.query;
    const user = req.user;

    if (user.role !== "admin") {
      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    if (!studentId) {
      return res.status(400).json({ 
        success: false,
        message: "Student ID is required" 
      });
    }

    // Find student by studentId field (e.g., "S25153") or MongoDB _id
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(studentId);
    const student = isObjectId 
      ? await Student.findById(studentId).select("studentId name class section status isActive promotionHistory currentAcademicYear")
      : await Student.findOne({ studentId: studentId }).select("studentId name class section status isActive promotionHistory currentAcademicYear");

    if (!student) {
      return res.status(404).json({ 
        success: false,
        message: `Student not found with ID: ${studentId}` 
      });
    }

    // Calculate promotion status
    let promotionStatus = 'eligible'; // Default
    const academicYearStr = academicYear || student.currentAcademicYear || getCurrentAcademicYear();
    
    // Check if student was promoted in this academic year
    const promotionHistory = student.promotionHistory || [];
    const promotionInThisYear = promotionHistory.find(
      p => p.academicYear === academicYearStr && p.promotionType === 'promoted'
    );

    if (promotionInThisYear) {
      promotionStatus = 'promoted';
    } else {
      // Calculate attendance to determine eligibility
      const { startDate: startOfYear, endDate: endOfYear } = getAcademicYearDateRange(academicYearStr);
      const attendanceRecords = await Attendance.find({
        student: student._id,
        date: { $gte: startOfYear, $lte: endOfYear }
      });

      const totalDays = attendanceRecords.length;
      const presentDays = attendanceRecords.filter(r => r.status === 'present').length;
      const attendancePercentage = totalDays > 0 
        ? Math.round((presentDays / totalDays) * 100) 
        : 0;

      const minAttendanceRequired = 75;
      if (totalDays === 0 || attendancePercentage < minAttendanceRequired) {
        promotionStatus = 'hold-back';
      } else {
        promotionStatus = 'eligible';
      }
    }

    res.status(200).json({
      success: true,
      student: {
        studentId: student.studentId,
        name: student.name,
        class: student.class,
        section: student.section,
        status: student.status || 'active',
        isActive: student.isActive,
        promotionStatus: promotionStatus // 'eligible', 'hold-back', or 'promoted'
      }
    });
  } catch (error) {
    console.error("Search student by studentId error:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};

// ✅ Update single student image
export const updateStudentImage = async (req, res) => {
  try {
    const { studentId } = req.params;
    const user = req.user;

    // Check if user is admin or teacher
    if (user.role !== "admin" && user.role !== "teacher") {
      return res.status(403).json({ message: "Access denied" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "Image file is required" });
    }

    // Find student
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    // Delete old image from Cloudinary if exists
    if (student.image?.public_id) {
      try {
        await cloudinary.uploader.destroy(student.image.public_id);
      } catch (cloudinaryError) {
        console.warn(`Failed to delete old image for ${student.studentId}:`, cloudinaryError.message);
      }
    }

    // Upload new image to Cloudinary
    const imageData = await uploadImageToCloudinary(req.file.path, student.studentId);
    if (!imageData) {
      return res.status(500).json({ message: "Failed to upload image" });
    }

    // Update student with new image
    student.image = imageData;
    await student.save();

    // Cleanup uploaded file
    fs.unlinkSync(req.file.path);

    // Invalidate student caches
    await invalidateCache.students();

    res.status(200).json({
      message: "Student image updated successfully",
      image: imageData
    });

  } catch (error) {
    console.error("Update student image error:", error);
    res.status(500).json({ message: "Update failed", error: error.message });
  }
};

// ✅ Update student images from ZIP file
export const updateStudentImages = async (req, res) => {
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

      const updatedStudents = [];
      const notFoundStudents = [];
      const errors = [];

      // Process each image file
      for (const imageFile of imageFiles) {
        try {
          // Extract student ID from filename (remove extension)
          const studentId = path.parse(imageFile).name;
          const imagePath = path.join(tempDir, imageFile);

          // Find student by ID
          const student = await Student.findOne({ studentId });
          if (!student) {
            notFoundStudents.push(studentId);
            continue;
          }

          // Delete old image from Cloudinary if exists
          if (student.image?.public_id) {
            try {
              await cloudinary.uploader.destroy(student.image.public_id);
            } catch (cloudinaryError) {
              console.warn(`Failed to delete old image for ${studentId}:`, cloudinaryError.message);
            }
          }

          // Upload new image to Cloudinary
          const imageData = await uploadImageToCloudinary(imagePath, studentId);
          if (!imageData) {
            errors.push(`Failed to upload image for ${studentId}`);
            continue;
          }

          // Update student with new image
          student.image = imageData;
          await student.save();

          updatedStudents.push({
            studentId: student.studentId,
            name: student.name,
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

      // Invalidate student caches
      await invalidateCache.students();

      res.status(200).json({
        message: "Student images updated successfully",
        updated: updatedStudents.length,
        notFound: notFoundStudents.length,
        errors: errors.length,
        details: {
          updatedStudents,
          notFoundStudents,
          errors
        }
      });

    } catch (error) {
      // Cleanup on error
      if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
      if (imagesZipPath) fs.unlinkSync(imagesZipPath);
      
      console.error("Update student images error:", error);
      res.status(500).json({ message: "Failed to update images", error: error.message });
    }
  } catch (error) {
    console.error("Update student images error:", error);
    res.status(500).json({ message: "Update failed", error: error.message });
  }
};



