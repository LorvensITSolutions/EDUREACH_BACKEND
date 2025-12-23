import mongoose from "mongoose";

const examSeatingSchema = new mongoose.Schema({
  examName: { type: String, required: true },
  examDate: { type: Date, required: true },
  classes: [String], // Array of class names (e.g., ["10A", "10B", "11A"])
  totalStudents: { type: Number, required: true },
  totalTeachers: { type: Number, required: true },
  examHalls: [
    {
      hallName: { type: String, required: true },
      capacity: { type: Number, required: true },
      supervisor: { type: String }, // Teacher name
      students: [
        {
          studentId: { type: String },
          name: { type: String },
          class: { type: String },
          section: { type: String },
          seatNumber: { type: Number }
        }
      ]
    }
  ],
  seatingArrangement: {
    type: Map,
    of: {
      hallName: String,
      seatNumber: Number,
      row: Number,
      column: Number
    }
  },
  options: {
    shuffleSameClass: { type: Boolean, default: true }, // Distribute same class students
    minDistanceBetweenSameClass: { type: Number, default: 2 }, // Minimum seats between same class students
    randomizeSeats: { type: Boolean, default: true }
  },
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
});

// Index for quick lookups
examSeatingSchema.index({ examDate: -1 });
examSeatingSchema.index({ createdAt: -1 });

export const ExamSeatingModel = mongoose.model("ExamSeating", examSeatingSchema);

