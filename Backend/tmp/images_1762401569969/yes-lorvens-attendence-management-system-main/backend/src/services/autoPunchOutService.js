const Attendance = require("../models/Attendance");
const AttendanceStatusService = require("./attendanceStatusService");
const moment = require("moment");
const { createISTDateRangeQuery } = require("../utils/helpers");

class AutoPunchOutService {
  /**
   * Mark employees as absent if they have punch-ins but no punch-outs after end of day
   * @param {Date} date - The date to process (defaults to today)
   * @returns {Object} - Results of the end-of-day absence marking operation
   */
  static async autoPunchOutEmployees(date = new Date()) {
    try {
      console.log(`Starting end-of-day absence marking for date: ${moment(date).format('YYYY-MM-DD')}`);
      
      // Get today's date in IST
      const today = moment(date).startOf('day');
      const todayQuery = createISTDateRangeQuery(today.format('YYYY-MM-DD'), today.format('YYYY-MM-DD'));
      
      // Find all attendance records for today
      const todayAttendance = await Attendance.find(todayQuery)
        .populate("employee", "name employeeId department")
        .sort({ "employee.name": 1 });

      let processedCount = 0;
      let markedAbsentCount = 0;
      const results = [];

      for (const attendanceRecord of todayAttendance) {
        processedCount++;
        
        // Check if employee has any open punch sessions (punch-in without punch-out)
        const openSessions = attendanceRecord.punchSessions.filter(session => 
          session.punchIn && session.punchIn.time && !session.punchOut?.time
        );

        if (openSessions.length > 0) {
          // Remove all open sessions since employee didn't punch out properly
          attendanceRecord.punchSessions = attendanceRecord.punchSessions.filter(session => 
            session.punchIn && session.punchIn.time && session.punchOut?.time
          );

          // Recalculate total hours for the day (only from completed sessions)
          let totalHours = 0;
          attendanceRecord.punchSessions.forEach(session => {
            if (session.sessionHours) {
              totalHours += session.sessionHours;
            }
          });
          attendanceRecord.totalHours = totalHours;

          // Mark as absent since employee didn't complete their punch-out
          attendanceRecord.status = "absent";

          // Save the updated attendance record
          await attendanceRecord.save();

          // Update attendance status after marking as absent
          try {
            await AttendanceStatusService.updateAttendanceStatus(attendanceRecord.employee._id, today.toDate());
          } catch (statusError) {
            console.error(`Error updating attendance status for ${attendanceRecord.employee.employeeId}:`, statusError);
          }

          markedAbsentCount++;
          
          results.push({
            employeeId: attendanceRecord.employee.employeeId,
            employeeName: attendanceRecord.employee.name,
            department: attendanceRecord.employee.department,
            action: "marked_absent",
            reason: "Incomplete punch-out after end of day",
            removedSessions: openSessions.length,
            finalTotalHours: totalHours
          });

          console.log(`Marked absent: ${attendanceRecord.employee.employeeId} (${attendanceRecord.employee.name}) - removed ${openSessions.length} incomplete sessions`);
        }
      }

      const summary = {
        date: today.format('YYYY-MM-DD'),
        processedRecords: processedCount,
        markedAbsentCount: markedAbsentCount,
        results: results
      };

      console.log(`End-of-day absence marking completed: ${markedAbsentCount} employees marked as absent`);
      return summary;

    } catch (error) {
      console.error('Error in end-of-day absence service:', error);
      throw new Error(`Failed to mark employees as absent: ${error.message}`);
    }
  }

  /**
   * Get employees who have incomplete punch sessions (punch-in without punch-out)
   * @param {Date} date - The date to check (defaults to today)
   * @returns {Array} - List of employees with incomplete sessions
   */
  static async getLoggedInEmployees(date = new Date()) {
    try {
      const today = moment(date).startOf('day');
      const todayQuery = createISTDateRangeQuery(today.format('YYYY-MM-DD'), today.format('YYYY-MM-DD'));
      
      const todayAttendance = await Attendance.find(todayQuery)
        .populate("employee", "name employeeId department")
        .sort({ "employee.name": 1 });

      const loggedInEmployees = [];

      for (const attendanceRecord of todayAttendance) {
        const openSessions = attendanceRecord.punchSessions.filter(session => 
          session.punchIn && session.punchIn.time && !session.punchOut?.time
        );

        if (openSessions.length > 0) {
          const lastOpenSession = openSessions[openSessions.length - 1];
          const punchInTime = moment(lastOpenSession.punchIn.time);
          
          loggedInEmployees.push({
            employeeId: attendanceRecord.employee.employeeId,
            employeeName: attendanceRecord.employee.name,
            department: attendanceRecord.employee.department,
            punchInTime: punchInTime.format('HH:mm:ss'),
            duration: moment().diff(punchInTime, 'hours', true).toFixed(2)
          });
        }
      }

      return loggedInEmployees;
    } catch (error) {
      console.error('Error getting logged in employees:', error);
      throw new Error(`Failed to get logged in employees: ${error.message}`);
    }
  }

  /**
   * Check if end-of-day absence marking should run (e.g., after 6 PM)
   * @returns {boolean} - True if end-of-day absence marking should run
   */
  static shouldRunAutoPunchOut() {
    const now = moment();
    const currentHour = now.hour();
    const currentMinute = now.minute();
    
    // Run auto punch-out after 6:00 PM (18:00)
    return currentHour >= 18 && currentMinute >= 0;
  }
}

module.exports = AutoPunchOutService; 