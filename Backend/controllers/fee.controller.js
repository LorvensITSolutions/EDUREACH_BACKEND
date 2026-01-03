import FeeStructure from "../models/FeeStructure.model.js";
import Student from "../models/student.model.js";
import Parent from "../models/parent.model.js";
import FeePayment from "../models/feePayment.model.js"; // ✅ <-- THIS IS IMPORTANT
import CustomFee from "../models/customFee.model.js";
import { getAcademicYear } from "../config/appConfig.js";
import { 
  getCurrentAcademicYear, 
  getPreviousAcademicYear, 
  getNextAcademicYear 
} from "../utils/academicYear.js";

// POST /api/admin/fee-structure
export const createFeeStructure = async (req, res) => {
  try {
    const { className, section, academicYear, totalFee, breakdown } = req.body;

    // 1. Validate breakdown is present and has values
    if (!breakdown || typeof breakdown !== "object" || Object.keys(breakdown).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Breakdown is required and should have at least one field",
      });
    }

    // 2. Check if structure already exists
    const existing = await FeeStructure.findOne({
      class: className,
      section,
      academicYear,
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Fee structure already exists for this class and section in this year.",
      });
    }

    // 3. Calculate and validate totalFee
    const calculatedTotal = Object.values(breakdown).reduce(
      (sum, value) => sum + Number(value),
      0
    );

    if (Number(totalFee) !== calculatedTotal) {
      return res.status(400).json({
        success: false,
        message: `Total fee (${totalFee}) does not match breakdown sum (${calculatedTotal})`,
      });
    }

    // 4. Create fee structure
    const structure = await FeeStructure.create({
      class: className,
      section,
      academicYear,
      totalFee,
      breakdown,
    });

    res.status(201).json({
      success: true,
      message: "Fee structure assigned successfully",
      data: structure,
    });
  } catch (error) {
    console.error("Fee structure creation error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to assign fee structure",
    });
  }
};


// GET /api/admin/fee-structure/all
export const getAllFeeStructures = async (req, res) => {
  try {
    const structures = await FeeStructure.find().sort({ createdAt: -1 });
    res.json({ success: true, structures });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch" });
  }
};

// DELETE /api/admin/fee-structure/:id
// DELETE /api/admin/fee-structure/:id
export const deleteStructure = async (req, res) => {
  try {
    const structureId = req.params.id;

    // 1. Check if FeeStructure exists
    const structure = await FeeStructure.findById(structureId);
    if (!structure) {
      return res.status(404).json({ success: false, message: "Fee structure not found." });
    }

    // 2. Check if any FeePayment is linked to this structure
    const usedInPayment = await FeePayment.exists({ feeStructure: structureId });
    if (usedInPayment) {
      return res.status(400).json({
        success: false,
        message: "This fee structure is already linked to payments and cannot be deleted.",
      });
    }

    // 3. Check if any Student uses this class+section+academicYear
    const isAssigned = await Student.exists({
      class: structure.class,
      section: structure.section,
    });

    if (isAssigned) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete. Fee structure is assigned to existing students.",
      });
    }

    // 4. Delete
    await FeeStructure.findByIdAndDelete(structureId);
    res.json({ success: true, message: "Fee structure deleted successfully." });
  } catch (err) {
    console.error("Delete fee structure error:", err);
    res.status(500).json({ success: false, message: "Delete failed due to server error." });
  }
};


// PUT /api/admin/fee-structure/:id
export const updateStructure = async (req, res) => {
  try {
    const updated = await FeeStructure.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.json({ success: true, structure: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: "Update failed" });
  }
};

// Helper function to determine student's class for a given academic year (same logic as promotion controller)
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

// GET /api/parent/fee-structure
export const getFeeStructureForAllChildren = async (req, res) => {
  try {
    const parentId = req.user.parentId;
    const currentAcademicYear = getCurrentAcademicYear();

    const children = await Student.find({ parent: parentId })
      .populate("parent", "email name")
      .lean();

    // Get all unique academic years from fee structures (past, current, and future)
    const allFeeStructures = await FeeStructure.find({}).select("academicYear").lean();
    const uniqueAcademicYears = [...new Set(allFeeStructures.map(fs => fs.academicYear))].sort();

    // If no fee structures exist, return empty result
    if (uniqueAcademicYears.length === 0) {
      return res.status(200).json({ success: true, children: [] });
    }

    const result = await Promise.all(
      children.map(async (student) => {
        // Get fee structures for all academic years
        const feeStructuresByYear = await Promise.all(
          uniqueAcademicYears.map(async (academicYear) => {
            // Determine student's class for this academic year
            const { displayClass, displaySection } = getStudentClassForAcademicYear(student, academicYear);

            // Try to find fee structure for this academic year and class
        const feeStructure = await FeeStructure.findOne({
              class: displayClass,
              section: displaySection,
              academicYear: String(academicYear).trim(),
            }).lean();

            // Also check for custom fee
            const customFee = await CustomFee.findOne({
              student: student._id,
              academicYear: String(academicYear).trim(),
        }).lean();

            const feeStructureToUse = customFee || feeStructure;

            // If no fee structure found for this academic year, skip it
            if (!feeStructureToUse) {
              return null;
            }

            // Get payments for this academic year
        const payments = await FeePayment.find({
          student: student._id,
              academicYear: String(academicYear).trim(),
          status: "paid",
        })
          .sort({ paidAt: -1 })
          .lean();

        const totalPaid = payments.reduce(
          (sum, p) => sum + (p.amountPaid || 0) + (p.lateFee || 0),
          0
        );

            const totalFee = feeStructureToUse?.totalFee || 0;
        const remaining = totalFee - totalPaid;

        return {
          academicYear,
              displayClass,
              displaySection,
              feeStructure: feeStructureToUse,
          latestPayment: payments[0]
            ? {
                ...payments[0],
                amount: (payments[0].amountPaid || 0) + (payments[0].lateFee || 0),
              }
            : null,
          totalPaid,
          remaining,
              discount: feeStructureToUse?.discount || 0,
              discountPercentage: feeStructureToUse?.discountPercentage || "0%",
          paymentHistory: payments.map((p) => ({
            amountPaid: p.amountPaid,
            lateFee: p.lateFee,
            total: (p.amountPaid || 0) + (p.lateFee || 0),
            paidAt: p.paidAt,
            receiptUrl: p.receiptUrl,
                receiptNumber: p._id.toString().slice(-8).toUpperCase(),
            status: p.status,
                paymentMethod: p.paymentMethod,
          })),
            };
          })
        );

        // Filter out null entries (academic years with no fee structure)
        const validFeeStructures = feeStructuresByYear.filter(fs => fs !== null);

        return {
          student,
          feeStructures: validFeeStructures, // Array of fee structures for different academic years
        };
      })
    );

    res.status(200).json({ success: true, children: result });
  } catch (err) {
    console.error("getFeeStructureForAllChildren error:", err);
    res.status(500).json({ success: false, message: "Could not fetch fee structure" });
  }
};


