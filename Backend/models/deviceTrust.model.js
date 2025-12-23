import mongoose from "mongoose";

const deviceTrustSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  deviceToken: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  deviceFingerprint: {
    type: String,
    required: true,
  },
  deviceInfo: {
    browser: String,
    os: String,
    platform: String,
    userAgent: String,
  },
  ipAddress: {
    type: String,
    required: true,
  },
  location: {
    country: String,
    city: String,
  },
  lastUsed: {
    type: Date,
    default: Date.now,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expireAfterSeconds: 0 }, // Auto-delete expired documents
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

// Compound index for faster lookups
deviceTrustSchema.index({ userId: 1, deviceToken: 1 });
deviceTrustSchema.index({ userId: 1, isActive: 1 });

export default mongoose.model("DeviceTrust", deviceTrustSchema);

