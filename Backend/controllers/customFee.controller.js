import CustomFee from "../models/customFee.model.js";
import FeeStructure from "../models/FeeStructure.model.js"; // Import your standard structure model

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
