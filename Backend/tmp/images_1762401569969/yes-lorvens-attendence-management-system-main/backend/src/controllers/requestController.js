const Request = require("../models/Request");
const User = require("../models/User");
const Attendance = require("../models/Attendance");
const AttendanceStatusService = require("../services/attendanceStatusService");
const {
  createRequestNotification,
  createStatusUpdateNotification,
} = require("./notificationController");
const { sendSuccessResponse, sendErrorResponse, calculatePagination } = require("../utils/responseHelpers");
const { getCurrentDate } = require("../utils/helpers");

// Create a new request
const createRequest = async (req, res) => {
  try {
    const { type, startDate, startTime, endDate, endTime, reason } = req.body;
    const employeeId = req.user._id; // Fixed: use _id instead of id

    // Validate dates - Create dates in IST timezone to avoid timezone issues
    const start = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T00:00:00");
    const today = getCurrentDate();

    if (start < today) {
      return sendErrorResponse(res, "Start date cannot be in the past", 400);
    }

    if (end < start) {
      return sendErrorResponse(res, "End date cannot be before start date", 400);
    }

    // Set default times for all request types
    if (!startTime) {
      req.body.startTime = "09:00:00";
    }
    if (!endTime) {
      req.body.endTime = "18:00:00";
    }

    // Check for existing requests on the same date(s)
    const existingRequestOnSameDate = await Request.findOne({
      employeeId,
      status: { $in: ["pending", "approved"] },
      $or: [
        // Check if there's any request on the start date
        { startDate: start },
        { endDate: start },
        // Check if there's any request on the end date
        { startDate: end },
        { endDate: end },
        // Check if there's any request that spans across these dates
        {
          startDate: { $lte: start },
          endDate: { $gte: start },
        },
        {
          startDate: { $lte: end },
          endDate: { $gte: end },
        },
      ],
    });

    if (existingRequestOnSameDate) {
      return sendErrorResponse(res, "You already have a request for this date. Only one request per date is allowed.", 400);
    }

    // Check for overlapping requests (time-based overlap)
    const overlappingRequest = await Request.findOne({
      employeeId,
      status: { $in: ["pending", "approved"] },
      $or: [
        // Different dates overlap
        {
          startDate: { $lte: end },
          endDate: { $gte: start },
        },
      ],
    });

    if (overlappingRequest) {
      return sendErrorResponse(res, "You have an overlapping request. Please check your existing requests.", 400);
    }

    // Check if employee has already punched in on any date in the request period
    const hasPunchedIn = await checkEmployeePunchInStatus(employeeId, start, end);
    
    if (hasPunchedIn) {
      return sendErrorResponse(res, "Cannot create leave request. You have already punched in on one or more dates in the request period.", 400);
    }

    // Create the request
    const request = new Request({
      employeeId,
      type,
      startDate: start,
      startTime: req.body.startTime,
      endDate: end,
      endTime: req.body.endTime,
      reason,
    });

    await request.save();

    // Create notification for admin
    console.log('Creating notification for request:', request._id);
    console.log('Request data for notification:', {
      _id: request._id,
      employeeId: request.employeeId,
      type: request.type,
      status: request.status
    });
    try {
      await createRequestNotification(request);
      console.log('Notification created successfully for request:', request._id);
    } catch (notificationError) {
      console.error('Error creating notification:', notificationError);
    }

    return sendSuccessResponse(res, request, "Request created successfully", 201);
  } catch (error) {
    return sendErrorResponse(res, "Failed to create request. Please try again.");
  }
};

// Get employee's own requests
const getEmployeeRequests = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const employeeId = req.user._id; // Fixed: use _id instead of id

    const query = { employeeId };

    if (status && status !== "all") {
      query.status = status;
    }

    const requests = await Request.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Request.countDocuments(query);

    const pagination = calculatePagination(page, limit, total);

    return sendSuccessResponse(res, {
        requests,
      pagination,
    });
  } catch (error) {
    return sendErrorResponse(res, "Failed to get requests. Please try again.");
  }
};

// Get all requests (admin only)
const getAllRequests = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, employeeId, type } = req.query;

    const query = {};

    if (status && status !== "all") {
      query.status = status;
    }

    if (employeeId) {
      query.employeeId = employeeId;
    }

    if (type && type !== "all") {
      query.type = type;
    }

    const requests = await Request.find(query)
      .populate([
        { path: "employeeId", select: "name email employeeId department" },
        { path: "approvedBy", select: "name" }
      ])
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Request.countDocuments(query);

    const pagination = calculatePagination(page, limit, total);

    return sendSuccessResponse(res, {
        requests,
      pagination,
    });
  } catch (error) {
    return sendErrorResponse(res, "Failed to get requests. Please try again.");
  }
};

// Update request status (admin only)
const updateRequestStatus = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { status, adminComments } = req.body;

    const request = await Request.findById(requestId).populate([
      { path: "employeeId", select: "name email employeeId" },
      { path: "approvedBy", select: "name" }
    ]);

    if (!request) {
      return sendErrorResponse(res, "Request not found", 404);
    }

    if (request.status !== "pending") {
      return sendErrorResponse(res, "Request has already been processed", 400);
    }

    // If trying to approve the request, check if employee has punched in on any date in the request period
    if (status === "approved") {
      const startDate = new Date(request.startDate);
      const endDate = new Date(request.endDate);
      
      // Check if employee has punched in on any date in the request period
      const hasPunchedIn = await checkEmployeePunchInStatus(request.employeeId._id, startDate, endDate);
      
      if (hasPunchedIn) {
        return sendErrorResponse(res, "Cannot approve leave request. Employee has already punched in on one or more dates in the request period.", 400);
      }
    }

    request.status = status;
    request.adminComments = adminComments;
    request.approvedBy = req.user._id; // Fixed: use _id instead of id
    request.approvedAt = new Date();

    await request.save();

    // Update attendance records for all dates in the request period
    try {
      const startDate = new Date(request.startDate);
      const endDate = new Date(request.endDate);
      
      // Iterate through each date in the request period
      for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
        await AttendanceStatusService.updateAttendanceStatus(request.employeeId._id, new Date(date));
      }
      
      console.log(`Updated attendance status for employee ${request.employeeId.employeeId} from ${startDate.toDateString()} to ${endDate.toDateString()}`);
    } catch (attendanceError) {
      console.error('Error updating attendance status after request status change:', attendanceError);
      // Don't fail the request update if attendance update fails
    }

    // Create notification for employee
    console.log('Creating status update notification for request:', request._id, 'Status:', status);
    try {
      await createStatusUpdateNotification(request);
      console.log('Status update notification created successfully for request:', request._id);
    } catch (notificationError) {
      console.error('Error creating status update notification:', notificationError);
    }

    return sendSuccessResponse(res, request, `Request ${status} successfully`);
  } catch (error) {
    return sendErrorResponse(res, "Failed to update request status. Please try again.");
  }
};

// Helper function to check if employee has punched in on any date in the given range
const checkEmployeePunchInStatus = async (employeeId, startDate, endDate) => {
  try {
    // Create date range query
    const startOfDay = new Date(startDate);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(endDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Find attendance records for the employee in the date range
    const attendanceRecords = await Attendance.find({
      employee: employeeId,
      date: { $gte: startOfDay, $lte: endOfDay }
    });

    // Check if any attendance record has punch sessions
    for (const record of attendanceRecords) {
      if (record.punchSessions && record.punchSessions.length > 0) {
        // Check if any session has a punch-in time
        const hasPunchIn = record.punchSessions.some(session => 
          session.punchIn && session.punchIn.time
        );
        
        if (hasPunchIn) {
          return true; // Employee has punched in on at least one date
        }
      }
    }

    return false; // Employee has not punched in on any date in the range
  } catch (error) {
    console.error('Error checking employee punch-in status:', error);
    throw new Error('Failed to check employee punch-in status');
  }
};

// Get request statistics (admin gets all, employee gets their own)
const getRequestStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const query = {};

    // If user is not admin, only show their own requests
    if (req.user.role !== 'admin') {
      query.employeeId = req.user._id;
    }

    if (startDate && endDate) {
      // Filter by request date range (startDate and endDate of requests)
      query.$or = [
        // Requests that start within the filter range
        {
          startDate: {
            $gte: new Date(startDate),
            $lte: new Date(endDate),
          },
        },
        // Requests that end within the filter range
        {
          endDate: {
            $gte: new Date(startDate),
            $lte: new Date(endDate),
          },
        },
        // Requests that span across the filter range
        {
          startDate: { $lte: new Date(startDate) },
          endDate: { $gte: new Date(endDate) },
        },
      ];
    }

    const totalRequests = await Request.countDocuments(query);
    const pendingRequests = await Request.countDocuments({
      ...query,
      status: "pending",
    });
    const approvedRequests = await Request.countDocuments({
      ...query,
      status: "approved",
    });
    const rejectedRequests = await Request.countDocuments({
      ...query,
      status: "rejected",
    });

    // Get requests by type
    const leaveRequests = await Request.countDocuments({
      ...query,
      type: "leave",
    });
    const odRequests = await Request.countDocuments({
      ...query,
      type: "od",
    });
    const workFromHomeRequests = await Request.countDocuments({
      ...query,
      type: "work_from_home",
    });

    const stats = {
      total: totalRequests,
      pending: pendingRequests,
      approved: approvedRequests,
      rejected: rejectedRequests,
      byType: {
        leave: leaveRequests,
        od: odRequests,
        workFromHome: workFromHomeRequests,
      },
    };

    return sendSuccessResponse(res, stats);
  } catch (error) {
    return sendErrorResponse(res, "Failed to get request statistics. Please try again.");
  }
};

// Delete request (admin only)
const deleteRequest = async (req, res) => {
  try {
    const { requestId } = req.params;

    const request = await Request.findById(requestId);

    if (!request) {
      return sendErrorResponse(res, "Request not found", 404);
    }

    await Request.findByIdAndDelete(requestId);

    return sendSuccessResponse(res, null, "Request deleted successfully");
  } catch (error) {
    return sendErrorResponse(res, "Failed to delete request. Please try again.");
  }
};

module.exports = {
  createRequest,
  getEmployeeRequests,
  getAllRequests,
  updateRequestStatus,
  getRequestStats,
  deleteRequest,
};
