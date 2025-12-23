import mongoose from "mongoose";

const SubjectSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  code: { type: String },
  description: { type: String }
});

export const SubjectModel = mongoose.model("Subject", SubjectSchema);