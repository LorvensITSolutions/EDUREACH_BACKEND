// models/timetableTemplateModel.js
import mongoose from "mongoose";

const TimetableTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  classes: [
    {
      name: String,
      subjects: [
        {
          name: String,
          periodsPerWeek: Number
        }
      ]
    }
  ],
  teachers: [
    {
      name: String,
      subjects: [String]
    }
  ],
  days: [String],
  periodsPerDay: Number,
  options: {
    startTime: String,
    endTime: String,
    periodDuration: Number,
    breakDuration: Number,
    breakAfterPeriods: [Number],
    lunchAfterPeriod: Number
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  isPublic: { type: Boolean, default: false },
  tags: [String]
}, {
  timestamps: true
});

TimetableTemplateSchema.index({ name: 1, createdBy: 1 });
TimetableTemplateSchema.index({ tags: 1 });
TimetableTemplateSchema.index({ isPublic: 1 });

export const TimetableTemplateModel = mongoose.model("TimetableTemplate", TimetableTemplateSchema);

