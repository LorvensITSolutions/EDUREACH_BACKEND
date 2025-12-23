import mongoose from "mongoose";

const teacherSchema = new mongoose.Schema({
  teacherId: { type: String, unique: true, required: true }, // Now required for manual teacher IDs
  name: { type: String, required: true },
  phone: String,
  qualification: String,
  subject: String,
  image: {
    public_id: String,
    url: String
  },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  generatedCredentials: {
    username: String,
    password: String
  },
  sectionAssignments: [
    {
      className: String,
      section: String,
    },
  ],
}, { 
  timestamps: true,
  validateBeforeSave: true // Ensure validation runs before save
});

export default mongoose.model("Teacher", teacherSchema);
