const User = require("../models/User");
const Attendance = require("../models/Attendance");
const moment = require("moment");
const emailService = require("../services/emailService");
const AutoPunchOutService = require("../services/autoPunchOutService");
const AttendanceStatusService = require("../services/attendanceStatusService");
const { createISTDateRangeQuery, convertToIST } = require("../utils/helpers");
const {
  sendSuccessResponse,
  sendErrorResponse,
  calculatePagination,
  buildQuery,
} = require("../utils/responseHelpers");

// Helper function to generate next employee ID
const generateNextEmployeeId = async () => {
  try {
    // Find the employee with the highest employeeId number
    const lastEmployee = await User.findOne({
      employeeId: { $regex: /^E-\d+$/ },
    }).sort({ employeeId: -1 });

    let nextNumber = 123; // Start from 123

    if (lastEmployee) {
      // Extract the number from the last employee ID (e.g., "E-125" -> 125)
      const lastNumber = parseInt(lastEmployee.employeeId.split("-")[1]);
      nextNumber = lastNumber + 1;
    }

    return `E-${nextNumber}`;
  } catch (error) {
    throw new Error("Failed to generate employee ID");
  }
};

// @desc    Get all employees
// @route   GET /api/admin/employees
// @access  Private (Admin)
const getAllEmployees = async (req, res) => {
  try {
    const { search, department, status, page = 1, limit = 20 } = req.query;

    let query = {};

    // Always filter to show only employees (exclude admins)
    query.role = "employee";

    // By default, show only active and pending employees (exclude inactive)
    if (status) {
      query.status = status;
    } else {
      // Default filter: exclude inactive employees
      query.status = { $ne: "inactive" };
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { employeeId: { $regex: search, $options: "i" } },
      ];
    }

    if (department) {
      query.department = department;
    }

    const skip = (page - 1) * limit;

    const employees = await User.find(query)
      .select("-password")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments(query);

    const pagination = calculatePagination(page, limit, total);

    return sendSuccessResponse(res, {
      employees,
      pagination,
    });
  } catch (error) {
    return sendErrorResponse(res, "Failed to get employees");
  }
};

// @desc    Get next employee ID
// @route   GET /api/admin/employees/next-id
// @access  Private (Admin)
const getNextEmployeeId = async (req, res) => {
  try {
    const nextEmployeeId = await generateNextEmployeeId();

    return sendSuccessResponse(res, {
      nextEmployeeId,
    });
  } catch (error) {
    return sendErrorResponse(res, "Failed to get next employee ID");
  }
};

// @desc    Get employee details
// @route   GET /api/admin/employees/:id/details
// @access  Private (Admin)
const getEmployeeDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    const employee = await User.findById(id).select("-password");
    if (!employee) {
      return sendErrorResponse(res, "Employee not found");
    }

    // Get attendance records for the employee
    let attendanceQuery = { employee: employee._id };

    if (startDate && endDate) {
      Object.assign(
        attendanceQuery,
        createISTDateRangeQuery(startDate, endDate)
      );
    }

    const attendance = await Attendance.find(attendanceQuery)
      .sort({ date: -1 })
      .limit(30);

    // Calculate statistics
    const totalDays = attendance.length;
    const presentDays = attendance.filter(
      (record) => record.status === "present"
    ).length;
    const absentDays = attendance.filter(
      (record) => record.status === "absent"
    ).length;
    const lateDays = attendance.filter(
      (record) => record.status === "late"
    ).length;
    const totalHours = attendance.reduce(
      (sum, record) => sum + (record.totalHours || 0),
      0
    );

    const employeeData = {
      ...employee.toObject(),
      attendance: {
        records: attendance,
        statistics: {
          totalDays,
          presentDays,
          absentDays,
          lateDays,
          totalHours: parseFloat(totalHours.toFixed(2)),
          attendancePercentage:
            totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0,
        },
      },
    };

    return sendSuccessResponse(res, {
      employee: employeeData,
    });
  } catch (error) {
    return sendErrorResponse(res, "Failed to get employee details");
  }
};

// @desc    Create new employee
// @route   POST /api/admin/employees
// @access  Private (Admin)
const createEmployee = async (req, res) => {
  try {
    const {
      name,
      email,
      employeeId,
      department,
      position,
      phone,
      address,
      joiningDate,
      salary,
      role,
    } = req.body;

    // Generate employee ID if not provided
    const finalEmployeeId = employeeId || (await generateNextEmployeeId());

    // Check if employee already exists
    const existingEmployee = await User.findOne({
      $or: [{ email }, { employeeId: finalEmployeeId }],
    });

    if (existingEmployee) {
      return sendErrorResponse(
        res,
        "Employee with this email or employee ID already exists"
      );
    }

    const employee = new User({
      name,
      email,
      employeeId: finalEmployeeId,
      department,
      position,
      phone,
      address,
      joiningDate,
      salary,
      role,
      status: "pending", // Set status to pending until account verification
    });

    await employee.save();

    // Generate invitation token for the new employee
    const invitationToken = await employee.generateInvitationToken();

    // Send invitation email with verification token
    try {
      const userForEmail = {
        name,
        email,
        employeeId: finalEmployeeId,
        department,
        role,
      };
      console.log(employee.role);
      // Get admin name from request user
      const adminName = req.user?.name || "Administrator";
      if (employee.role === "admin") {
        console.log("admin");
        await emailService.sendAdminInvitation(userForEmail, adminName);
      } else {
        await emailService.sendEmployeeInvitation(
          userForEmail,
          adminName,
          invitationToken
        );
      }
    } catch (emailError) {
      console.error("Failed to send invitation email:", emailError);
      // Don't fail the request if email fails
    }

    return sendSuccessResponse(res, {
      employee: {
        _id: employee._id,
        name: employee.name,
        email: employee.email,
        employeeId: finalEmployeeId,
        department: employee.department,
        position: employee.position,
        status: employee.status,
        isInvited: employee.isInvited,
        role: employee.role,
      },
      message:
        "Employee created successfully. Invitation email sent with verification link.",
    });
  } catch (error) {
    return sendErrorResponse(res, "Failed to create employee");
  }
};

// @desc    Update employee
// @route   PUT /api/admin/employees/:id
// @access  Private (Admin)
const updateEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    console.log(updateData);

    // Remove sensitive fields that shouldn't be updated
    delete updateData.password;
    delete updateData.role;

    const employee = await User.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select("-password");

    if (!employee) {
      return sendErrorResponse(res, "Employee not found");
    }

    return sendSuccessResponse(res, {
      employee,
      message: "Employee updated successfully",
    });
  } catch (error) {
    return sendErrorResponse(res, "Failed to update employee");
  }
};

// @desc    Delete employee
// @route   DELETE /api/admin/employees/:id
// @access  Private (Admin)
const deleteEmployee = async (req, res) => {
  try {
    const { id } = req.params;

    // Mark employee as inactive
    const employee = await User.findByIdAndUpdate(
      id,
      { status: "inactive" },
      { new: true }
    );

    if (!employee) {
      return sendErrorResponse(res, "Employee not found");
    }

    return sendSuccessResponse(res, {
      message: "Employee marked as inactive successfully",
      employee,
    });
  } catch (error) {
    console.error(error);
    return sendErrorResponse(res, "Failed to update employee status");
  }
};

// @desc    Get all attendance records
// @route   GET /api/admin/attendance
// @access  Private (Admin)
const getAllAttendance = async (req, res) => {
  try {
    const {
      employeeId,
      startDate,
      endDate,
      department,
      status,
      search,
      page = 1,
      limit = 50,
    } = req.query;

    let query = {};

    if (employeeId) {
      const employee = await User.findOne({ employeeId });
      if (employee) {
        query.employee = employee._id;
      }
    }

    if (startDate && endDate) {
      Object.assign(query, createISTDateRangeQuery(startDate, endDate));
    }

    if (status) {
      query.status = status;
    }

    const skip = (page - 1) * limit;

    let attendanceQuery = Attendance.find(query)
      .populate("employee", "name employeeId department role")
      .sort({ date: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Filter by department if specified
    if (department) {
      attendanceQuery = attendanceQuery.populate({
        path: "employee",
        match: { department: department, role: "employee" },
      });
    } else {
      // Always filter to show only employees (exclude admins)
      attendanceQuery = attendanceQuery.populate({
        path: "employee",
        match: { role: "employee" },
      });
    }

    // Filter by search term if specified
    if (search) {
      attendanceQuery = attendanceQuery.populate({
        path: "employee",
        match: {
          role: "employee",
          $or: [
            { name: { $regex: search, $options: "i" } },
            { employeeId: { $regex: search, $options: "i" } },
            { department: { $regex: search, $options: "i" } },
          ],
        },
      });
    }

    const attendance = await attendanceQuery;

    // Filter out records where employee is null (due to department or search filter)
    const filteredAttendance = attendance.filter((record) => record.employee);

    const total = await Attendance.countDocuments(query);

    const pagination = calculatePagination(page, limit, total);

    return sendSuccessResponse(res, {
      attendance: filteredAttendance,
      pagination,
    });
  } catch (error) {
    return sendErrorResponse(res, "Failed to get attendance records");
  }
};

// @desc    Get today's attendance for all employees
// @route   GET /api/admin/attendance/today
// @access  Private (Admin)
const getTodayAttendance = async (req, res) => {
  try {
    const { date } = req.query;
    const selectedDate = date || new Date().toISOString().split("T")[0];

    // Check if this is today
    const today = moment().startOf("day");
    const selectedDateMoment = moment(selectedDate).startOf("day");
    const isToday = today.isSame(selectedDateMoment);
    const currentHourForToday = moment().hour();
    const currentMinuteForToday = moment().minute();
    const isWorkDayCompleted =
      currentHourForToday >= 23 ||
      (currentHourForToday === 23 && currentMinuteForToday >= 30); // After 11:30 PM

    // Only update attendance status for previous days, not for today
    let updateResults = null;
    if (!isToday) {
      updateResults = await AttendanceStatusService.batchUpdateAttendanceStatus(
        new Date(selectedDate)
      );
    } else {
      updateResults = { message: "Today - no status update needed" };
    }

    // Get attendance records for the selected date (same logic as dashboard)
    const dateRange = createISTDateRangeQuery(selectedDate, selectedDate);
    const todayAttendance = await Attendance.find({ ...dateRange })
      .populate("employee", "name employeeId department")
      .sort({ "employee.name": 1 });

    // Get all active employees to check who hasn't punched in (same logic as dashboard)
    const allActiveEmployees = await User.find({
      role: "employee",
      status: "active",
    }).select("name employeeId department");

    // Create a set of active employee IDs for quick lookup
    const activeEmployeeIds = new Set(
      allActiveEmployees.map((emp) => emp._id.toString())
    );

    // Filter attendance records to only include active employees
    const activeAttendance = todayAttendance.filter((record) =>
      activeEmployeeIds.has(record.employee._id.toString())
    );

    // Log if there were inactive employees in attendance records
    const inactiveInAttendance = todayAttendance.filter(
      (record) => !activeEmployeeIds.has(record.employee._id.toString())
    );
    if (inactiveInAttendance.length > 0) {
      console.warn(
        `Found ${inactiveInAttendance.length} attendance records for inactive employees:`,
        inactiveInAttendance.map((record) => record.employee.employeeId)
      );
    }

    // Ensure we have unique attendance records per employee
    const uniqueAttendance = [];
    const seenEmployeeIds = new Set();

    activeAttendance.forEach((record) => {
      const employeeId = record.employee._id.toString();
      if (!seenEmployeeIds.has(employeeId)) {
        seenEmployeeIds.add(employeeId);
        uniqueAttendance.push(record);
      }
    });

    // Get all active employees to check who hasn't punched in (same logic as dashboard)
    const employeeIdsWithAttendance = new Set(
      uniqueAttendance.map((record) => record.employee._id.toString())
    );

    // Count employees who haven't punched in yet (same logic as dashboard)
    const employeesWithoutAttendance = allActiveEmployees.filter(
      (emp) => !employeeIdsWithAttendance.has(emp._id.toString())
    );

    // Create comprehensive report - only show employees with attendance records
    const todayReport = await Promise.all(
      uniqueAttendance.map(async (attendanceRecord) => {
        const employee = attendanceRecord.employee;
        // Get first punch in and last punch out from punch sessions
        let firstPunchIn = null;
        let lastPunchOut = null;

        if (
          attendanceRecord.punchSessions &&
          attendanceRecord.punchSessions.length > 0
        ) {
          const firstSession = attendanceRecord.punchSessions[0];
          const lastSession =
            attendanceRecord.punchSessions[
              attendanceRecord.punchSessions.length - 1
            ];

          if (firstSession.punchIn && firstSession.punchIn.time) {
            firstPunchIn = moment(firstSession.punchIn.time).format("HH:mm:ss");
          }

          if (lastSession.punchOut && lastSession.punchOut.time) {
            lastPunchOut = moment(lastSession.punchOut.time).format("HH:mm:ss");
          }
        }

        // Determine status based on whether it's today or a previous day
        let status, statusDisplay;

        if (isToday) {
          const approvedRequestStatus =
            await AttendanceStatusService.checkRequestStatus(
              employee._id,
              new Date(selectedDate)
            );
          if (approvedRequestStatus) {
            status = approvedRequestStatus;
            statusDisplay = AttendanceStatusService.getStatusDisplay(status);
          } else {
            if (isWorkDayCompleted) {
              // After work day is completed, show final status based on total hours
              const totalHours = attendanceRecord.totalHours || 0;

              if (totalHours > 7.5) {
                // Present: > 7 hours 30 minutes
                status = "present";
                statusDisplay = {
                  label: "Present",
                  color: "green",
                  bgColor: "bg-green-100",
                  textColor: "text-green-800",
                  darkBgColor: "dark:bg-green-900",
                  darkTextColor: "dark:text-green-300",
                };
              } else if (totalHours >= 4 && totalHours <= 7.5) {
                // Half-day: between 4 hours and 7 hours 30 minutes
                status = "half-day";
                statusDisplay = {
                  label: "Half Day",
                  color: "orange",
                  bgColor: "bg-orange-100",
                  textColor: "text-orange-800",
                  darkBgColor: "dark:bg-orange-900",
                  darkTextColor: "dark:text-orange-300",
                };
              } else {
                // Absent: < 4 hours
                status = "absent";
                statusDisplay = {
                  label: "Absent",
                  color: "red",
                  bgColor: "bg-red-100",
                  textColor: "text-red-800",
                  darkBgColor: "dark:bg-red-900",
                  darkTextColor: "dark:text-red-300",
                };
              }
            } else {
              // During work day, show working status
              if (firstPunchIn && lastPunchOut) {
                status = "completed";
                statusDisplay = {
                  label: "Completed",
                  color: "green",
                  bgColor: "bg-green-100",
                  textColor: "text-green-800",
                  darkBgColor: "dark:bg-green-900",
                  darkTextColor: "dark:text-green-300",
                };
              } else if (firstPunchIn && !lastPunchOut) {
                status = "punched-in";
                statusDisplay = {
                  label: "Punched In",
                  color: "blue",
                  bgColor: "bg-blue-100",
                  textColor: "text-blue-800",
                  darkBgColor: "dark:bg-blue-900",
                  darkTextColor: "dark:text-blue-300",
                };
              } else if (firstPunchIn && !lastPunchOut) {
                status = "work-from-home";
                statusDisplay = {
                  label: "Work From Home",
                  color: "gray",
                  bgColor: "bg-gray-100",
                  textColor: "text-gray-800",
                  darkBgColor: "dark:bg-gray-900",
                  darkTextColor: "dark:text-gray-300",
                };
              } else {
                status = "not-started";
                statusDisplay = {
                  label: "Not Started",
                  color: "gray",
                  bgColor: "bg-gray-100",
                  textColor: "text-gray-800",
                  darkBgColor: "dark:bg-gray-900",
                  darkTextColor: "dark:text-gray-300",
                };
              }
            }
          }
        } else {
          // For previous days, first check for approved requests (leave, WFH, etc.)
          const approvedRequestStatus =
            await AttendanceStatusService.checkRequestStatus(
              employee._id,
              new Date(selectedDate)
            );
          if (approvedRequestStatus) {
            // If there's an approved request, use that status
            status = approvedRequestStatus;
            statusDisplay = AttendanceStatusService.getStatusDisplay(status);
          } else {
            // Otherwise, use the actual status from the database
            status = attendanceRecord.status || "no-records";
            statusDisplay = AttendanceStatusService.getStatusDisplay(status);
          }
        }
        const employeeData = {
          employeeId: employee.employeeId,
          name: employee.name,
          department: employee.department,
          hasAttendance: true,
          status: status,
          statusDisplay: statusDisplay,
          punchIn: firstPunchIn,
          punchOut: lastPunchOut,
          totalHours: attendanceRecord.totalHours || 0,
          isManualEntry: attendanceRecord.isManualEntry || false,
          notes: attendanceRecord.notes || null,
          attendanceId: attendanceRecord._id || null,
          isToday: isToday,
        };

        return employeeData;
      })
    );

    // Check for duplicate employee IDs in todayReport
    const employeeIds = todayReport.map((emp) => emp.employeeId);
    const duplicateIds = employeeIds.filter(
      (id, index) => employeeIds.indexOf(id) !== index
    );
    if (duplicateIds.length > 0) {
      console.warn(
        "Duplicate employee IDs found in attendance records:",
        duplicateIds
      );
    }

    // Add employees without attendance records if it's after 10 AM (same logic as dashboard)
    const currentHour = moment().hour();
    if (currentHour >= 10 && isToday) {
      // Process employees without attendance records and check for leave status
      const employeesWithoutAttendanceData = await Promise.all(
        employeesWithoutAttendance.map(async (employee) => {
          // Double-check that this employee doesn't already have an attendance record
          const existingRecord = todayReport.find(
            (record) => record.employeeId === employee.employeeId
          );
          if (existingRecord) {
            console.warn(
              `Employee ${employee.employeeId} already has attendance record with status: ${existingRecord.status}`
            );
            return null;
          }

          // Check for approved requests (leave, WFH, etc.) even for employees without attendance records
          const approvedRequestStatus =
            await AttendanceStatusService.checkRequestStatus(
              employee._id,
              new Date(selectedDate)
            );

          let status, statusDisplay;

          if (approvedRequestStatus) {
            // If there's an approved request, use that status
            status = approvedRequestStatus;
            statusDisplay = AttendanceStatusService.getStatusDisplay(status);
          } else {
            // Otherwise, set as not-started
            status = "not-started";
            statusDisplay = {
              label: "Not Started",
              color: "gray",
              bgColor: "bg-gray-100",
              textColor: "text-gray-800",
              darkBgColor: "dark:bg-gray-900",
              darkTextColor: "dark:text-gray-300",
            };
          }

          const employeeData = {
            employeeId: employee.employeeId,
            name: employee.name,
            department: employee.department,
            hasAttendance: false,
            status: status,
            statusDisplay: statusDisplay,
            punchIn: null,
            punchOut: null,
            totalHours: 0,
            isManualEntry: false,
            notes: null,
            attendanceId: null,
            isToday: isToday,
          };

          return employeeData;
        })
      );

      // Add the processed employees to the report
      employeesWithoutAttendanceData.forEach((employeeData) => {
        if (employeeData) {
          todayReport.push(employeeData);
        }
      });
    }

    // Group by status (same logic as dashboard)
    const statusSummary = {};
    todayReport.forEach((emp) => {
      const status = emp.status;
      statusSummary[status] = (statusSummary[status] || 0) + 1;
    });

    return sendSuccessResponse(res, {
      date: selectedDate,
      totalEmployees: allActiveEmployees.length,
      statusSummary,
      employees: todayReport,
      updateResults: updateResults,
    });
  } catch (error) {
    return sendErrorResponse(res, "Failed to get today's attendance records");
  }
};

// @desc    Create manual attendance entry
// @route   POST /api/admin/attendance
// @access  Private (Admin)
const createManualAttendance = async (req, res) => {
  try {
    const { employeeId, date, punchIn, punchOut, reason } = req.body;

    const employee = await User.findById(employeeId);
    if (!employee) {
      return sendErrorResponse(res, "Employee not found");
    }

    // Check if attendance already exists for this date
    const existingAttendance = await Attendance.findOne({
      employee: employeeId,
      date: {
        $gte: new Date(date + "T00:00:00.000Z"),
        $lte: new Date(date + "T23:59:59.999Z"),
      },
    });

    if (existingAttendance) {
      return sendErrorResponse(
        res,
        "Attendance record already exists for this date"
      );
    }

    // Calculate total hours if both punch in and punch out are provided
    let totalHours = 0;
    if (punchIn && punchOut) {
      const punchInTime = new Date(`2000-01-01T${punchIn}`);
      const punchOutTime = new Date(`2000-01-01T${punchOut}`);
      totalHours = (punchOutTime - punchInTime) / (1000 * 60 * 60);
    }

    // Determine status based on punch times
    let status = "present";
    if (!punchIn && !punchOut) {
      status = "absent";
    } else if (punchIn && !punchOut) {
      status = "present";
    } else if (totalHours < 4) {
      status = "half-day";
    }

    // Create punch sessions array
    const punchSessions = [];
    if (punchIn || punchOut) {
      const session = {
        sessionHours: parseFloat(totalHours.toFixed(2)),
      };

      if (punchIn) {
        session.punchIn = {
          time: convertToIST(`2000-01-01T${punchIn}`),
          location: "Manual Entry",
          ipAddress: "",
          userAgent: "",
        };
      }
      if (punchOut) {
        session.punchOut = {
          time: convertToIST(`2000-01-01T${punchOut}`),
          location: "Manual Entry",
          ipAddress: "",
          userAgent: "",
        };
      }

      punchSessions.push(session);
    }

    const attendance = new Attendance({
      employee: employeeId,
      date: new Date(date),
      totalHours: parseFloat(totalHours.toFixed(2)),
      status,
      isManualEntry: true,
      manualEntryBy: req.user._id,
      manualEntryReason: reason,
      punchSessions,
    });

    await attendance.save();

    return sendSuccessResponse(res, {
      attendance: {
        _id: attendance._id,
        employee: {
          _id: employee._id,
          name: employee.name,
          employeeId: employee.employeeId,
        },
        date: attendance.date,
        status: attendance.status,
        totalHours: attendance.totalHours,
        isManualEntry: attendance.isManualEntry,
      },
      message: "Manual attendance entry created successfully",
    });
  } catch (error) {
    return sendErrorResponse(res, "Failed to create manual attendance entry");
  }
};

// @desc    Update attendance record
// @route   PUT /api/admin/attendance/:id
// @access  Private (Admin)
const updateAttendance = async (req, res) => {
  try {
    const { id } = req.params;
    const { punchIn, punchOut, status, notes } = req.body;

    const attendance = await Attendance.findById(id).populate(
      "employee",
      "name employeeId"
    );

    if (!attendance) {
      return sendErrorResponse(res, "Attendance record not found");
    }

    // Update status and notes
    if (status !== undefined) {
      attendance.status = status;
    }
    if (notes !== undefined) {
      attendance.notes = notes;
    }

    // Update punch sessions if punch times are provided
    if (punchIn !== undefined || punchOut !== undefined) {
      let totalHours = 0;

      if (punchIn && punchOut) {
        const punchInTime = new Date(`2000-01-01T${punchIn}`);
        const punchOutTime = new Date(`2000-01-01T${punchOut}`);
        totalHours = (punchOutTime - punchInTime) / (1000 * 60 * 60);
      }

      // Update or create punch session
      if (attendance.punchSessions && attendance.punchSessions.length > 0) {
        // Update existing session
        const session = attendance.punchSessions[0];
        if (punchIn !== undefined) {
          session.punchIn = {
            time: new Date(`2000-01-01T${punchIn}`),
            location: "Manual Entry",
            ipAddress: "",
            userAgent: "",
          };
        }
        if (punchOut !== undefined) {
          session.punchOut = {
            time: new Date(`2000-01-01T${punchOut}`),
            location: "Manual Entry",
            ipAddress: "",
            userAgent: "",
          };
        }
        session.sessionHours = parseFloat(totalHours.toFixed(2));
      } else {
        // Create new session
        const session = {
          sessionHours: parseFloat(totalHours.toFixed(2)),
        };

        if (punchIn !== undefined) {
          session.punchIn = {
            time: new Date(`2000-01-01T${punchIn}`),
            location: "Manual Entry",
            ipAddress: "",
            userAgent: "",
          };
        }
        if (punchOut !== undefined) {
          session.punchOut = {
            time: new Date(`2000-01-01T${punchOut}`),
            location: "Manual Entry",
            ipAddress: "",
            userAgent: "",
          };
        }

        attendance.punchSessions = [session];
      }

      attendance.totalHours = parseFloat(totalHours.toFixed(2));
    }

    await attendance.save();

    // Get first punch in and last punch out for response
    let firstPunchIn = null;
    let lastPunchOut = null;

    if (attendance.punchSessions && attendance.punchSessions.length > 0) {
      const firstSession = attendance.punchSessions[0];
      const lastSession =
        attendance.punchSessions[attendance.punchSessions.length - 1];

      if (firstSession.punchIn && firstSession.punchIn.time) {
        firstPunchIn = moment(firstSession.punchIn.time).format("HH:mm:ss");
      }

      if (lastSession.punchOut && lastSession.punchOut.time) {
        lastPunchOut = moment(lastSession.punchOut.time).format("HH:mm:ss");
      }
    }

    return sendSuccessResponse(res, {
      attendance: {
        _id: attendance._id,
        employee: attendance.employee,
        date: attendance.date,
        status: attendance.status,
        totalHours: attendance.totalHours,
        punchIn: firstPunchIn,
        punchOut: lastPunchOut,
        notes: attendance.notes,
      },
      message: "Attendance record updated successfully",
    });
  } catch (error) {
    return sendErrorResponse(res, "Failed to update attendance record");
  }
};

// @desc    Get dashboard statistics
// @route   GET /api/admin/dashboard
// @access  Private (Admin)
const getDashboardStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Get total employees
    const totalEmployees = await User.countDocuments({ role: "employee" });
    const activeEmployees = await User.countDocuments({
      role: "employee",
      status: "active",
    });

    // Get today's date in IST
    const today = moment().utcOffset("+05:30").format("YYYY-MM-DD");
    const todayQuery = createISTDateRangeQuery(today, today);

    // Get today's attendance
    const todayAttendance = await Attendance.find({ ...todayQuery }).populate(
      "employee",
      "name employeeId department"
    );

    // Get all active employees to check who hasn't punched in
    const allActiveEmployees = await User.find({
      role: "employee",
      status: "active",
    }).select("_id");

    // Create a set of active employee IDs for quick lookup
    const activeEmployeeIds = new Set(
      allActiveEmployees.map((emp) => emp._id.toString())
    );

    // Filter attendance records to only include active employees
    const activeAttendance = todayAttendance.filter((record) =>
      activeEmployeeIds.has(record.employee._id.toString())
    );

    // Log if there were inactive employees in attendance records
    const inactiveInAttendance = todayAttendance.filter(
      (record) => !activeEmployeeIds.has(record.employee._id.toString())
    );
    if (inactiveInAttendance.length > 0) {
      console.warn(
        `Dashboard: Found ${inactiveInAttendance.length} attendance records for inactive employees:`,
        inactiveInAttendance.map((record) => record.employee.employeeId)
      );
    }

    // Ensure we have unique attendance records per employee
    const uniqueAttendance = [];
    const seenEmployeeIds = new Set();

    activeAttendance.forEach((record) => {
      const employeeId = record.employee._id.toString();
      if (!seenEmployeeIds.has(employeeId)) {
        seenEmployeeIds.add(employeeId);
        uniqueAttendance.push(record);
      }
    });

    // Get all active employees to check who hasn't punched in
    const employeeIdsWithAttendance = new Set(
      uniqueAttendance.map((record) => record.employee._id.toString())
    );

    // Count employees who haven't punched in yet
    const employeesWithoutAttendance = allActiveEmployees.filter(
      (emp) => !employeeIdsWithAttendance.has(emp._id.toString())
    ).length;

    // Enhance attendance records with request status information for accurate stats
    const enhancedAttendance = await Promise.all(
      uniqueAttendance.map(async (record) => {
        const recordDate = new Date(record.date);
        recordDate.setHours(0, 0, 0, 0);

        // Check for approved requests
        const approvedRequestStatus =
          await AttendanceStatusService.checkRequestStatus(
            record.employee._id,
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

    const todayStats = {
      total: enhancedAttendance.length,
      present: enhancedAttendance.filter(
        (record) => record.status === "present"
      ).length,
      absent: enhancedAttendance.filter((record) => record.status === "absent")
        .length,
      late: enhancedAttendance.filter((record) => record.status === "late")
        .length,
      "half-day": enhancedAttendance.filter(
        (record) => record.status === "half-day"
      ).length,
      leave: enhancedAttendance.filter((record) => record.status === "leave")
        .length,
      "work-from-home": enhancedAttendance.filter(
        (record) => record.status === "work-from-home"
      ).length,
      "on-duty": enhancedAttendance.filter(
        (record) => record.status === "on-duty"
      ).length,
      "sick-leave": enhancedAttendance.filter(
        (record) => record.status === "sick-leave"
      ).length,
      holiday: enhancedAttendance.filter(
        (record) => record.status === "holiday"
      ).length,
      login: enhancedAttendance.filter((record) => record.status === "login")
        .length,
      logout: enhancedAttendance.filter((record) => record.status === "logout")
        .length,
      "no-records": enhancedAttendance.filter(
        (record) => record.status === "no-records"
      ).length,
      penalty: enhancedAttendance.filter(
        (record) => record.status === "penalty"
      ).length,
    };

    // Calculate attendance statistics more accurately
    const currentTime = moment().utcOffset("+05:30");
    const currentHour = currentTime.hour();
    const currentMinute = currentTime.minute();
    const isToday = currentTime
      .startOf("day")
      .isSame(moment(today).startOf("day"));
    const isWorkDayCompleted =
      currentHour >= 23 || (currentHour === 23 && currentMinute >= 30); // After 11:30 PM IST

    // Declare variables in outer scope
    let attendancePercentage = 0;
    let absentPercentage = 0;

    // For today, use different logic based on whether work day is completed
    if (isToday) {
      // Calculate present employees based on punch sessions (completed + punched-in)
      let completedCount = 0;
      let punchedInCount = 0;
      let notStartedCount = 0;
      let absentCount = 0;

      enhancedAttendance.forEach((record) => {
        // Check if employee has any punch sessions
        if (record.punchSessions && record.punchSessions.length > 0) {
          const lastSession =
            record.punchSessions[record.punchSessions.length - 1];

          if (
            lastSession.punchIn &&
            lastSession.punchIn.time &&
            lastSession.punchOut &&
            lastSession.punchOut.time
          ) {
            // Employee has both punch-in and punch-out
            completedCount++;
          } else if (
            lastSession.punchIn &&
            lastSession.punchIn.time &&
            !lastSession.punchOut?.time
          ) {
            // Employee has only punch-in (still logged in)
            punchedInCount++;
          }
        }
        // Note: We don't count employees with "absent" status here as they are already counted in notStartedCount
        // Employees with "absent" status are those who have attendance records but no punch sessions
      });

      // Count employees without attendance records and employees with "absent" status
      const employeesWithAbsentStatus = enhancedAttendance.filter(
        (record) => record.status === "absent"
      ).length;
      const employeesWithoutAttendance =
        activeEmployees - uniqueAttendance.length;

      // Calculate employees with special statuses (leave, work-from-home, on-duty)
      const employeesWithSpecialStatus =
        todayStats.leave + todayStats["work-from-home"] + todayStats["on-duty"];

      // Calculate not started count (employees who should be working but aren't)
      // This excludes employees with special statuses
      notStartedCount = Math.max(
        0,
        activeEmployees -
          completedCount -
          punchedInCount -
          employeesWithSpecialStatus
      );

      // Update todayStats with the correct counts for today
      todayStats.completed = completedCount;
      todayStats["punched-in"] = punchedInCount;
      todayStats["not-started"] = notStartedCount;
      todayStats.absent = employeesWithAbsentStatus; // Only count explicit absent status

      if (isWorkDayCompleted) {
        // After work day is completed, calculate final present/absent based on total hours
        let presentCount = 0;
        let halfDayCount = 0;
        let absentCount = 0;

        // Process employees with attendance records
        enhancedAttendance.forEach((record) => {
          const totalHours = record.totalHours || 0;

          if (totalHours > 7.5) {
            // Present: > 7 hours 30 minutes
            presentCount++;
          } else if (totalHours >= 4 && totalHours <= 7.5) {
            // Half-day: between 4 hours and 7 hours 30 minutes
            halfDayCount++;
          } else {
            // Absent: < 4 hours
            absentCount++;
          }
        });

        // Add employees without attendance records to absent count
        absentCount += employeesWithoutAttendance;

        // Update todayStats with the new counts
        todayStats.present = presentCount;
        todayStats["half-day"] = halfDayCount;
        todayStats.absent = absentCount;

        // Calculate attendance percentage (present + half-day)
        const totalPresent = presentCount + halfDayCount;
        attendancePercentage =
          activeEmployees > 0
            ? Math.round((totalPresent / activeEmployees) * 100)
            : 0;

        // Calculate absent percentage
        absentPercentage =
          activeEmployees > 0
            ? Math.round((absentCount / activeEmployees) * 100)
            : 0;
      } else {
        // During work day, show working status instead of final present/absent
        const totalWorking = completedCount + punchedInCount;
        const totalNotWorking = notStartedCount;

        todayStats.present = totalWorking;
        todayStats.absent = totalNotWorking;

        // Calculate working percentage (excluding employees with special statuses)
        const employeesExpectedToWork =
          activeEmployees - employeesWithSpecialStatus;
        attendancePercentage =
          employeesExpectedToWork > 0
            ? Math.round((totalWorking / employeesExpectedToWork) * 100)
            : 0;

        // Calculate not working percentage (excluding employees with special statuses)
        absentPercentage =
          employeesExpectedToWork > 0
            ? Math.round((totalNotWorking / employeesExpectedToWork) * 100)
            : 0;
      }
    } else {
      // For previous days, use the original logic
      // Calculate present employees (present + late + half-day)
      const totalPresent =
        todayStats.present + todayStats.late + todayStats["half-day"];

      // Calculate absent employees - respect actual attendance records
      let absentCount;
      if (currentHour >= 10) {
        // After 10 AM: count employees with "absent" status + employees without attendance records
        const absentWithRecords = uniqueAttendance.filter(
          (record) => record.status === "absent"
        ).length;
        const employeesWithoutAttendance =
          activeEmployees - uniqueAttendance.length;
        absentCount = absentWithRecords + employeesWithoutAttendance;
      } else {
        // Before 10 AM: only count employees with explicit "absent" status
        absentCount = uniqueAttendance.filter(
          (record) => record.status === "absent"
        ).length;
      }

      // Update todayStats with the correct absent count
      todayStats.absent = absentCount;

      // Calculate attendance percentage
      attendancePercentage =
        activeEmployees > 0
          ? Math.round((totalPresent / activeEmployees) * 100)
          : 0;

      // Calculate absent percentage
      absentPercentage =
        activeEmployees > 0
          ? Math.round((absentCount / activeEmployees) * 100)
          : 0;
    }

    // Get recent attendance records
    const recentAttendance = await Attendance.find()
      .populate("employee", "name employeeId department")
      .sort({ date: -1 })
      .limit(10);

    // Get department-wise statistics
    const departmentStats = await User.aggregate([
      { $match: { role: "employee" } },
      {
        $group: {
          _id: "$department",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    // Get attendance trends for the last 7 days
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];
      last7Days.push(dateStr);
    }

    const weeklyStats = await Promise.all(
      last7Days.map(async (date) => {
        const dateQuery = createISTDateRangeQuery(date, date);
        const dayAttendance = await Attendance.find({ ...dateQuery });
        return {
          date,
          present: dayAttendance.filter((record) => record.status === "present")
            .length,
          absent: dayAttendance.filter((record) => record.status === "absent")
            .length,
          late: dayAttendance.filter((record) => record.status === "late")
            .length,
        };
      })
    );

    return sendSuccessResponse(res, {
      totalEmployees,
      activeEmployees,
      employeesExpectedToWork: isToday
        ? activeEmployees -
          (todayStats.leave +
            todayStats["work-from-home"] +
            todayStats["on-duty"])
        : activeEmployees,
      todayAttendance: isToday
        ? todayStats.completed + todayStats["punched-in"]
        : todayStats.present,
      attendancePercentage,
      absentPercentage,
      absentToday: isToday ? todayStats["not-started"] : todayStats.absent,
      absentWithRecords: uniqueAttendance.filter(
        (record) => record.status === "absent"
      ).length,
      lateToday: todayStats.late,
      halfDayToday: todayStats["half-day"],
      leaveToday: todayStats.leave,
      workFromHomeToday: todayStats["work-from-home"],
      onDutyToday: todayStats["on-duty"],
      totalPresentToday: isToday
        ? todayStats.completed + todayStats["punched-in"]
        : todayStats.present + todayStats.late + todayStats["half-day"],
      totalAbsentToday: isToday ? todayStats["not-started"] : todayStats.absent,
      inactiveEmployees: totalEmployees - activeEmployees,
      // Add new status counts for today
      completedToday: todayStats.completed || 0,
      punchedInToday: todayStats["punched-in"] || 0,
      notStartedToday: todayStats["not-started"] || 0,
      // Add work day completion status
      isWorkDayCompleted: isToday ? isWorkDayCompleted : true, // Previous days are always completed
      isToday: isToday,
      recentAttendance: recentAttendance.map((record) => ({
        _id: record._id,
        employee: record.employee,
        date: record.date,
        status: record.status,
        totalHours: record.totalHours,
      })),
      departmentStats,
      weeklyStats,
    });
  } catch (error) {
    console.error("Dashboard API Error:", error);
    return sendErrorResponse(res, "Failed to get dashboard statistics");
  }
};

// @desc    Generate reports
// @route   GET /api/admin/reports
// @access  Private (Admin)
const getReports = async (req, res) => {
  try {
    const {
      reportType = "attendance",
      startDate,
      endDate,
      department,
      employeeId,
      page = 1,
      limit = 50,
    } = req.query;

    let query = {};

    // Date range filter
    if (startDate && endDate) {
      Object.assign(query, createISTDateRangeQuery(startDate, endDate));
    }

    // Department filter
    if (department) {
      query["employee.department"] = department;
    }

    // Employee filter
    if (employeeId) {
      const employee = await User.findOne({ employeeId });
      if (employee) {
        query.employee = employee._id;
      }
    }

    // Check if we're looking at today's date
    const today = moment().startOf("day");
    const startDateMoment = moment(startDate).startOf("day");
    const endDateMoment = moment(endDate).startOf("day");
    const isTodayIncluded = today.isBetween(
      startDateMoment,
      endDateMoment,
      null,
      "[]"
    );
    const currentHour = moment().hour();
    const currentMinute = moment().minute();
    const isWorkDayCompleted =
      currentHour >= 23 || (currentHour === 23 && currentMinute >= 30); // After 11:30 PM

    // Build aggregation pipeline based on report type
    let pipeline = [
      {
        $lookup: {
          from: "users",
          localField: "employee",
          foreignField: "_id",
          as: "employee",
        },
      },
      {
        $unwind: "$employee",
      },
      // Filter to show only employees (exclude admins)
      {
        $match: {
          "employee.role": "employee",
        },
      },
    ];

    // Add date filter
    if (startDate && endDate) {
      pipeline.push({
        $match: {
          date: {
            $gte: new Date(startDate),
            $lte: new Date(endDate),
          },
        },
      });
    }

    // Add department filter
    if (department) {
      pipeline.push({
        $match: {
          "employee.department": department,
        },
      });
    }

    // Add employee filter
    if (employeeId) {
      const employee = await User.findOne({ employeeId });
      if (employee) {
        pipeline.push({
          $match: {
            employee: employee._id,
          },
        });
      }
    }

    // Add report-specific aggregations
    switch (reportType) {
      case "attendance":
        pipeline.push(
          {
            $group: {
              _id: {
                employeeId: "$employee.employeeId",
                name: "$employee.name",
                department: "$employee.department",
                date: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
              },
              status: { $first: "$status" },
              totalHours: { $first: "$totalHours" },
              punchSessions: { $first: "$punchSessions" },
            },
          },
          {
            $addFields: {
              punchIn: {
                $cond: {
                  if: { $gt: [{ $size: "$punchSessions" }, 0] },
                  then: { $arrayElemAt: ["$punchSessions.punchIn.time", 0] },
                  else: null,
                },
              },
              punchOut: {
                $cond: {
                  if: { $gt: [{ $size: "$punchSessions" }, 0] },
                  then: {
                    $let: {
                      vars: {
                        lastSession: { $arrayElemAt: ["$punchSessions", -1] },
                      },
                      in: "$$lastSession.punchOut.time",
                    },
                  },
                  else: null,
                },
              },
            },
          },
          {
            $addFields: {
              // Calculate proper status based on punch sessions and work day completion
              displayStatus: {
                $cond: {
                  if: {
                    $and: [
                      {
                        $eq: [
                          {
                            $dateToString: {
                              format: "%Y-%m-%d",
                              date: new Date(),
                            },
                          },
                          "$_id.date",
                        ],
                      },
                      { $lt: [{ $hour: new Date() }, 23] },
                    ],
                  },
                  then: {
                    // For today before 11 PM, show working status
                    $cond: {
                      if: {
                        $and: [
                          { $ne: ["$punchIn", null] },
                          { $ne: ["$punchOut", null] },
                        ],
                      },
                      then: "completed",
                      else: {
                        $cond: {
                          if: {
                            $and: [
                              { $ne: ["$punchIn", null] },
                              { $eq: ["$punchOut", null] },
                            ],
                          },
                          then: "punched-in",
                          else: "not-started",
                        },
                      },
                    },
                  },
                  else: {
                    // For previous days or today after 11 PM, show final status (Present/Absent)
                    $cond: {
                      if: {
                        $and: [
                          { $ne: ["$punchIn", null] },
                          { $ne: ["$punchOut", null] },
                          { $gt: [{ $ifNull: ["$totalHours", 0] }, 0] },
                        ],
                      },
                      then: "present",
                      else: "absent",
                    },
                  },
                },
              },
            },
          },
          {
            $project: {
              _id: 1,
              status: 1,
              displayStatus: 1,
              totalHours: 1,
              punchIn: 1,
              punchOut: 1,
            },
          },
          {
            $sort: { "_id.date": -1, "_id.name": 1 },
          }
        );
        break;

      case "late":
        pipeline.push(
          {
            $match: { status: "late" },
          },
          {
            $group: {
              _id: {
                employeeId: "$employee.employeeId",
                name: "$employee.name",
                department: "$employee.department",
                date: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
              },
              punchSessions: { $first: "$punchSessions" },
              totalHours: { $first: "$totalHours" },
            },
          },
          {
            $addFields: {
              punchIn: {
                $cond: {
                  if: { $gt: [{ $size: "$punchSessions" }, 0] },
                  then: { $arrayElemAt: ["$punchSessions.punchIn.time", 0] },
                  else: null,
                },
              },
            },
          },
          {
            $project: {
              _id: 1,
              punchIn: 1,
              totalHours: 1,
            },
          },
          {
            $sort: { "_id.date": -1, "_id.name": 1 },
          }
        );
        break;

      case "absent":
        pipeline.push(
          {
            $match: { status: "absent" },
          },
          {
            $group: {
              _id: {
                employeeId: "$employee.employeeId",
                name: "$employee.name",
                department: "$employee.department",
                date: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
              },
            },
          },
          {
            $sort: { "_id.date": -1, "_id.name": 1 },
          }
        );
        break;

      case "summary":
        pipeline.push(
          {
            $group: {
              _id: {
                employeeId: "$employee.employeeId",
                name: "$employee.name",
                department: "$employee.department",
              },
              totalDays: { $sum: 1 },
              presentDays: {
                $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] },
              },
              absentDays: {
                $sum: { $cond: [{ $eq: ["$status", "absent"] }, 1, 0] },
              },
              lateDays: {
                $sum: { $cond: [{ $eq: ["$status", "late"] }, 1, 0] },
              },
              halfDayDays: {
                $sum: { $cond: [{ $eq: ["$status", "half-day"] }, 1, 0] },
              },
              leaveDays: {
                $sum: { $cond: [{ $eq: ["$status", "leave"] }, 1, 0] },
              },
              workFromHomeDays: {
                $sum: { $cond: [{ $eq: ["$status", "work-from-home"] }, 1, 0] },
              },
              onDutyDays: {
                $sum: { $cond: [{ $eq: ["$status", "on-duty"] }, 1, 0] },
              },
              sickLeaveDays: {
                $sum: { $cond: [{ $eq: ["$status", "sick-leave"] }, 1, 0] },
              },
              holidayDays: {
                $sum: { $cond: [{ $eq: ["$status", "holiday"] }, 1, 0] },
              },
              loginDays: {
                $sum: { $cond: [{ $eq: ["$status", "login"] }, 1, 0] },
              },
              logoutDays: {
                $sum: { $cond: [{ $eq: ["$status", "logout"] }, 1, 0] },
              },
              noRecordsDays: {
                $sum: { $cond: [{ $eq: ["$status", "no-records"] }, 1, 0] },
              },
              penaltyDays: {
                $sum: { $cond: [{ $eq: ["$status", "penalty"] }, 1, 0] },
              },
              totalHours: { $sum: "$totalHours" },
            },
          },
          {
            $addFields: {
              attendancePercentage: {
                $multiply: [
                  {
                    $cond: [
                      { $gt: ["$totalDays", 0] },
                      { $divide: ["$presentDays", "$totalDays"] },
                      0,
                    ],
                  },
                  100,
                ],
              },
            },
          },
          {
            $sort: { "_id.name": 1 },
          }
        );
        break;

      default:
        return sendErrorResponse(res, "Invalid report type");
    }

    // Add pagination
    const skip = (page - 1) * limit;
    pipeline.push({ $skip: skip }, { $limit: parseInt(limit) });

    const results = await Attendance.aggregate(pipeline);

    // Debug: Log some results to see what's happening
    if (results.length > 0) {
      console.log("Reports Results Debug:", {
        sampleRecord: {
          date: results[0]._id.date,
          status: results[0].status,
          displayStatus: results[0].displayStatus,
          totalHours: results[0].totalHours,
          punchIn: results[0].punchIn,
          punchOut: results[0].punchOut,
        },
        totalResults: results.length,
      });
    }

    // Get total count for pagination
    const countPipeline = pipeline.slice(0, -2); // Remove skip and limit
    countPipeline.push({ $count: "total" });
    const countResult = await Attendance.aggregate(countPipeline);
    const total = countResult.length > 0 ? countResult[0].total : 0;

    return sendSuccessResponse(res, {
      reportType,
      results,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalRecords: total,
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    return sendErrorResponse(res, "Failed to generate report");
  }
};

// @desc    Export reports
// @route   GET /api/admin/reports/export
// @access  Private (Admin)
const exportReports = async (req, res) => {
  try {
    const {
      reportType = "attendance",
      startDate,
      endDate,
      department,
      employeeId,
      format = "csv",
    } = req.query;

    let query = {};

    // Date range filter
    if (startDate && endDate) {
      Object.assign(query, createISTDateRangeQuery(startDate, endDate));
    }

    // Department filter
    if (department) {
      query["employee.department"] = department;
    }

    // Employee filter
    if (employeeId) {
      const employee = await User.findOne({ employeeId });
      if (employee) {
        query.employee = employee._id;
      }
    }

    // Build aggregation pipeline
    let pipeline = [
      {
        $lookup: {
          from: "users",
          localField: "employee",
          foreignField: "_id",
          as: "employee",
        },
      },
      {
        $unwind: "$employee",
      },
    ];

    // Add filters
    if (startDate && endDate) {
      pipeline.push({
        $match: {
          date: {
            $gte: new Date(startDate),
            $lte: new Date(endDate),
          },
        },
      });
    }

    if (department) {
      pipeline.push({
        $match: {
          "employee.department": department,
        },
      });
    }

    if (employeeId) {
      const employee = await User.findOne({ employeeId });
      if (employee) {
        pipeline.push({
          $match: {
            employee: employee._id,
          },
        });
      }
    }

    // Add report-specific aggregations
    switch (reportType) {
      case "attendance":
        pipeline.push(
          {
            $group: {
              _id: {
                employeeId: "$employee.employeeId",
                name: "$employee.name",
                department: "$employee.department",
                date: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
              },
              status: { $first: "$status" },
              totalHours: { $first: "$totalHours" },
              punchIn: { $first: "$firstPunchInTime" },
              punchOut: { $first: "$lastPunchOutTime" },
            },
          },
          {
            $sort: { "_id.date": -1, "_id.name": 1 },
          }
        );
        break;

      case "summary":
        pipeline.push(
          {
            $group: {
              _id: {
                employeeId: "$employee.employeeId",
                name: "$employee.name",
                department: "$employee.department",
              },
              totalDays: { $sum: 1 },
              presentDays: {
                $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] },
              },
              absentDays: {
                $sum: { $cond: [{ $eq: ["$status", "absent"] }, 1, 0] },
              },
              lateDays: {
                $sum: { $cond: [{ $eq: ["$status", "late"] }, 1, 0] },
              },
              halfDayDays: {
                $sum: { $cond: [{ $eq: ["$status", "half-day"] }, 1, 0] },
              },
              leaveDays: {
                $sum: { $cond: [{ $eq: ["$status", "leave"] }, 1, 0] },
              },
              workFromHomeDays: {
                $sum: { $cond: [{ $eq: ["$status", "work-from-home"] }, 1, 0] },
              },
              onDutyDays: {
                $sum: { $cond: [{ $eq: ["$status", "on-duty"] }, 1, 0] },
              },
              sickLeaveDays: {
                $sum: { $cond: [{ $eq: ["$status", "sick-leave"] }, 1, 0] },
              },
              holidayDays: {
                $sum: { $cond: [{ $eq: ["$status", "holiday"] }, 1, 0] },
              },
              loginDays: {
                $sum: { $cond: [{ $eq: ["$status", "login"] }, 1, 0] },
              },
              logoutDays: {
                $sum: { $cond: [{ $eq: ["$status", "logout"] }, 1, 0] },
              },
              noRecordsDays: {
                $sum: { $cond: [{ $eq: ["$status", "no-records"] }, 1, 0] },
              },
              penaltyDays: {
                $sum: { $cond: [{ $eq: ["$status", "penalty"] }, 1, 0] },
              },
              totalHours: { $sum: "$totalHours" },
            },
          },
          {
            $addFields: {
              attendancePercentage: {
                $multiply: [
                  {
                    $cond: [
                      { $gt: ["$totalDays", 0] },
                      { $divide: ["$presentDays", "$totalDays"] },
                      0,
                    ],
                  },
                  100,
                ],
              },
            },
          },
          {
            $sort: { "_id.name": 1 },
          }
        );
        break;

      default:
        return sendErrorResponse(res, "Invalid report type");
    }

    const results = await Attendance.aggregate(pipeline);

    // Format data for export
    let exportData = [];
    let headers = [];

    if (reportType === "attendance") {
      headers = [
        "Employee ID",
        "Name",
        "Department",
        "Date",
        "Status",
        "Total Hours",
        "Punch In",
        "Punch Out",
      ];
      exportData = results.map((record) => [
        record._id.employeeId,
        record._id.name,
        record._id.department,
        record._id.date,
        record.status,
        record.totalHours || 0,
        record.punchIn || "",
        record.punchOut || "",
      ]);
    } else if (reportType === "summary") {
      headers = [
        "Employee ID",
        "Name",
        "Department",
        "Total Days",
        "Present Days",
        "Absent Days",
        "Late Days",
        "Half Day Days",
        "Leave Days",
        "Work From Home Days",
        "On Duty Days",
        "Sick Leave Days",
        "Holiday Days",
        "Login Days",
        "Logout Days",
        "No Records Days",
        "Penalty Days",
        "Total Hours",
        "Attendance Percentage",
      ];
      exportData = results.map((record) => [
        record._id.employeeId,
        record._id.name,
        record._id.department,
        record.totalDays,
        record.presentDays,
        record.absentDays,
        record.lateDays,
        record.halfDayDays || 0,
        record.leaveDays || 0,
        record.workFromHomeDays || 0,
        record.onDutyDays || 0,
        record.sickLeaveDays || 0,
        record.holidayDays || 0,
        record.loginDays || 0,
        record.logoutDays || 0,
        record.noRecordsDays || 0,
        record.penaltyDays || 0,
        parseFloat(record.totalHours.toFixed(2)),
        parseFloat(record.attendancePercentage.toFixed(2)) + "%",
      ]);
    }

    // Generate CSV content
    const csvContent = [
      headers.join(","),
      ...exportData.map((row) => row.join(",")),
    ].join("\n");

    // Set response headers
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${reportType}_report_${startDate}_to_${endDate}.csv"`
    );

    res.send(csvContent);
  } catch (error) {
    return sendErrorResponse(res, "Failed to export report");
  }
};

// @desc    Update attendance status for all employees on a specific date
// @route   POST /api/admin/attendance/update-status
// @access  Private (Admin)
const updateAttendanceStatus = async (req, res) => {
  try {
    const { date } = req.body;

    if (!date) {
      return sendErrorResponse(res, "Date is required");
    }

    // Update attendance status for all employees
    const results = await AttendanceStatusService.batchUpdateAttendanceStatus(
      new Date(date)
    );

    return sendSuccessResponse(res, {
      date: date,
      results: results,
      totalProcessed: results.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
    });
  } catch (error) {
    return sendErrorResponse(res, "Failed to update attendance status");
  }
};

// @desc    Get currently logged in employees
// @route   GET /api/admin/attendance/logged-in
// @access  Private (Admin)
const getLoggedInEmployees = async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date ? new Date(date) : new Date();

    // Get logged in employees
    const loggedInEmployees = await AutoPunchOutService.getLoggedInEmployees(
      targetDate
    );

    return sendSuccessResponse(res, {
      date: moment(targetDate).format("YYYY-MM-DD"),
      loggedInCount: loggedInEmployees.length,
      employees: loggedInEmployees,
    });
  } catch (error) {
    console.error("Get logged in employees error:", error);
    return sendErrorResponse(
      res,
      `Failed to get logged in employees: ${error.message}`
    );
  }
};

// @desc    Check if auto punch-out should run
// @route   GET /api/admin/attendance/auto-punchout/status
// @access  Private (Admin)
const getAutoPunchOutStatus = async (req, res) => {
  try {
    const shouldRun = AutoPunchOutService.shouldRunAutoPunchOut();
    const now = moment();

    return sendSuccessResponse(res, {
      shouldRun: shouldRun,
      currentTime: now.format("HH:mm:ss"),
      currentDate: now.format("YYYY-MM-DD"),
      autoPunchOutTime: "18:00:00", // 6:00 PM
    });
  } catch (error) {
    console.error("Get auto punch-out status error:", error);
    return sendErrorResponse(
      res,
      `Failed to get auto punch-out status: ${error.message}`
    );
  }
};

// @desc    Get employees by attendance status for a specific date
// @route   GET /api/admin/attendance/by-status
// @access  Private (Admin)
const getEmployeesByAttendanceStatus = async (req, res) => {
  try {
    const { status, date } = req.query;

    if (!status) {
      return sendErrorResponse(res, "Status is required");
    }

    const targetDate = date ? new Date(date) : new Date();
    const today = moment(targetDate).startOf("day");
    const todayQuery = createISTDateRangeQuery(
      today.format("YYYY-MM-DD"),
      today.format("YYYY-MM-DD")
    );

    // Get attendance records for the specified status
    const attendanceRecords = await Attendance.find({
      ...todayQuery,
      status: status,
    }).populate("employee", "name employeeId department status");

    // Filter to only include active employees
    const activeEmployees = attendanceRecords.filter(
      (record) => record.employee && record.employee.status === "active"
    );

    const employees = activeEmployees.map((record) => ({
      _id: record.employee._id,
      name: record.employee.name,
      employeeId: record.employee.employeeId,
      department: record.employee.department,
      status: record.status,
      attendanceId: record._id,
      totalHours: record.totalHours,
    }));

    return sendSuccessResponse(res, {
      date: today.format("YYYY-MM-DD"),
      status: status,
      count: employees.length,
      employees: employees,
    });
  } catch (error) {
    console.error("Get employees by attendance status error:", error);
    return sendErrorResponse(
      res,
      `Failed to get employees by attendance status: ${error.message}`
    );
  }
};

// @desc    Manually trigger end-of-day status update for a specific date
// @route   POST /api/admin/attendance/end-of-day-update
// @access  Private (Admin)
const triggerEndOfDayStatusUpdate = async (req, res) => {
  try {
    const { date } = req.body;

    // Use provided date or default to yesterday
    const targetDate = date ? new Date(date) : new Date();
    if (date) {
      targetDate.setDate(targetDate.getDate() - 1); // Process the day before the provided date
    } else {
      targetDate.setDate(targetDate.getDate() - 1); // Default to yesterday
    }

    console.log(
      `Manual end-of-day status update triggered for date: ${moment(
        targetDate
      ).format("YYYY-MM-DD")}`
    );

    // Batch update attendance status for all employees
    const results = await AttendanceStatusService.batchUpdateAttendanceStatus(
      targetDate
    );

    // Calculate summary
    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;
    const totalCount = results.length;

    return sendSuccessResponse(
      res,
      {
        date: moment(targetDate).format("YYYY-MM-DD"),
        totalEmployees: totalCount,
        successCount: successCount,
        failureCount: failureCount,
        results: results,
      },
      `End-of-day status update completed. ${successCount}/${totalCount} employees processed successfully.`
    );
  } catch (error) {
    console.error("Manual end-of-day status update error:", error);
    return sendErrorResponse(
      res,
      `Failed to trigger end-of-day status update: ${error.message}`
    );
  }
};

module.exports = {
  getAllEmployees,
  getNextEmployeeId,
  getEmployeeDetails,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getAllAttendance,
  getTodayAttendance,
  createManualAttendance,
  updateAttendance,
  updateAttendanceStatus,
  getDashboardStats,
  getReports,
  exportReports,
  getLoggedInEmployees,
  getAutoPunchOutStatus,
  getEmployeesByAttendanceStatus,
  triggerEndOfDayStatusUpdate,
};
