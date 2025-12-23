import mongoose from "mongoose";

// Schema for each student's assignment submission
const submissionSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
  file: String, // Path to submitted file (PDF)
  submittedAt: { type: Date, default: Date.now },
});

// Schema for teacher's evaluation per student
const studentEvaluationSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
  file: String, // Optional: path to annotated PDF or feedback file
  marks: Number,
  feedback: String,
}, { _id: false });

// Main Assignment schema
const assignmentSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  dueDate: Date,
  class: { type: String, required: true },
  section: { type: String, required: true },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "Teacher", required: true },
  attachments: [String], // PDFs or references uploaded by the teacher
  submissions: [submissionSchema], // ✅ Students' file uploads
  evaluations: [studentEvaluationSchema], // ✅ Teacher evaluations per student
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("Assignment", assignmentSchema);
