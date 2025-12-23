const Attendance = require("../models/Attendance");
const User = require("../models/User");
const Request = require("../models/Request");
const moment = require("moment");
const { getCurrentDate } = require("../utils/helpers");

class AttendanceStatusService {
  // Calculate attendance status based on total hours worked
  static calculateAttendanceStatus(employee, date, attendance) {
    try {
      // Check if it's Sunday (holiday)
      const dayOfWeek = moment(date).day();
      if (dayOfWeek === 0) {
        return "holiday";
      }

      // If no attendance record or no punch sessions, mark as absent
      if (!attendance || !attendance.punchSessions || attendance.punchSessions.length === 0) {
        return "absent";
      }

      const totalHours = attendance.totalHours || 0;
      const isToday = moment(date).isSame(moment().utcOffset("+05:30"), "day");

      // For today's attendance, don't calculate status yet
      if (isToday) {
        return attendance.status || "present";
      }

      // For previous days, calculate status based on hours worked
      if (totalHours < 4) {
        return "absent";
      } else if (totalHours >= 4 && totalHours < 7.5) {
        return "half-day";
      } else {
        return "present";
      }
    } catch (error) {
      console.error('Error calculating attendance status:', error);
      return "absent";
    }
  }

  // Check if employee has approved requests for the given date
  static async checkRequestStatus(employeeId, date) {
    try {
      const normalizedDate = new Date(date);
      normalizedDate.setHours(0, 0, 0, 0);
      
      
      const request = await Request.findOne({
      employeeId,
      startDate: { $lte: normalizedDate },
      endDate: { $gte: normalizedDate }, 
      status: "approved",
    });
      if (request) {
        switch (request.type) {
          case "leave":
            return "leave";
          case "work_from_home":
            return "work-from-home";
          case "od":
            return "on-duty";
          case "sick_leave":
            return "sick-leave";
          default:
            return null;
        }
      }

      return null;
    } catch (error) {
      throw new Error(`Error checking request status: ${error.message}`);
    }
  }

  static async checkLeaveRequestStatus(employeeId, date) {
    try {
      
      const normalizedDate = new Date(date);
      normalizedDate.setHours(0, 0, 0, 0);
      
      
      const request = await Request.findOne({
      employeeId,
      startDate: { $lte: normalizedDate },
      endDate: { $gte: normalizedDate }, 
      type: { $nin: ["work_from_home", "on_duty"] }, // exclude these
      status: "approved",
    });
      if (request) {
        switch (request.type) {
          case "leave":
            return "leave";
          case "work_from_home":
            return "work-from-home";
          case "od":
            return "on-duty";
          case "sick_leave":
            return "sick-leave";
          default:
            return null;
        }
      }

      return null;
    } catch (error) {
      throw new Error(`Error checking request status: ${error.message}`);
    }
  }

  // Check if employee has rejected requests for the given date
  static async checkRejectedRequestStatus(employeeId, date) {
    try {
      const normalizedDate = new Date(date);
      normalizedDate.setHours(0, 0, 0, 0);
      
      const request = await Request.findOne({
        employeeId: employeeId, // Use the ObjectId directly
        startDate: { $lte: normalizedDate },
        endDate: { $gte: normalizedDate },
        status: "rejected",
      });

      return request ? request.type : null;
    } catch (error) {
      throw new Error(`Error checking rejected request status: ${error.message}`);
    }
  }

  // Get display text for attendance status
  static getStatusDisplay(status) {
    const statusMap = {
      present: "Present",
      absent: "Absent",
      "half-day": "Half Day",
      late: "Late",
      leave: "Leave",
      "work-from-home": "Work From Home",
      "on-duty": "On Duty",
      "sick-leave": "Sick Leave",
      holiday: "Holiday",
      "not-started": "Not Started",
      "no-records": "No Records",
    };

    return statusMap[status] || status;
  }

  // Update attendance status for a specific employee and date
  static async updateAttendanceStatus(employeeId, date) {
    try {
      if (!employeeId || !date) {
        throw new Error("Employee ID and date are required");
      }

      const employee = await User.findById(employeeId);
      if (!employee) {
        throw new Error("Employee not found");
      }

      // Atomically ensure the attendance record exists for that day
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);

      // Use a deterministic key (employee + date range) to upsert today's record
      await Attendance.updateOne(
        { employee: employeeId, date: { $gte: dayStart, $lte: dayEnd } },
        {
          $setOnInsert: {
            employee: employeeId,
            date: dayStart,
            punchSessions: [],
            status: "absent",
            totalHours: 0,
          },
        },
        { upsert: true }
      );

      let attendance = await Attendance.findByEmployeeAndDate(employeeId, date);

      // First, check for approved requests
      const approvedRequestStatus = await this.checkRequestStatus(employeeId, date);
      if (approvedRequestStatus) {
        // If there's an approved request, set status accordingly
        if (attendance.status !== approvedRequestStatus) {
          attendance.status = approvedRequestStatus;
          await attendance.save();
        }
        return attendance;
      }

      // Check for rejected requests
      const rejectedRequestType = await this.checkRejectedRequestStatus(employeeId, date);
      if (rejectedRequestType) {
        // If there's a rejected request, employee can punch in/out normally
        // Calculate status based on punch sessions
        const newStatus = this.calculateAttendanceStatus(employee, date, attendance);
        if (attendance.status !== newStatus) {
          attendance.status = newStatus;
          await attendance.save();
        }
        return attendance;
      }

      // No requests found, calculate status normally
      const newStatus = this.calculateAttendanceStatus(employee, date, attendance);

      // Update status if it has changed
      if (attendance.status !== newStatus) {
        attendance.status = newStatus;
        await attendance.save();
      }

      return attendance;
    } catch (error) {
      console.error('Error updating attendance status:', error);
      throw new Error(`Error updating attendance status: ${error.message}`);
    }
  }

  // Batch update attendance status for all employees for a specific date
  static async batchUpdateAttendanceStatus(date) {
    try {
      const employees = await User.find({ role: "employee", status: "active" });
      const results = [];

      console.log(`Starting batch attendance status update for ${employees.length} employees on ${moment(date).format('YYYY-MM-DD')}`);

      for (const employee of employees) {
        try {
          const updatedAttendance = await this.updateAttendanceStatus(employee._id, date);
          results.push({
            employeeId: employee._id,
            employeeName: employee.name,
            status: updatedAttendance.status,
            totalHours: updatedAttendance.totalHours || 0,
            success: true,
          });
          console.log(`Updated ${employee.name} (${employee.employeeId}): ${updatedAttendance.status} (${updatedAttendance.totalHours || 0} hours)`);
        } catch (error) {
          results.push({
            employeeId: employee._id,
            employeeName: employee.name,
            error: error.message,
            success: false,
          });
          console.error(`Failed to update ${employee.name} (${employee.employeeId}): ${error.message}`);
        }
      }

      console.log(`Batch attendance status update completed. ${results.filter(r => r.success).length}/${results.length} employees processed successfully.`);
      return results;
    } catch (error) {
      throw new Error(`Error in batch update attendance status: ${error.message}`);
    }
  }

  // Get attendance statistics for a date range
  static async getAttendanceStats(startDate, endDate, department = null) {
    try {
      const query = {
        date: {
          $gte: moment(startDate).startOf("day").toDate(),
          $lte: moment(endDate).endOf("day").toDate(),
        },
      };

      if (department) {
        // Get employee IDs for the department
        const employees = await User.find({ department, role: "employee" });
        const employeeIds = employees.map(emp => emp._id);
        query.employee = { $in: employeeIds };
      }

      const attendanceRecords = await Attendance.find(query).populate("employee", "name employeeId department");

      const stats = {
        totalDays: 0,
        present: 0,
        absent: 0,
        "half-day": 0,
        late: 0,
        leave: 0,
        "work-from-home": 0,
        "on-duty": 0,
        "sick-leave": 0,
        holiday: 0,
        totalHours: 0,
        averageHours: 0,
      };

      attendanceRecords.forEach(record => {
        stats.totalDays++;
        stats.totalHours += record.totalHours || 0;

        const status = record.status || "absent";
        if (stats.hasOwnProperty(status)) {
          stats[status]++;
        }
      });

      if (stats.totalDays > 0) {
        stats.averageHours = parseFloat((stats.totalHours / stats.totalDays).toFixed(2));
      }

      return stats;
    } catch (error) {
      throw new Error(`Error getting attendance stats: ${error.message}`);
    }
  }

  // Get employee attendance summary
  static async getEmployeeAttendanceSummary(employeeId, startDate, endDate) {
    try {
      const attendanceRecords = await Attendance.find({
        employee: employeeId,
        date: {
          $gte: moment(startDate).startOf("day").toDate(),
          $lte: moment(endDate).endOf("day").toDate(),
        },
      }).sort({ date: 1 });

      const summary = {
        totalDays: attendanceRecords.length,
        present: 0,
        absent: 0,
        "half-day": 0,
        late: 0,
        leave: 0,
        "work-from-home": 0,
        "on-duty": 0,
        "sick-leave": 0,
        holiday: 0,
        totalHours: 0,
        averageHours: 0,
        attendancePercentage: 0,
        records: attendanceRecords,
      };

      attendanceRecords.forEach(record => {
        summary.totalHours += record.totalHours || 0;

        const status = record.status || "absent";
        if (summary.hasOwnProperty(status)) {
          summary[status]++;
        }
      });

      if (summary.totalDays > 0) {
        summary.averageHours = parseFloat((summary.totalHours / summary.totalDays).toFixed(2));
        summary.attendancePercentage = parseFloat(((summary.present + summary["half-day"]) / summary.totalDays * 100).toFixed(2));
      }

      return summary;
    } catch (error) {
      throw new Error(`Error getting employee attendance summary: ${error.message}`);
    }
  }
}

module.exports = AttendanceStatusService;
