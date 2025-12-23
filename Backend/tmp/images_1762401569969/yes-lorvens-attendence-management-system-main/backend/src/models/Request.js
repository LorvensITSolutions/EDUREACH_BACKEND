const mongoose = require("mongoose");

const requestSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  type: {
    type: String,
    enum: ["leave", "od", "work_from_home", "sick_leave"],
    required: true,
  },
  startDate: {
    type: Date,
    required: true,
  },
  startTime: {
    type: String,
    required: true,
    validate: {
      validator: function (v) {
        // Validate time format (HH:MM:SS)
        return /^([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/.test(v);
      },
      message: "Start time must be in HH:MM:SS format",
    },
  },
  endDate: {
    type: Date,
    required: true,
  },
  endTime: {
    type: String,
    required: true,
    validate: {
      validator: function (v) {
        // Validate time format (HH:MM:SS)
        return /^([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/.test(v);
      },
      message: "End time must be in HH:MM:SS format",
    },
  },
  reason: {
    type: String,
    required: true,
    trim: true,
  },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending",
  },
  adminComments: {
    type: String,
    trim: true,
    default: "",
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  approvedAt: {
    type: Date,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update the updatedAt field before saving
requestSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

// Virtual for request type display name
requestSchema.virtual("typeDisplayName").get(function () {
  const typeNames = {
    leave: "Leave",
    od: "On Duty",
    work_from_home: "Work from Home",
    sick_leave: "Sick Leave",
  };
  return typeNames[this.type] || this.type;
});

// Virtual for status display name
requestSchema.virtual("statusDisplayName").get(function () {
  const statusNames = {
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected",
  };
  return statusNames[this.status] || this.status;
});

// Virtual for formatted time range
requestSchema.virtual("timeRange").get(function () {
  if (!this.startTime || !this.endTime) return "";

  const formatTime = (timeStr) => {
    const [hours, minutes] = timeStr.split(":");
    const hour = parseInt(hours);
    const displayHour = hour.toString().padStart(2, "0");
    return `${displayHour}:${minutes}`;
  };

  const startTimeFormatted = formatTime(this.startTime);
  const endTimeFormatted = formatTime(this.endTime);

  return `${startTimeFormatted} - ${endTimeFormatted}`;
});

// Virtual for full date-time range
requestSchema.virtual("dateTimeRange").get(function () {
  if (!this.startDate || !this.endDate || !this.startTime || !this.endTime)
    return "";

  const formatDate = (date) => {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (timeStr) => {
    const [hours, minutes] = timeStr.split(":");
    const hour = parseInt(hours);
    const displayHour = hour.toString().padStart(2, "0");
    return `${displayHour}:${minutes}`;
  };

  const startDateFormatted = formatDate(this.startDate);
  const endDateFormatted = formatDate(this.endDate);
  const startTimeFormatted = formatTime(this.startTime);
  const endTimeFormatted = formatTime(this.endTime);

  if (this.startDate.getTime() === this.endDate.getTime()) {
    return `${startDateFormatted} ${startTimeFormatted} - ${endTimeFormatted}`;
  } else {
    return `${startDateFormatted} ${startTimeFormatted} - ${endDateFormatted} ${endTimeFormatted}`;
  }
});

// Index for better query performance
requestSchema.index({ employeeId: 1, createdAt: -1 });
requestSchema.index({ status: 1, createdAt: -1 });
requestSchema.index({ type: 1, status: 1 });

// Enable virtuals
requestSchema.set("toJSON", { virtuals: true });
requestSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Request", requestSchema);
