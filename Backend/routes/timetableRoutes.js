import express from "express";
import { Subject, Teacher, ClassGroup, TimetableGenerator } from "../lib/generator.js";
import {TimetableModel} from '../models/timetableModel.js';
import TeacherModel from "../models/teacher.model.js";
import { protectRoute, teacherRoute, studentRoute, parentRoute } from "../middleware/auth.middleware.js";
import { validateTimetableInput, validateSubjectsExist, validateTeachersExist, validateClassesExist, detectConflicts } from "../utils/timetableValidation.js";
import { initProgress, updateProgress, getProgress, completeProgress, failProgress } from "../utils/timetableProgress.js";
import { TimetableTemplateModel } from "../models/timetableTemplateModel.js";
import { parseClassesFromFile, parseTeachersFromFile, parseFromJSON, parseClassesFromCSV } from "../utils/timetableBulkImport.js";
import { exportToPDF, exportToExcel, exportToJSON } from "../utils/timetableExport.js";
import { SubjectModel } from "../models/subjectModel.js";
import ClassModel from "../models/class.model.js";
import StudentModel from "../models/student.model.js";
import multer from "multer";
import { randomUUID } from "crypto";
import path from "path";
import fs from "fs";

const router = express.Router();

// Configure multer for file uploads
const upload = multer({ 
  dest: "uploads/timetable/",
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// ============================================
// QUICK WINS - IMPROVED ENDPOINTS
// ============================================

// POST /api/timetable/validate - Pre-validation endpoint
router.post("/validate", async (req, res) => {
  try {
    const { classes, teachers, days, periodsPerDay } = req.body;
    const validation = await validateTimetableInput({ classes, teachers, days, periodsPerDay });
    const conflictDetection = await detectConflicts({ classes, teachers, days, periodsPerDay });
    
    res.json({
      success: validation.valid,
      valid: validation.valid,
      errors: validation.errors,
      warnings: validation.warnings,
      summary: validation.summary,
      conflicts: conflictDetection.conflicts,
      conflictSuggestions: conflictDetection.suggestions,
      hasConflicts: conflictDetection.hasConflicts
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/timetable/generate - Improved with validation
router.post("/generate", async (req, res) => {
  try {
    const { classes, teachers, days, periodsPerDay, options, jobId } = req.body;
    
    // Pre-validate input
    const validation = await validateTimetableInput({ classes, teachers, days, periodsPerDay });
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        valid: false,
        errors: validation.errors,
        warnings: validation.warnings
      });
    }

    // Initialize progress tracking if jobId provided
    const currentJobId = jobId || randomUUID();
    if (jobId) {
      initProgress(currentJobId, { totalClasses: classes.length });
      updateProgress(currentJobId, { 
        status: "generating",
        currentStep: "Starting generation...",
        progress: 0
      });
    }

    // Convert frontend classes to backend ClassGroup format
    const classObjects = classes.map((c) => {
      // Extract class name and section from frontend format (e.g., "10A" -> name: "10", section: "A")
      const classMatch = c.name.match(/^(\d+)([A-Z]?)$/);
      const className = classMatch ? `Grade ${classMatch[1]}` : c.name;
      const section = classMatch && classMatch[2] ? classMatch[2] : "A";
      
      return new ClassGroup(
        className,
        [section], // Single section per class
        c.subjects.map((s) => new Subject(s.name, s.periodsPerWeek))
      );
    });

    const teacherObjects = teachers.map(
      (t) => new Teacher(t.name, t.subjects)
    );

    // Generate timetable with progress updates
    const generator = new TimetableGenerator();
    
    // Wrap generation to track progress
    let completedClasses = 0;
    const originalGenerate = generator._generateSectionTimetable.bind(generator);
    generator._generateSectionTimetable = function(...args) {
      if (jobId) {
        completedClasses++;
        updateProgress(currentJobId, {
          completedSteps: completedClasses,
          currentStep: `Generating timetable for class ${completedClasses} of ${classes.length}...`,
          progress: Math.round((completedClasses / classes.length) * 90) // Reserve 10% for finalization
        });
      }
      return originalGenerate(...args);
    };
    
    const result = generator.generateTimetable(
      classObjects,
      teacherObjects,
      days,
      periodsPerDay,
      options
    );

    if (result.success) {
      if (jobId) {
        updateProgress(currentJobId, {
          currentStep: "Saving timetable...",
          progress: 95
        });
      }
      // Transform nested timetable structure to flat array for frontend
      const classesArray = [];
      
      Object.entries(result.timetable).forEach(([className, sections]) => {
        Object.entries(sections).forEach(([section, timetable]) => {
          // Create class name in frontend format (e.g., "Grade 10" + "A" = "10A")
          const gradeMatch = className.match(/Grade (\d+)/);
          const gradeNumber = gradeMatch ? gradeMatch[1] : className;
          const frontendClassName = `${gradeNumber}${section}`;
          
          classesArray.push({
            name: frontendClassName,
            timetable: timetable
          });
        });
      });

      // Save to MongoDB - use insertOne to avoid unique index conflicts
      try {
        await TimetableModel.create({
          classes: classesArray,
          days,
          periodsPerDay,
          className: null,
          section: null,
          academicYear: null
        });
      } catch (saveError) {
        // If there's a duplicate key error, try to delete existing timetables first
        if (saveError.code === 11000) {
          console.log("Duplicate key error detected, clearing old timetables...");
          await TimetableModel.deleteMany({});
          // Retry the save
          await TimetableModel.create({
            classes: classesArray,
            days,
            periodsPerDay,
            className: null,
            section: null,
            academicYear: null
          });
        } else {
          throw saveError;
        }
      }
      
      // Send transformed result with quality metrics
      const response = {
        success: true,
        classes: classesArray,
        days,
        periodsPerDay,
        timeSlots: result.timeSlots,
        jobId: currentJobId,
        quality: result.quality || null // Include quality metrics
      };
      
      if (jobId) {
        completeProgress(currentJobId, response);
      }
      
      res.json(response);
    } else {
      if (jobId) {
        failProgress(currentJobId, result.error || "Generation failed");
      }
      res.status(400).json({
        ...result,
        errors: [{
          code: "GENERATION_FAILED",
          message: result.error || "Unable to generate timetable",
          suggestion: "Try reducing periods per week, adding more teachers, or adjusting constraints"
        }]
      });
    }
  } catch (err) {
    console.error("Timetable generation error:", err);
    if (req.body.jobId) {
      failProgress(req.body.jobId, err.message);
    }
    res.status(500).json({ 
      success: false, 
      error: err.message,
      errors: [{
        code: "INTERNAL_ERROR",
        message: err.message,
        suggestion: "Please check your input and try again. If the problem persists, contact support."
      }]
    });
  }
});

// GET /api/timetable/progress/:jobId - Get generation progress
router.get("/progress/:jobId", async (req, res) => {
  try {
    const { jobId } = req.params;
    const progress = getProgress(jobId);
    
    if (!progress) {
      return res.status(404).json({ 
        success: false, 
        message: "Progress not found. Job may have expired or never existed." 
      });
    }
    
    res.json({ success: true, ...progress });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/timetable/all
router.get("/all", async (req, res) => {
  try {
    const timetables = await TimetableModel.find().sort({ createdAt: -1 });
    res.json({ success: true, timetables });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/timetable/:id
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await TimetableModel.findByIdAndDelete(id);
    res.json({ success: true, message: "Timetable deleted successfully." });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/teachers (only name + subject)
router.get("/", async (req, res) => {
  try {
    const teachers = await TeacherModel.find().select("name subject");
    res.json({ success: true, teachers });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/timetable/teacher/:teacherName
router.get("/teacher/:teacherName", async (req, res) => {
  try {
    const { teacherName } = req.params;
    // Get the latest timetable
    const latestTimetable = await TimetableModel.findOne().sort({ createdAt: -1 });
    if (!latestTimetable) {
      return res.status(404).json({ success: false, message: "No timetable found" });
    }
    // Collect all slots for this teacher
    const teacherSlots = [];
    for (const classObj of latestTimetable.classes) {
      const { name: className, timetable } = classObj;
      for (const day of latestTimetable.days) {
        const periods = timetable[day];
        if (Array.isArray(periods)) {
          periods.forEach((slot, periodIdx) => {
            if (slot && slot.teacher === teacherName) {
              teacherSlots.push({
                class: className,
                day,
                period: periodIdx + 1,
                subject: slot.subject,
                teacher: slot.teacher
              });
            }
          });
        }
      }
    }
    res.json({ success: true, teacher: teacherName, slots: teacherSlots });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Teacher fetches ONLY their own timetable
router.get("/my-timetable", protectRoute, teacherRoute, async (req, res) => {
  try {
    const teacherName = req.user.name; // comes from User

    const latestTimetable = await TimetableModel.findOne().sort({ createdAt: -1 });
    if (!latestTimetable) {
      return res.status(404).json({ success: false, message: "No timetable found" });
    }

    const teacherSlots = [];
    for (const classObj of latestTimetable.classes) {
      const { name: className, timetable } = classObj;

      for (const day of latestTimetable.days) {
        const periods = timetable[day];
        if (Array.isArray(periods)) {
          periods.forEach((slot, periodIdx) => {
            if (slot && slot.teacher === teacherName) {
              teacherSlots.push({
                class: className,
                day,
                period: periodIdx + 1,
                subject: slot.subject,
                teacher: slot.teacher
              });
            }
          });
        }
      }
    }

    res.json({
      success: true,
      teacher: teacherName,
      slots: teacherSlots,
      days: latestTimetable.days,
      periodsPerDay: latestTimetable.periodsPerDay
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Student fetches ONLY their class timetable
router.get("/students-timetable", protectRoute, studentRoute, async (req, res) => {
  try {
    const { class: studentClass, section } = req.user;

    const latestTimetable = await TimetableModel.findOne().sort({ createdAt: -1 });
    if (!latestTimetable) {
      return res.status(404).json({ success: false, message: "No timetable found" });
    }

    // Format class name to match frontend format (e.g., "10A")
    const className = `${studentClass}${section}`;
    const classObj = latestTimetable.classes.find(
      (cls) => cls.name === className
    );

    if (!classObj) {
      return res.status(404).json({ success: false, message: `Class timetable for ${className} not found` });
    }

    res.json({
      success: true,
      class: className,
      timetable: classObj.timetable,
      days: latestTimetable.days,
      periodsPerDay: latestTimetable.periodsPerDay
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Parent fetches timetables for all their children
router.get("/parents-timetable", protectRoute, parentRoute, async (req, res) => {
  try {
    const parentId = req.user.parentId;
    
    if (!parentId) {
      return res.status(400).json({ success: false, message: "Parent ID not found" });
    }

    // Fetch all children for this parent
    const children = await StudentModel.find({ parent: parentId })
      .select("name class section _id studentId");

    if (!children || children.length === 0) {
      return res.status(404).json({ success: false, message: "No children found for this parent" });
    }

    // Get the latest timetable
    const latestTimetable = await TimetableModel.findOne().sort({ createdAt: -1 });
    if (!latestTimetable) {
      return res.status(404).json({ success: false, message: "No timetable found" });
    }

    // For each child, find their class timetable
    const childrenTimetables = children.map(child => {
      // Format class name to match frontend format (e.g., "10A")
      const className = `${child.class}${child.section}`;
      const classObj = latestTimetable.classes.find(
        (cls) => cls.name === className
      );

      return {
        _id: child._id.toString(),
        studentId: child._id.toString(), // Use _id as studentId for consistency
        studentName: child.name,
        studentIdNumber: child.studentId || child._id.toString(),
        class: className,
        classNumber: child.class,
        section: child.section,
        timetable: classObj ? classObj.timetable : null,
        hasTimetable: !!classObj,
        message: classObj ? null : `Timetable is not created yet for ${className}`
      };
    });

    res.json({
      success: true,
      children: childrenTimetables,
      days: latestTimetable.days,
      periodsPerDay: latestTimetable.periodsPerDay
    });
  } catch (err) {
    console.error("Parent timetable fetch error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// BULK IMPORT ENDPOINTS
// ============================================

// POST /api/timetable/import/classes - Import classes from file
router.post("/import/classes", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No file uploaded" });
    }

    const filePath = req.file.path;
    const fileExt = path.extname(req.file.originalname).toLowerCase();

    let classes;
    if (fileExt === ".json") {
      const data = parseFromJSON(filePath);
      classes = data.classes;
    } else if ([".xlsx", ".xls", ".csv"].includes(fileExt)) {
      classes = parseClassesFromFile(filePath);
    } else {
      return res.status(400).json({ success: false, error: "Unsupported file format" });
    }

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    res.json({ success: true, classes, count: classes.length });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/timetable/import/teachers - Import teachers from file
router.post("/import/teachers", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No file uploaded" });
    }

    const filePath = req.file.path;
    const fileExt = path.extname(req.file.originalname).toLowerCase();

    let teachers;
    if (fileExt === ".json") {
      const data = parseFromJSON(filePath);
      teachers = data.teachers;
    } else if ([".xlsx", ".xls", ".csv"].includes(fileExt)) {
      teachers = parseTeachersFromFile(filePath);
    } else {
      return res.status(400).json({ success: false, error: "Unsupported file format" });
    }

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    res.json({ success: true, teachers, count: teachers.length });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/timetable/import/full - Import complete timetable config from JSON
router.post("/import/full", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No file uploaded" });
    }

    const filePath = req.file.path;
    const data = parseFromJSON(filePath);

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    // Validate imported data
    const validation = await validateTimetableInput(data);
    
    res.json({
      success: validation.valid,
      data,
      errors: validation.errors,
      warnings: validation.warnings
    });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(400).json({ success: false, error: err.message });
  }
});

// ============================================
// AUTO-FILL ENDPOINTS
// ============================================

// GET /api/timetable/auto-fill/teachers - Auto-fill teachers from database
router.get("/auto-fill/teachers", async (req, res) => {
  try {
    const teachers = await TeacherModel.find().select("name subject");
    
    if (!teachers || teachers.length === 0) {
      return res.json({ 
        success: true, 
        teachers: [],
        message: "No teachers found in database. Please add teachers first.",
        count: 0
      });
    }
    
    const formattedTeachers = teachers.map(t => ({
      name: t.name,
      subjects: Array.isArray(t.subject) ? t.subject : (t.subject ? [t.subject] : [])
    })).filter(t => t.name); // Filter out teachers without names
    
    res.json({ 
      success: true, 
      teachers: formattedTeachers,
      count: formattedTeachers.length,
      message: `Loaded ${formattedTeachers.length} teacher${formattedTeachers.length !== 1 ? 's' : ''} from database`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/timetable/auto-fill/subjects - Auto-fill subjects from database
router.get("/auto-fill/subjects", async (req, res) => {
  try {
    const subjects = await SubjectModel.find().select("name code");
    res.json({ success: true, subjects });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/timetable/auto-fill/classes - Auto-fill classes from database
router.get("/auto-fill/classes", async (req, res) => {
  try {
    // First, try to get classes from Student model (actual class-section combinations)
    const students = await StudentModel.find().select("class section").lean();
    
    // Get unique class-section combinations from students
    const classSectionMap = new Map();
    students.forEach(student => {
      if (student.class && student.section) {
        const key = `${student.class}${student.section}`;
        if (!classSectionMap.has(key)) {
          classSectionMap.set(key, {
            class: student.class,
            section: student.section
          });
        }
      }
    });
    
    // If we have classes from students, use those
    if (classSectionMap.size > 0) {
      const formattedClasses = Array.from(classSectionMap.values()).map(({ class: className, section }) => {
        // Get subjects from ClassModel if available for this grade
        return {
          name: `${className}${section}`,
          subjects: [] // Subjects will be empty, user can add them manually or we can fetch from ClassModel
        };
      });
      
      // Try to enrich with subjects from ClassModel
      const classModelData = await ClassModel.find().select("name sections subjects").lean();
      const enrichedClasses = formattedClasses.map(formattedClass => {
        // Try multiple matching strategies
        let matchedClassModel = null;
        
        // Strategy 1: Match by grade number (e.g., "10A" -> "Grade 10")
        const gradeMatch = formattedClass.name.match(/^(\d+)([A-Z])$/);
        if (gradeMatch) {
          const gradeNum = gradeMatch[1];
          matchedClassModel = classModelData.find(c => {
            const cGradeMatch = c.name.match(/Grade (\d+)/i);
            return cGradeMatch && cGradeMatch[1] === gradeNum;
          });
        }
        
        // Strategy 2: Match by class name directly (e.g., "NurseryA" -> "Nursery" or "Grade Nursery")
        if (!matchedClassModel) {
          const classNameWithoutSection = formattedClass.name.replace(/[A-Z]$/, '');
          matchedClassModel = classModelData.find(c => {
            const cName = c.name.toLowerCase();
            return cName.includes(classNameWithoutSection.toLowerCase()) || 
                   cName === `grade ${classNameWithoutSection.toLowerCase()}` ||
                   cName === classNameWithoutSection.toLowerCase();
          });
        }
        
        // Strategy 3: Match by section if class name matches (e.g., "7B" -> find "Grade 7" with section "B")
        if (!matchedClassModel && gradeMatch) {
          const gradeNum = gradeMatch[1];
          const section = gradeMatch[2];
          matchedClassModel = classModelData.find(c => {
            const cGradeMatch = c.name.match(/Grade (\d+)/i);
            if (cGradeMatch && cGradeMatch[1] === gradeNum) {
              // Check if this class model has the section
              return c.sections && c.sections.includes(section);
            }
            return false;
          });
        }
        
        // If found, add subjects
        if (matchedClassModel && matchedClassModel.subjects && matchedClassModel.subjects.length > 0) {
          return {
            ...formattedClass,
            subjects: matchedClassModel.subjects.map(s => ({
              name: s.name,
              periodsPerWeek: s.periodsPerWeek || 5
            }))
          };
        }
        
        // If no match found, return class with empty subjects (user can add manually)
        return formattedClass;
      });
      
      return res.json({ 
        success: true, 
        classes: enrichedClasses,
        count: enrichedClasses.length,
        sourceCount: classSectionMap.size,
        message: `Loaded ${enrichedClasses.length} class${enrichedClasses.length !== 1 ? 'es' : ''} from student database (${classSectionMap.size} unique class-section combinations)`
      });
    }
    
    // Fallback to ClassModel if no students found
    const classes = await ClassModel.find().select("name sections subjects");
    
    if (!classes || classes.length === 0) {
      return res.json({ 
        success: true, 
        classes: [],
        message: "No classes found in database. Please add classes or students first.",
        count: 0
      });
    }
    
    const formattedClasses = classes.flatMap(cls => {
      // Handle sections - if no sections defined, create section "A" by default
      let sections = cls.sections && cls.sections.length > 0 ? cls.sections : ["A"];
      
      // If sections is an empty array, default to ["A"]
      if (sections.length === 0) {
        sections = ["A"];
      }
      
      return sections.map(section => {
        // Extract grade number from class name (e.g., "Grade 10" -> "10")
        const gradeMatch = cls.name.match(/Grade (\d+)/i);
        const className = gradeMatch 
          ? `${gradeMatch[1]}${section}` 
          : `${cls.name}${section}`;
        
        return {
          name: className,
          subjects: (cls.subjects || []).map(s => ({
            name: s.name,
            periodsPerWeek: s.periodsPerWeek || 5
          }))
        };
      });
    });
    
    res.json({ 
      success: true, 
      classes: formattedClasses,
      count: formattedClasses.length,
      sourceCount: classes.length,
      message: `Loaded ${formattedClasses.length} class${formattedClasses.length !== 1 ? 'es' : ''} from ${classes.length} grade${classes.length !== 1 ? 's' : ''} in database`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// TEMPLATE SYSTEM ENDPOINTS
// ============================================

// POST /api/timetable/templates - Save a template
router.post("/templates", protectRoute, async (req, res) => {
  try {
    const templateData = {
      ...req.body,
      createdBy: req.user._id
    };
    
    const template = await TimetableTemplateModel.create(templateData);
    res.json({ success: true, template });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/timetable/templates - Get all templates (user's + public)
router.get("/templates", protectRoute, async (req, res) => {
  try {
    const templates = await TimetableTemplateModel.find({
      $or: [
        { createdBy: req.user._id },
        { isPublic: true }
      ]
    }).sort({ createdAt: -1 });
    
    res.json({ success: true, templates });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/timetable/templates/:id - Get a specific template
router.get("/templates/:id", protectRoute, async (req, res) => {
  try {
    const template = await TimetableTemplateModel.findOne({
      _id: req.params.id,
      $or: [
        { createdBy: req.user._id },
        { isPublic: true }
      ]
    });
    
    if (!template) {
      return res.status(404).json({ success: false, message: "Template not found" });
    }
    
    res.json({ success: true, template });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/timetable/templates/:id - Delete a template
router.delete("/templates/:id", protectRoute, async (req, res) => {
  try {
    const template = await TimetableTemplateModel.findOneAndDelete({
      _id: req.params.id,
      createdBy: req.user._id
    });
    
    if (!template) {
      return res.status(404).json({ success: false, message: "Template not found or you don't have permission" });
    }
    
    res.json({ success: true, message: "Template deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// MANUAL EDITING ENDPOINTS
// ============================================

// PATCH /api/timetable/:id/slot - Update a single slot
router.patch("/:id/slot", protectRoute, async (req, res) => {
  try {
    const { id } = req.params;
    const { className, day, period, subject, teacher } = req.body;
    
    const timetable = await TimetableModel.findById(id);
    if (!timetable) {
      return res.status(404).json({ success: false, message: "Timetable not found" });
    }
    
    const classObj = timetable.classes.find(c => c.name === className);
    if (!classObj) {
      return res.status(404).json({ success: false, message: "Class not found in timetable" });
    }
    
    const dayTimetable = classObj.timetable[day];
    if (!Array.isArray(dayTimetable) || period < 1 || period > dayTimetable.length) {
      return res.status(400).json({ success: false, message: "Invalid period" });
    }
    
    // Update the slot
    dayTimetable[period - 1] = subject && teacher ? { subject, teacher } : null;
    
    await timetable.save();
    
    res.json({ success: true, message: "Slot updated successfully", timetable });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/timetable/:id/swap - Swap two slots
router.post("/:id/swap", protectRoute, async (req, res) => {
  try {
    const { id } = req.params;
    const { slot1, slot2 } = req.body; // { className, day, period }
    
    const timetable = await TimetableModel.findById(id);
    if (!timetable) {
      return res.status(404).json({ success: false, message: "Timetable not found" });
    }
    
    const getSlot = (className, day, period) => {
      const classObj = timetable.classes.find(c => c.name === className);
      if (!classObj || !classObj.timetable[day]) return null;
      return classObj.timetable[day][period - 1];
    };
    
    const setSlot = (className, day, period, value) => {
      const classObj = timetable.classes.find(c => c.name === className);
      if (classObj && classObj.timetable[day]) {
        classObj.timetable[day][period - 1] = value;
      }
    };
    
    const slot1Value = getSlot(slot1.className, slot1.day, slot1.period);
    const slot2Value = getSlot(slot2.className, slot2.day, slot2.period);
    
    setSlot(slot1.className, slot1.day, slot1.period, slot2Value);
    setSlot(slot2.className, slot2.day, slot2.period, slot1Value);
    
    await timetable.save();
    
    res.json({ success: true, message: "Slots swapped successfully", timetable });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// EXPORT ENDPOINTS
// ============================================

// GET /api/timetable/:id/export/pdf - Export timetable to PDF
router.get("/:id/export/pdf", async (req, res) => {
  try {
    const timetable = await TimetableModel.findById(req.params.id);
    if (!timetable) {
      return res.status(404).json({ success: false, message: "Timetable not found" });
    }
    
    const pdfPath = await exportToPDF(timetable.toObject());
    
    res.download(pdfPath, `timetable-${req.params.id}.pdf`, (err) => {
      if (err) {
        console.error("Error sending PDF:", err);
      }
      // Clean up file after sending
      setTimeout(() => {
        if (fs.existsSync(pdfPath)) {
          fs.unlinkSync(pdfPath);
        }
      }, 5000);
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/timetable/:id/export/excel - Export timetable to Excel
router.get("/:id/export/excel", async (req, res) => {
  try {
    const timetable = await TimetableModel.findById(req.params.id);
    if (!timetable) {
      return res.status(404).json({ success: false, message: "Timetable not found" });
    }
    
    const excelPath = await exportToExcel(timetable.toObject());
    
    res.download(excelPath, `timetable-${req.params.id}.xlsx`, (err) => {
      if (err) {
        console.error("Error sending Excel:", err);
      }
      // Clean up file after sending
      setTimeout(() => {
        if (fs.existsSync(excelPath)) {
          fs.unlinkSync(excelPath);
        }
      }, 5000);
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/timetable/:id/export/json - Export timetable to JSON
router.get("/:id/export/json", async (req, res) => {
  try {
    const timetable = await TimetableModel.findById(req.params.id);
    if (!timetable) {
      return res.status(404).json({ success: false, message: "Timetable not found" });
    }
    
    const jsonPath = await exportToJSON(timetable.toObject());
    
    res.download(jsonPath, `timetable-${req.params.id}.json`, (err) => {
      if (err) {
        console.error("Error sending JSON:", err);
      }
      // Clean up file after sending
      setTimeout(() => {
        if (fs.existsSync(jsonPath)) {
          fs.unlinkSync(jsonPath);
        }
      }, 5000);
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/timetable/save-class-subjects - Save subjects for classes to database
router.post("/save-class-subjects", async (req, res) => {
  try {
    const { classes } = req.body; // Array of { name: "6A", subjects: [...] }
    
    if (!Array.isArray(classes) || classes.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: "Classes array is required" 
      });
    }
    
    // Try to drop old index if it exists (non-blocking)
    try {
      await ClassModel.collection.dropIndex("className_1").catch(() => {
        // Index doesn't exist or can't be dropped, ignore
      });
    } catch (indexErr) {
      // Ignore index errors
    }
    
    const results = [];
    
    for (const classData of classes) {
      // Validate input
      if (!classData.name || typeof classData.name !== 'string' || classData.name.trim() === '') {
        results.push({
          className: classData.name || 'unknown',
          action: "skipped",
          reason: "Invalid class name"
        });
        continue;
      }
      
      if (!classData.subjects || !Array.isArray(classData.subjects) || classData.subjects.length === 0) {
        results.push({
          className: classData.name,
          action: "skipped",
          reason: "No subjects provided"
        });
        continue;
      }
      
      // Parse class name to get base class and section (e.g., "6A" -> base: "6", section: "A")
      const gradeMatch = classData.name.trim().match(/^(\d+)([A-Z])$/);
      const nameMatch = classData.name.trim().match(/^([A-Za-z]+)([A-Z])$/);
      
      let baseClassName = null;
      let section = null;
      
      if (gradeMatch) {
        baseClassName = `Grade ${gradeMatch[1]}`;
        section = gradeMatch[2];
      } else if (nameMatch) {
        baseClassName = nameMatch[1];
        section = nameMatch[2];
      } else {
        // If no pattern matches, use the full name as base class
        baseClassName = classData.name.trim();
      }
      
      // Validate baseClassName is not null or empty
      if (!baseClassName || baseClassName.trim() === '') {
        results.push({
          className: classData.name,
          action: "skipped",
          reason: "Could not determine base class name"
        });
        continue;
      }
      
      // Validate subjects
      const validSubjects = classData.subjects.filter(s => 
        s && s.name && typeof s.name === 'string' && s.name.trim() !== ''
      ).map(s => ({
        name: s.name.trim(),
        periodsPerWeek: Number(s.periodsPerWeek) || 5
      }));
      
      if (validSubjects.length === 0) {
        results.push({
          className: classData.name,
          action: "skipped",
          reason: "No valid subjects found"
        });
        continue;
      }
      
      try {
        // Check if class exists
        let classModel = await ClassModel.findOne({ name: baseClassName });
        
        if (!classModel) {
          // Create new class - use updateOne with upsert to avoid index conflicts
          try {
            const updateResult = await ClassModel.updateOne(
              { name: baseClassName },
              {
                $setOnInsert: {
                  name: baseClassName,
                  sections: section ? [section] : [],
                  subjects: validSubjects
                }
              },
              { upsert: true }
            );
            
            // Fetch the created/updated document
            classModel = await ClassModel.findOne({ name: baseClassName });
            
            if (updateResult.upsertedCount > 0 || updateResult.modifiedCount > 0 || classModel) {
              results.push({ 
                className: classData.name, 
                baseClass: baseClassName, 
                action: "created", 
                subjectsCount: validSubjects.length 
              });
            } else {
              // If upsert didn't work, try direct creation
              classModel = new ClassModel({
                name: baseClassName,
                sections: section ? [section] : [],
                subjects: validSubjects
              });
              await classModel.save();
              results.push({ 
                className: classData.name, 
                baseClass: baseClassName, 
                action: "created", 
                subjectsCount: validSubjects.length 
              });
            }
          } catch (createErr) {
            // If creation fails due to duplicate key, try alternative approach
            if (createErr.code === 11000) {
              // Duplicate key error - try to find existing class
              classModel = await ClassModel.findOne({ 
                $or: [
                  { name: baseClassName },
                  { name: { $regex: new RegExp(`^${baseClassName}`, 'i') } }
                ]
              });
              
              if (classModel) {
                // Class exists, update it
                const existingSubjectNames = new Set(classModel.subjects.map(s => s.name));
                const newSubjects = validSubjects.filter(s => !existingSubjectNames.has(s.name));
                
                if (newSubjects.length > 0) {
                  classModel.subjects.push(...newSubjects);
                  if (section && !classModel.sections.includes(section)) {
                    classModel.sections.push(section);
                  }
                  await classModel.save();
                  results.push({ 
                    className: classData.name, 
                    baseClass: baseClassName, 
                    action: "updated", 
                    subjectsAdded: newSubjects.length,
                    totalSubjects: classModel.subjects.length
                  });
                } else {
                  results.push({ 
                    className: classData.name, 
                    baseClass: baseClassName, 
                    action: "no_change", 
                    message: "All subjects already exist"
                  });
                }
              } else {
                // Class doesn't exist but got duplicate key error - likely index issue
                // Try using insertOne directly with ignore errors
                try {
                  await ClassModel.collection.insertOne({
                    name: baseClassName,
                    sections: section ? [section] : [],
                    subjects: validSubjects
                  }, { ignoreUndefined: true });
                  
                  results.push({ 
                    className: classData.name, 
                    baseClass: baseClassName, 
                    action: "created", 
                    subjectsCount: validSubjects.length 
                  });
                } catch (insertErr) {
                  // If still fails, report error
                  results.push({
                    className: classData.name,
                    baseClass: baseClassName,
                    action: "error",
                    error: `Database index conflict. Please contact admin to fix index on 'className' field. Original: ${createErr.message}`
                  });
                }
              }
            } else {
              // Other error, re-throw
              throw createErr;
            }
          }
        } else {
          // Update existing class
          let updated = false;
          
          // Add section if not exists
          if (section && !classModel.sections.includes(section)) {
            classModel.sections.push(section);
            updated = true;
          }
          
          // Merge subjects (avoid duplicates)
          const existingSubjectNames = new Set(classModel.subjects.map(s => s.name));
          const newSubjects = validSubjects.filter(s => !existingSubjectNames.has(s.name));
          
          if (newSubjects.length > 0) {
            classModel.subjects.push(...newSubjects);
            updated = true;
          }
          
          if (updated) {
            await classModel.save();
            results.push({ 
              className: classData.name, 
              baseClass: baseClassName, 
              action: "updated", 
              subjectsAdded: newSubjects.length,
              totalSubjects: classModel.subjects.length
            });
          } else {
            results.push({ 
              className: classData.name, 
              baseClass: baseClassName, 
              action: "no_change", 
              message: "All subjects already exist"
            });
          }
        }
      } catch (classErr) {
        console.error(`Error processing class ${classData.name}:`, classErr);
        // If it's a duplicate key error, try to find and update instead
        if (classErr.code === 11000) {
          try {
            const existingClass = await ClassModel.findOne({ name: baseClassName });
            if (existingClass) {
              // Merge subjects
              const existingSubjectNames = new Set(existingClass.subjects.map(s => s.name));
              const newSubjects = validSubjects.filter(s => !existingSubjectNames.has(s.name));
              
              if (newSubjects.length > 0) {
                existingClass.subjects.push(...newSubjects);
                if (section && !existingClass.sections.includes(section)) {
                  existingClass.sections.push(section);
                }
                await existingClass.save();
                results.push({ 
                  className: classData.name, 
                  baseClass: baseClassName, 
                  action: "updated", 
                  subjectsAdded: newSubjects.length,
                  totalSubjects: existingClass.subjects.length
                });
              } else {
                results.push({ 
                  className: classData.name, 
                  baseClass: baseClassName, 
                  action: "no_change", 
                  message: "All subjects already exist"
                });
              }
            } else {
              results.push({
                className: classData.name,
                baseClass: baseClassName,
                action: "error",
                error: "Duplicate key error - class may exist with different structure"
              });
            }
          } catch (retryErr) {
            results.push({
              className: classData.name,
              baseClass: baseClassName,
              action: "error",
              error: retryErr.message
            });
          }
        } else {
          results.push({
            className: classData.name,
            baseClass: baseClassName,
            action: "error",
            error: classErr.message
          });
        }
      }
    }
    
    res.json({
      success: true,
      message: `Saved subjects for ${results.length} class${results.length !== 1 ? 'es' : ''}`,
      results
    });
  } catch (err) {
    console.error("Error saving class subjects:", err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

export default router;   // ✅ Use export default instead of module.exports
