import mongoose from "mongoose";

const parentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: String,
  children: [{ type: mongoose.Schema.Types.ObjectId, ref: "Student" }],
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  generatedCredentials: { // Store parent credentials
    username: { type: String, required: true },
    password: { type: String, required: true },
    generatedAt: { type: Date, default: Date.now }
  }
}, { timestamps: true });

export default mongoose.model("Parent", parentSchema);