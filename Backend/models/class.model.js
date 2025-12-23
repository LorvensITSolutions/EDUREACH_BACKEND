import mongoose from "mongoose";

const SubjectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  periodsPerWeek: { type: Number, required: true }
});

const ClassSchema = new mongoose.Schema({
  name: { type: String, required: true },       // e.g. "Grade 10"
  sections: [String],                           // e.g. ["A","B"]
  subjects: [SubjectSchema]
});

export default mongoose.model("Class", ClassSchema);
