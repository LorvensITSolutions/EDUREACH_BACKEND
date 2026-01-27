// controllers/assignment.controller.js
import Assignment from "../models/assignment.model.js";
import Teacher from "../models/teacher.model.js";
import Student from "../models/student.model.js";
import fs from "fs";
import path from "path";

export const uploadAssignment = async (req, res) => {
  try {
    const { title, description, dueDate, className, section, totalMarks } = req.body;
    const teacher = await Teacher.findById(req.user.teacherId);

    const isAuthorized = teacher.sectionAssignments.some(
      s => s.className === className && s.section === section
    );
    if (!isAuthorized) return res.status(403).json({ message: "Unauthorized section" });

    const pdfPaths = req.files?.map(f => f.path) || [];

    const assignment = await Assignment.create({
      title,
      description,
      dueDate,
      class: className,
      section,
      teacherId: teacher._id,
      attachments: pdfPaths,
      totalMarks: totalMarks ? Number(totalMarks) : null,
    });

    res.status(201).json({ message: "Assignment uploaded", assignment });
  } catch (err) {
    console.error("Assignment upload error:", err);
    res.status(500).json({ message: "Upload failed", error: err.message });
  }
};

// PATCH /api/assignments/:id/update-due-date
export const updateAssignmentDueDate = async (req, res) => {
  try {
    const { id } = req.params;
    const { newDueDate } = req.body;
    const teacherId = req.user.teacherId;

    const assignment = await Assignment.findById(id);
    if (!assignment) return res.status(404).json({ message: "Assignment not found" });

    // Ensure the teacher owns this assignment
    if (assignment.teacherId.toString() !== teacherId.toString()) {
      return res.status(403).json({ message: "Not authorized to update this assignment" });
    }

    assignment.dueDate = newDueDate;
    await assignment.save();

    res.status(200).json({ message: "Due date updated", assignment });
  } catch (err) {
    console.error("Update due date error:", err);
    res.status(500).json({ message: "Failed to update due date", error: err.message });
  }
};

// PATCH /api/assignments/:id/update — update all fields: title, description, dueDate, class, section, optional pdfs
export const updateAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    let { title, description, dueDate, className, section, removedAttachments, totalMarks } = req.body;
    const teacherId = req.user.teacherId;

    // Handle removedAttachments from FormData (it comes as JSON string)
    if (typeof removedAttachments === 'string') {
      try {
        removedAttachments = JSON.parse(removedAttachments);
      } catch (e) {
        removedAttachments = [];
      }
    }
    removedAttachments = removedAttachments || [];

    const teacher = await Teacher.findById(teacherId);
    if (!teacher) return res.status(404).json({ message: "Teacher not found" });

    const assignment = await Assignment.findById(id);
    if (!assignment) return res.status(404).json({ message: "Assignment not found" });

    if (assignment.teacherId.toString() !== teacherId.toString()) {
      return res.status(403).json({ message: "Not authorized to update this assignment" });
    }

    // If class/section are being changed, ensure teacher is assigned to the new class/section
    const newClass = className != null ? String(className) : assignment.class;
    const newSection = section != null ? String(section) : assignment.section;
    const isAuthorized = teacher.sectionAssignments.some(
      (s) => s.className === newClass && s.section === newSection
    );
    if (!isAuthorized) {
      return res.status(403).json({ message: "You are not assigned to this class and section" });
    }

    if (title != null) assignment.title = title;
    if (description != null) assignment.description = description;
    if (dueDate != null && dueDate !== "") assignment.dueDate = dueDate;
    if (totalMarks != null && totalMarks !== "") assignment.totalMarks = totalMarks ? Number(totalMarks) : null;
    assignment.class = newClass;
    assignment.section = newSection;

    // Remove files that were marked for deletion
    if (removedAttachments.length > 0) {
      const currentAttachments = assignment.attachments || [];
      
      // Delete files from filesystem
      removedAttachments.forEach((filePath) => {
        try {
          const fullPath = path.join(process.cwd(), filePath);
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            console.log(`Deleted file: ${fullPath}`);
          }
        } catch (err) {
          console.error(`Error deleting file ${filePath}:`, err.message);
          // Continue even if file deletion fails
        }
      });

      // Remove from attachments array
      assignment.attachments = currentAttachments.filter(
        (file) => !removedAttachments.includes(file)
      );
    }

    // Append new PDFs if uploaded
    if (req.files && req.files.length > 0) {
      const newPaths = req.files.map((f) => f.path);
      assignment.attachments = [...(assignment.attachments || []), ...newPaths];
    }

    await assignment.save();

    res.status(200).json({ message: "Assignment updated", assignment });
  } catch (err) {
    console.error("Update assignment error:", err);
    res.status(500).json({ message: "Failed to update assignment", error: err.message });
  }
};

export const evaluateAssignment = async (req, res) => {
  try {
    const { assignmentId, studentId, marks, feedback } = req.body;
    const assignment = await Assignment.findById(assignmentId);

    if (!assignment) return res.status(404).json({ message: "Assignment not found" });

    // Check teacher owns the assignment
    if (assignment.teacherId.toString() !== req.user.teacherId.toString()) {
      return res.status(403).json({ message: "Unauthorized to evaluate" });
    }

    // Check if already evaluated
    const existingEval = assignment.evaluations.find(
      (e) => e.studentId.toString() === studentId.toString()
    );

    if (existingEval) {
      existingEval.marks = marks;
      existingEval.feedback = feedback;
    } else {
      assignment.evaluations.push({ studentId, marks, feedback });
    }

    await assignment.save();

    // Normalize studentId to string
    const evaluations = assignment.evaluations.map((e) => ({
      studentId: e.studentId.toString(),
      marks: e.marks,
      feedback: e.feedback,
    }));

    res.status(200).json({ message: "Evaluation saved", evaluations });
  } catch (err) {
    console.error("Evaluate error:", err.message);
    res.status(500).json({ message: "Evaluation failed", error: err.message });
  }
};


export const getStudentAssignments = async (req, res) => {
  try {
    const student = req.user;
    console.log('Student class:', student.class, 'section:', student.section, 'email:', student.email, 'studentId:', student.studentId);

    const assignments = await Assignment.find({
      class: student.class,
      section: student.section,
    }).sort({ createdAt: -1 });
    console.log('Assignments found:', assignments.length);

    const assignmentsWithEvaluation = assignments.map((a) => {
      let evalEntry = null;
      let submissionEntry = null;
      
      if (student.studentId) {
        // Find evaluation for this student
        evalEntry = a.evaluations.find(
          e => e.studentId && e.studentId.toString() === student.studentId.toString()
        );
        
        // Find submission for this student
        submissionEntry = a.submissions.find(
          s => s.studentId && s.studentId.toString() === student.studentId.toString()
        );
      }
      
      // Convert Mongoose document to plain object if needed
      const assignmentObj = a.toObject ? a.toObject() : (a._doc || a);
      
      // Ensure totalMarks is always included (handle undefined, null, empty string, or missing field)
      let totalMarksValue = null;
      if (assignmentObj.totalMarks !== undefined && assignmentObj.totalMarks !== null && assignmentObj.totalMarks !== "") {
        const parsed = Number(assignmentObj.totalMarks);
        totalMarksValue = !isNaN(parsed) ? parsed : null;
      }
      
      return {
        ...assignmentObj,
        totalMarks: totalMarksValue, // Always explicitly set, even if null
        evaluation: evalEntry || null,
        submission: submissionEntry || null,
      };
    });

    res.status(200).json({ assignments: assignmentsWithEvaluation });
  } catch (err) {
    console.error("Fetch student assignments error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

export const submitAssignment = async (req, res) => {
  try {
    const assignmentId = req.params.assignmentId;
    const userId = req.user._id; // this is USER ID, not student ID!
    const filePath = req.file?.path;

    if (!filePath) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    // ✅ Find the actual Student linked to this User
    const student = await Student.findOne({ userId: req.user._id });

    if (!student) {
      return res.status(404).json({ message: "Student not found for this user" });
    }

    // ✅ Check if the deadline has passed
    const now = new Date();
    const dueDate = new Date(assignment.dueDate);
    if (dueDate < now) {
      return res.status(400).json({ message: "Submission deadline has passed" });
    }

    // ❌ Prevent duplicate submissions
    const alreadySubmitted = assignment.submissions.some(
      (s) => s.studentId?.toString() === student._id.toString()
    );
    if (alreadySubmitted) {
      return res.status(400).json({ message: "You have already submitted this assignment" });
    }

    // ✅ Add submission with correct student ID
    assignment.submissions.push({
      studentId: student._id,
      file: filePath,
    });

    await assignment.save();
    res.status(200).json({ message: "Assignment submitted successfully" });

  } catch (err) {
    console.error("Submit error:", err.message);
    res.status(500).json({ message: "Submit failed", error: err.message });
  }
};

// GET /api/assignments/:id/submissions
export const getSubmissions = async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id)
      .lean(); // <-- Important for manual population

    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    // Manually populate each studentId in submissions
    const populatedSubmissions = await Promise.all(
      assignment.submissions.map(async (sub) => {
        const student = await Student.findById(sub.studentId).select("name email studentId");
        return {
          ...sub,
          studentId: student ? {
            _id: student._id,
            name: student.name,
            email: student.email,
            studentId: student.studentId, // Add roll number
          } : null,
        };
      })
    );

    // Normalize evaluations too
    const evaluations = (assignment.evaluations || []).map((e) => ({
      studentId: e.studentId?.toString(),
      marks: e.marks,
      feedback: e.feedback,
    }));

    res.status(200).json({
      submissions: populatedSubmissions,
      evaluations,
      totalMarks: assignment.totalMarks != null ? assignment.totalMarks : null,
    });
  } catch (err) {
    console.error("Submission fetch error:", err.message);
    res.status(500).json({ message: "Failed to fetch", error: err.message });
  }
};


export const getTeacherAssignments = async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.user.teacherId);

    if (!teacher) {
      return res.status(404).json({ message: "Teacher not found" });
    }

    const assignments = await Assignment.find({ teacherId: teacher._id }).sort({ createdAt: -1 });

    // Ensure totalMarks is always included in the response (for backward compatibility with old assignments)
    const assignmentsWithMarks = assignments.map(a => {
      const assignmentObj = a.toObject ? a.toObject() : a;
      return {
        ...assignmentObj,
        totalMarks: assignmentObj.totalMarks != null ? assignmentObj.totalMarks : null
      };
    });

    res.status(200).json({ assignments: assignmentsWithMarks });
  } catch (err) {
    console.error("Error fetching teacher assignments:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};


export const getSingleAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    const studentId = req.user.studentId;

    const assignment = await Assignment.findById(id);
    if (!assignment) return res.status(404).json({ message: "Assignment not found" });

    const evaluation = assignment.evaluations.find(
      (e) => e.studentId?.toString() === studentId?.toString()
    );
    const submission = assignment.submissions.find(
      (s) => s.studentId?.toString() === studentId?.toString()
    );

    res.status(200).json({
      assignment,
      evaluation: evaluation || null,
      submission: submission || null,
    });
  } catch (err) {
    console.error("Get single assignment error:", err.message);
    res.status(500).json({ message: "Failed to fetch assignment", error: err.message });
  }
};

// DELETE /api/assignments/:id
export const deleteAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    const teacherId = req.user.teacherId;

    const assignment = await Assignment.findById(id);
    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    if (assignment.teacherId.toString() !== teacherId.toString()) {
      return res.status(403).json({ message: "You are not authorized to delete this assignment" });
    }

    await Assignment.findByIdAndDelete(id);
    res.status(200).json({ message: "Assignment deleted successfully" });
  } catch (err) {
    console.error("Delete assignment error:", err.message);
    res.status(500).json({ message: "Failed to delete assignment", error: err.message });
  }
};

export const getChildAssignments = async (req, res) => {
  try {

    // Find parent and populate children
    const parent = await (await import("../models/parent.model.js")).default.findOne({ _id: req.user.parentId }).populate("children");
    console.log("Parent found:", parent);
    console.log("Parent children:", parent?.children);
    
    if (!parent || !parent.children || parent.children.length === 0) {
      console.log("No parent or children found - returning 404");
      return res.status(404).json({ message: "No student linked to this parent" });
    }
    
    console.log("Found", parent.children.length, "children");
    // For each child, fetch assignments for their class and section
    const assignmentsByChild = await Promise.all(parent.children.map(async (student) => {
      const assignments = await Assignment.find({
        class: student.class,
        section: student.section,
      })
        .populate({
          path: "submissions",
          match: { studentId: student._id },
          select: "file submittedAt",
        })
        .sort({ dueDate: -1 });
      const formatted = assignments.map((a) => {
        const submission = a.submissions?.[0] || null;
        
        // Find evaluation for this student
        let evalEntry = null;
        if (student._id && a.evaluations && Array.isArray(a.evaluations)) {
          evalEntry = a.evaluations.find(
            e => e.studentId && e.studentId.toString() === student._id.toString()
          ) || null;
        }
        
        return {
          _id: a._id,
          title: a.title,
          description: a.description,
          dueDate: a.dueDate,
          createdAt: a.createdAt,
          attachments: a.attachments,
          totalMarks: a.totalMarks != null ? a.totalMarks : null,
          submission,
          evaluation: evalEntry || null,
        };
      });

      return {
        studentId: student._id,
        studentName: student.name,
        class: student.class,
        section: student.section,
        assignments: formatted,
      };
    }));

    res.status(200).json({ assignmentsByChild });
  } catch (error) {
    console.error("Parent assignment fetch error:", error);
    res.status(500).json({ message: "Server error" });
  }
};







