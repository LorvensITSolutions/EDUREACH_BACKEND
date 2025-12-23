const Notification = require("../models/Notification");
const User = require("../models/User");
const Request = require("../models/Request");
const { sendSuccessResponse, sendErrorResponse, calculatePagination } = require("../utils/responseHelpers");

// Get all notifications for the current user
const getNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20, unreadOnly = false } = req.query;
    const skip = (page - 1) * limit;

    console.log('getNotifications called for user:', req.user._id);
    console.log('Query params:', { page, limit, unreadOnly });

    // Build query
    const query = { recipient: req.user._id };
    if (unreadOnly === "true") {
      query.isRead = false;
    }

    console.log('Query:', query);

    // Get notifications with pagination
    const notifications = await Notification.find(query)
      .populate("sender", "name employeeId")
      .populate("relatedRequest", "type startDate endDate reason status")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    console.log('Found notifications:', notifications.length);

    // Get total count
    const total = await Notification.countDocuments(query);
    const totalPages = Math.ceil(total / limit);

    // Get unread count
    const unreadCount = await Notification.countDocuments({
      recipient: req.user._id,
      isRead: false,
    });

    console.log('Total notifications:', total);
    console.log('Unread count:', unreadCount);

    const pagination = calculatePagination(page, limit, total);

    return sendSuccessResponse(res, {
        notifications,
      pagination,
        unreadCount,
    });
  } catch (error) {
    console.error('Error in getNotifications:', error);
    return sendErrorResponse(res, "Failed to fetch notifications");
  }
};

// Mark notification as read (don't delete immediately)
const markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, recipient: req.user._id },
      {
        isRead: true,
        readAt: new Date(),
      },
      { new: true }
    );

    if (!notification) {
      return sendErrorResponse(res, "Notification not found", 404);
    }

    // Don't delete immediately - let user delete manually or auto-delete after some time
    return sendSuccessResponse(res, notification, "Notification marked as read");
  } catch (error) {
    return sendErrorResponse(res, "Failed to mark notification as read");
  }
};

// Mark all notifications as read (don't delete immediately)
const markAllAsRead = async (req, res) => {
  try {
    // Get all unread notifications for the user
    const unreadNotifications = await Notification.find({
      recipient: req.user._id,
      isRead: false,
    });

    if (unreadNotifications.length === 0) {
      return sendSuccessResponse(res, null, "No unread notifications to mark");
    }

    // Mark all as read
    await Notification.updateMany(
      { recipient: req.user._id, isRead: false },
      {
        isRead: true,
        readAt: new Date(),
      }
    );

    // Don't delete all notifications - let user manage them manually
    return sendSuccessResponse(res, null, "All notifications marked as read");
  } catch (error) {
    return sendErrorResponse(res, "Failed to mark notifications as read");
  }
};

// Delete a specific notification
const deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notification = await Notification.findOneAndDelete({
      _id: notificationId,
      recipient: req.user._id,
    });

    if (!notification) {
      return sendErrorResponse(res, "Notification not found", 404);
    }

    return sendSuccessResponse(res, null, "Notification deleted successfully");
  } catch (error) {
    return sendErrorResponse(res, "Failed to delete notification");
  }
};

// Get unread notification count
const getUnreadCount = async (req, res) => {
  try {
    console.log('getUnreadCount called for user:', req.user._id);
    
    const count = await Notification.countDocuments({
      recipient: req.user._id,
      isRead: false,
    });

    console.log('Unread count for user:', req.user._id, 'is:', count);

    return sendSuccessResponse(res, { unreadCount: count });
  } catch (error) {
    console.error('Error in getUnreadCount:', error);
    return sendErrorResponse(res, "Failed to get unread count");
  }
};

// Cleanup old notifications (admin only)
const cleanupOldNotifications = async (req, res) => {
  try {
    const result = await Notification.cleanupOldNotifications();
    return sendSuccessResponse(res, result, "Old notifications cleaned up successfully");
  } catch (error) {
    console.error('Error in cleanupOldNotifications:', error);
    return sendErrorResponse(res, "Failed to cleanup old notifications");
  }
};

// Create a new notification
const createNotification = async (
  recipientId,
  senderId,
  type,
  title,
  message,
  relatedData = {}
) => {
  try {
    console.log('createNotification called with:', {
      recipientId,
      senderId,
      type,
      title,
      message,
      relatedData
    });

    const notificationData = {
      recipient: recipientId,
      sender: senderId,
      type,
      title,
      message,
    };

    // Add related request if provided
    if (relatedData.requestId) {
      notificationData.relatedRequest = relatedData.requestId;
    }

    // Add related attendance if provided
    if (relatedData.attendanceId) {
      notificationData.relatedAttendance = relatedData.attendanceId;
    }

    console.log('Creating notification with data:', notificationData);

    const notification = new Notification(notificationData);
    await notification.save();
    
    console.log('Notification created successfully:', notification._id);
    console.log('Saved notification:', notification);
    return notification;
  } catch (error) {
    console.error('Error in createNotification:', error);
    throw error;
  }
};

// Create notification for new request (for admins)
const createRequestNotification = async (request) => {
  try {
    console.log('createRequestNotification called for request:', request._id);
    console.log('Request object:', request);
    
    // Get all admin users
    const admins = await User.find({ role: "admin", status: "active" });
    console.log('Found admin users:', admins.length);
    console.log('Admin users:', admins.map(admin => ({ id: admin._id, name: admin.name, role: admin.role, status: admin.status })));

    if (admins.length === 0) {
      console.log('No active admin users found - no notifications will be created');
      return;
    }

    for (const admin of admins) {
      console.log('Creating notification for admin:', admin._id);
      await createNotification(
        admin._id,
        request.employeeId,
        "REQUEST_CREATED",
        "New Request Submitted",
        `A new ${request.type} request has been submitted and requires your attention.`,
        { requestId: request._id }
      );
      console.log('Notification created for admin:', admin._id);
    }
    console.log('All admin notifications created successfully');
  } catch (error) {
    console.error('Error in createRequestNotification:', error);
    // Silently handle notification creation errors
  }
};

// Create notification for request status update (for employee)
const createStatusUpdateNotification = async (request) => {
  try {
    console.log('createStatusUpdateNotification called for request:', request._id, 'Status:', request.status);
    console.log('Request object for status update:', {
      _id: request._id,
      employeeId: request.employeeId,
      approvedBy: request.approvedBy,
      type: request.type,
      status: request.status
    });
    
    const statusText = request.status === "approved" ? "approved" : "rejected";
    const notificationType = request.status === "approved" ? "REQUEST_APPROVED" : "REQUEST_REJECTED";

    console.log('Creating notification for employee:', request.employeeId);
    console.log('Notification details:', {
      recipientId: request.employeeId,
      senderId: request.approvedBy,
      type: notificationType,
      title: `Request ${statusText.charAt(0).toUpperCase() + statusText.slice(1)}`,
      message: `Your ${request.type} request has been ${statusText}.`,
      relatedData: { requestId: request._id }
    });

    await createNotification(
      request.employeeId,
      request.approvedBy,
      notificationType,
      `Request ${statusText.charAt(0).toUpperCase() + statusText.slice(1)}`,
      `Your ${request.type} request has been ${statusText}.`,
      { requestId: request._id }
    );
    console.log('Status update notification created successfully for employee:', request.employeeId);
  } catch (error) {
    console.error('Error in createStatusUpdateNotification:', error);
    // Silently handle notification creation errors
  }
};

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getUnreadCount,
  cleanupOldNotifications,
  createNotification,
  createRequestNotification,
  createStatusUpdateNotification,
};
