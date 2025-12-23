import express from "express";
import { ExamSeatingModel } from "../models/examSeatingModel.js";
import { generateExamSeating } from "../utils/examSeatingGenerator.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import StudentModel from "../models/student.model.js";
import TeacherModel from "../models/teacher.model.js";

const router = express.Router();

// POST /api/exam-seating/generate - Generate exam seating arrangement
router.post("/generate", protectRoute, async (req, res) => {
  try {
    const {
      examName,
      examDate,
      classes,
      totalStudents,
      totalTeachers,
      examHalls,
      options
    } = req.body;

    // Validate required fields
    if (!examName || !examDate || !classes || !totalStudents || !totalTeachers || !examHalls) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: examName, examDate, classes, totalStudents, totalTeachers, examHalls"
      });
    }

    // Generate seating arrangement
    const result = await generateExamSeating({
      classes,
      totalStudents,
      totalTeachers,
      examHalls,
      options: options || {}
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Save to database
    const examSeating = await ExamSeatingModel.create({
      examName,
      examDate: new Date(examDate),
      classes,
      totalStudents: result.summary.totalStudents,
      totalTeachers,
      examHalls: result.examHalls,
      seatingArrangement: result.seatingArrangement,
      options: options || {},
      createdBy: req.user._id
    });

    res.json({
      success: true,
      examSeating,
      summary: result.summary,
      message: "Exam seating arrangement generated successfully"
    });
  } catch (error) {
    console.error("Exam seating generation error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/exam-seating/all - Get all exam seating arrangements
router.get("/all", protectRoute, async (req, res) => {
  try {
    const examSeatings = await ExamSeatingModel.find()
      .sort({ examDate: -1, createdAt: -1 })
      .populate("createdBy", "name email")
      .lean();

    res.json({
      success: true,
      examSeatings,
      count: examSeatings.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/exam-seating/:id - Get specific exam seating arrangement
router.get("/:id", protectRoute, async (req, res) => {
  try {
    const examSeating = await ExamSeatingModel.findById(req.params.id)
      .populate("createdBy", "name email")
      .lean();

    if (!examSeating) {
      return res.status(404).json({
        success: false,
        message: "Exam seating arrangement not found"
      });
    }

    res.json({
      success: true,
      examSeating
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// DELETE /api/exam-seating/:id - Delete exam seating arrangement
router.delete("/:id", protectRoute, async (req, res) => {
  try {
    const examSeating = await ExamSeatingModel.findByIdAndDelete(req.params.id);

    if (!examSeating) {
      return res.status(404).json({
        success: false,
        message: "Exam seating arrangement not found"
      });
    }

    res.json({
      success: true,
      message: "Exam seating arrangement deleted successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/exam-seating/auto-fill/students - Get students count for classes
router.get("/auto-fill/students", protectRoute, async (req, res) => {
  try {
    let { classes } = req.query;

    // Handle query params - can be array, object (from classes[]), or comma-separated string
    if (!classes) {
      return res.json({
        success: true,
        totalStudents: 0,
        studentsByClass: {},
        message: "No classes specified"
      });
    }

    // If it's an object (from classes[]=value1&classes[]=value2), convert to array
    if (typeof classes === 'object' && !Array.isArray(classes)) {
      classes = Object.values(classes);
    }
    
    // If it's a string, split by comma
    if (typeof classes === 'string') {
      classes = classes.split(',').map(c => c.trim()).filter(c => c);
    }
    
    // Ensure it's an array
    if (!Array.isArray(classes) || classes.length === 0) {
      return res.json({
        success: true,
        totalStudents: 0,
        studentsByClass: {},
        message: "No classes specified"
      });
    }

    console.log("Received classes:", classes);

    // Parse class names and fetch students
    const classQueries = classes.map(className => {
      // Try numeric class first (e.g., "7B" -> class: "7", section: "B")
      const numericMatch = className.match(/^(\d+)([A-Z])$/);
      if (numericMatch) {
        return {
          class: numericMatch[1],
          section: numericMatch[2],
          original: className
        };
      }
      // Try text class (e.g., "NurseryD" -> class: "Nursery", section: "D")
      const textMatch = className.match(/^([A-Za-z]+)([A-Z])$/);
      if (textMatch) {
        return {
          class: textMatch[1],
          section: textMatch[2],
          original: className
        };
      }
      // Fallback: use full name as class
      return {
        class: className,
        section: "",
        original: className
      };
    });

    console.log("Parsed class queries:", JSON.stringify(classQueries, null, 2));

    // Build query - handle cases where section might be empty
    const query = {
      $or: classQueries.map(q => {
        if (q.section) {
          return {
            class: q.class,
            section: q.section
          };
        } else {
          return {
            class: q.class
          };
        }
      })
    };

    console.log("MongoDB query for students:", JSON.stringify(query, null, 2));
    
    const students = await StudentModel.find(query)
      .select("studentId name class section")
      .lean();

    console.log(`Found ${students.length} students for classes: ${classes.join(', ')}`);
    if (students.length > 0) {
      console.log("Sample students:", students.slice(0, 3).map(s => `${s.name} - ${s.class}${s.section || ''}`));
    }

    // Group by class
    const studentsByClass = {};
    students.forEach(student => {
      const classKey = `${student.class}${student.section || ""}`;
      if (!studentsByClass[classKey]) {
        studentsByClass[classKey] = [];
      }
      studentsByClass[classKey].push(student);
    });

    // If no students found, try a more flexible query
    if (students.length === 0) {
      console.log("No students found with exact match, trying flexible query...");
      
      // Try matching just by class name (without section requirement)
      const flexibleQuery = {
        $or: classQueries.map(q => ({
          class: { $regex: new RegExp(`^${q.class}$`, 'i') },
          section: q.section ? { $regex: new RegExp(`^${q.section}$`, 'i') } : { $exists: true }
        }))
      };
      
      console.log("Flexible query:", JSON.stringify(flexibleQuery, null, 2));
      
      const flexibleStudents = await StudentModel.find(flexibleQuery)
        .select("studentId name class section")
        .lean();
      
      console.log(`Found ${flexibleStudents.length} students with flexible query`);
      
      if (flexibleStudents.length > 0) {
        flexibleStudents.forEach(student => {
          const classKey = `${student.class}${student.section || ""}`;
          if (!studentsByClass[classKey]) {
            studentsByClass[classKey] = [];
          }
          studentsByClass[classKey].push(student);
        });
        
        return res.json({
          success: true,
          totalStudents: flexibleStudents.length,
          studentsByClass,
          message: `Found ${flexibleStudents.length} student${flexibleStudents.length !== 1 ? 's' : ''} across ${classes.length} class${classes.length !== 1 ? 'es' : ''}`
        });
      }
    }

    res.json({
      success: true,
      totalStudents: students.length,
      studentsByClass,
      message: students.length > 0 
        ? `Found ${students.length} student${students.length !== 1 ? 's' : ''} across ${classes.length} class${classes.length !== 1 ? 'es' : ''}`
        : `No students found for the selected classes. Please verify class names match the database format.`
    });
  } catch (error) {
    console.error("Error in auto-fill students:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/exam-seating/auto-fill/teachers - Get available teachers count
router.get("/auto-fill/teachers", protectRoute, async (req, res) => {
  try {
    const teachers = await TeacherModel.find()
      .select("name")
      .lean();

    res.json({
      success: true,
      totalTeachers: teachers.length,
      teachers: teachers.map(t => t.name),
      message: `Found ${teachers.length} teacher${teachers.length !== 1 ? 's' : ''} available`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/exam-seating/auto-fill/classes - Get available classes
router.get("/auto-fill/classes", protectRoute, async (req, res) => {
  try {
    const students = await StudentModel.find()
      .select("class section")
      .lean();

    // Get unique class-section combinations
    const classMap = new Map();
    students.forEach(student => {
      if (student.class && student.section) {
        const classKey = `${student.class}${student.section}`;
        if (!classMap.has(classKey)) {
          classMap.set(classKey, {
            name: classKey,
            class: student.class,
            section: student.section,
            studentCount: 0
          });
        }
        classMap.get(classKey).studentCount++;
      }
    });

    const classes = Array.from(classMap.values());

    res.json({
      success: true,
      classes,
      count: classes.length,
      message: `Found ${classes.length} class${classes.length !== 1 ? 'es' : ''} with students`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;

