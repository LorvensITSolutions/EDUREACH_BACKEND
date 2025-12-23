import mongoose from "mongoose";

const bookRequestSchema = new mongoose.Schema({
  requesterId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: "requesterModel",
  },
  requesterModel: {
    type: String,
    enum: ["Student", "Teacher"],
    required: true,
  },
  book: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Book",
    required: true,
  },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending",
  },
}, { timestamps: true });

export default mongoose.model("BookRequest", bookRequestSchema);
