const mongoose = require("mongoose");
const { convertToIST } = require("../utils/helpers");

const attendanceSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Employee reference is required"],
      index: true,
    },
    date: {
      type: Date,
      required: [true, "Date is required"],
      default: Date.now,
    },
    // Multiple punch sessions for the day
    punchSessions: [
      {
        punchIn: {
          time: {
            type: Date,
            required: [true, "Punch in time is required"],
          },
          location: {
            type: String,
            trim: true,
          },
          ipAddress: {
            type: String,
            trim: true,
          },
          userAgent: {
            type: String,
            trim: true,
          },
        },
        punchOut: {
          time: {
            type: Date,
          },
          location: {
            type: String,
            trim: true,
          },
          ipAddress: {
            type: String,
            trim: true,
          },
          userAgent: {
            type: String,
            trim: true,
          },
        },
        sessionHours: {
          type: Number,
          min: 0,
          default: 0,
        },
      },
    ],
    totalHours: {
      type: Number,
      min: 0,
      default: 0,
    },
    status: {
      type: String,
      enum: [
        "present",
        "absent",
        "late",
        "half-day",
        "leave",
        "work-from-home",
        "on-duty",
        "sick-leave",
        "holiday",
        "login",
        "logout",
        "no-records",
        "penalty",
      ],
      default: "present",
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [500, "Notes cannot exceed 500 characters"],
    },
    isManualEntry: {
      type: Boolean,
      default: false,
    },
    manualEntryBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    manualEntryReason: {
      type: String,
      trim: true,
      maxlength: [500, "Manual entry reason cannot exceed 500 characters"],
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient queries
attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });

// Virtual for total sessions
attendanceSchema.virtual("totalSessions").get(function () {
  return this.punchSessions ? this.punchSessions.length : 0;
});

// Virtual for completed sessions
attendanceSchema.virtual("completedSessions").get(function () {
  if (!this.punchSessions) return 0;
  return this.punchSessions.filter(
    (session) => session.punchOut && session.punchOut.time
  ).length;
});

// Pre-save middleware to calculate total hours
attendanceSchema.pre("save", function (next) {
  this.calculateTotalHours();
  next();
});

// Instance method to calculate total hours
attendanceSchema.methods.calculateTotalHours = function () {
  if (!this.punchSessions || this.punchSessions.length === 0) {
    this.totalHours = 0;
    return;
  }

    let totalHours = 0;

  this.punchSessions.forEach((session) => {
    if (session.punchIn && session.punchIn.time && session.punchOut && session.punchOut.time) {
      const punchInTime = new Date(session.punchIn.time);
      const punchOutTime = new Date(session.punchOut.time);
      const duration = punchOutTime - punchInTime;
      const hours = duration / (1000 * 60 * 60);
      session.sessionHours = parseFloat(hours.toFixed(2));
        totalHours += session.sessionHours;
      }
    });

  this.totalHours = parseFloat(totalHours.toFixed(2));
};

// Instance method to calculate attendance status
attendanceSchema.methods.calculateAttendanceStatus = function () {
  try {
    const totalHours = this.totalHours || 0;

    if (totalHours < 4) {
      return "absent";
    } else if (totalHours >= 4 && totalHours < 8) {
      return "half-day";
    } else {
      return "present";
    }
  } catch (error) {
    return "absent";
  }
};

// Static method to find attendance by employee and date
attendanceSchema.statics.findByEmployeeAndDate = async function (employeeId, date) {
  try {
    if (!employeeId || !date) {
      throw new Error("Employee ID and date are required");
    }

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const attendance = await this.findOne({
      employee: employeeId,
      date: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
    });

    return attendance;
  } catch (error) {
    console.error('Error in findByEmployeeAndDate:', error);
    throw error;
  }
};

// Instance method to perform punch in
attendanceSchema.methods.performPunchIn = async function (punchInData) {
  try {
    if (!punchInData) {
      throw new Error("Punch in data is required");
    }

    const newSession = {
      punchIn: {
        time: punchInData.punchTime ? new Date(punchInData.punchTime) : new Date(), // Store in UTC
        location: punchInData.location || "",
        ipAddress: punchInData.ipAddress || "",
        userAgent: punchInData.userAgent || "",
      },
      sessionHours: 0,
    };

    this.punchSessions.push(newSession);
    this.calculateTotalHours();

    await this.save();
    return this;
  } catch (error) {
    console.error('Error in performPunchIn:', error);
    throw error;
  }
};

// Instance method to perform punch out
attendanceSchema.methods.performPunchOut = async function (punchOutData) {
  try {
    if (!punchOutData) {
      throw new Error("Punch out data is required");
    }

    const currentSession = this.getCurrentSession();
    if (!currentSession) {
      throw new Error("No active session to punch out from");
    }

    currentSession.punchOut = {
      time: punchOutData.punchTime ? new Date(punchOutData.punchTime) : new Date(), // Store in UTC
      location: punchOutData.location || "",
      ipAddress: punchOutData.ipAddress || "",
      userAgent: punchOutData.userAgent || "",
    };

    // Calculate session hours
    if (currentSession.punchIn && currentSession.punchIn.time) {
      const punchInTime = new Date(currentSession.punchIn.time);
      const punchOutTime = new Date(currentSession.punchOut.time);
      const duration = punchOutTime - punchInTime;
      const hours = duration / (1000 * 60 * 60);
      currentSession.sessionHours = parseFloat(hours.toFixed(2));
    }

    this.calculateTotalHours();

    await this.save();
    return this;
  } catch (error) {
    console.error('Error in performPunchOut:', error);
    throw error;
  }
};

// Instance method to get current active session
attendanceSchema.methods.getCurrentSession = function () {
  if (!this.punchSessions || this.punchSessions.length === 0) {
    return null;
  }

  const lastSession = this.punchSessions[this.punchSessions.length - 1];
  const hasPunchOut = lastSession.punchOut && lastSession.punchOut.time;

  if (hasPunchOut) {
    return null; // Session is completed
  }

  return lastSession; // Session is active
};

// Instance method to update last session
attendanceSchema.methods.updateLastSession = async function (updateData) {
  try {
    if (!this.punchSessions || this.punchSessions.length === 0) {
      throw new Error("No sessions to update");
    }

    const lastSession = this.punchSessions[this.punchSessions.length - 1];

    if (updateData.punchOut) {
      lastSession.punchOut = {
        time: updateData.punchOut.punchTime ? new Date(updateData.punchOut.punchTime) : new Date(), // Store in UTC
        location: updateData.punchOut.location || "",
        ipAddress: updateData.punchOut.ipAddress || "",
        userAgent: updateData.punchOut.userAgent || "",
      };

      // Calculate session hours
      if (lastSession.punchIn && lastSession.punchIn.time) {
        const punchInTime = new Date(lastSession.punchIn.time);
        const punchOutTime = new Date(lastSession.punchOut.time);
        const duration = punchOutTime - punchInTime;
        const hours = duration / (1000 * 60 * 60);
        lastSession.sessionHours = parseFloat(hours.toFixed(2));
      }
    }

    this.calculateTotalHours();

    await this.save();
    return this;
  } catch (error) {
    throw error;
  }
};

// Static method to get attendance statistics
attendanceSchema.statics.getAttendanceStats = async function (employeeId, startDate, endDate) {
  try {
    const attendanceRecords = await this.find({
      employee: employeeId,
      date: {
        $gte: startDate,
        $lte: endDate,
      },
    });

    const stats = {
      totalDays: attendanceRecords.length,
      present: 0,
      absent: 0,
      "half-day": 0,
      totalHours: 0,
    };

    attendanceRecords.forEach((record) => {
      stats.totalHours += record.totalHours || 0;

      switch (record.status) {
        case "present":
          stats.present++;
          break;
        case "absent":
          stats.absent++;
          break;
        case "half-day":
          stats["half-day"]++;
          break;
  }
    });

    return stats;
  } catch (error) {
    throw error;
  }
};

const Attendance = mongoose.model("Attendance", attendanceSchema);

module.exports = Attendance;
