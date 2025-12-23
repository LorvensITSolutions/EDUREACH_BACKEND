// models/user.model.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true, sparse: true }, // Optional, unique when present
  password: { type: String, required: true },
  role: { type: String, enum: ["admin", "teacher", "student", "parent","librarian"], required: true },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "Teacher" },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: "Parent" },
  mustChangePassword: { type: Boolean, default: false }, // 🔐 Important
  avatar: {
    public_id: String,
    url: String
  },
  // 2FA/MFA fields
  twoFactorSecret: { type: String, default: null }, // TOTP secret key
  twoFactorEnabled: { type: Boolean, default: false }, // Whether 2FA is enabled
  twoFactorVerified: { type: Boolean, default: false }, // Whether 2FA setup is verified
  tempTwoFactorSecret: { type: String, default: null }, // Temporary secret during setup
  email2FAEnabled: { type: Boolean, default: false }, // Email-based 2FA enabled
  sms2FAEnabled: { type: Boolean, default: false }, // SMS-based 2FA enabled
  phone: { type: String, default: null } // Phone number for SMS 2FA (E.164 format: +1234567890)
});

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

export default mongoose.model("User", userSchema);