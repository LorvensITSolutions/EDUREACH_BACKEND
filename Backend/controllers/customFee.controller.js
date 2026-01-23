import CustomFee from "../models/customFee.model.js";
import FeeStructure from "../models/FeeStructure.model.js"; // Import your standard structure model
import Student from "../models/student.model.js";
import FeePayment from "../models/feePayment.model.js";
import Parent from "../models/parent.model.js";
import { getPreviousAcademicYear } from "../utils/academicYear.js";

// Helper function to determine student's class for a given academic year
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
    // Student's promotion was reverted - show them in the class they were reverted to
    return {
      displayClass: revertRecord.toClass,
      displaySection: revertRecord.toSection
    };
  }
  
  if (promotionInThisYear) {
    // Student was promoted in this year (and not reverted) - show them in their OLD class (fromClass)
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
    // Promotion was reverted in previous year - show them in the class they were reverted to
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
    // Student was promoted in previous year (and not reverted) - show them in their NEW class (toClass) for this year
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

export const createOrUpdateCustomFee = async (req, res) => {
  try {
    const { student, academicYear, totalFee, breakdown, frequency, dueDate, lateFeePerDay, reason, className, section } = req.body;
console.log("createOrUpdateCustomFee",req.body);
    // Validate required fields
    if (!student) {
      return res.status(400).json({ success: false, message: "Student ID is required." });
    }

    if (!academicYear) {
      return res.status(400).json({ success: false, message: "Academic year is required." });
    }

    if (!breakdown || typeof breakdown !== "object" || Object.keys(breakdown).length === 0) {
      return res.status(400).json({ success: false, message: "Breakdown must have at least one fee component." });
    }

    const calculatedTotal = Object.values(breakdown).reduce((sum, val) => sum + Number(val), 0);

    if (Number(totalFee) !== calculatedTotal) {
      return res.status(400).json({
        success: false,
        message: `Total fee (${totalFee}) does not match sum of breakdown (${calculatedTotal})`,
      });
    }

    // Always fetch student to get the correct class for this academic year (handles promotions)
    let classToUse = className;
    let sectionToUse = section;

    try {
      const studentDoc = await Student.findById(student).select('class section promotionHistory').lean();
      if (!studentDoc) {
        return res.status(404).json({ success: false, message: "Student not found." });
      }

      // Get the correct class for this academic year based on promotion history
      const classInfo = getStudentClassForAcademicYear(studentDoc, academicYear);
      
      // Use provided className/section if available, otherwise use calculated class
      // But validate that provided class matches calculated class for this academic year
      if (classInfo.displayClass && classInfo.displaySection) {
        // If className/section were provided, verify they match the calculated class
        if (classToUse && sectionToUse) {
          // Allow if they match, or if they're close (case-insensitive)
          if (classToUse.toLowerCase() !== classInfo.displayClass.toLowerCase() || 
              sectionToUse.toLowerCase() !== classInfo.displaySection.toLowerCase()) {
            console.warn(`Class mismatch: Provided ${classToUse}-${sectionToUse}, but calculated ${classInfo.displayClass}-${classInfo.displaySection} for academic year ${academicYear}`);
          }
        }
        // Always use the calculated class to ensure consistency
        classToUse = classInfo.displayClass;
        sectionToUse = classInfo.displaySection;
      } else {
        // Fallback to student's current class if no promotion history
        classToUse = classToUse || studentDoc.class;
        sectionToUse = sectionToUse || studentDoc.section;
      }
    } catch (err) {
      console.error("Error fetching student:", err);
      return res.status(500).json({ 
        success: false, 
        message: "Error fetching student information. Please try again." 
      });
    }

    // Validate that we have class and section
    if (!classToUse || !sectionToUse) {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot determine class and section for student in academic year ${academicYear}. Please ensure the student is promoted to this academic year.` 
      });
    }

    // 🔍 1. Get the standard fee structure for the student's class
    let standard = null;
    try {
      standard = await FeeStructure.findOne({
        class: classToUse,
        section: sectionToUse,
        academicYear: String(academicYear).trim(),
    });
    } catch (err) {
      console.error("Error fetching standard fee structure:", err);
      // Continue even if standard fee lookup fails
    }

    let discount = null;
    if (standard) {
      const original = standard.totalFee;
      discount = original - totalFee;
    }

    // 💾 2. Save or update custom fee
    try {
    const updated = await CustomFee.findOneAndUpdate(
        { student, academicYear: String(academicYear).trim() },
        { 
          totalFee, 
          breakdown, 
          frequency, 
          dueDate, 
          lateFeePerDay, 
          reason 
        },
      { new: true, upsert: true }
    );

    res.status(200).json({
      success: true,
      message: "Custom fee saved",
      data: updated,
      originalFee: standard?.totalFee || null,
      discount: discount !== null ? discount : null,
    });
    } catch (dbError) {
      console.error("Database error saving custom fee:", dbError);
      console.error("Student ID:", student);
      console.error("Academic Year:", academicYear);
      console.error("Class:", classToUse, "Section:", sectionToUse);
      
      // Check if it's a duplicate key error
      if (dbError.code === 11000) {
        // Check if it's the old index issue (unique on student only)
        if (dbError.keyPattern && dbError.keyPattern.student && !dbError.keyPattern.academicYear) {
          console.error("⚠️ Database index issue: Old unique index on 'student' only detected.");
          console.error("⚠️ Please run the migration script to fix the database index.");
          return res.status(500).json({ 
            success: false, 
            message: "Database configuration error. Please contact administrator. The system needs to allow multiple custom fees per student (one per academic year)." 
          });
        }
        
        // Normal duplicate key error (shouldn't happen with upsert, but handle it)
        return res.status(400).json({ 
          success: false, 
          message: "Custom fee already exists for this student and academic year." 
        });
      }
      
      throw dbError; // Re-throw to be caught by outer catch
    }

  } catch (err) {
    console.error("Custom fee error:", err);
    console.error("Error stack:", err.stack);
    console.error("Request body:", JSON.stringify(req.body, null, 2));
    res.status(500).json({ 
      success: false, 
      message: "Failed to save custom fee",
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// Get all custom fees with student details and payment history
export const getAllCustomFees = async (req, res) => {
  try {
    const customFees = await CustomFee.find()
      .populate({
        path: 'student',
        select: 'name studentId class section parent promotionHistory',
        populate: {
          path: 'parent',
          select: 'name phone email'
        }
      })
      .sort({ createdAt: -1 });

    // For each custom fee, fetch payment history
    // Filter out custom fees with null/undefined students first
    const validCustomFees = customFees.filter(customFee => 
      customFee.student && 
      (customFee.student._id || customFee.student)
    );

    const customFeesWithPayments = await Promise.all(
      validCustomFees.map(async (customFee) => {
        const studentId = customFee.student._id || customFee.student;
        const student = customFee.student;
        
        // Get the correct class for this academic year (not the current class)
        const classInfo = getStudentClassForAcademicYear(student, customFee.academicYear);
        const displayClass = classInfo.displayClass;
        const displaySection = classInfo.displaySection;
        
        // Get the standard fee structure for comparison using the correct class for this academic year
        let standardFee = null;
        let actualFee = null;
        let discount = null;
        
        if (displayClass && displaySection) {
          standardFee = await FeeStructure.findOne({
            class: displayClass,
            section: displaySection,
            academicYear: customFee.academicYear,
          });
          
          if (standardFee) {
            actualFee = standardFee.totalFee || 0;
            discount = actualFee - customFee.totalFee;
          }
        }
        
        // Find all payments for this student and academic year
        // Check both by student+academicYear and by customFee reference
        const payments = await FeePayment.find({
          $or: [
            {
              student: studentId,
              academicYear: customFee.academicYear,
            },
            {
              feeStructure: customFee._id
            }
          ],
          status: { $in: ['paid', 'success'] }
        })
        .populate('verifiedBy', 'name')
        .sort({ paidAt: -1 });

        // Calculate total paid and remaining
        const totalPaid = payments.reduce((sum, payment) => {
          return sum + (payment.amountPaid || 0) + (payment.lateFee || 0);
        }, 0);

        const remaining = Math.max(0, customFee.totalFee - totalPaid);
        const percentPaid = customFee.totalFee > 0 
          ? ((totalPaid / customFee.totalFee) * 100).toFixed(2)
          : 0;

        // Convert breakdown Map to object if needed
        const breakdown = customFee.breakdown instanceof Map 
          ? Object.fromEntries(customFee.breakdown)
          : customFee.breakdown || {};

        // Convert standard fee breakdown Map to object if needed
        let standardBreakdown = null;
        if (standardFee && standardFee.breakdown) {
          standardBreakdown = standardFee.breakdown instanceof Map
            ? Object.fromEntries(standardFee.breakdown)
            : standardFee.breakdown;
        }

        // Ensure student object with populated parent is included
        let studentObj;
        if (student && student.toObject) {
          studentObj = student.toObject();
        } else {
          studentObj = student;
        }
        
        // Ensure parent is properly populated (fallback if nested populate didn't work)
        if (studentObj && studentObj.parent) {
          // Check if parent is populated (has name/phone/email) or just an ObjectId
          const parentIsPopulated = studentObj.parent && 
            typeof studentObj.parent === 'object' && 
            (studentObj.parent.name || studentObj.parent.phone || studentObj.parent.email);
          
          if (!parentIsPopulated) {
            // Parent is not populated, fetch it
            let parentId;
            if (typeof studentObj.parent === 'object' && studentObj.parent._id) {
              parentId = studentObj.parent._id;
            } else if (typeof studentObj.parent === 'string') {
              parentId = studentObj.parent;
            } else if (studentObj.parent && studentObj.parent.toString) {
              parentId = studentObj.parent.toString();
            }
            
            if (parentId) {
              try {
                const parentData = await Parent.findById(parentId).select('name phone email').lean();
                if (parentData) {
                  studentObj.parent = parentData;
                  console.log(`✅ Populated parent for student ${studentObj.studentId}:`, parentData);
                } else {
                  console.log(`⚠️ Parent not found for ID: ${parentId}`);
                  studentObj.parent = null;
                }
              } catch (err) {
                console.error(`❌ Error fetching parent ${parentId}:`, err);
                studentObj.parent = null;
              }
            }
          } else {
            console.log(`✅ Parent already populated for student ${studentObj.studentId}:`, studentObj.parent);
          }
        }
        
        return {
          ...customFee.toObject(),
          student: studentObj, // Explicitly include populated student with parent
          breakdown,
          paymentHistory: payments,
          totalPaid,
          remaining,
          percentPaid: parseFloat(percentPaid),
          assignedDate: customFee.createdAt,
          actualFee: actualFee,
          standardFee: standardFee ? {
            totalFee: standardFee.totalFee,
            breakdown: standardBreakdown
          } : null,
          discount: discount !== null ? discount : null,
          hasDiscount: discount !== null && discount > 0,
          // Add display class and section for this academic year
          displayClass: displayClass,
          displaySection: displaySection
        };
      })
    );

    res.status(200).json({
      success: true,
      customFees: customFeesWithPayments,
      count: customFeesWithPayments.length
    });
  } catch (err) {
    console.error("Get custom fees error:", err);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch custom fees",
      error: err.message 
    });
  }
};

// Update custom fee with validations
export const updateCustomFee = async (req, res) => {
  try {
    const { customFeeId } = req.params;
    const { totalFee, breakdown, frequency, dueDate, lateFeePerDay, reason, className, section } = req.body;

    // Find the existing custom fee
    const existingCustomFee = await CustomFee.findById(customFeeId)
      .populate('student', 'name studentId class section');
    
    if (!existingCustomFee) {
      return res.status(404).json({ 
        success: false, 
        message: "Custom fee not found" 
      });
    }

    // Check if any payments have been made
    const studentId = existingCustomFee.student._id || existingCustomFee.student;
    const payments = await FeePayment.find({
      $or: [
        {
          student: studentId,
          academicYear: existingCustomFee.academicYear,
        },
        {
          feeStructure: customFeeId
        }
      ],
      status: { $in: ['paid', 'success'] }
    });

    const totalPaid = payments.reduce((sum, payment) => {
      return sum + (payment.amountPaid || 0) + (payment.lateFee || 0);
    }, 0);

    // Validation: Cannot edit if payments have been made
    if (totalPaid > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot modify custom fee. Student has already paid ₹${totalPaid.toLocaleString()}. Custom fees with payments cannot be edited.`,
        totalPaid: totalPaid
      });
    }

    // Validate breakdown
    if (!breakdown || typeof breakdown !== "object" || Object.keys(breakdown).length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Breakdown must have at least one fee component." 
      });
    }

    // Validate total matches breakdown
    const calculatedTotal = Object.values(breakdown).reduce((sum, val) => sum + Number(val), 0);
    if (Number(totalFee) !== calculatedTotal) {
      return res.status(400).json({
        success: false,
        message: `Total fee (${totalFee}) does not match sum of breakdown (${calculatedTotal})`,
      });
    }

    // Get the standard fee structure for comparison
    const student = existingCustomFee.student;
    let standardFee = null;
    let oldDiscount = null;
    let newDiscount = null;
    
    if (student && (className || student.class) && (section || student.section)) {
      const classToUse = className || student.class;
      const sectionToUse = section || student.section;
      
      standardFee = await FeeStructure.findOne({
        class: classToUse,
        section: sectionToUse,
        academicYear: existingCustomFee.academicYear,
      });
      
      if (standardFee) {
        const original = standardFee.totalFee;
        oldDiscount = original - existingCustomFee.totalFee;
        newDiscount = original - Number(totalFee);
      }
    }

    // Store old values for comparison
    const oldValues = {
      totalFee: existingCustomFee.totalFee,
      breakdown: existingCustomFee.breakdown instanceof Map 
        ? Object.fromEntries(existingCustomFee.breakdown)
        : existingCustomFee.breakdown || {},
      discount: oldDiscount
    };

    // Update the custom fee
    existingCustomFee.totalFee = Number(totalFee);
    existingCustomFee.breakdown = breakdown;
    if (frequency) existingCustomFee.frequency = frequency;
    if (dueDate) existingCustomFee.dueDate = dueDate;
    if (lateFeePerDay !== undefined) existingCustomFee.lateFeePerDay = lateFeePerDay;
    if (reason !== undefined) existingCustomFee.reason = reason;
    
    await existingCustomFee.save();

    res.status(200).json({
      success: true,
      message: "Custom fee updated successfully",
      data: existingCustomFee,
      comparison: {
        old: oldValues,
        new: {
          totalFee: Number(totalFee),
          breakdown: breakdown,
          discount: newDiscount
        },
        difference: {
          totalFee: Number(totalFee) - oldValues.totalFee,
          discount: newDiscount !== null && oldDiscount !== null ? newDiscount - oldDiscount : null
        }
      },
      standardFee: standardFee?.totalFee || null
    });

  } catch (err) {
    console.error("Update custom fee error:", err);
    res.status(500).json({ 
      success: false, 
      message: "Failed to update custom fee",
      error: err.message 
    });
  }
};
