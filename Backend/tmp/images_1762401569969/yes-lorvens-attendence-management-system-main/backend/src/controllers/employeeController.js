const Attendance = require("../models/Attendance");
const User = require("../models/User");
const AttendanceStatusService = require("../services/attendanceStatusService");
const moment = require("moment");
const {
  sendSuccessResponse,
  sendErrorResponse,
  calculatePagination,
} = require("../utils/responseHelpers");
const { convertToIST, getCurrentDate } = require("../utils/helpers");

// @desc    Punch in
// @route   POST /api/employee/punch-in
// @access  Private (Employee)
const punchIn = async (req, res) => {
  try {
    const today = getCurrentDate();

    // 1. Check leave
    const approvedLeave = await AttendanceStatusService.checkLeaveRequestStatus(
      req.user._id,
      today
    );
    if (approvedLeave) {
      return sendErrorResponse(
        res,
        `Cannot punch in. You have approved ${approvedLeave} for today.`,
        400
      );
    }

    // 2. Ensure attendance record exists (atomic)
    const filter = { employee: req.user._id, date: today };
    await Attendance.updateOne(
      filter,
      {
        $setOnInsert: {
          employee: req.user._id,
          date: today,
          punchSessions: [],
          status: "present",
          totalHours: 0,
        },
      },
      { upsert: true }
    );

    const attendance = await Attendance.findOne(filter);

    // 3. Prevent multiple punch-ins without punch-out
    const currentSession = attendance.getCurrentSession();
    if (currentSession) {
      return sendErrorResponse(
        res,
        "You have an active session. Please punch out first.",
        400
      );
    }

    // 4. Add punch-in session in UTC
    await attendance.performPunchIn({
      location: req.body.location || "",
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get("User-Agent"),
      punchTime: new Date(), // Always UTC
    });

    const newCurrentSession = attendance.getCurrentSession();

    return sendSuccessResponse(
      res,
      {
        attendance: {
          id: attendance._id,
          currentSession: newCurrentSession,
          totalSessions: attendance.totalSessions,
          totalHours: attendance.totalHours,
          date: attendance.date,
        },
      },
      "Punched in successfully",
      201
    );
  } catch (error) {
    console.error("Punch in error:", error);
    return sendErrorResponse(res, "Failed to punch in. Please try again.");
  }
};

// @desc    Punch out
// @route   POST /api/employee/punch-out
// @access  Private (Employee)
const punchOut = async (req, res) => {
  try {
    const today = getCurrentDate();

    // Check if employee has approved leave for today
    const approvedLeave = await AttendanceStatusService.checkLeaveRequestStatus(
      req.user._id,
      today
    );
    if (approvedLeave) {
      return sendErrorResponse(
        res,
        `Cannot punch out. You have approved ${approvedLeave} for today.`,
        400
      );
    }

    const attendance = await Attendance.findByEmployeeAndDate(
      req.user._id,
      today
    );

    if (!attendance) {
      return sendErrorResponse(res, "You have not punched in today", 400);
    }

    const currentSession = attendance.getCurrentSession();
    if (!currentSession) {
      return sendErrorResponse(
        res,
        "You have no active session to punch out from",
        400
      );
    }

    await attendance.performPunchOut({
      location: req.body.location || "",
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get("User-Agent"),
      punchTime: new Date(), // Pass UTC time
    });

    return sendSuccessResponse(
      res,
      {
        attendance: {
          id: attendance._id,
          totalSessions: attendance.totalSessions,
          completedSessions: attendance.completedSessions,
          totalHours: attendance.totalHours,
          date: attendance.date,
        },
      },
      "Punched out successfully"
    );
  } catch (error) {
    console.error("Punch out error:", error);
    return sendErrorResponse(res, "Failed to punch out. Please try again.");
  }
};

// @desc    Get today's attendance status
// @route   GET /api/employee/today
// @access  Private (Employee)
const getTodayStatus = async (req, res) => {
  try {
    const today = getCurrentDate();

    // Check if work day is completed (after 11:30 PM IST)
    const currentTime = moment().utcOffset("+05:30");
    const currentHour = currentTime.hour();
    const currentMinute = currentTime.minute();
    const isWorkDayCompleted =
      currentHour >= 23 || (currentHour === 23 && currentMinute >= 30);

    const attendance = await Attendance.findByEmployeeAndDate(
      req.user._id,
      today
    );

    let updatedAttendance;
    try {
      updatedAttendance = await AttendanceStatusService.updateAttendanceStatus(
        req.user._id,
        today
      );
    } catch (statusError) {
      console.error("Error updating attendance status:", statusError);
      // If status update fails, use the original attendance record
      updatedAttendance = attendance;
    }

    // Check for approved and rejected requests first
    const approvedRequestStatus =
      await AttendanceStatusService.checkRequestStatus(req.user._id, today);
    const rejectedRequestType =
      await AttendanceStatusService.checkRejectedRequestStatus(
        req.user._id,
        today
      );

    // Determine the display status based on work day completion and request status
    let displayStatus = "not-started";
    let statusLabel = "Not Started";

    if (approvedRequestStatus) {
      // If there's an approved request, show the request status
      displayStatus = approvedRequestStatus;
      switch (approvedRequestStatus) {
        case "leave":
          statusLabel = "Leave";
          break;
        case "work-from-home":
          statusLabel = "Work From Home";
          break;
        case "on-duty":
          statusLabel = "On Duty";
          break;
        case "sick-leave":
          statusLabel = "Sick Leave";
          break;
        default:
          statusLabel = approvedRequestStatus;
      }
    } else if (rejectedRequestType) {
      // If there's a rejected request, show as absent
      displayStatus = "absent";
      statusLabel = "Absent";
    } else if (
      updatedAttendance &&
      updatedAttendance.punchSessions &&
      updatedAttendance.punchSessions.length > 0
    ) {
      // Normal attendance logic
      if (isWorkDayCompleted) {
        // After work day completion, show final status based on total hours
        const totalHours = updatedAttendance.totalHours || 0;

        if (totalHours > 7.5) {
          displayStatus = "present";
          statusLabel = "Present";
        } else if (totalHours >= 4 && totalHours <= 7.5) {
          displayStatus = "half-day";
          statusLabel = "Half Day";
        } else {
          displayStatus = "absent";
          statusLabel = "Absent";
        }
      } else {
        // During work day, show working status
        const lastSession =
          updatedAttendance.punchSessions[
            updatedAttendance.punchSessions.length - 1
          ];
        if (
          lastSession.punchIn &&
          lastSession.punchIn.time &&
          lastSession.punchOut &&
          lastSession.punchOut.time
        ) {
          displayStatus = "completed";
          statusLabel = "Completed";
        } else if (
          lastSession.punchIn &&
          lastSession.punchIn.time &&
          !lastSession.punchOut?.time
        ) {
          displayStatus = "punched-in";
          statusLabel = "Punched In";
        } else {
          displayStatus = "not-started";
          statusLabel = "Not Started";
        }
      }
    } else {
      // No attendance record or no punch sessions
      if (isWorkDayCompleted) {
        displayStatus = "absent";
        statusLabel = "Absent";
      } else {
        displayStatus = "not-started";
        statusLabel = "Not Started";
      }
    }

    const status = {
      hasAttendance: !!(
        updatedAttendance &&
        updatedAttendance.punchSessions &&
        updatedAttendance.punchSessions.length > 0
      ),
      totalSessions: updatedAttendance?.totalSessions || 0,
      completedSessions: updatedAttendance?.completedSessions || 0,
      totalHours: updatedAttendance?.totalHours || 0,
      canPunchIn: true,
      canPunchOut: false,
      currentSession: null,
      punchSessions: updatedAttendance?.punchSessions || [],
      currentStatus: displayStatus,
      statusDisplay: {
        label: statusLabel,
        color:
          displayStatus === "present"
            ? "green"
            : displayStatus === "half-day"
            ? "orange"
            : displayStatus === "absent"
            ? "red"
            : displayStatus === "completed"
            ? "green"
            : displayStatus === "punched-in"
            ? "blue"
            : displayStatus === "leave"
            ? "purple"
            : displayStatus === "work-from-home"
            ? "indigo"
            : displayStatus === "on-duty"
            ? "teal"
            : displayStatus === "sick-leave"
            ? "pink"
            : "gray",
        bgColor:
          displayStatus === "present"
            ? "bg-green-100"
            : displayStatus === "half-day"
            ? "bg-orange-100"
            : displayStatus === "absent"
            ? "bg-red-100"
            : displayStatus === "completed"
            ? "bg-green-100"
            : displayStatus === "punched-in"
            ? "bg-blue-100"
            : displayStatus === "leave"
            ? "bg-purple-100"
            : displayStatus === "work-from-home"
            ? "bg-indigo-100"
            : displayStatus === "on-duty"
            ? "bg-teal-100"
            : displayStatus === "sick-leave"
            ? "bg-pink-100"
            : "bg-gray-100",
        textColor:
          displayStatus === "present"
            ? "text-green-800"
            : displayStatus === "half-day"
            ? "text-orange-800"
            : displayStatus === "absent"
            ? "text-red-800"
            : displayStatus === "completed"
            ? "text-green-800"
            : displayStatus === "punched-in"
            ? "text-blue-800"
            : displayStatus === "leave"
            ? "text-purple-800"
            : displayStatus === "work-from-home"
            ? "text-indigo-800"
            : displayStatus === "on-duty"
            ? "text-teal-800"
            : displayStatus === "sick-leave"
            ? "text-pink-800"
            : "text-gray-800",
        darkBgColor:
          displayStatus === "present"
            ? "dark:bg-green-900/30"
            : displayStatus === "half-day"
            ? "dark:bg-orange-900/30"
            : displayStatus === "absent"
            ? "dark:bg-red-900/30"
            : displayStatus === "completed"
            ? "dark:bg-green-900/30"
            : displayStatus === "punched-in"
            ? "dark:bg-blue-900/30"
            : displayStatus === "leave"
            ? "dark:bg-purple-900/30"
            : displayStatus === "work-from-home"
            ? "dark:bg-indigo-900/30"
            : displayStatus === "on-duty"
            ? "dark:bg-teal-900/30"
            : displayStatus === "sick-leave"
            ? "dark:bg-pink-900/30"
            : "dark:bg-gray-900/30",
        darkTextColor:
          displayStatus === "present"
            ? "dark:text-green-300"
            : displayStatus === "half-day"
            ? "dark:text-orange-300"
            : displayStatus === "absent"
            ? "dark:text-red-300"
            : displayStatus === "completed"
            ? "dark:text-green-300"
            : displayStatus === "punched-in"
            ? "dark:text-blue-300"
            : displayStatus === "leave"
            ? "dark:text-purple-300"
            : displayStatus === "work-from-home"
            ? "dark:text-indigo-300"
            : displayStatus === "on-duty"
            ? "dark:text-teal-300"
            : displayStatus === "sick-leave"
            ? "dark:text-pink-300"
            : "dark:text-gray-300",
      },
      isWorkDayCompleted: isWorkDayCompleted,
    };

    if (updatedAttendance) {
      status.hasAttendance = true;
      status.totalSessions = updatedAttendance.totalSessions;
      status.completedSessions = updatedAttendance.completedSessions;
      status.totalHours = updatedAttendance.totalHours;
      status.punchSessions = updatedAttendance.punchSessions;

      const currentSession = updatedAttendance.getCurrentSession();

      if (currentSession) {
        status.canPunchIn = false;
        status.canPunchOut = true;
        status.currentSession = currentSession;
      } else {
        status.canPunchIn = true;
        status.canPunchOut = false;
      }
    }

    return sendSuccessResponse(res, {
      today: today,
      attendance: status,
    });
  } catch (error) {
    console.error("Get today status error:", error);
    return sendErrorResponse(
      res,
      "Failed to get today's status. Please try again."
    );
  }
};

// @desc    Get attendance logs
// @route   GET /api/employee/attendance-logs
// @access  Private (Employee)
const getAttendanceLogs = async (req, res) => {
  try {
    const {
      month,
      year,
      startDate: startDateParam,
      endDate: endDateParam,
    } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;

    let startDate, endDate;

    // Handle both parameter formats: month/year and startDate/endDate
    if (startDateParam && endDateParam) {
      // Frontend is sending startDate and endDate
      startDate = new Date(startDateParam + "T00:00:00");
      endDate = new Date(endDateParam + "T23:59:59.999");
    } else {
      // Backend is sending month and year (fallback)
      startDate = new Date(
        year || new Date().getFullYear(),
        month ? month - 1 : new Date().getMonth(),
        1
      );
      endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
    }
    const normalizedStartDate = new Date(startDate);
    normalizedStartDate.setHours(0, 0, 0, 0);
    startDate = normalizedStartDate;
    const normalizedEndDate = new Date(endDate);
    normalizedEndDate.setHours(23, 59, 59, 999);
    endDate = normalizedEndDate;
    const attendanceLogs = await Attendance.find({
      employee: req.user._id,
      date: { $gte: startDate, $lte: endDate },
    })
      .sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    // Enhance attendance logs with request status information
    const enhancedLogs = await Promise.all(
      attendanceLogs.map(async (log) => {
        const logDate = new Date(log.date);
        logDate.setHours(0, 0, 0, 0);

        // Check for approved requests
        const approvedRequestStatus =
          await AttendanceStatusService.checkRequestStatus(
            req.user._id,
            logDate
          );
        const rejectedRequestType =
          await AttendanceStatusService.checkRejectedRequestStatus(
            req.user._id,
            logDate
          );

        let finalStatus = log.status;
        let statusDisplay = log.statusDisplay;

        if (approvedRequestStatus) {
          // Override with approved request status
          finalStatus = approvedRequestStatus;
          switch (approvedRequestStatus) {
            case "leave":
              statusDisplay = "Leave";
              break;
            case "work-from-home":
              statusDisplay = "Work From Home";
              break;
            case "on-duty":
              statusDisplay = "On Duty";
              break;
            case "sick-leave":
              statusDisplay = "Sick Leave";
              break;
            default:
              statusDisplay = approvedRequestStatus;
          }
        } else if (rejectedRequestType) {
          // Override with absent status for rejected requests
          finalStatus = "absent";
          statusDisplay = "Absent";
        }

        return {
          ...log.toObject(),
          status: finalStatus,
          statusDisplay: statusDisplay,
        };
      })
    );

    const total = await Attendance.countDocuments({
      employee: req.user._id,
      date: { $gte: startDate, $lte: endDate },
    });

    const pagination = calculatePagination(page, limit, total);

    return sendSuccessResponse(res, {
      attendanceLogs: enhancedLogs,
      pagination,
    });
  } catch (error) {
    console.error("Get attendance logs error:", error);
    return sendErrorResponse(
      res,
      "Failed to get attendance logs. Please try again."
    );
  }
};

// @desc    Get attendance statistics
// @route   GET /api/employee/attendance-stats
// @access  Private (Employee)
const getAttendanceStats = async (req, res) => {
  try {
    const {
      month,
      year,
      startDate: startDateParam,
      endDate: endDateParam,
    } = req.query;

    let startDate, endDate;

    // Handle both parameter formats: month/year and startDate/endDate
    if (startDateParam && endDateParam) {
      // Frontend is sending startDate and endDate
      startDate = new Date(startDateParam + "T00:00:00");
      endDate = new Date(endDateParam + "T23:59:59.999");
    } else {
      // Backend is sending month and year (fallback)
      startDate = new Date(
        year || new Date().getFullYear(),
        month ? month - 1 : new Date().getMonth(),
        1
      );
      endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
    }

    const attendanceRecords = await Attendance.find({
      employee: req.user._id,
      date: { $gte: startDate, $lte: endDate },
    });

    const stats = {
      totalDays: attendanceRecords.length,
      present: 0,
      absent: 0,
      halfDay: 0,
      leave: 0,
      workFromHome: 0,
      onDuty: 0,
      sickLeave: 0,
      holiday: 0,
      totalHours: 0,
    };

    // Enhance attendance records with request status information
    const enhancedRecords = await Promise.all(
      attendanceRecords.map(async (record) => {
        const recordDate = new Date(record.date);
        recordDate.setHours(0, 0, 0, 0);

        // Check for approved requests
        const approvedRequestStatus =
          await AttendanceStatusService.checkRequestStatus(
            req.user._id,
            recordDate
          );

        let finalStatus = record.status;

        if (approvedRequestStatus) {
          // Override with approved request status
          finalStatus = approvedRequestStatus;
        }

        return {
          ...record.toObject(),
          status: finalStatus,
        };
      })
    );

    enhancedRecords.forEach((record) => {
      stats.totalHours += record.totalHours || 0;

      switch (record.status) {
        case "present":
          stats.present++;
          break;
        case "absent":
          stats.absent++;
          break;
        case "half-day":
          stats.halfDay++;
          break;
        case "leave":
          stats.leave++;
          break;
        case "work-from-home":
          stats.workFromHome++;
          break;
        case "on-duty":
          stats.onDuty++;
          break;
        case "sick-leave":
          stats.sickLeave++;
          break;
        case "holiday":
          stats.holiday++;
          break;
      }
    });

    // Calculate additional fields expected by frontend
    const presentDays =
      stats.present + stats.halfDay + stats.workFromHome + stats.onDuty;
    const totalWorkingDays = stats.totalDays || 1; // Avoid division by zero
    const averageHoursPerDay =
      presentDays > 0 ? stats.totalHours / presentDays : 0;
    const attendancePercentage =
      totalWorkingDays > 0
        ? Math.round((presentDays / totalWorkingDays) * 100)
        : 0;

    // Return the complete stats object with all required fields
    const completeStats = {
      ...stats,
      presentDays,
      averageHoursPerDay,
      attendancePercentage,
    };

    return sendSuccessResponse(res, {
      stats: completeStats,
      period: {
        startDate,
        endDate,
      },
    });
  } catch (error) {
    console.error("Get attendance stats error:", error);
    return sendErrorResponse(
      res,
      "Failed to get attendance statistics. Please try again."
    );
  }
};

// @desc    Get profile
// @route   GET /api/employee/profile
// @access  Private (Employee)
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return sendErrorResponse(res, "User not found", 404);
    }
    return sendSuccessResponse(res, { user });
  } catch (error) {
    console.error("Get profile error:", error);
    return sendErrorResponse(res, "Failed to get profile. Please try again.");
  }
};

// @desc    Update profile
// @route   PUT /api/employee/profile
// @access  Private (Employee)
const updateProfile = async (req, res) => {
  try {
    const { name, department } = req.body;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { name, department },
      { new: true, runValidators: true }
    );

    if (!user) {
      return sendErrorResponse(res, "User not found", 404);
    }

    return sendSuccessResponse(res, { user }, "Profile updated successfully");
  } catch (error) {
    console.error("Update profile error:", error);
    return sendErrorResponse(
      res,
      "Failed to update profile. Please try again."
    );
  }
};

// @desc    Get employee dashboard
// @route   GET /api/employee/dashboard
// @access  Private (Employee)
const getDashboard = async (req, res) => {
  try {
    const today = getCurrentDate();

    // Get today's attendance status
    const attendance = await Attendance.findByEmployeeAndDate(
      req.user._id,
      today
    );

    const dashboardData = {
      user: {
        id: req.user._id,
        name: req.user.name,
        employeeId: req.user.employeeId,
        department: req.user.department,
        email: req.user.email,
      },
      today: {
        date: today,
        hasAttendance: !!attendance,
        canPunchIn: true,
        canPunchOut: false,
        currentSession: null,
        totalHours: attendance ? attendance.totalHours : 0,
        status: attendance ? attendance.status : "not-started",
      },
    };

    if (attendance) {
      const currentSession = attendance.getCurrentSession();
      if (currentSession) {
        dashboardData.today.canPunchIn = false;
        dashboardData.today.canPunchOut = true;
        dashboardData.today.currentSession = currentSession;
      }
    }

    return sendSuccessResponse(res, dashboardData);
  } catch (error) {
    console.error("Get dashboard error:", error);
    return sendErrorResponse(
      res,
      "Failed to get dashboard data. Please try again."
    );
  }
};

module.exports = {
  punchIn,
  punchOut,
  getTodayStatus,
  getAttendanceLogs,
  getAttendanceStats,
  getProfile,
  updateProfile,
  getDashboard,
};
