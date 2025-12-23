// utils/timetableBulkImport.js
// Bulk import utilities for classes and teachers

import XLSX from "xlsx";
import fs from "fs";

/**
 * Parse CSV/Excel file for classes
 * Expected format:
 * Class Name | Subject | Periods Per Week
 * 10A       | Maths   | 5
 * 10A       | Science | 4
 * 10B       | Maths   | 5
 */
export function parseClassesFromFile(filePath) {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    const classesMap = new Map();

    for (const row of data) {
      const className = row["Class Name"] || row["ClassName"] || row["class"] || row["Class"];
      const subjectName = row["Subject"] || row["subject"];
      const periodsPerWeek = Number(row["Periods Per Week"] || row["PeriodsPerWeek"] || row["periods"] || row["Periods"] || 0);

      if (!className || !subjectName) {
        continue; // Skip invalid rows
      }

      if (!classesMap.has(className)) {
        classesMap.set(className, {
          name: className,
          subjects: []
        });
      }

      const classObj = classesMap.get(className);
      classObj.subjects.push({
        name: subjectName,
        periodsPerWeek: periodsPerWeek || 5
      });
    }

    return Array.from(classesMap.values());
  } catch (error) {
    throw new Error(`Failed to parse classes file: ${error.message}`);
  }
}

/**
 * Parse CSV/Excel file for teachers
 * Expected format:
 * Teacher Name | Subjects (comma-separated)
 * Mr. Smith   | Maths, Science
 * Ms. Jones   | English
 */
export function parseTeachersFromFile(filePath) {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    const teachers = [];

    for (const row of data) {
      const teacherName = row["Teacher Name"] || row["TeacherName"] || row["teacher"] || row["Teacher"];
      const subjectsStr = row["Subjects"] || row["subjects"] || row["Subject"] || "";

      if (!teacherName) {
        continue; // Skip invalid rows
      }

      // Parse subjects (comma-separated or array)
      let subjects = [];
      if (Array.isArray(subjectsStr)) {
        subjects = subjectsStr;
      } else if (typeof subjectsStr === "string") {
        subjects = subjectsStr.split(",").map(s => s.trim()).filter(Boolean);
      }

      teachers.push({
        name: teacherName,
        subjects: subjects.length > 0 ? subjects : []
      });
    }

    return teachers;
  } catch (error) {
    throw new Error(`Failed to parse teachers file: ${error.message}`);
  }
}

/**
 * Parse JSON file for classes and teachers
 * Expected format:
 * {
 *   "classes": [
 *     { "name": "10A", "subjects": [{ "name": "Maths", "periodsPerWeek": 5 }] }
 *   ],
 *   "teachers": [
 *     { "name": "Mr. Smith", "subjects": ["Maths", "Science"] }
 *   ]
 * }
 */
export function parseFromJSON(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(content);

    return {
      classes: data.classes || [],
      teachers: data.teachers || [],
      days: data.days || ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      periodsPerDay: data.periodsPerDay || 8,
      options: data.options || {}
    };
  } catch (error) {
    throw new Error(`Failed to parse JSON file: ${error.message}`);
  }
}

/**
 * Parse CSV text for classes
 */
export function parseClassesFromCSV(csvText) {
  const lines = csvText.split("\n").filter(line => line.trim());
  if (lines.length < 2) {
    throw new Error("CSV must have at least a header row and one data row");
  }

  const headers = lines[0].split(",").map(h => h.trim());
  const classNameIdx = headers.findIndex(h => 
    /class/i.test(h) && /name/i.test(h)
  );
  const subjectIdx = headers.findIndex(h => /subject/i.test(h));
  const periodsIdx = headers.findIndex(h => 
    /period/i.test(h) || /week/i.test(h)
  );

  if (classNameIdx === -1 || subjectIdx === -1) {
    throw new Error("CSV must have 'Class Name' and 'Subject' columns");
  }

  const classesMap = new Map();

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map(v => v.trim());
    const className = values[classNameIdx];
    const subjectName = values[subjectIdx];
    const periodsPerWeek = periodsIdx !== -1 ? Number(values[periodsIdx]) || 5 : 5;

    if (!className || !subjectName) continue;

    if (!classesMap.has(className)) {
      classesMap.set(className, {
        name: className,
        subjects: []
      });
    }

    classesMap.get(className).subjects.push({
      name: subjectName,
      periodsPerWeek
    });
  }

  return Array.from(classesMap.values());
}

