import Student from "../models/student.model.js";
import Attendance from "../models/attendance.model.js";
import User from "../models/user.model.js";
import FeeStructure from "../models/FeeStructure.model.js";
import CustomFee from "../models/customFee.model.js";
import FeePayment from "../models/feePayment.model.js";
import {
  getCurrentAcademicYear,
  getAcademicYearDateRange,
  getNextAcademicYear,
  getPreviousAcademicYear,
  isValidAcademicYear
} from "../utils/academicYear.js";

export const getStudentsForPromotion = async (req, res) => {
  try {
    const { academicYear, className } = req.query;
    const user = req.user;

    if (user.role !== "admin") {
      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    // Use the provided academicYear or default to current academic year
    const academicYearStr = academicYear || getCurrentAcademicYear();
    const currentAcademicYear = getCurrentAcademicYear();
    const isNextAcademicYear = academicYearStr !== currentAcademicYear;
    
    // Validate and get date range for academic year
    const { startDate: startOfYear, endDate: endOfYear } = getAcademicYearDateRange(academicYearStr);
    
    console.log(`Calculating attendance for academic year ${academicYearStr} from ${startOfYear.toISOString()} to ${endOfYear.toISOString()}`);
    console.log(`Is next academic year: ${isNextAcademicYear}`);

    // Get ALL students (no status/active filters) - we'll filter by class later based on promotion history
    const allStudents = await Student.find({})
      .populate("parent", "name phone email")
      .populate("userId", "email")
      .select("-__v")
      .sort({ class: 1, section: 1, name: 1 });

    console.log(`Found ${allStudents.length} total students`);

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
             !p.reverted // IMPORTANT: Don't count reverted promotions
      );
      
      if (revertRecord) {
        // Student's promotion was reverted - show them in the class they were reverted to
        return {
          displayClass: revertRecord.toClass,
          displaySection: revertRecord.toSection,
          promotedInThisYear: false, // Not promoted anymore
          promotionRecord: null,
          wasPromoted: false
        };
      }
      
      if (promotionInThisYear) {
        // Student was promoted in this year (and not reverted) - show them in their OLD class (fromClass)
        return {
          displayClass: promotionInThisYear.fromClass,
          displaySection: promotionInThisYear.fromSection,
          promotedInThisYear: true,
          promotionRecord: promotionInThisYear,
          wasPromoted: true
        };
      }
      
      // Check if student was promoted in the PREVIOUS academic year (affects this year)
      // But only if that promotion wasn't reverted
      const previousAcademicYear = getPreviousAcademicYear(targetAcademicYear);
      const promotionInPreviousYear = promotionHistory.find(
        p => p.academicYear === previousAcademicYear && 
             p.promotionType === 'promoted' && 
             !p.reverted // Don't count reverted promotions
      );
      
      // Also check if there's a revert record in the previous year
      const revertInPreviousYear = promotionHistory.find(
        p => p.academicYear === previousAcademicYear && p.promotionType === 'reverted'
      );
      
      if (revertInPreviousYear) {
        // Promotion was reverted in previous year - show them in the class they were reverted to
        return {
          displayClass: revertInPreviousYear.toClass,
          displaySection: revertInPreviousYear.toSection,
          promotedInThisYear: false,
          promotionRecord: null,
          wasPromoted: false
        };
      }
      
      if (promotionInPreviousYear) {
        // Student was promoted in previous year (and not reverted) - show them in their NEW class (toClass) for this year
        return {
          displayClass: promotionInPreviousYear.toClass,
          displaySection: promotionInPreviousYear.toSection,
          promotedInThisYear: false,
          promotionRecord: null,
          wasPromoted: true
        };
      }
      
      // No promotion affecting this year - use current class
      return {
        displayClass: student.class,
        displaySection: student.section,
        promotedInThisYear: false,
        promotionRecord: null,
        wasPromoted: false
      };
    };

    // Process students and determine their display class for the selected academic year
    const studentsWithClassInfo = allStudents.map(student => {
      const classInfo = getStudentClassForAcademicYear(student, academicYearStr);
      return {
        student,
        ...classInfo
      };
    });

    // If viewing next academic year, ONLY show students who were promoted in previous year
    let filteredStudents = studentsWithClassInfo;
    if (isNextAcademicYear) {
      filteredStudents = studentsWithClassInfo.filter(
        item => item.wasPromoted === true
      );
      console.log(`Filtered to ${filteredStudents.length} promoted students for next academic year ${academicYearStr}`);
    }

    // Filter by className if provided (filter by displayClass, not current class)
    if (className) {
      filteredStudents = filteredStudents.filter(
        item => item.displayClass === className
      );
      console.log(`Filtered to ${filteredStudents.length} students in class ${className} for academic year ${academicYearStr}`);
    }

    // Calculate attendance and build response
    const studentsWithAttendance = await Promise.all(
      filteredStudents.map(async ({ student, displayClass, displaySection, promotedInThisYear, promotionRecord }) => {
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

        // Get fee information for this academic year
        let feeInfo = {
          feeStructure: null,
          totalFee: 0,
          totalPaid: 0,
          remaining: 0,
          paymentStatus: 'No Fee Structure',
          paymentHistory: [],
          hasCustomFee: false
        };

        try {
          // Check for custom fee first
          const customFee = await CustomFee.findOne({
            student: student._id,
            academicYear: academicYearStr.trim()
          }).lean();

          let feeStructure = null;
          if (customFee) {
            feeStructure = customFee;
            feeInfo.hasCustomFee = true;
          } else {
            // Get standard fee structure for the display class
            feeStructure = await FeeStructure.findOne({
              class: displayClass,
              section: displaySection,
              academicYear: academicYearStr.trim()
            }).lean();
          }

          if (feeStructure) {
            feeInfo.feeStructure = {
              _id: feeStructure._id,
              totalFee: feeStructure.totalFee || 0,
              breakdown: feeStructure.breakdown || {},
              frequency: feeStructure.frequency || 'annually',
              dueDate: feeStructure.dueDate,
              discount: feeStructure.discount || 0,
              discountPercentage: feeStructure.discountPercentage || '0%'
            };
            feeInfo.totalFee = feeStructure.totalFee || 0;

            // Get all paid payments for this academic year
            const payments = await FeePayment.find({
              student: student._id,
              academicYear: academicYearStr.trim(),
              status: 'paid'
            })
              .sort({ paidAt: -1 })
              .lean();

            // Calculate total paid
            feeInfo.totalPaid = payments.reduce(
              (sum, p) => sum + (p.amountPaid || 0) + (p.lateFee || 0),
              0
            );

            feeInfo.remaining = Math.max(0, feeInfo.totalFee - feeInfo.totalPaid);

            // Determine payment status
            if (feeInfo.totalPaid >= feeInfo.totalFee) {
              feeInfo.paymentStatus = 'Paid';
            } else if (feeInfo.totalPaid > 0) {
              feeInfo.paymentStatus = 'Partially Paid';
            } else {
              feeInfo.paymentStatus = 'Unpaid';
            }

            // Get payment history
            feeInfo.paymentHistory = payments.map(p => ({
              _id: p._id,
              amountPaid: p.amountPaid || 0,
              lateFee: p.lateFee || 0,
              total: (p.amountPaid || 0) + (p.lateFee || 0),
              paidAt: p.paidAt,
              receiptUrl: p.receiptUrl,
              receiptNumber: p._id.toString().slice(-8).toUpperCase(),
              status: p.status,
              paymentMethod: p.paymentMethod || 'online',
              frequency: p.frequency || 'annually'
            }));
          }
        } catch (feeError) {
          console.error(`Error fetching fee info for student ${student.studentId}:`, feeError);
          // Continue without fee info if there's an error
        }

        // CRITICAL: Validate promotion - if student was promoted but doesn't meet attendance requirement,
        // don't show them as "Promoted" (treat as invalid promotion)
        // Also check if promotion was reverted
        let validPromotedInThisYear = promotedInThisYear;
        let validPromotionRecord = promotionRecord;
        
        // Check if promotion was reverted for this academic year
        const promotionHistory = student.promotionHistory || [];
        const revertRecord = promotionHistory.find(
          p => p.academicYear === academicYearStr && p.promotionType === 'reverted'
        );
        
        if (revertRecord) {
          // Promotion was reverted - don't show as promoted
          validPromotedInThisYear = false;
          validPromotionRecord = null;
          console.log(`Promotion reverted for student ${student.studentId} in academic year ${academicYearStr}`);
        } else if (promotedInThisYear) {
          // Check if the promotion is valid (student must have >= 75% attendance)
          if (totalDays === 0 || attendancePercentage < minAttendanceRequired) {
            // Invalid promotion - student was promoted but doesn't meet requirements
            validPromotedInThisYear = false;
            validPromotionRecord = null;
            console.log(`Invalid promotion detected for student ${student.studentId}: Promoted but attendance is ${attendancePercentage}% (${totalDays} total days)`);
          }
        }

        return {
          _id: student._id,
          studentId: student.studentId,
          name: student.name,
          class: displayClass, // Use displayClass (class they should appear in for this academic year)
          section: displaySection, // Use displaySection
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
          transferCertificate: student.transferCertificate || null,
          // New fields to indicate promotion status (only valid promotions)
          promotedInThisYear: validPromotedInThisYear, // true if validly promoted in the selected academic year
          actualCurrentClass: student.class, // The student's actual current class in database
          actualCurrentSection: student.section, // The student's actual current section in database
          promotionRecord: validPromotionRecord, // The promotion record if validly promoted in this year
          // Fee information
          feeInfo: feeInfo
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
      // Handle class names (case-insensitive)
      const normalizedClass = String(currentClass).trim();
      const classMap = {
        'Nursery': 'LKG',
        'nursery': 'LKG',
        'NURSERY': 'LKG',
        'LKG': '1',
        'lkg': '1',
        'Lkg': '1',
        '1': '2', '2': '3', '3': '4', '4': '5', '5': '6',
        '6': '7', '7': '8', '8': '9', '9': '10', '10': 'Graduated', '11': '12', '12': 'Graduated'
      };
      return classMap[normalizedClass] || currentClass;
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

        // Check if student was already promoted in this academic year (excluding reverted promotions)
        const promotionHistory = student.promotionHistory || [];
        const academicYearStr = academicYear || student.currentAcademicYear || getCurrentAcademicYear();
        
        // Find all non-reverted promotions for this academic year
        // Explicitly check: reverted must be false, undefined, or null (not explicitly true)
        const nonRevertedPromotions = promotionHistory.filter(
          p => p.academicYear === academicYearStr && 
               p.promotionType === 'promoted' && 
               p.reverted !== true // Only exclude if explicitly marked as reverted
        );
        
        // Debug: Log all promotions for this academic year
        const allPromotionsForYear = promotionHistory.filter(
          p => p.academicYear === academicYearStr && p.promotionType === 'promoted'
        );
        console.log(`Student ${student.studentId} (${student.name}) - All promotions for ${academicYearStr}:`, 
          allPromotionsForYear.map(p => ({
            id: p._id,
            reverted: p.reverted,
            promotedAt: p.promotedAt
          }))
        );
        
        if (nonRevertedPromotions.length > 0) {
          console.log(`Student ${student.studentId} (${student.name}) already has ${nonRevertedPromotions.length} non-reverted promotion(s) in academic year ${academicYearStr}`);
          console.log(`Non-reverted promotion details:`, nonRevertedPromotions.map(p => ({
            id: p._id,
            reverted: p.reverted,
            revertedAt: p.revertedAt,
            promotedAt: p.promotedAt
          })));
          failedPromotions.push({ 
            studentId, 
            name: student.name,
            error: `Already promoted in academic year ${academicYearStr}` 
          });
          continue;
        }
        
        // Log if there are reverted promotions (for debugging)
        const revertedPromotions = promotionHistory.filter(
          p => p.academicYear === academicYearStr && 
               p.promotionType === 'promoted' && 
               p.reverted === true
        );
        if (revertedPromotions.length > 0) {
          console.log(`Student ${student.studentId} (${student.name}) has ${revertedPromotions.length} reverted promotion(s) - allowing new promotion`);
        }

        // Calculate attendance for the academic year BEFORE making promotion decision
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

        // Minimum attendance required for promotion
        const minAttendanceRequired = 75;
        
        // Store attendance for promotion history
        const attendancePercentageForHistory = attendancePercentage;

        const previousClass = student.class;
        const previousSection = student.section;
        let newClass, newSection;

        if (promotionType === 'promoted') {
          // CRITICAL: Check attendance before promoting
          if (totalDays === 0) {
            failedPromotions.push({ 
              studentId, 
              name: student.name,
              error: "Cannot promote: No attendance records found" 
            });
            continue;
          }

          if (attendancePercentage < minAttendanceRequired) {
            failedPromotions.push({ 
              studentId, 
              name: student.name,
              error: `Cannot promote: Attendance ${attendancePercentage}% is below minimum required ${minAttendanceRequired}%` 
            });
            continue;
          }

          // Promote to next class - attendance requirement met
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
          console.log(`Promoting student ${student.name} (${attendancePercentageForHistory}% attendance): ${validOldAcademicYear} -> ${nextAcademicYear}`);
        } else {
          // For hold-back, keep same academic year
          student.currentAcademicYear = validOldAcademicYear;
        }

        // Record promotion in history with the OLD academic year (the year they completed)
        student.promotionHistory.push({
          academicYear: validOldAcademicYear, // The year they completed (e.g., "2025-2026")
          fromClass: previousClass,
          fromSection: previousSection,
          toClass: newClass,
          toSection: newSection,
          promotionType: promotionType,
          reason: reason || (promotionType === 'hold-back' 
            ? `Low attendance (${attendancePercentageForHistory}% < ${minAttendanceRequired}%)` 
            : `Promoted to next class (${attendancePercentageForHistory}% attendance)`),
          attendancePercentage: attendancePercentageForHistory,
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

    if (!studentId) {
      return res.status(400).json({ 
        success: false,
        message: "Student ID is required" 
      });
    }

    // Find student by studentId field (e.g., "S25153") or MongoDB _id
    // Check if it's a valid MongoDB ObjectId, otherwise search by studentId field
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(studentId);
    const student = isObjectId 
      ? await Student.findById(studentId)
      : await Student.findOne({ studentId: studentId });
    
    if (!student) {
      return res.status(404).json({ 
        success: false,
        message: `Student not found with ID: ${studentId}` 
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

    // Validate minAttendancePercentage
    const minAttendance = Number(minAttendancePercentage);
    if (isNaN(minAttendance) || minAttendance < 0 || minAttendance > 100) {
      return res.status(400).json({ 
        success: false,
        message: "Minimum attendance percentage must be between 0 and 100" 
      });
    }

    console.log(`Bulk promote: Class=${className}, AcademicYear=${academicYear}, MinAttendance=${minAttendance}%`);

    // Get academic year date range
    const academicYearStr = academicYear || getCurrentAcademicYear();
    const { startDate: startOfYear, endDate: endOfYear } = getAcademicYearDateRange(academicYearStr);

    // Get all students (no status/active filters) - we'll filter by class based on promotion history
    // This matches the logic in getStudentsForPromotion
    const allStudents = await Student.find({});

    // Helper function to determine which class a student should appear in for the academic year
    // This must match the logic in getStudentsForPromotion exactly
    const getStudentClassForAcademicYear = (student, targetAcademicYear) => {
      const promotionHistory = student.promotionHistory || [];
      
      // Check if there's a revert record for this academic year (takes precedence)
      const revertRecord = promotionHistory.find(
        p => p.academicYear === targetAcademicYear && p.promotionType === 'reverted'
      );
      
      if (revertRecord) {
        // Student's promotion was reverted - show them in the class they were reverted to
        return revertRecord.toClass;
      }
      
      // Check if student was promoted IN this academic year (and not reverted)
      const promotionInThisYear = promotionHistory.find(
        p => p.academicYear === targetAcademicYear && 
             p.promotionType === 'promoted' && 
             !p.reverted // Don't count reverted promotions
      );
      
      if (promotionInThisYear) {
        // Student was promoted in this year (and not reverted) - they were in fromClass
        return promotionInThisYear.fromClass;
      }
      
      // Check if student was promoted in the PREVIOUS academic year (affects this year)
      // But only if that promotion wasn't reverted
      const previousAcademicYear = getPreviousAcademicYear(targetAcademicYear);
      const revertInPreviousYear = promotionHistory.find(
        p => p.academicYear === previousAcademicYear && p.promotionType === 'reverted'
      );
      
      if (revertInPreviousYear) {
        // Promotion was reverted in previous year - show them in the class they were reverted to
        return revertInPreviousYear.toClass;
      }
      
      const promotionInPreviousYear = promotionHistory.find(
        p => p.academicYear === previousAcademicYear && 
             p.promotionType === 'promoted' && 
             !p.reverted // Don't count reverted promotions
      );
      
      if (promotionInPreviousYear) {
        // Student was promoted in previous year (and not reverted) - they are in toClass for this year
        return promotionInPreviousYear.toClass;
      }
      
      // No promotion affecting this year - use current class
      return student.class;
    };

    // Filter students who are in the specified class for this academic year
    const students = allStudents.filter(student => {
      const studentClassForYear = getStudentClassForAcademicYear(student, academicYearStr);
      const matches = studentClassForYear === className;
      return matches;
    });

    console.log(`Found ${allStudents.length} total students for bulk promote`);
    console.log(`Found ${students.length} students in class ${className} for academic year ${academicYearStr}`);
    
    // Additional debug: show sample of filtered students
    if (students.length > 0) {
      console.log(`Sample student IDs: ${students.slice(0, 3).map(s => s.studentId).join(', ')}`);
    } else {
      // Debug: check why no students found
      const sampleStudents = allStudents.slice(0, 5);
      console.log(`Sample student classes for debugging:`);
      sampleStudents.forEach(s => {
        const classForYear = getStudentClassForAcademicYear(s, academicYearStr);
        console.log(`  Student ${s.studentId}: DB class=${s.class}, Year class=${classForYear}, Target=${className}`);
      });
    }

    const promotionResults = {
      promoted: [],
      holdBack: [],
      errors: []
    };

    const getNextClass = (currentClass) => {
      // Handle class names (case-insensitive)
      const normalizedClass = String(currentClass).trim();
      const classMap = {
        'Nursery': 'LKG',
        'nursery': 'LKG',
        'NURSERY': 'LKG',
        'LKG': '1',
        'lkg': '1',
        'Lkg': '1',
        '1': '2', '2': '3', '3': '4', '4': '5', '5': '6',
        '6': '7', '7': '8', '8': '9', '9': '10', '10': 'Graduated', '11': '12', '12': 'Graduated'
      };
      return classMap[normalizedClass] || currentClass;
    };

    // Filter to only active students for promotion processing
    const activeStudents = students.filter(student => 
      student.isActive !== false && student.status === 'active'
    );
    
    console.log(`Filtered to ${activeStudents.length} active students out of ${students.length} total in class ${className}`);

    for (const student of activeStudents) {
      try {
        // Check if student was already promoted in this academic year (excluding reverted promotions)
        const promotionHistory = student.promotionHistory || [];
        const alreadyPromoted = promotionHistory.find(
          p => p.academicYear === academicYearStr && 
               p.promotionType === 'promoted' && 
               p.reverted !== true // Only exclude if explicitly marked as reverted
        );
        
        if (alreadyPromoted) {
          // Skip if already promoted in this academic year (and not reverted)
          console.log(`Bulk Promote: Student ${student.studentId} (${student.name}) already has non-reverted promotion in ${academicYearStr}, promotion ID: ${alreadyPromoted._id}, reverted: ${alreadyPromoted.reverted}`);
          promotionResults.errors.push({
            studentId: student.studentId,
            name: student.name,
            error: `Already promoted in academic year ${academicYearStr}`
          });
          continue;
        }

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

        // Get the class the student is in for this academic year (before promotion)
        const currentClassForYear = getStudentClassForAcademicYear(student, academicYearStr);
        const previousClass = currentClassForYear;
        const previousSection = student.section;
        let newClass, newSection, promotionType;

        // IMPORTANT: Students with no attendance records (0 total days) must be held back
        // Students must have at least some attendance records AND meet the minimum percentage
        if (totalDays === 0) {
          // No attendance records - hold back
          newClass = currentClassForYear;
          newSection = student.section;
          promotionType = 'hold-back';
          console.log(`Student ${student.studentId} (${student.name}): No attendance records - holding back`);
        } else if (attendancePercentage >= minAttendance) {
          // Promote - attendance meets minimum requirement
          newClass = getNextClass(currentClassForYear);
          newSection = student.section;
          promotionType = 'promoted';
          console.log(`Student ${student.studentId} (${student.name}): ${attendancePercentage}% >= ${minAttendance}% - promoting`);
          
          if (newClass === 'Graduated') {
            student.status = 'graduated';
            student.isActive = false;
          }
        } else {
          // Hold back - attendance below minimum requirement
          newClass = currentClassForYear;
          newSection = student.section;
          promotionType = 'hold-back';
          console.log(`Student ${student.studentId} (${student.name}): ${attendancePercentage}% < ${minAttendance}% - holding back`);
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
            ? `Low attendance (${attendancePercentage}% < ${minAttendance}%)`
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
        total: activeStudents.length,
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

/**
 * Revert/Undo a student promotion
 */
export const revertPromotion = async (req, res) => {
  try {
    const { studentId, academicYear, reason } = req.body;
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

    const student = await Student.findById(studentId);
    
    if (!student) {
      return res.status(404).json({ 
        success: false,
        message: "Student not found" 
      });
    }

    // Find the most recent promotion record for the academic year
    const academicYearStr = academicYear || getCurrentAcademicYear();
    const promotionHistory = student.promotionHistory || [];
    
    // Find the MOST RECENT non-reverted promotion record for this academic year
    // Sort by promotedAt date (most recent first) and find the first non-reverted one
    const promotionRecords = promotionHistory
      .filter(p => p.academicYear === academicYearStr && p.promotionType === 'promoted')
      .sort((a, b) => new Date(b.promotedAt || 0) - new Date(a.promotedAt || 0));
    
    console.log(`Revert: Found ${promotionRecords.length} promotion record(s) for student ${student.studentId} in academic year ${academicYearStr}`);
    promotionRecords.forEach((p, idx) => {
      console.log(`  Record ${idx + 1}: ID=${p._id}, reverted=${p.reverted}, promotedAt=${p.promotedAt}`);
    });
    
    const promotionRecord = promotionRecords.find(p => p.reverted !== true);

    if (!promotionRecord) {
      // Check if all promotions are already reverted
      if (promotionRecords.length > 0) {
        return res.status(400).json({ 
          success: false,
          message: "All promotions for this academic year have already been reverted" 
        });
      }
      return res.status(400).json({ 
        success: false,
        message: `No promotion found for student in academic year ${academicYearStr}` 
      });
    }

    // Revert the student back to their previous class
    student.class = promotionRecord.fromClass;
    student.section = promotionRecord.fromSection;
    student.previousClass = promotionRecord.fromClass;
    student.previousSection = promotionRecord.fromSection;
    
    // Revert academic year back
    student.currentAcademicYear = academicYearStr;

    // Mark the promotion record as reverted
    console.log(`Revert: Marking promotion record ${promotionRecord._id} as reverted`);
    promotionRecord.reverted = true;
    promotionRecord.revertedAt = new Date();
    promotionRecord.revertedBy = user._id;
    promotionRecord.revertReason = reason || "Promotion reverted by admin";

    // Explicitly mark the promotionHistory array as modified to ensure Mongoose saves the changes
    student.markModified('promotionHistory');
    
    console.log(`Revert: Before save - promotionRecord.reverted = ${promotionRecord.reverted}`);

    // Add a revert record to promotion history
    student.promotionHistory.push({
      academicYear: academicYearStr,
      fromClass: promotionRecord.toClass,
      fromSection: promotionRecord.toSection,
      toClass: promotionRecord.fromClass,
      toSection: promotionRecord.fromSection,
      promotionType: 'reverted',
      reason: reason || "Promotion reverted - student moved back to previous class",
      attendancePercentage: promotionRecord.attendancePercentage,
      promotedBy: user._id,
      revertedFrom: promotionRecord._id
    });

    const saveResult = await student.save();
    console.log(`Revert: Student saved, checking verification...`);
    
    // Verify the revert was saved by reloading from database
    const savedStudent = await Student.findById(student._id).lean();
    const savedPromotion = savedStudent.promotionHistory.find(
      p => p._id && p._id.toString() === promotionRecord._id.toString()
    );
    
    console.log(`Revert: Verification - savedPromotion found: ${!!savedPromotion}, reverted value: ${savedPromotion?.reverted}`);
    
    if (!savedPromotion) {
      console.error(`ERROR: Promotion record ${promotionRecord._id} not found after save for student ${student.studentId}`);
      return res.status(500).json({
        success: false,
        message: "Failed to save promotion revert. Promotion record not found after save."
      });
    }
    
    if (savedPromotion.reverted !== true) {
      console.error(`ERROR: Promotion revert not saved properly for student ${student.studentId}. Expected reverted=true, got: ${savedPromotion.reverted}`);
      console.error(`Full promotion record:`, JSON.stringify(savedPromotion, null, 2));
      return res.status(500).json({
        success: false,
        message: "Failed to save promotion revert. The revert flag was not saved correctly."
      });
    }
    
    console.log(`Successfully reverted promotion for student ${student.studentId}: promotion record ${promotionRecord._id} marked as reverted`);

    console.log(`Reverted promotion for student ${student.studentId} (${student.name}): ${promotionRecord.toClass} -> ${promotionRecord.fromClass}`);

    res.status(200).json({
      success: true,
      message: "Promotion reverted successfully",
      student: {
        studentId: student.studentId,
        name: student.name,
        previousClass: promotionRecord.toClass,
        currentClass: promotionRecord.fromClass,
        academicYear: academicYearStr
      }
    });
  } catch (error) {
    console.error("Revert promotion error:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};

