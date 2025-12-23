import mongoose from 'mongoose';

const admissionSchema = new mongoose.Schema({
  studentName: { type: String, required: true },
  dateOfBirth: { type: Date, required: true },
  gender: { type: String, required: true },
  grade: { type: String, required: true },
  parentName: { type: String, required: true },
  parentEmail: {
    type: String,
    required: true,
    match: [/.+\@.+\..+/, 'Please enter a valid email']
  },
  parentPhone: {
    type: String,
    required: true,
    match: [/^[0-9]{10}$/, 'Please enter a valid 10-digit phone number']
  },
  address: { type: String },
  previousSchool: { type: String },
  medicalConditions: { type: String },
  documents: {
    birthCertificate: { type: String, default: '' },
    previousRecords: { type: String, default: '' },
    medicalRecords: { type: String, default: '' },
    passport: { type: String, default: '' }
  },
  status: {
    type: String,
    enum: ['draft', 'submitted', 'reviewed', 'accepted', 'rejected'],
    default: 'draft',
    index: true
  }
}, {
  timestamps: true
});

export default mongoose.model('AdmissionApplication', admissionSchema);
