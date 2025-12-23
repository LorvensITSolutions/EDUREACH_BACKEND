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
  }
}, { timestamps: true }); // Add timestamps for created/updated tracking

export default mongoose.model("Student", studentSchema);