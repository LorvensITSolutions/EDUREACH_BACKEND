// leaveApplication.model.js
import mongoose from "mongoose";

const leaveSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    fromDate: { type: Date, required: true },
    toDate: { type: Date, required: true },
    reason: { type: String, required: true },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    rejectionReason: { type: String },
    appliedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Parent", required: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // teacher/admin
  },
  { timestamps: true }
);

export default mongoose.model("Leave", leaveSchema);
