import mongoose from "mongoose";

const teacherAttendanceSchema = new mongoose.Schema({
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Teacher",
    required: true
  },
  teacherId: {
    type: String,
    required: true
  },
  teacherName: {
    type: String,
    required: true
  },
  subject: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  status: {
    type: String,
    enum: ["present", "absent", "late", "half-day", "sick-leave", "personal-leave", "emergency-leave"],
    default: "present",
    required: true
  },
  reason: {
    type: String,
    default: ""
  },
  notes: {
    type: String,
    default: ""
  },
  markedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  markedByRole: {
    type: String,
    enum: ["admin", "teacher"],
    required: true
  },
  isModified: {
    type: Boolean,
    default: false
  },
  modifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  modifiedAt: {
    type: Date,
    default: null
  },
  modificationReason: {
    type: String,
    default: ""
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
teacherAttendanceSchema.index({ teacher: 1, date: 1 });
teacherAttendanceSchema.index({ date: 1 });
teacherAttendanceSchema.index({ status: 1 });
teacherAttendanceSchema.index({ teacherId: 1 });
teacherAttendanceSchema.index({ subject: 1 });

// Static method to get attendance summary for a teacher
teacherAttendanceSchema.statics.getAttendanceSummary = async function(teacherId, startDate, endDate) {
  const pipeline = [
    {
      $match: {
        teacher: new mongoose.Types.ObjectId(teacherId),
        date: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: null,
        totalDays: { $sum: 1 },
        presentDays: { $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] } },
        absentDays: { $sum: { $cond: [{ $eq: ["$status", "absent"] }, 1, 0] } },
        lateDays: { $sum: { $cond: [{ $eq: ["$status", "late"] }, 1, 0] } },
        halfDays: { $sum: { $cond: [{ $eq: ["$status", "half-day"] }, 1, 0] } },
        sickLeaveDays: { $sum: { $cond: [{ $eq: ["$status", "sick-leave"] }, 1, 0] } },
        personalLeaveDays: { $sum: { $cond: [{ $eq: ["$status", "personal-leave"] }, 1, 0] } },
        emergencyLeaveDays: { $sum: { $cond: [{ $eq: ["$status", "emergency-leave"] }, 1, 0] } }
      }
    }
  ];

  const result = await this.aggregate(pipeline);
  return result[0] || {
    totalDays: 0,
    presentDays: 0,
    absentDays: 0,
    lateDays: 0,
    halfDays: 0,
    sickLeaveDays: 0,
    personalLeaveDays: 0,
    emergencyLeaveDays: 0
  };
};

// Static method to get monthly attendance for all teachers
teacherAttendanceSchema.statics.getMonthlyAttendance = async function(year, month) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);

  // First, get all teachers with their user info
  const allTeachers = await mongoose.model('Teacher').aggregate([
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "userInfo"
      }
    },
    {
      $unwind: "$userInfo"
    },
    {
      $project: {
        _id: 1,
        teacherId: 1,
        teacherName: "$userInfo.name",
        teacherEmail: "$userInfo.email",
        subject: 1
      }
    }
  ]);

  // Then get attendance data for the month
  const attendanceData = await this.aggregate([
    {
      $match: {
        date: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: "$teacher",
        totalDays: { $sum: 1 },
        presentDays: { $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] } },
        absentDays: { $sum: { $cond: [{ $eq: ["$status", "absent"] }, 1, 0] } },
        lateDays: { $sum: { $cond: [{ $eq: ["$status", "late"] }, 1, 0] } },
        attendanceRecords: {
          $push: {
            date: "$date",
            status: "$status",
            reason: "$reason",
            notes: "$notes",
            isModified: "$isModified",
            modifiedAt: "$modifiedAt"
          }
        }
      }
    }
  ]);

  // Create a map of attendance data by teacher ID
  const attendanceMap = new Map();
  attendanceData.forEach(att => {
    attendanceMap.set(att._id.toString(), att);
  });

  // Combine all teachers with their attendance data
  const result = allTeachers.map(teacher => {
    const attendance = attendanceMap.get(teacher._id.toString());
    
    if (attendance) {
      // Teacher has attendance records
      return {
        _id: teacher._id,
        teacherId: teacher.teacherId,
        teacherName: teacher.teacherName,
        teacherEmail: teacher.teacherEmail,
        subject: teacher.subject,
        totalDays: attendance.totalDays,
        presentDays: attendance.presentDays,
        absentDays: attendance.absentDays,
        lateDays: attendance.lateDays,
        attendancePercentage: attendance.totalDays > 0 ? 
          Math.round((attendance.presentDays / attendance.totalDays) * 100 * 10) / 10 : 0,
        attendanceRecords: attendance.attendanceRecords
      };
    } else {
      // Teacher has no attendance records for this month
      return {
        _id: teacher._id,
        teacherId: teacher.teacherId,
        teacherName: teacher.teacherName,
        teacherEmail: teacher.teacherEmail,
        subject: teacher.subject,
        totalDays: 0,
        presentDays: 0,
        absentDays: 0,
        lateDays: 0,
        attendancePercentage: 0,
        attendanceRecords: []
      };
    }
  });

  // Sort by teacher name
  return result.sort((a, b) => a.teacherName.localeCompare(b.teacherName));
};

export default mongoose.model("TeacherAttendance", teacherAttendanceSchema);
