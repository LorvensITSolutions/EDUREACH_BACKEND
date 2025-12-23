import School from "../models/school.model.js";
import Student from "../models/student.model.js";
import Teacher from "../models/teacher.model.js";
import { invalidateCache } from "../lib/redis.js";

// Get or create school configuration
const getSchoolConfig = async () => {
  let school = await School.findOne({ isActive: true });
  
  if (!school) {
    // Create default school configuration
    school = await School.create({
      name: "School Management System",
      shortName: "EDU",
      studentIdPrefix: "S",
      studentIdYear: new Date().getFullYear().toString().slice(-2),
      currentStudentNumber: 0,
      parentIdPrefix: "P",
      currentParentNumber: 0,
      teacherIdPrefix: "T",
      teacherIdYear: new Date().getFullYear().toString().slice(-2),
      currentTeacherNumber: 0,
      isActive: true
    });
  }
  
  return school;
};

// Generate next student ID
export const generateStudentId = async () => {
  const school = await getSchoolConfig();
  
  // Find the highest existing student number for the current year
  const currentYearPrefix = `${school.studentIdPrefix}${school.studentIdYear}`;
  const existingStudents = await Student.find({
    studentId: { $regex: `^${currentYearPrefix}` }
  }).sort({ studentId: -1 }).limit(1);
  
  let nextNumber = 1;
  
  if (existingStudents.length > 0) {
    // Extract the number from the highest existing student ID
    const lastStudentId = existingStudents[0].studentId;
    const lastNumber = parseInt(lastStudentId.replace(currentYearPrefix, ''));
    nextNumber = lastNumber + 1;
  } else {
    // If no students exist for this year, start from the school's counter or 1
    nextNumber = Math.max(school.currentStudentNumber + 1, 1);
  }
  
  // Ensure the generated ID doesn't already exist (safety check)
  let generatedId;
  let attempts = 0;
  const maxAttempts = 100; // Prevent infinite loop
  
  do {
    const studentNumber = nextNumber.toString().padStart(3, '0');
    generatedId = `${school.studentIdPrefix}${school.studentIdYear}${studentNumber}`;
    
    const existingStudent = await Student.findOne({ studentId: generatedId });
    if (!existingStudent) {
      break; // ID is unique, we can use it
    }
    
    nextNumber++;
    attempts++;
  } while (attempts < maxAttempts);
  
  if (attempts >= maxAttempts) {
    throw new Error('Unable to generate unique student ID after maximum attempts');
  }
  
  // Update school counter to the next number
  school.currentStudentNumber = nextNumber;
  await school.save();
  
  // Invalidate school config cache
  await invalidateCache.school();
  
  return generatedId;
};

// Generate student credentials
export const generateStudentCredentials = async (studentId) => {
  const school = await getSchoolConfig();
  
  // Username: Student ID (e.g., S24001)
  const username = studentId;
  
  // Password: School prefix + last 3 digits of student ID (e.g., EDU001)
  const lastThreeDigits = studentId.slice(-3);
  const password = `${school.shortName}${lastThreeDigits}`;
  
  return {
    username,
    password
  };
};

// Generate parent ID (sequential)
export const generateParentId = async () => {
  const school = await getSchoolConfig();
  
  // Increment parent number
  school.currentParentNumber += 1;
  await school.save();
  
  // Format: P + 3-digit number (e.g., P001, P002)
  const parentNumber = school.currentParentNumber.toString().padStart(3, '0');
  return parentNumber;
};

// Generate next teacher ID
export const generateTeacherId = async () => {
  const school = await getSchoolConfig();
  
  // Find the highest existing teacher number for the current year
  const currentYearPrefix = `${school.teacherIdPrefix}${school.teacherIdYear}`;
  const existingTeachers = await Teacher.find({
    teacherId: { $regex: `^${currentYearPrefix}` }
  }).sort({ teacherId: -1 }).limit(1);
  
  let nextNumber = 1;
  
  if (existingTeachers.length > 0) {
    // Extract the number from the highest existing teacher ID
    const lastTeacherId = existingTeachers[0].teacherId;
    const lastNumber = parseInt(lastTeacherId.replace(currentYearPrefix, ''));
    nextNumber = lastNumber + 1;
  } else {
    // If no teachers exist for this year, start from the school's counter or 1
    nextNumber = Math.max(school.currentTeacherNumber + 1, 1);
  }
  
  // Ensure the generated ID doesn't already exist (safety check)
  let generatedId;
  let attempts = 0;
  const maxAttempts = 100; // Prevent infinite loop
  
  do {
    const teacherNumber = nextNumber.toString().padStart(3, '0');
    generatedId = `${school.teacherIdPrefix}${school.teacherIdYear}${teacherNumber}`;
    
    const existingTeacher = await Teacher.findOne({ teacherId: generatedId });
    if (!existingTeacher) {
      break; // ID is unique, we can use it
    }
    
    nextNumber++;
    attempts++;
  } while (attempts < maxAttempts);
  
  if (attempts >= maxAttempts) {
    throw new Error('Unable to generate unique teacher ID after maximum attempts');
  }
  
  // Update school counter to the next number
  school.currentTeacherNumber = nextNumber;
  await school.save();
  
  // Invalidate school config cache
  await invalidateCache.school();
  
  return generatedId;
};

// Generate parent credentials based on email (consistent for same parent)
export const generateParentCredentialsByEmail = async (parentEmail) => {
  const school = await getSchoolConfig();
  
  // Check if parent already has credentials
  const Parent = (await import("../models/parent.model.js")).default;
  const existingParent = await Parent.findOne({ email: parentEmail });
  
  if (existingParent && existingParent.generatedCredentials) {
    return existingParent.generatedCredentials;
  }
  
  // Generate new parent ID
  const parentId = await generateParentId();
  
  // Username: P + Parent ID (e.g., P001, P002)
  const username = `${school.parentIdPrefix}${parentId}`;
  
  // Password: School prefix + Parent ID (e.g., EDU001, EDU002)
  const password = `${school.shortName}${parentId}`;
  
  return {
    username,
    password
  };
};

// Legacy function for backward compatibility (now uses parent email)
export const generateParentCredentials = async (studentId) => {
  // This is now deprecated - use generateParentCredentialsByEmail instead
  console.warn('generateParentCredentials with studentId is deprecated. Use generateParentCredentialsByEmail instead.');
  
  const school = await getSchoolConfig();
  
  // Username: P + Student ID (e.g., PS24001)
  const username = `${school.parentIdPrefix}${studentId}`;
  
  // Password: School prefix + last 3 digits of student ID (e.g., EDU001)
  const lastThreeDigits = studentId.slice(-3);
  const password = `${school.shortName}${lastThreeDigits}`;
  
  return {
    username,
    password
  };
};

// Generate credentials for both student and parent
export const generateAllCredentials = async (studentId) => {
  const studentCreds = await generateStudentCredentials(studentId);
  
  return {
    student: studentCreds,
    parent: null // Parent credentials will be generated separately by email
  };
};

// Generate teacher credentials
export const generateTeacherCredentials = async (teacherId) => {
  const school = await getSchoolConfig();
  
  // Username: Teacher ID (e.g., T24001)
  const username = teacherId;
  
  // Password: School prefix + last 3 digits of teacher ID (e.g., EDU001)
  const lastThreeDigits = teacherId.slice(-3);
  const password = `${school.shortName}${lastThreeDigits}`;
  
  return {
    username,
    password
  };
};

// Generate credentials for student and parent by email
export const generateAllCredentialsByEmail = async (studentId, parentEmail) => {
  const [studentCreds, parentCreds] = await Promise.all([
    generateStudentCredentials(studentId),
    generateParentCredentialsByEmail(parentEmail)
  ]);
  
  return {
    student: studentCreds,
    parent: parentCreds
  };
};

// Update school configuration
export const updateSchoolConfig = async (config) => {
  const school = await getSchoolConfig();
  
  Object.keys(config).forEach(key => {
    if (config[key] !== undefined) {
      school[key] = config[key];
    }
  });
  
  await school.save();
  return school;
};

// Get school configuration
export const getSchoolSettings = async () => {
  return await getSchoolConfig();
};
