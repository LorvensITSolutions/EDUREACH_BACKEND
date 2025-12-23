
import Leave from "../models/leaveApplication.model.js";
import Student from "../models/student.model.js";
import Parent from "../models/parent.model.js";
import Teacher from "../models/teacher.model.js";

// ✅ Submit leave request by parent
export const applyLeave = async (req, res) => {
  try {
    const parentId = req.user.parentId;
    const { studentId, fromDate, toDate, reason } = req.body;

    if (!studentId || !fromDate || !toDate || !reason) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Load parent with their children
    const parent = await Parent.findById(parentId).populate("children");
    if (!parent || parent.children.length === 0) {
      return res.status(404).json({ message: "No student linked to this parent" });
    }

    // Validate that the student belongs to this parent
    const student = parent.children.find(child => child._id.toString() === studentId);
    if (!student) {
      return res.status(400).json({ message: "Student not found or not linked to this parent" });
    }

    // Validate dates - allow same dates for single-day leave
    const fromDateObj = new Date(fromDate);
    fromDateObj.setHours(0, 0, 0, 0);
    const toDateObj = new Date(toDate);
    toDateObj.setHours(0, 0, 0, 0);
    
    // Only reject if toDate is strictly before fromDate (allow same dates)
    if (toDateObj < fromDateObj) {
      return res.status(400).json({ message: "To date cannot be before from date" });
    }

    // Restrict current date - only allow future dates (tomorrow onwards)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Check if from date is today or in the past (only allow tomorrow onwards)
    if (fromDateObj.getTime() <= today.getTime()) {
      return res.status(400).json({ message: "Leave can only be applied for future dates (from tomorrow onwards)" });
    }

    const leave = await Leave.create({
      student: student._id,
      fromDate,
      toDate,
      reason,
      appliedBy: parentId,
    });

    res.status(201).json({ message: "Leave request submitted", leave });
  } catch (error) {
    console.error("Apply leave error:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ✅ Get parent's children for leave application
export const getParentChildren = async (req, res) => {
  try {
    const parentId = req.user.parentId;

    const parent = await Parent.findById(parentId).populate("children", "name class section studentId");
    if (!parent || parent.children.length === 0) {
      return res.status(404).json({ message: "No student linked to this parent" });
    }

    res.status(200).json({ children: parent.children });
  } catch (error) {
    console.error("Get parent children error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ Get leaves submitted by parent (all their children)
export const getLeavesByParent = async (req, res) => {
  try {
    const parentId = req.user.parentId;

    const leaves = await Leave.find({ appliedBy: parentId })
      .populate("student", "name class section studentId")
        .populate("approvedBy", "name email") // ✅ Ensure this line is included
      .sort({ createdAt: -1 });

    res.status(200).json({ leaves });
  } catch (error) {
    console.error("Get leaves by parent error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ Admin/teacher view all leave applications (filtered by assigned students for teachers)
export const getAllLeaves = async (req, res) => {
  try {
    const user = req.user;
    let leaves;

    if (user.role === "admin") {
      // ✅ Admin sees ALL leave applications
      leaves = await Leave.find()
        .populate("student", "name class section studentId")
        .populate("appliedBy", "name email")
        .populate("approvedBy", "name email")
        .sort({ createdAt: -1 });
    } else if (user.role === "teacher") {
      // ✅ Teacher sees only their assigned students' leave applications
      const teacher = await Teacher.findById(user.teacherId);
      if (!teacher) {
        return res.status(404).json({ message: "Teacher not found" });
      }

      // Get class-section combinations assigned to this teacher
      const sectionQueries = teacher.sectionAssignments.map(({ className, section }) => ({
        class: className,
        section,
      }));

      // Find students assigned to this teacher
      const assignedStudents = await Student.find({ $or: sectionQueries });
      const assignedStudentIds = assignedStudents.map(student => student._id);

      // Get leave applications only for assigned students
      leaves = await Leave.find({ student: { $in: assignedStudentIds } })
        .populate("student", "name class section studentId")
        .populate("appliedBy", "name email")
        .populate("approvedBy", "name email")
        .sort({ createdAt: -1 });
    } else {
      return res.status(403).json({ message: "Access denied - Only teachers and admins can view leave applications" });
    }

    res.status(200).json({ leaves });
  } catch (error) {
    console.error("Get all leaves error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ Get leave requests for teacher's assigned students only
export const getTeacherLeaves = async (req, res) => {
  try {
    const user = req.user;
    
    if (user.role !== "teacher") {
      return res.status(403).json({ message: "Access denied - Only teachers can access this endpoint" });
    }

    const teacher = await Teacher.findById(user.teacherId);
    if (!teacher) {
      return res.status(404).json({ message: "Teacher not found" });
    }

    // Get class-section combinations assigned to this teacher
    const sectionQueries = teacher.sectionAssignments.map(({ className, section }) => ({
      class: className,
      section,
    }));

    // Find students assigned to this teacher
    const assignedStudents = await Student.find({ $or: sectionQueries });
    const assignedStudentIds = assignedStudents.map(student => student._id);

    // Get leave applications only for assigned students
    const leaves = await Leave.find({ student: { $in: assignedStudentIds } })
      .populate("student", "name class section studentId")
      .populate("appliedBy", "name email")
      .populate("approvedBy", "name email")
      .sort({ createdAt: -1 });

    // Get statistics
    const totalLeaves = leaves.length;
    const pendingLeaves = leaves.filter(leave => leave.status === "pending").length;
    const approvedLeaves = leaves.filter(leave => leave.status === "approved").length;
    const rejectedLeaves = leaves.filter(leave => leave.status === "rejected").length;

    res.status(200).json({ 
      leaves,
      statistics: {
        total: totalLeaves,
        pending: pendingLeaves,
        approved: approvedLeaves,
        rejected: rejectedLeaves
      },
      assignedStudents: assignedStudents.map(s => ({
        _id: s._id,
        name: s.name,
        class: s.class,
        section: s.section,
        studentId: s.studentId
      }))
    });
  } catch (error) {
    console.error("Get teacher leaves error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ Update leave status (approve/reject)
// leave.controller.js
export const updateLeaveStatus = async (req, res) => {
  try {
    const { leaveId } = req.params;
    const { status, rejectionReason } = req.body;
    const userId = req.user._id; // assume user is authenticated

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const updateData = {
      status,
      approvedBy: userId,
    };

    if (status === "rejected") {
      updateData.rejectionReason = rejectionReason || "No reason provided";
    }

    const leave = await Leave.findByIdAndUpdate(leaveId, updateData, { new: true });

    if (!leave) {
      return res.status(404).json({ message: "Leave not found" });
    }

    res.status(200).json({ message: "Leave status updated", leave });
  } catch (error) {
    console.error("Update leave error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

