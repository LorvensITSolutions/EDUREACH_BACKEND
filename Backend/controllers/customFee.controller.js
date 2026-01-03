import CustomFee from "../models/customFee.model.js";
import FeeStructure from "../models/FeeStructure.model.js"; // Import your standard structure model
import Student from "../models/student.model.js";
import FeePayment from "../models/feePayment.model.js";
import Parent from "../models/parent.model.js";

export const createOrUpdateCustomFee = async (req, res) => {
  try {
    const { student, academicYear, totalFee, breakdown, frequency, dueDate, lateFeePerDay, reason, className, section } = req.body;

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

    // 🔍 1. Get the standard fee structure for the student's class
    const standard = await FeeStructure.findOne({
      class: className,
      section,
      academicYear,
    });

    let discount = null;
    if (standard) {
      const original = standard.totalFee;
      discount = original - totalFee;
    }

    // 💾 2. Save or update custom fee
    const updated = await CustomFee.findOneAndUpdate(
      { student, academicYear },
      { totalFee, breakdown, frequency, dueDate, lateFeePerDay, reason },
      { new: true, upsert: true }
    );

    res.status(200).json({
      success: true,
      message: "Custom fee saved",
      data: updated,
      originalFee: standard?.totalFee || null,
      discount: discount !== null ? discount : null,
    });

  } catch (err) {
    console.error("Custom fee error:", err);
    res.status(500).json({ success: false, message: "Failed to save custom fee" });
  }
};

// Get all custom fees with student details and payment history
export const getAllCustomFees = async (req, res) => {
  try {
    const customFees = await CustomFee.find()
      .populate({
        path: 'student',
        select: 'name studentId class section parent',
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
        
        // Get the standard fee structure for comparison
        let standardFee = null;
        let actualFee = null;
        let discount = null;
        
        if (student && student.class && student.section) {
          standardFee = await FeeStructure.findOne({
            class: student.class,
            section: student.section,
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
          hasDiscount: discount !== null && discount > 0
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
