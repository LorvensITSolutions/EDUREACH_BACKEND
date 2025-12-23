import mongoose from "mongoose";

const feePaymentSchema = new mongoose.Schema(
  {
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Parent",
      required: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    feeStructure: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FeeStructure", // or "CustomFee"
    },
    academicYear: {
      type: String,
      required: true,
    },
    amountPaid: {
      type: Number,
      required: true,
    },
    lateFee: {
      type: Number,
      default: 0,
    },
    dueDate: {
      type: Date,
    },
    frequency: {
      type: String,
      enum: ["monthly", "quarterly", "annually"],
    },
    notes: {
      type: String,
    },
    razorpay: {
      orderId: String,
      paymentId: String,
      signature: String,
    },
    status: {
      type: String,
      enum: ["paid", "success", "failed", "pending", "pending_verification"], // ✅ Add pending_verification
      default: "pending",
    },
    paidAt: {
      type: Date,
      default: Date.now,
    },
    receiptUrl: {
      type: String, // Cloudinary URL of receipt PDF
    },

    // ✅ NEW FIELDS for offline payments
    paymentMethod: {
      type: String,
      enum: ["online", "cash", "cheque", "bank_transfer"],
      default: "online",
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // Admin who verified the payment
    },
    verifiedAt: {
      type: Date,
    },

    // ✅ NEW FIELDS for fee tracking
    totalPaidSoFar: {
      type: Number,
      default: 0,
    },
    remainingAmount: {
      type: Number,
      default: 0,
    },
    percentPaid: {
      type: Number, // value like 84.57
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.models.FeePayment || mongoose.model("FeePayment", feePaymentSchema);


// import mongoose from "mongoose";

// const feePaymentSchema = new mongoose.Schema({
//   parent: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "Parent",
//     required: true,
//   },
//   student: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "Student",
//     required: true,
//   },
//   feeStructure: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "FeeStructure",
//   },
//   academicYear: {
//     type: String,
//     required: true,
//   },
//   amountPaid: {
//     type: Number,
//     required: true,
//   },
//   razorpay: {
//     orderId: String,
//     paymentId: String,
//     signature: String,
//   },
// status: {
//   type: String,
//   enum: ["paid", "success", "failed", "pending"],
//   default: "pending",
// },
//   paidAt: {
//     type: Date,
//     default: Date.now,
//   },
//    receiptUrl: {
//       type: String, // ✅ Add this to store Cloudinary receipt URL
//     },
// }, {
//   timestamps: true,
// });

// export default mongoose.model("FeePayment", feePaymentSchema);
