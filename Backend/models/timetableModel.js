import mongoose from "mongoose";

const TimetableSchema = new mongoose.Schema({
  classes: [
    {
      name: String,
      timetable: mongoose.Schema.Types.Mixed // stores the timetable object for each class
    }
  ],
  days: [String],
  periodsPerDay: Number,
  className: { type: String, default: null }, // Add missing field
  section: { type: String, default: null }, // Add missing field  
  academicYear: { type: String, default: null }, // Add missing field
  createdAt: { type: Date, default: Date.now }
});

// Remove any existing unique indexes that might be causing conflicts
TimetableSchema.index({ createdAt: -1 }); // Only index by creation date

export const TimetableModel = mongoose.model("Timetable", TimetableSchema);