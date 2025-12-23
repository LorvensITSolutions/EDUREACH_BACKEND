import FeeStructure from "../models/FeeStructure.model.js";
import Student from "../models/student.model.js";
import Parent from "../models/parent.model.js";
import FeePayment from "../models/feePayment.model.js"; // ✅ <-- THIS IS IMPORTANT
import CustomFee from "../models/customFee.model.js";
import { getAcademicYear } from "../config/appConfig.js";

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

// GET /api/parent/fee-structure
export const getFeeStructureForAllChildren = async (req, res) => {
  try {
    const parentId = req.user.parentId;
    const academicYear = getAcademicYear();

    const children = await Student.find({ parent: parentId })
      .populate("parent", "email name")
      .lean();

    const result = await Promise.all(
      children.map(async (student) => {
        const feeStructure = await FeeStructure.findOne({
          class: student.class,
          section: student.section,
          academicYear,
        }).lean();

        const payments = await FeePayment.find({
          student: student._id,
          academicYear,
          status: "paid",
        })
          .sort({ paidAt: -1 })
          .lean();

        const totalPaid = payments.reduce(
          (sum, p) => sum + (p.amountPaid || 0) + (p.lateFee || 0),
          0
        );

        const totalFee = feeStructure?.totalFee || 0;
        const remaining = totalFee - totalPaid;

        return {
          student,
          academicYear,
          feeStructure,
          latestPayment: payments[0]
            ? {
                ...payments[0],
                amount: (payments[0].amountPaid || 0) + (payments[0].lateFee || 0),
              }
            : null,
          totalPaid,
          remaining,
          discount: feeStructure?.discount || 0,
          discountPercentage: feeStructure?.discountPercentage || "0%",
          paymentHistory: payments.map((p) => ({
            amountPaid: p.amountPaid,
            lateFee: p.lateFee,
            total: (p.amountPaid || 0) + (p.lateFee || 0),
            paidAt: p.paidAt,
            receiptUrl: p.receiptUrl,
            receiptNumber: p._id.toString().slice(-8).toUpperCase(), // Generate receipt number from ID
            status: p.status,
          })),
        };
      })
    );

    res.status(200).json({ success: true, children: result });
  } catch (err) {
    console.error("getFeeStructureForAllChildren error:", err);
    res.status(500).json({ success: false, message: "Could not fetch fee structure" });
  }
};


