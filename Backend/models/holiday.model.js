// models/holiday.model.js
import mongoose from 'mongoose';

const holidaySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  date: {
    type: Date,
    required: true
    // Uniqueness enforced by partial index below (only for isActive: true) so delete+re-add same day works
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  type: {
    type: String,
    enum: ['national', 'religious', 'regional', 'school', 'other'],
    default: 'school'
  },
  academicYear: {
    type: String,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Index for efficient date queries
holidaySchema.index({ date: 1, isActive: 1 });
holidaySchema.index({ academicYear: 1, isActive: 1 });
// Only one active holiday per date; inactive (deleted) rows don't block re-adding same date
holidaySchema.index(
  { date: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);

export default mongoose.model('Holiday', holidaySchema);
