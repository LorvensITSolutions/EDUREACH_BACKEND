import mongoose from "mongoose";

const studentSchema = new mongoose.Schema({
  studentId: { type: String, unique: true, required: true },
  name: { type: String, required: true },
  class: { type: String, required: true },
  section: { type: String, required: true },
  birthDate: { type: Date, required: true },
  parent: { type: mongoose.Schema.Types.ObjectId, ref: "Parent", required: true },
  assignedTeacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  image: { // For student photos
    public_id: String,
    url: String
  },
  generatedCredentials: { // Store generated login credentials
    username: { type: String, required: true },
    password: { type: String, required: true },
    generatedAt: { type: Date, default: Date.now }
  },
  // Promotion and Status Fields
  isActive: { 
    type: Boolean, 
    default: true 
  },
  status: { 
    type: String, 
    enum: ['active', 'inactive', 'transferred', 'graduated', 'hold-back'],
    default: 'active' 
  },
  previousClass: { 
    type: String 
  },
  previousSection: { 
    type: String 
  },
  currentAcademicYear: {
    type: String,
    default: () => {
      // Default to current academic year in "YYYY-YYYY" format
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();
      // If June or later, academic year is currentYear-nextYear, else previousYear-currentYear
      if (currentMonth >= 5) {
        return `${currentYear}-${currentYear + 1}`;
      } else {
        return `${currentYear - 1}-${currentYear}`;
      }
    }
  },
  promotionHistory: [{
    academicYear: { type: String },
    fromClass: { type: String },
    fromSection: { type: String },
    toClass: { type: String },
    toSection: { type: String },
    promotionType: { 
      type: String, 
      enum: ['promoted', 'hold-back', 'transferred'] 
    },
    reason: { type: String },
    attendancePercentage: { type: Number },
    promotedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    promotedAt: { type: Date, default: Date.now }
  }],
  transferCertificate: {
    issued: { type: Boolean, default: false },
    issuedDate: { type: Date },
    reason: { type: String },
    issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }
}, { timestamps: true }); // Add timestamps for created/updated tracking

export default mongoose.model("Student", studentSchema);