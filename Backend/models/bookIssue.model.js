import mongoose from "mongoose";

const bookIssueSchema = new mongoose.Schema({
  borrowerId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: "borrowerModel",
  },
  borrowerModel: {
    type: String,
    enum: ["Student", "Teacher"],
    required: true,
  },
  book: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Book",
    required: true,
  },
  issueDate: {
    type: Date,
    default: Date.now,
  },
  dueDate: {
    type: Date,
    required: true,
  },
  returnDate: Date,
  status: {
    type: String,
    enum: ["borrowed", "returned"],
    default: "borrowed",
  },
}, { timestamps: true });

export default mongoose.model("BookIssue", bookIssueSchema);
