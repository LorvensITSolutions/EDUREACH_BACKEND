// utils/timetableValidation.js
// Comprehensive validation utilities for timetable input

import { SubjectModel } from "../models/subjectModel.js";
import TeacherModel from "../models/teacher.model.js";
import ClassModel from "../models/class.model.js";

/**
 * Validates timetable input and returns detailed error messages
 * @param {Object} input - { classes, teachers, days, periodsPerDay }
 * @returns {Object} { valid: boolean, errors: Array, warnings: Array }
 */
export async function validateTimetableInput(input) {
  const { classes, teachers, days, periodsPerDay } = input;
  const errors = [];
  const warnings = [];

  // 1. Basic structure validation
  if (!Array.isArray(classes) || classes.length === 0) {
    errors.push({
      field: "classes",
      code: "NO_CLASSES",
      message: "At least one class must be defined",
      suggestion: "Add classes with their subjects and periods per week"
    });
    return { valid: false, errors, warnings };
  }

  if (!Array.isArray(teachers) || teachers.length === 0) {
    errors.push({
      field: "teachers",
      code: "NO_TEACHERS",
      message: "At least one teacher must be defined",
      suggestion: "Add teachers with their assigned subjects"
    });
    return { valid: false, errors, warnings };
  }

  if (!Array.isArray(days) || days.length === 0) {
    errors.push({
      field: "days",
      code: "NO_DAYS",
      message: "At least one day must be defined",
      suggestion: "Specify working days (e.g., ['Monday', 'Tuesday', ...])"
    });
    return { valid: false, errors, warnings };
  }

  if (!Number.isInteger(periodsPerDay) || periodsPerDay <= 0 || periodsPerDay > 12) {
    errors.push({
      field: "periodsPerDay",
      code: "INVALID_PERIODS",
      message: "Periods per day must be between 1 and 12",
      suggestion: `Set periodsPerDay to a value between 1 and 12 (current: ${periodsPerDay})`
    });
    return { valid: false, errors, warnings };
  }

  // 2. Validate classes
  const classNames = new Set();
  const allSubjects = new Set();
  const totalSlotsPerWeek = days.length * periodsPerDay;

  for (let i = 0; i < classes.length; i++) {
    const cls = classes[i];
    const classIndex = i + 1;

    // Class name validation
    if (!cls.name || typeof cls.name !== "string" || cls.name.trim() === "") {
      errors.push({
        field: `classes[${i}].name`,
        code: "INVALID_CLASS_NAME",
        message: `Class ${classIndex} is missing a name`,
        suggestion: `Provide a valid class name (e.g., "10A", "9B")`
      });
      continue;
    }

    // Check for duplicate class names
    if (classNames.has(cls.name)) {
      errors.push({
        field: `classes[${i}].name`,
        code: "DUPLICATE_CLASS",
        message: `Duplicate class name: "${cls.name}"`,
        suggestion: "Each class must have a unique name"
      });
    }
    classNames.add(cls.name);

    // Subjects validation
    if (!Array.isArray(cls.subjects) || cls.subjects.length === 0) {
      errors.push({
        field: `classes[${i}].subjects`,
        code: "NO_SUBJECTS",
        message: `Class "${cls.name}" has no subjects defined`,
        suggestion: `Add at least one subject to class "${cls.name}"`
      });
      continue;
    }

    // Validate each subject
    const classSubjects = new Set();
    let totalPeriodsRequired = 0;

    for (let j = 0; j < cls.subjects.length; j++) {
      const subject = cls.subjects[j];
      const subjectIndex = j + 1;

      if (!subject.name || typeof subject.name !== "string") {
        errors.push({
          field: `classes[${i}].subjects[${j}].name`,
          code: "INVALID_SUBJECT_NAME",
          message: `Class "${cls.name}", subject ${subjectIndex} is missing a name`,
          suggestion: "Provide a valid subject name"
        });
        continue;
      }

      // Check for duplicate subjects in same class
      if (classSubjects.has(subject.name)) {
        warnings.push({
          field: `classes[${i}].subjects[${j}].name`,
          code: "DUPLICATE_SUBJECT_IN_CLASS",
          message: `Class "${cls.name}" has duplicate subject: "${subject.name}"`,
          suggestion: "Consider merging periods if this is intentional"
        });
      }
      classSubjects.add(subject.name);
      allSubjects.add(subject.name);

      // Periods per week validation
      const periods = Number(subject.periodsPerWeek);
      if (!Number.isInteger(periods) || periods <= 0 || periods > 20) {
        errors.push({
          field: `classes[${i}].subjects[${j}].periodsPerWeek`,
          code: "INVALID_PERIODS_PER_WEEK",
          message: `Class "${cls.name}", subject "${subject.name}" has invalid periods per week: ${subject.periodsPerWeek}`,
          suggestion: "Set periodsPerWeek to a number between 1 and 20"
        });
        continue;
      }

      totalPeriodsRequired += periods;
    }

    // Check if total periods exceed available slots
    if (totalPeriodsRequired > totalSlotsPerWeek) {
      errors.push({
        field: `classes[${i}]`,
        code: "EXCESSIVE_PERIODS",
        message: `Class "${cls.name}" requires ${totalPeriodsRequired} periods/week but only ${totalSlotsPerWeek} slots available`,
        suggestion: `Reduce total periods per week for class "${cls.name}" by ${totalPeriodsRequired - totalSlotsPerWeek} periods, or increase days/periodsPerDay`
      });
    }

    // Warning if periods are close to limit
    if (totalPeriodsRequired > totalSlotsPerWeek * 0.9) {
      warnings.push({
        field: `classes[${i}]`,
        code: "HIGH_PERIOD_USAGE",
        message: `Class "${cls.name}" uses ${((totalPeriodsRequired / totalSlotsPerWeek) * 100).toFixed(1)}% of available slots`,
        suggestion: "Consider leaving some free periods for flexibility"
      });
    }
  }

  // 3. Validate teachers
  const teacherNames = new Set();
  const teacherSubjects = new Set();

  for (let i = 0; i < teachers.length; i++) {
    const teacher = teachers[i];
    const teacherIndex = i + 1;

    if (!teacher.name || typeof teacher.name !== "string" || teacher.name.trim() === "") {
      errors.push({
        field: `teachers[${i}].name`,
        code: "INVALID_TEACHER_NAME",
        message: `Teacher ${teacherIndex} is missing a name`,
        suggestion: "Provide a valid teacher name"
      });
      continue;
    }

    // Check for duplicate teacher names
    if (teacherNames.has(teacher.name)) {
      errors.push({
        field: `teachers[${i}].name`,
        code: "DUPLICATE_TEACHER",
        message: `Duplicate teacher name: "${teacher.name}"`,
        suggestion: "Each teacher must have a unique name"
      });
    }
    teacherNames.add(teacher.name);

    // Subjects validation
    if (!Array.isArray(teacher.subjects) || teacher.subjects.length === 0) {
      errors.push({
        field: `teachers[${i}].subjects`,
        code: "NO_TEACHER_SUBJECTS",
        message: `Teacher "${teacher.name}" has no subjects assigned`,
        suggestion: `Assign at least one subject to teacher "${teacher.name}"`
      });
      continue;
    }

    // Validate teacher subjects
    for (let j = 0; j < teacher.subjects.length; j++) {
      const subject = teacher.subjects[j];
      if (typeof subject !== "string" || subject.trim() === "") {
        errors.push({
          field: `teachers[${i}].subjects[${j}]`,
          code: "INVALID_TEACHER_SUBJECT",
          message: `Teacher "${teacher.name}" has invalid subject at index ${j + 1}`,
          suggestion: "Provide a valid subject name"
        });
        continue;
      }
      teacherSubjects.add(subject);
    }
  }

  // 4. Check if all class subjects have assigned teachers
  const missingTeachers = [];
  for (const subject of allSubjects) {
    if (!teacherSubjects.has(subject)) {
      missingTeachers.push(subject);
    }
  }

  if (missingTeachers.length > 0) {
    errors.push({
      field: "teachers",
      code: "MISSING_TEACHERS",
      message: `No teacher assigned for subjects: ${missingTeachers.join(", ")}`,
      suggestion: `Assign teachers for: ${missingTeachers.join(", ")}`
    });
  }

  // 5. Check teacher workload (warnings)
  const teacherWorkload = {};
  for (const cls of classes) {
    for (const subject of cls.subjects || []) {
      const periods = Number(subject.periodsPerWeek) || 0;
      for (const teacher of teachers) {
        if (teacher.subjects && teacher.subjects.includes(subject.name)) {
          if (!teacherWorkload[teacher.name]) {
            teacherWorkload[teacher.name] = 0;
          }
          teacherWorkload[teacher.name] += periods;
        }
      }
    }
  }

  for (const [teacherName, workload] of Object.entries(teacherWorkload)) {
    const maxPossible = days.length * periodsPerDay;
    if (workload > maxPossible) {
      warnings.push({
        field: "teachers",
        code: "HIGH_TEACHER_WORKLOAD",
        message: `Teacher "${teacherName}" is assigned ${workload} periods/week (max possible: ${maxPossible})`,
        suggestion: "This teacher may be over-allocated. Consider redistributing subjects."
      });
    }
  }

  // 6. Validate days format
  const validDayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const dayAbbreviations = { "Mon": "Monday", "Tue": "Tuesday", "Wed": "Wednesday", "Thu": "Thursday", "Fri": "Friday", "Sat": "Saturday", "Sun": "Sunday" };

  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    if (typeof day !== "string") {
      errors.push({
        field: `days[${i}]`,
        code: "INVALID_DAY_FORMAT",
        message: `Invalid day format at index ${i + 1}: ${day}`,
        suggestion: "Use full day names (e.g., 'Monday', 'Tuesday')"
      });
      continue;
    }

    const normalizedDay = dayAbbreviations[day] || day;
    if (!validDayNames.includes(normalizedDay)) {
      warnings.push({
        field: `days[${i}]`,
        code: "UNUSUAL_DAY_NAME",
        message: `Unusual day name: "${day}"`,
        suggestion: "Ensure day names are spelled correctly"
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: {
      totalClasses: classes.length,
      totalTeachers: teachers.length,
      totalSubjects: allSubjects.size,
      totalDays: days.length,
      periodsPerDay,
      totalSlotsPerWeek
    }
  };
}

/**
 * Validates if subjects exist in database
 * @param {Array} subjectNames - Array of subject names
 * @returns {Object} { valid: boolean, missing: Array, existing: Array }
 */
export async function validateSubjectsExist(subjectNames) {
  const existingSubjects = await SubjectModel.find({
    name: { $in: subjectNames }
  }).select("name");

  const existingNames = new Set(existingSubjects.map(s => s.name));
  const missing = subjectNames.filter(name => !existingNames.has(name));
  const existing = subjectNames.filter(name => existingNames.has(name));

  return {
    valid: missing.length === 0,
    missing,
    existing
  };
}

/**
 * Validates if teachers exist in database
 * @param {Array} teacherNames - Array of teacher names
 * @returns {Object} { valid: boolean, missing: Array, existing: Array }
 */
export async function validateTeachersExist(teacherNames) {
  const existingTeachers = await TeacherModel.find({
    name: { $in: teacherNames }
  }).select("name");

  const existingNames = new Set(existingTeachers.map(t => t.name));
  const missing = teacherNames.filter(name => !existingNames.has(name));
  const existing = teacherNames.filter(name => existingNames.has(name));

  return {
    valid: missing.length === 0,
    missing,
    existing
  };
}

/**
 * Validates if classes exist in database
 * @param {Array} classNames - Array of class names (e.g., ["10A", "10B"])
 * @returns {Object} { valid: boolean, missing: Array, existing: Array }
 */
export async function validateClassesExist(classNames) {
  // Parse class names to match database format
  const parsedClasses = classNames.map(name => {
    const match = name.match(/^(\d+)([A-Z]?)$/);
    if (match) {
      return {
        frontendName: name,
        dbName: `Grade ${match[1]}`,
        section: match[2] || "A"
      };
    }
    return { frontendName: name, dbName: name, section: "A" };
  });

  const dbClassNames = [...new Set(parsedClasses.map(p => p.dbName))];
  const existingClasses = await ClassModel.find({
    name: { $in: dbClassNames }
  }).select("name sections");

  const existingMap = new Map();
  existingClasses.forEach(cls => {
    existingMap.set(cls.name, cls.sections || []);
  });

  const missing = [];
  const existing = [];

  for (const parsed of parsedClasses) {
    const classData = existingMap.get(parsed.dbName);
    if (classData && classData.includes(parsed.section)) {
      existing.push(parsed.frontendName);
    } else {
      missing.push(parsed.frontendName);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
    existing
  };
}

