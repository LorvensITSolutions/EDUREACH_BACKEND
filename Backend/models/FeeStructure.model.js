import mongoose from "mongoose";

const feeStructureSchema = new mongoose.Schema({
  class: { type: String, required: true },
  section: { type: String, required: true },
  academicYear: { type: String, required: true },
  totalFee: { type: Number, required: true },
  breakdown: {
    type: Map,
    of: Number,
    required: true,
  },
}, { timestamps: true });

export default mongoose.models.FeeStructure || mongoose.model("FeeStructure", feeStructureSchema);
