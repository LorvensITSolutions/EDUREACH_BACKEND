import mongoose from "mongoose";

const schoolSchema = new mongoose.Schema({
  name: { type: String, required: true, default: "School Management System" },
  shortName: { type: String, required: true, default: "EDU" }, // For password prefix
  studentIdPrefix: { type: String, default: "S" },
  studentIdYear: { type: String, default: new Date().getFullYear().toString().slice(-2) },
  currentStudentNumber: { type: Number, default: 0 },
  parentIdPrefix: { type: String, default: "P" },
  currentParentNumber: { type: Number, default: 0 },
  teacherIdPrefix: { type: String, default: "T" },
  teacherIdYear: { type: String, default: new Date().getFullYear().toString().slice(-2) },
  currentTeacherNumber: { type: Number, default: 0 },
  address: String,
  phone: String,
  email: String,
  website: String,
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

// Ensure only one school configuration exists
schoolSchema.index({ isActive: 1 }, { unique: true, partialFilterExpression: { isActive: true } });

export default mongoose.model("School", schoolSchema);
