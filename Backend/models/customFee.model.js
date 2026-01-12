// models/customFee.model.js

import mongoose from "mongoose";

const customFeeSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Student",
    required: true,
  },
  academicYear: {
    type: String,
    required: true,
  },
  totalFee: {
    type: Number,
    required: true,
  },
  breakdown: {
    type: Map,
    of: Number, // this allows dynamic fields with number values
    default: {},
  },
  frequency: {
    type: String,
    enum: ["monthly", "quarterly", "annually"],
    default: "monthly",
  },
  dueDate: {
    type: Date,
  },
  lateFeePerDay: {
    type: Number,
    default: 0,
  },
  reason: {
    type: String,
  },
}, { timestamps: true });

// Compound unique index: one custom fee per student per academic year
// This allows multiple custom fees for the same student (one per academic year)
customFeeSchema.index({ student: 1, academicYear: 1 }, { unique: true });

export default mongoose.models.CustomFee || mongoose.model("CustomFee", customFeeSchema);
