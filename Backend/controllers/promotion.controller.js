import Student from "../models/student.model.js";
import Attendance from "../models/attendance.model.js";
import User from "../models/user.model.js";
import {
  getCurrentAcademicYear,
  getAcademicYearDateRange,
  getNextAcademicYear,
  isValidAcademicYear
} from "../utils/academicYear.js";

/**
 * Get all students for promotion with attendance statistics
 */
export const getStudentsForPromotion = async (req, res) => {
  try {
    const { academicYear, className } = req.query;
    const user = req.user;

    if (user.role !== "admin") {
      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    // Build query - Get ALL students (no status/active filters)
    const query = {};
    if (className) {
      query.class = className;
    }

    // Get students - ALL students regardless of status
    const students = await Student.find(query)
      .populate("parent", "name phone email")
      .populate("userId", "email")
      .select("-__v")
      .sort({ class: 1, section: 1, name: 1 });

    console.log(`Found ${students.length} students for promotion`);

    // Calculate attendance for each student for the academic year
    // Use the provided academicYear or default to current academic year
    const academicYearStr = academicYear || getCurrentAcademicYear();
    
    // Validate and get date range for academic year
    const { startDate: startOfYear, endDate: endOfYear } = getAcademicYearDateRange(academicYearStr);
    
    console.log(`Calculating attendance for academic year ${academicYearStr} from ${startOfYear.toISOString()} to ${endOfYear.toISOString()}`);

    const studentsWithAttendance = await Promise.all(
      students.map(async (student) => {
        // Get attendance records for the academic year
        const attendanceRecords = await Attendance.find({
          student: student._id,
          date: { $gte: startOfYear, $lte: endOfYear }
        });

        const totalDays = attendanceRecords.length;
        const presentDays = attendanceRecords.filter(r => r.status === 'present').length;
        const attendancePercentage = totalDays > 0 
          ? Math.round((presentDays / totalDays) * 100) 
          : 0;

        // Determine promotion eligibility (default: 75% attendance required)
        const minAttendanceRequired = 75;
        const isEligibleForPromotion = attendancePercentage >= minAttendanceRequired;

        return {
          _id: student._id,
          studentId: student.studentId,
          name: student.name,
          class: student.class,
          section: student.section,
          birthDate: student.birthDate,
          image: student.image,
          parent: student.parent ? {
            _id: student.parent._id,
            name: student.parent.name,
            phone: student.parent.phone,
            email: student.parent.email
          } : null,
          userId: student.userId,
          attendancePercentage,
          presentDays,
          totalDays,
          absentDays: totalDays - presentDays,
          isEligibleForPromotion,
          currentStatus: student.status || 'active',
          currentAcademicYear: student.currentAcademicYear || academicYearStr || getCurrentAcademicYear(),
          previousClass: student.previousClass,
          previousSection: student.previousSection,
          promotionHistory: student.promotionHistory || [],
          transferCertificate: student.transferCertificate || null
        };
      })
    );

    res.status(200).json({
      success: true,
      students: studentsWithAttendance,
      academicYear: academicYearStr,
      minAttendanceRequired: 75
    });
  } catch (error) {
    console.error("Get students for promotion error:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};

/**
 * Promote students to next class
 */
export const promoteStudents = async (req, res) => {
  try {
    const { studentIds, academicYear, promotionType, reason } = req.body;
    const user = req.user;

    if (user.role !== "admin") {
      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ 
        success: false,
        message: "Student IDs are required" 
      });
    }

    const promotedStudents = [];
    const failedPromotions = [];

    // Helper function to get next class
    const getNextClass = (currentClass) => {
      const classMap = {
        '1': '2', '2': '3', '3': '4', '4': '5', '5': '6',
        '6': '7', '7': '8', '8': '9', '9': '10', '10': '11', '11': '12', '12': 'Graduated'
      };
      return classMap[currentClass] || currentClass;
    };

    for (const studentId of studentIds) {
      try {
        const student = await Student.findById(studentId);
        
        if (!student) {
          failedPromotions.push({ studentId, error: "Student not found" });
          continue;
        }

        if (student.status !== 'active' || !student.isActive) {
          failedPromotions.push({ 
            studentId, 
            name: student.name,
            error: "Student is not active" 
          });
          continue;
        }

        const previousClass = student.class;
        const previousSection = student.section;
        let newClass, newSection;

        if (promotionType === 'promoted') {
          // Promote to next class
          newClass = getNextClass(student.class);
          newSection = student.section; // Keep same section or can be changed
          
          // If graduated, mark as graduated
          if (newClass === 'Graduated') {
            student.status = 'graduated';
            student.isActive = false;
          }
        } else if (promotionType === 'hold-back') {
          // Hold back - stay in same class
          newClass = student.class;
          newSection = student.section;
        } else {
          failedPromotions.push({ 
            studentId, 
            name: student.name,
            error: "Invalid promotion type" 
          });
          continue;
        }

        // Update student
        student.previousClass = previousClass;
        student.previousSection = previousSection;
        student.class = newClass;
        student.section = newSection;

        // Update academic year when promoted
        const oldAcademicYear = academicYear || student.currentAcademicYear || getCurrentAcademicYear();
        
        // Validate academic year format
        const validOldAcademicYear = isValidAcademicYear(oldAcademicYear) 
          ? oldAcademicYear 
          : getCurrentAcademicYear();
        
        // If promoting, move to next academic year (e.g., 2025-2026 -> 2026-2027)
        if (promotionType === 'promoted') {
          const nextAcademicYear = getNextAcademicYear(validOldAcademicYear);
          student.currentAcademicYear = nextAcademicYear;
          console.log(`Promoting student ${student.name}: ${validOldAcademicYear} -> ${nextAcademicYear}`);
        } else {
          // For hold-back, keep same academic year
          student.currentAcademicYear = validOldAcademicYear;
        }
        
        // Get attendance percentage for the OLD academic year (before promotion)
        const { startDate: startOfYear, endDate: endOfYear } = getAcademicYearDateRange(validOldAcademicYear);
        const attendanceRecords = await Attendance.find({
          student: student._id,
          date: { $gte: startOfYear, $lte: endOfYear }
        });
        const totalDays = attendanceRecords.length;
        const presentDays = attendanceRecords.filter(r => r.status === 'present').length;
        const attendancePercentage = totalDays > 0 
          ? Math.round((presentDays / totalDays) * 100) 
          : 0;

        // Record promotion in history with the OLD academic year (the year they completed)
        student.promotionHistory.push({
          academicYear: validOldAcademicYear, // The year they completed (e.g., "2025-2026")
          fromClass: previousClass,
          fromSection: previousSection,
          toClass: newClass,
          toSection: newSection,
          promotionType: promotionType,
          reason: reason || (promotionType === 'hold-back' ? 'Low attendance' : 'Promoted to next class'),
          attendancePercentage,
          promotedBy: user._id
        });

        await student.save();

        promotedStudents.push({
          studentId: student.studentId,
          name: student.name,
          previousClass,
          newClass,
          promotionType
        });
      } catch (error) {
        console.error(`Error promoting student ${studentId}:`, error);
        failedPromotions.push({ 
          studentId, 
          error: error.message 
        });
      }
    }

    res.status(200).json({
      success: true,
      message: `Promotion completed. ${promotedStudents.length} students processed.`,
      promoted: promotedStudents,
      failed: failedPromotions,
      academicYear: academicYear || getCurrentAcademicYear() // Format: "2025-2026"
    });
  } catch (error) {
    console.error("Promote students error:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};

/**
 * Issue Transfer Certificate (TC) to student
 */
export const issueTransferCertificate = async (req, res) => {
  try {
    const { studentId, reason } = req.body;
    const user = req.user;

    if (user.role !== "admin") {
      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    const student = await Student.findById(studentId);
    
    if (!student) {
      return res.status(404).json({ 
        success: false,
        message: "Student not found" 
      });
    }

    // Issue TC
    student.transferCertificate = {
      issued: true,
      issuedDate: new Date(),
      reason: reason || "Transfer Certificate requested",
      issuedBy: user._id
    };

    // Mark student as inactive and transferred
    student.isActive = false;
    student.status = 'transferred';

    // Add to promotion history
    const currentAcademicYear = getCurrentAcademicYear();
    student.promotionHistory.push({
      academicYear: currentAcademicYear,
      fromClass: student.class,
      fromSection: student.section,
      toClass: 'N/A',
      toSection: 'N/A',
      promotionType: 'transferred',
      reason: reason || "Transfer Certificate issued",
      attendancePercentage: 0,
      promotedBy: user._id
    });

    await student.save();

    res.status(200).json({
      success: true,
      message: "Transfer Certificate issued successfully",
      student: {
        studentId: student.studentId,
        name: student.name,
        class: student.class,
        section: student.section,
        tcIssued: true,
        tcIssuedDate: student.transferCertificate.issuedDate
      }
    });
  } catch (error) {
    console.error("Issue TC error:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};

/**
 * Get student attendance records for academic year
 */
export const getStudentAttendanceForYear = async (req, res) => {
  try {
    const { studentId, academicYear } = req.query;
    const user = req.user;

    if (user.role !== "admin") {
      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ 
        success: false,
        message: "Student not found" 
      });
    }

    // Calculate date range for academic year
    const academicYearStr = academicYear || getCurrentAcademicYear();
    const { startDate: startOfYear, endDate: endOfYear } = getAcademicYearDateRange(academicYearStr);

    // Get all attendance records for the academic year
    const attendanceRecords = await Attendance.find({
      student: studentId,
      date: { $gte: startOfYear, $lte: endOfYear }
    })
    .sort({ date: 1 }) // Sort by date ascending
    .lean();

    // Format attendance records
    const formattedRecords = attendanceRecords.map(record => ({
      date: record.date,
      status: record.status,
      reason: record.reason || '',
      markedAt: record.createdAt
    }));

    // Calculate statistics
    const totalDays = formattedRecords.length;
    const presentDays = formattedRecords.filter(r => r.status === 'present').length;
    const absentDays = formattedRecords.filter(r => r.status === 'absent').length;
    const attendancePercentage = totalDays > 0 
      ? Math.round((presentDays / totalDays) * 100) 
      : 0;

    res.status(200).json({
      success: true,
      name: student.name,
      class: student.class,
      section: student.section,
      academicYear: academicYearStr,
      attendance: formattedRecords, // Frontend expects 'attendance' key
      attendanceRecords: formattedRecords, // Also include for compatibility
      statistics: { // Frontend expects 'statistics' key
        totalDays,
        presentDays,
        absentDays,
        attendancePercentage
      },
      attendanceStats: { // Also include for compatibility
        totalDays,
        presentDays,
        absentDays,
        attendancePercentage
      }
    });
  } catch (error) {
    console.error("Get student attendance error:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};

/**
 * Get promotion history for a student
 */
export const getPromotionHistory = async (req, res) => {
  try {
    const { studentId } = req.params;
    const user = req.user;

    if (user.role !== "admin" && user.role !== "parent" && user.role !== "student") {
      return res.status(403).json({ message: "Access denied" });
    }

    const student = await Student.findOne({ 
      $or: [
        { _id: studentId },
        { studentId: studentId }
      ]
    }).populate('promotionHistory.promotedBy', 'name email');

    if (!student) {
      return res.status(404).json({ 
        success: false,
        message: "Student not found" 
      });
    }

    res.status(200).json({
      success: true,
      student: {
        studentId: student.studentId,
        name: student.name,
        currentClass: student.class,
        currentSection: student.section,
        status: student.status,
        isActive: student.isActive
      },
      promotionHistory: student.promotionHistory || [],
      transferCertificate: student.transferCertificate
    });
  } catch (error) {
    console.error("Get promotion history error:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};

/**
 * Update all students with current academic year
 */
export const updateAllStudentsAcademicYear = async (req, res) => {
  try {
    const user = req.user;

    if (user.role !== "admin") {
      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    const currentAcademicYear = getCurrentAcademicYear();
    console.log(`📅 Updating all students with academic year: ${currentAcademicYear}`);

    // Find all students
    const students = await Student.find({});
    console.log(`📊 Total students found: ${students.length}`);

    let updated = 0;
    let skipped = 0;

    for (const student of students) {
      // Check if student has currentAcademicYear and if it's in correct format
      const hasValidAcademicYear = student.currentAcademicYear && 
        student.currentAcademicYear.includes('-') &&
        student.currentAcademicYear.split('-').length === 2;

      if (!hasValidAcademicYear || !student.currentAcademicYear) {
        // Update student with current academic year
        student.currentAcademicYear = currentAcademicYear;
        await student.save();
        updated++;
      } else {
        skipped++;
      }
    }

    res.status(200).json({
      success: true,
      message: `Academic year update completed`,
      academicYear: currentAcademicYear,
      summary: {
        total: students.length,
        updated,
        skipped
      }
    });
  } catch (error) {
    console.error("Update academic year error:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};

/**
 * Bulk promote students by class
 */
export const bulkPromoteByClass = async (req, res) => {
  try {
    const { className, academicYear, minAttendancePercentage = 75 } = req.body;
    const user = req.user;

    if (user.role !== "admin") {
      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    if (!className) {
      return res.status(400).json({ 
        success: false,
        message: "Class name is required" 
      });
    }

    // Get all active students in the class
    const students = await Student.find({ 
      class: className,
      isActive: true,
      status: 'active'
    });

    // Get academic year date range
    const academicYearStr = academicYear || getCurrentAcademicYear();
    const { startDate: startOfYear, endDate: endOfYear } = getAcademicYearDateRange(academicYearStr);

    const promotionResults = {
      promoted: [],
      holdBack: [],
      errors: []
    };

    const getNextClass = (currentClass) => {
      const classMap = {
        '1': '2', '2': '3', '3': '4', '4': '5', '5': '6',
        '6': '7', '7': '8', '8': '9', '9': '10', '10': '11', '11': '12', '12': 'Graduated'
      };
      return classMap[currentClass] || currentClass;
    };

    for (const student of students) {
      try {
        // Calculate attendance
        const attendanceRecords = await Attendance.find({
          student: student._id,
          date: { $gte: startOfYear, $lte: endOfYear }
        });
        const totalDays = attendanceRecords.length;
        const presentDays = attendanceRecords.filter(r => r.status === 'present').length;
        const attendancePercentage = totalDays > 0 
          ? Math.round((presentDays / totalDays) * 100) 
          : 0;

        const previousClass = student.class;
        const previousSection = student.section;
        let newClass, newSection, promotionType;

        if (attendancePercentage >= minAttendancePercentage) {
          // Promote
          newClass = getNextClass(student.class);
          newSection = student.section;
          promotionType = 'promoted';
          
          if (newClass === 'Graduated') {
            student.status = 'graduated';
            student.isActive = false;
          }
        } else {
          // Hold back
          newClass = student.class;
          newSection = student.section;
          promotionType = 'hold-back';
        }

        student.previousClass = previousClass;
        student.previousSection = previousSection;
        student.class = newClass;
        student.section = newSection;

        // Update academic year when promoted
        const oldAcademicYear = academicYearStr || student.currentAcademicYear || getCurrentAcademicYear();
        const validOldAcademicYear = isValidAcademicYear(oldAcademicYear) 
          ? oldAcademicYear 
          : getCurrentAcademicYear();
        
        if (promotionType === 'promoted') {
          student.currentAcademicYear = getNextAcademicYear(validOldAcademicYear);
        } else {
          student.currentAcademicYear = validOldAcademicYear;
        }

        student.promotionHistory.push({
          academicYear: validOldAcademicYear,
          fromClass: previousClass,
          fromSection: previousSection,
          toClass: newClass,
          toSection: newSection,
          promotionType: promotionType,
          reason: promotionType === 'hold-back' 
            ? `Low attendance (${attendancePercentage}% < ${minAttendancePercentage}%)`
            : `Promoted based on attendance (${attendancePercentage}%)`,
          attendancePercentage,
          promotedBy: user._id
        });

        await student.save();

        if (promotionType === 'promoted') {
          promotionResults.promoted.push({
            studentId: student.studentId,
            name: student.name,
            attendancePercentage,
            fromClass: previousClass,
            toClass: newClass
          });
        } else {
          promotionResults.holdBack.push({
            studentId: student.studentId,
            name: student.name,
            attendancePercentage,
            class: newClass
          });
        }
      } catch (error) {
        console.error(`Error processing student ${student.studentId}:`, error);
        promotionResults.errors.push({
          studentId: student.studentId,
          name: student.name,
          error: error.message
        });
      }
    }

    res.status(200).json({
      success: true,
      message: `Bulk promotion completed for class ${className}`,
      results: promotionResults,
      academicYear: academicYearStr,
      summary: {
        total: students.length,
        promoted: promotionResults.promoted.length,
        holdBack: promotionResults.holdBack.length,
        errors: promotionResults.errors.length
      }
    });
  } catch (error) {
    console.error("Bulk promote by class error:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};

