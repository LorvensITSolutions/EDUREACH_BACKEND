import TeacherAttendance from "../models/TeacherAttendance.js";
import Teacher from "../models/teacher.model.js";
import User from "../models/user.model.js";

// ===========================================
// ADMIN FUNCTIONS (Manage All Teachers' Attendance)
// ===========================================

// Mark teacher attendance (admin only) - handles both single and bulk like student attendance
export const markTeacherAttendance = async (req, res) => {
  try {
    const { attendanceData } = req.body;
    const records = [];
    const skippedTeachers = [];

    const groupedByDate = {}; // Prevent querying DB repeatedly for same teacher/date combo

    for (let record of attendanceData) {
      const { teacherId, status, reason, date } = record;
      // Parse date and store at UTC noon to avoid timezone issues
      // When date is "2025-11-08", store it as 2025-11-08 12:00:00 UTC
      // This ensures the date is always stored as the correct calendar day regardless of timezone
      let dateToStore, dayStart, dayEnd;
      if (date) {
        // Parse YYYY-MM-DD format and create UTC date at noon (12:00:00 UTC)
        const [year, month, day] = date.split('-').map(Number);
        // Create date at UTC noon to ensure correct calendar day storage
        dateToStore = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
        // For querying, use UTC start and end of day
        dayStart = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
        dayEnd = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
        console.log("📅 Parsed date string:", date, "Storing as UTC:", dateToStore.toISOString(), "Query range:", dayStart.toISOString(), "to", dayEnd.toISOString());
      } else {
        // Use today's date at UTC noon
        const today = new Date();
        const year = today.getUTCFullYear();
        const month = today.getUTCMonth();
        const day = today.getUTCDate();
        dateToStore = new Date(Date.UTC(year, month, day, 12, 0, 0, 0));
        dayStart = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
        dayEnd = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
      }
      const key = `${teacherId}-${dateToStore.toISOString()}`;

      if (groupedByDate[key]) {
        skippedTeachers.push(teacherId); // already processed in this request
        continue;
      }

      const existing = await TeacherAttendance.findOne({
        teacher: teacherId,
        date: { $gte: dayStart, $lte: dayEnd },
      });

      if (existing) {
        // Update existing attendance record
        existing.status = status;
        existing.reason = reason || "";
        existing.updatedAt = new Date();
        await existing.save();
        records.push(existing);
        continue;
      }

      const teacher = await Teacher.findById(teacherId).populate('userId', 'name email');
      if (!teacher) {
        console.warn(`Skipping teacher ${teacherId} — teacher not found`);
        continue;
      }

      // Use teacher._id as teacherId if teacher.teacherId is not available
      const teacherIdString = teacher.teacherId || teacher._id.toString();

      const newAttendance = await TeacherAttendance.create({
        teacher: teacher._id,
        teacherId: teacherIdString,
        teacherName: teacher.userId?.name || teacher.name || 'Unknown Teacher',
        subject: teacher.subject || 'N/A',
        status,
        reason: status === 'absent' ? reason : '',
        date: dateToStore, // Store at UTC noon to ensure correct calendar day
        markedBy: req.user._id,
        markedByRole: req.user.role
      });

      records.push(newAttendance);
      groupedByDate[key] = true;
    }

    // Calculate summary statistics for the submitted date
    let summaryDayStart, summaryDayEnd;
    if (attendanceData[0]?.date) {
      // Parse YYYY-MM-DD format and use UTC for querying
      const [year, month, day] = attendanceData[0].date.split('-').map(Number);
      summaryDayStart = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
      summaryDayEnd = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
    } else {
      const today = new Date();
      const year = today.getUTCFullYear();
      const month = today.getUTCMonth();
      const day = today.getUTCDate();
      summaryDayStart = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
      summaryDayEnd = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
    }

    // Get all attendance records for this date
    const allAttendanceForDate = await TeacherAttendance.find({
      date: { $gte: summaryDayStart, $lte: summaryDayEnd }
    });

    // Calculate summary
    const summary = {
      total: allAttendanceForDate.length,
      present: allAttendanceForDate.filter(record => record.status === 'present').length,
      absent: allAttendanceForDate.filter(record => record.status === 'absent').length,
      late: allAttendanceForDate.filter(record => record.status === 'late').length,
      halfDay: allAttendanceForDate.filter(record => record.status === 'half-day').length,
      date: attendanceData[0]?.date || summaryDayStart.toISOString().split('T')[0]
    };

    res.status(200).json({
      message: records.length > 0 ? "Attendance updated successfully" : "No changes made",
      count: records.length,
      skippedTeachers,
      summary
    });
  } catch (error) {
    console.error("Error marking teacher attendance:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get all teachers' attendance (admin only)
export const getAllTeachersAttendance = async (req, res) => {
  try {
    const { startDate, endDate, teacherId, status, subject, page = 1, limit = 30 } = req.query;
    console.log("getAllTeachersAttendance query params:", { startDate, endDate, teacherId, status, subject, page, limit });

    const query = {};
    
    if (startDate && endDate) {
      // Create proper date range using UTC to match stored dates
      // Dates are stored at UTC noon, so query using UTC start/end of day
      const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
      const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
      const start = new Date(Date.UTC(startYear, startMonth - 1, startDay, 0, 0, 0, 0));
      const end = new Date(Date.UTC(endYear, endMonth - 1, endDay, 23, 59, 59, 999));
      
      query.date = {
        $gte: start,
        $lte: end
      };
      console.log("📅 Date query - Parsed startDate:", startDate, "UTC:", start.toISOString());
      console.log("📅 Date query - Parsed endDate:", endDate, "UTC:", end.toISOString());
      console.log("Date query range:", query.date);
    }

    if (teacherId) {
      query.teacher = teacherId;
    }

    if (status) {
      query.status = status;
    }

    if (subject) {
      query.subject = subject;
    }

    const attendance = await TeacherAttendance.find(query)
      .populate([
        { path: "teacher", populate: { path: "userId", select: "name email" } },
        { path: "markedBy", select: "name email role" },
        { path: "modifiedBy", select: "name email role" }
      ])
      .sort({ date: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    console.log("Found attendance records:", attendance.length);
    console.log("Attendance records:", attendance);

    const total = await TeacherAttendance.countDocuments(query);

    res.status(200).json({
      success: true,
      data: attendance,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });

  } catch (error) {
    console.error("Error fetching all teachers attendance:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
  }
};

// Update teacher attendance (admin only)
export const updateTeacherAttendance = async (req, res) => {
  try {
    console.log("Update attendance request received:", req.body);
    console.log("Attendance ID:", req.params.attendanceId);
    
    const { attendanceId } = req.params;
    const { status, reason, notes, modificationReason } = req.body;

    const attendance = await TeacherAttendance.findById(attendanceId);
    if (!attendance) {
      return res.status(404).json({ success: false, message: "Attendance record not found" });
    }

    console.log("Found attendance record:", attendance);

    // Store original values for audit
    const originalStatus = attendance.status;
    const originalReason = attendance.reason;

    // Update fields
    if (status) attendance.status = status;
    if (reason !== undefined) attendance.reason = reason;
    if (notes !== undefined) attendance.notes = notes;
    
    // Mark as modified
    attendance.isModified = true;
    attendance.modifiedBy = req.user._id;
    attendance.modifiedAt = new Date();
    attendance.modificationReason = modificationReason || `Status changed from ${originalStatus} to ${status || originalStatus}`;

    console.log("About to save attendance:", attendance);
    await attendance.save();

    // Populate teacher and user info
    await attendance.populate([
      { path: "teacher", populate: { path: "userId", select: "name email" } },
      { path: "markedBy", select: "name email role" },
      { path: "modifiedBy", select: "name email role" }
    ]);

    res.status(200).json({
      success: true,
      message: "Attendance updated successfully",
      data: attendance
    });

  } catch (error) {
    console.error("Error updating teacher attendance:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
  }
};

// Delete teacher attendance (admin only)
export const deleteTeacherAttendance = async (req, res) => {
  try {
    const { attendanceId } = req.params;

    const attendance = await TeacherAttendance.findById(attendanceId);
    if (!attendance) {
      return res.status(404).json({ success: false, message: "Attendance record not found" });
    }

    await TeacherAttendance.findByIdAndDelete(attendanceId);

    res.status(200).json({
      success: true,
      message: "Attendance record deleted successfully"
    });

  } catch (error) {
    console.error("Error deleting teacher attendance:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
  }
};


// Get teachers without attendance for a specific date (admin only)
export const getTeachersWithoutAttendance = async (req, res) => {
  try {
    const { date } = req.query;
    let targetDate, nextDay;
    if (date) {
      // Parse YYYY-MM-DD format and use UTC
      const [year, month, day] = date.split('-').map(Number);
      targetDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
      nextDay = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0));
    } else {
      const today = new Date();
      const year = today.getUTCFullYear();
      const month = today.getUTCMonth();
      const day = today.getUTCDate();
      targetDate = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
      nextDay = new Date(Date.UTC(year, month, day + 1, 0, 0, 0, 0));
    }

    // Get all teachers
    const allTeachers = await Teacher.find()
      .populate("userId", "name email")
      .select("_id teacherId userId subject");

    // Get teachers who have attendance for the target date
    const teachersWithAttendance = await TeacherAttendance.find({
      date: { $gte: targetDate, $lt: nextDay }
    }).select("teacher");

    const teachersWithAttendanceIds = teachersWithAttendance.map(record => record.teacher.toString());

    // Find teachers without attendance
    const teachersWithoutAttendance = allTeachers.filter(teacher => 
      !teachersWithAttendanceIds.includes(teacher._id.toString())
    );

    res.status(200).json({
      success: true,
      data: teachersWithoutAttendance,
      count: teachersWithoutAttendance.length,
      date: targetDate.toISOString().split('T')[0]
    });

  } catch (error) {
    console.error("Error fetching teachers without attendance:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
  }
};

// Get monthly attendance report for all teachers (admin only)
export const getMonthlyAttendanceReport = async (req, res) => {
  try {
    const { year, month } = req.query;
    
    const currentYear = year ? parseInt(year) : new Date().getFullYear();
    const currentMonth = month ? parseInt(month) : new Date().getMonth() + 1;

    const report = await TeacherAttendance.getMonthlyAttendance(currentYear, currentMonth);

    res.status(200).json({
      success: true,
      data: report,
      period: {
        year: currentYear,
        month: currentMonth,
        monthName: new Date(currentYear, currentMonth - 1).toLocaleString('default', { month: 'long' })
      }
    });

  } catch (error) {
    console.error("Error fetching monthly attendance report:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
  }
};

// Get daily teacher attendance summary (admin only)
export const getDailyTeacherAttendanceSummary = async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ message: "Date is required" });
    }

    // Parse YYYY-MM-DD format and use UTC for querying
    // Dates are stored at UTC noon, so query using UTC start/end of day
    const [year, month, day] = date.split('-').map(Number);
    const dayStart = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    const dayEnd = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
    console.log("📅 Daily summary - Parsed date string:", date, "Query UTC range:", dayStart.toISOString(), "to", dayEnd.toISOString());

    // Get all teachers
    const allTeachers = await Teacher.find();
    const totalTeachers = allTeachers.length;

    // Get attendance records for the specific date
    const attendanceRecords = await TeacherAttendance.find({
      date: { $gte: dayStart, $lte: dayEnd }
    });

    // Calculate summary statistics
    const presents = attendanceRecords.filter(record => record.status === 'present').length;
    const absents = attendanceRecords.filter(record => record.status === 'absent').length;
    const late = attendanceRecords.filter(record => record.status === 'late').length;
    const halfDay = attendanceRecords.filter(record => record.status === 'half-day').length;
    
    // Calculate attendance percentage based on total teachers
    const attendancePercentage = totalTeachers > 0 
      ? Math.round((presents / totalTeachers) * 100)
      : 0;

    res.status(200).json({
      totalTeachers,
      presents,
      absents,
      late,
      halfDay,
      attendancePercentage,
      date: date // Use the original date string from query parameter
    });

  } catch (error) {
    console.error("Error fetching daily teacher attendance summary:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get attendance summary for admin dashboard
export const getAttendanceSummary = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const today = new Date();
    const year = today.getUTCFullYear();
    const month = today.getUTCMonth();
    const day = today.getUTCDate();
    const todayStart = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    
    let start, end;
    if (startDate) {
      const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
      start = new Date(Date.UTC(startYear, startMonth - 1, startDay, 0, 0, 0, 0));
    } else {
      // Last 30 days from today
      start = new Date(Date.UTC(year, month, day - 30, 0, 0, 0, 0));
    }
    
    if (endDate) {
      const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
      end = new Date(Date.UTC(endYear, endMonth - 1, endDay, 23, 59, 59, 999));
    } else {
      end = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
    }

    const summary = await TeacherAttendance.aggregate([
      {
        $match: {
          date: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: null,
          totalRecords: { $sum: 1 },
          presentRecords: { $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] } },
          absentRecords: { $sum: { $cond: [{ $eq: ["$status", "absent"] }, 1, 0] } },
          lateRecords: { $sum: { $cond: [{ $eq: ["$status", "late"] }, 1, 0] } },
          halfDayRecords: { $sum: { $cond: [{ $eq: ["$status", "half-day"] }, 1, 0] } },
          modifiedRecords: { $sum: { $cond: ["$isModified", 1, 0] } }
        }
      }
    ]);

    const result = summary[0] || {
      totalRecords: 0,
      presentRecords: 0,
      absentRecords: 0,
      lateRecords: 0,
      halfDayRecords: 0,
      modifiedRecords: 0
    };

    // Calculate percentages
    const attendancePercentage = result.totalRecords > 0 ? 
      Math.round((result.presentRecords / result.totalRecords) * 100 * 10) / 10 : 0;

    res.status(200).json({
      success: true,
      data: {
        ...result,
        attendancePercentage,
        period: {
          start: start.toISOString().split('T')[0],
          end: end.toISOString().split('T')[0]
        }
      }
    });

  } catch (error) {
    console.error("Error fetching attendance summary:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
  }
};

// ===========================================
// TEACHER FUNCTIONS (View Own Attendance)
// ===========================================

// Get teacher's own attendance history
export const getTeacherAttendanceHistory = async (req, res) => {
  try {
    const userId = req.user._id;
    const { startDate, endDate, page = 1, limit = 30 } = req.query;

    // Find teacher by user ID
      const teacher = await Teacher.findOne({ userId: userId });
      if (!teacher) {
        return res.status(404).json({ success: false, message: "Teacher not found" });
      }

    const query = { teacher: teacher._id };
    
    if (startDate && endDate) {
      // Parse YYYY-MM-DD format and use UTC for querying
      const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
      const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
      query.date = {
        $gte: new Date(Date.UTC(startYear, startMonth - 1, startDay, 0, 0, 0, 0)),
        $lte: new Date(Date.UTC(endYear, endMonth - 1, endDay, 23, 59, 59, 999))
      };
    }

    const attendance = await TeacherAttendance.find(query)
      .populate("markedBy", "name email role")
      .populate("modifiedBy", "name email role")
      .sort({ date: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await TeacherAttendance.countDocuments(query);

    res.status(200).json({
      success: true,
      data: attendance,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });

  } catch (error) {
    console.error("Error fetching teacher attendance history:", error);
    res.status(500).json({ 
        success: false, 
      message: "Server error", 
      error: error.message 
    });
  }
};

// Get teacher's own attendance summary
export const getTeacherAttendanceSummary = async (req, res) => {
  try {
    const { month, year, startDate, endDate } = req.query;
    const userId = req.user._id;

    // Find teacher by user ID
    const teacher = await Teacher.findOne({ userId: userId });
    if (!teacher) {
      return res.status(404).json({ success: false, message: "Teacher not found" });
    }

    let start, end;

    // Handle month/year parameters
    if (month && year) {
      const monthNum = parseInt(month);
      const yearNum = parseInt(year);
      start = new Date(Date.UTC(yearNum, monthNum - 1, 1, 0, 0, 0, 0));
      end = new Date(Date.UTC(yearNum, monthNum, 1, 0, 0, 0, 0)); // First day of next month
    } else {
      // Handle startDate/endDate parameters
      if (startDate) {
        const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
        start = new Date(Date.UTC(startYear, startMonth - 1, startDay, 0, 0, 0, 0));
      } else {
        // Default to last month
        const today = new Date();
        const year = today.getUTCFullYear();
        const month = today.getUTCMonth();
        start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
      }
      
      if (endDate) {
        const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
        end = new Date(Date.UTC(endYear, endMonth - 1, endDay, 23, 59, 59, 999));
      } else {
        const today = new Date();
        const year = today.getUTCFullYear();
        const month = today.getUTCMonth();
        const day = today.getUTCDate();
        end = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
      }
    }

    // Get attendance records
    const attendance = await TeacherAttendance.find({
      teacher: teacher._id,
      date: { $gte: start, $lt: end },
    });

    // Format result
    let presents = 0;
    let absents = 0;
    let late = 0;
    let halfDay = 0;
    const dailyStatus = {};

    attendance.forEach((rec) => {
      const dateKey = rec.date.toISOString().slice(0, 10);
      dailyStatus[dateKey] = {
        status: rec.status,
        reason: rec.reason,
        notes: rec.notes,
        isModified: rec.isModified,
        modifiedAt: rec.modifiedAt
      };
      
      if (rec.status === "present") presents++;
      else if (rec.status === "absent") absents++;
      else if (rec.status === "late") late++;
      else if (rec.status === "half-day") halfDay++;
    });

    const totalDays = presents + absents + late + halfDay;
    const attendancePercentage = totalDays > 0 ? ((presents / totalDays) * 100).toFixed(1) + "%" : "0%";

    // Return data in the format expected by the frontend
    const responseData = {
      month: month || new Date().getMonth() + 1,
      year: year || new Date().getFullYear(),
      totalDays,
      presents,
      absents,
      late,
      halfDay,
      attendancePercentage,
      dailyStatus
    };

    res.status(200).json(responseData);

  } catch (error) {
    console.error("Error fetching teacher attendance summary:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
  }
};

// Get today's attendance status for a teacher
export const getTodayAttendanceStatus = async (req, res) => {
  try {
    const userId = req.user._id;

    // Find teacher by user ID
      const teacher = await Teacher.findOne({ userId: userId });
      if (!teacher) {
        return res.status(404).json({ success: false, message: "Teacher not found" });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const attendance = await TeacherAttendance.findOne({
      teacher: teacher._id,
      date: { $gte: today, $lt: tomorrow }
    }).populate([
      { path: "teacher", populate: { path: "userId", select: "name email" } },
      { path: "markedBy", select: "name email role" },
      { path: "modifiedBy", select: "name email role" }
    ]);

    res.status(200).json({
      success: true,
      data: attendance || null
    });

  } catch (error) {
    console.error("Error fetching today's attendance status:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
  }
};

// ===========================================
// UTILITY FUNCTIONS
// ===========================================

// Get attendance statistics for dashboard
export const getAttendanceStatistics = async (req, res) => {
  try {
    const today = new Date();
    const todayStart = new Date(today.setHours(0, 0, 0, 0));
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);

    const [
      todayAttendance,
      monthlyAttendance,
      totalTeachers,
      attendanceTrends
    ] = await Promise.all([
      // Today's attendance
      TeacherAttendance.aggregate([
        {
          $match: {
            date: { $gte: todayStart }
          }
        },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 }
          }
        }
      ]),
      
      // This month's attendance
      TeacherAttendance.aggregate([
        {
          $match: {
            date: { $gte: thisMonth }
          }
        },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 }
          }
        }
      ]),
      
      // Total teachers count
      Teacher.countDocuments(),
      
      // Attendance trends (last 7 days)
      TeacherAttendance.aggregate([
        {
          $match: {
            date: { $gte: new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000) }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$date" }
            },
            present: { $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] } },
            absent: { $sum: { $cond: [{ $eq: ["$status", "absent"] }, 1, 0] } },
            late: { $sum: { $cond: [{ $eq: ["$status", "late"] }, 1, 0] } },
            total: { $sum: 1 }
          }
        },
        { $sort: { "_id": 1 } }
      ])
    ]);

    // Process today's attendance
    const todayStats = {
      present: 0,
      absent: 0,
      late: 0,
      total: 0
    };
    
    todayAttendance.forEach(stat => {
      todayStats[stat._id] = stat.count;
      todayStats.total += stat.count;
    });

    // Process monthly attendance
    const monthlyStats = {
      present: 0,
      absent: 0,
      late: 0,
      total: 0
    };
    
    monthlyAttendance.forEach(stat => {
      monthlyStats[stat._id] = stat.count;
      monthlyStats.total += stat.count;
    });

    res.status(200).json({
      success: true,
      data: {
        today: {
          ...todayStats,
          percentage: todayStats.total > 0 ? Math.round((todayStats.present / todayStats.total) * 100) : 0
        },
        monthly: {
          ...monthlyStats,
          percentage: monthlyStats.total > 0 ? Math.round((monthlyStats.present / monthlyStats.total) * 100) : 0
        },
        totalTeachers,
        trends: attendanceTrends
      }
    });

  } catch (error) {
    console.error("Error fetching attendance statistics:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
  }
};
