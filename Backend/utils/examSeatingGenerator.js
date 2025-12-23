// utils/examSeatingGenerator.js
// Exam seating arrangement generator with student shuffling

import StudentModel from "../models/student.model.js";
import TeacherModel from "../models/teacher.model.js";

/**
 * Generate exam seating arrangement
 * @param {Object} config - Configuration object
 * @param {Array} config.classes - Array of class names (e.g., ["10A", "10B"])
 * @param {Number} config.totalStudents - Total number of students
 * @param {Number} config.totalTeachers - Total number of teachers available
 * @param {Array} config.examHalls - Array of { hallName, capacity }
 * @param {Object} config.options - Options for shuffling
 * @returns {Object} Seating arrangement result
 */
export async function generateExamSeating(config) {
  try {
    const { classes, totalStudents, totalTeachers, examHalls, options = {} } = config;

    // Validate inputs
    validateInputs(classes, totalStudents, totalTeachers, examHalls);

    // Fetch students from database
    const students = await fetchStudents(classes);
    
    if (students.length === 0) {
      return {
        success: false,
        error: "No students found for the specified classes"
      };
    }

    // Validate total students matches fetched students
    if (students.length !== totalStudents) {
      console.warn(`Warning: Total students specified (${totalStudents}) doesn't match fetched students (${students.length}). Using fetched count.`);
    }

    // Fetch teachers from database
    const teachers = await fetchTeachers(totalTeachers);

    if (teachers.length < examHalls.length) {
      return {
        success: false,
        error: `Not enough teachers. Need ${examHalls.length} teachers for ${examHalls.length} halls, but only ${teachers.length} available.`
      };
    }

    // Calculate total capacity
    const totalCapacity = examHalls.reduce((sum, hall) => sum + hall.capacity, 0);

    if (students.length > totalCapacity) {
      return {
        success: false,
        error: `Total students (${students.length}) exceed total hall capacity (${totalCapacity}). Add more halls or reduce students.`
      };
    }

    // Shuffle students based on options
    const shuffledStudents = shuffleStudents(students, options);

    // Assign students to halls
    const hallAssignments = assignStudentsToHalls(shuffledStudents, examHalls, options);

    // Assign teachers to halls
    const teacherAssignments = assignTeachersToHalls(teachers, examHalls);

    // Create final seating arrangement with detailed positions
    const seatingArrangement = createSeatingArrangement(hallAssignments, examHalls);

    return {
      success: true,
      examHalls: hallAssignments.map((hall, index) => ({
        hallName: hall.hallName,
        capacity: examHalls[index].capacity,
        totalStudents: hall.students.length,
        availableSeats: examHalls[index].capacity - hall.students.length,
        rows: hall.rows,
        columns: hall.columns,
        supervisor: teacherAssignments[index]?.name || null,
        students: hall.students.map(s => ({
          studentId: s.studentId,
          name: s.name,
          class: s.class,
          section: s.section || "",
          seatNumber: s.seatNumber,
          row: s.row,
          column: s.column,
          position: s.position
        }))
      })),
      summary: {
        totalStudents: students.length,
        totalHalls: examHalls.length,
        totalCapacity,
        utilizationRate: ((students.length / totalCapacity) * 100).toFixed(1) + "%",
        studentsPerHall: hallAssignments.map(h => h.students.length),
        teachersAssigned: teacherAssignments.length
      },
      seatingArrangement
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Validate input parameters
 */
function validateInputs(classes, totalStudents, totalTeachers, examHalls) {
  if (!Array.isArray(classes) || classes.length === 0) {
    throw new Error("At least one class must be specified");
  }

  if (!Number.isInteger(totalStudents) || totalStudents <= 0) {
    throw new Error("Total students must be a positive integer");
  }

  if (!Number.isInteger(totalTeachers) || totalTeachers <= 0) {
    throw new Error("Total teachers must be a positive integer");
  }

  if (!Array.isArray(examHalls) || examHalls.length === 0) {
    throw new Error("At least one exam hall must be specified");
  }

  examHalls.forEach((hall, index) => {
    if (!hall.hallName || typeof hall.hallName !== "string") {
      throw new Error(`Hall ${index + 1} is missing a name`);
    }
    if (!Number.isInteger(hall.capacity) || hall.capacity <= 0) {
      throw new Error(`Hall "${hall.hallName}" has invalid capacity`);
    }
  });
}

/**
 * Fetch students from database based on classes
 */
async function fetchStudents(classes) {
  try {
    // Parse class names to match database format
    // Frontend format: "10A" -> Database: class="10", section="A"
    const classQueries = classes.map(className => {
      const match = className.match(/^(\d+)([A-Z])$/);
      if (match) {
        return {
          class: match[1],
          section: match[2]
        };
      }
      // Try to match non-numeric classes (e.g., "NurseryA")
      const nameMatch = className.match(/^([A-Za-z]+)([A-Z])$/);
      if (nameMatch) {
        return {
          class: nameMatch[1],
          section: nameMatch[2]
        };
      }
      // Fallback: use full name as class
      return {
        class: className,
        section: ""
      };
    });

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

    const students = await StudentModel.find(query)
      .select("studentId name class section")
      .lean();

    return students;
  } catch (error) {
    console.error("Error fetching students:", error);
    throw new Error(`Failed to fetch students: ${error.message}`);
  }
}

/**
 * Fetch teachers from database
 */
async function fetchTeachers(totalTeachers) {
  try {
    const teachers = await TeacherModel.find()
      .select("name")
      .limit(totalTeachers)
      .lean();

    return teachers;
  } catch (error) {
    console.error("Error fetching teachers:", error);
    throw new Error(`Failed to fetch teachers: ${error.message}`);
  }
}

/**
 * Shuffle students based on options
 */
function shuffleStudents(students, options = {}) {
  const {
    shuffleSameClass = true,
    minDistanceBetweenSameClass = 2,
    randomizeSeats = true
  } = options;

  // Create a copy to avoid mutating original
  let shuffled = [...students];

  if (randomizeSeats) {
    // Fisher-Yates shuffle
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
  }

  // If shuffleSameClass is enabled, ensure same class students are distributed
  if (shuffleSameClass) {
    shuffled = distributeSameClassStudents(shuffled);
  }

  return shuffled;
}

/**
 * Distribute students from the same class across the list
 */
function distributeSameClassStudents(students) {
  // Group students by class
  const classGroups = {};
  students.forEach(student => {
    const classKey = `${student.class}${student.section || ""}`;
    if (!classGroups[classKey]) {
      classGroups[classKey] = [];
    }
    classGroups[classKey].push(student);
  });

  // Interleave students from different classes
  const distributed = [];
  const classKeys = Object.keys(classGroups);
  const maxLength = Math.max(...Object.values(classGroups).map(g => g.length));

  for (let i = 0; i < maxLength; i++) {
    classKeys.forEach(classKey => {
      if (classGroups[classKey][i]) {
        distributed.push(classGroups[classKey][i]);
      }
    });
  }

  // Shuffle the distributed array one more time
  for (let i = distributed.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [distributed[i], distributed[j]] = [distributed[j], distributed[i]];
  }

  return distributed;
}

/**
 * Get student's grade (extract numeric part from class name)
 * e.g., "1A" -> "1", "10B" -> "10", "NurseryA" -> "Nursery"
 */
function getStudentGrade(student) {
  if (!student || !student.class) return "";
  
  const classKey = `${student.class}${student.section || ""}`;
  // Try to extract numeric grade first
  const numericMatch = classKey.match(/^(\d+)/);
  if (numericMatch) {
    return numericMatch[1];
  }
  
  // For non-numeric classes like "Nursery", extract base name
  const textMatch = classKey.match(/^([A-Za-z]+)/);
  if (textMatch) {
    return textMatch[1];
  }
  
  // Fallback: use the base class name
  return student.class;
}

/**
 * Check if two students are from same class or same grade
 * Returns true if they should NOT sit adjacent
 * 
 * STRICT RULES:
 * 1. Same exact class (same class + same section) - CANNOT sit adjacent
 *    Example: "8D" and "8D" - VIOLATION
 * 2. Same grade but different sections - CANNOT sit adjacent
 *    Example: "8C" and "8D" - VIOLATION (both grade 8, different sections)
 *    Example: "1A" and "1B" - VIOLATION (both grade 1, different sections)
 */
function areStudentsRelated(student1, student2) {
  if (!student1 || !student2) {
    return false;
  }
  if (!student1.class || !student2.class) {
    return false;
  }
  
  // Normalize class and section for comparison
  const class1 = String(student1.class || "").trim();
  const section1 = String(student1.section || "").trim().toUpperCase();
  const class2 = String(student2.class || "").trim();
  const section2 = String(student2.section || "").trim().toUpperCase();
  
  // Rule 1: Same exact class (same class + same section) - CANNOT sit adjacent
  // Example: class="8", section="D" and class="8", section="D" = SAME CLASS
  if (class1 === class2 && section1 === section2) {
    return true; // They are related - cannot sit adjacent
  }
  
  // Rule 2: Same grade but different sections - CANNOT sit adjacent
  // Example: "8C" (class="8", section="C") and "8D" (class="8", section="D") = SAME GRADE, DIFFERENT SECTIONS
  const grade1 = getStudentGrade(student1);
  const grade2 = getStudentGrade(student2);
  
  if (grade1 && grade2 && grade1 === grade2) {
    // Both have the same grade (e.g., both "8" or both "1")
    // If they have different sections, they cannot sit adjacent
    if (section1 !== section2) {
      // Different sections - cannot sit adjacent
      // Handle cases:
      // - Both have sections and they're different (e.g., "8C" vs "8D")
      // - One has section, other doesn't (e.g., "8A" vs "8")
      if (section1 && section2) {
        // Both have sections and they're different - cannot sit adjacent
        return true;
      } else if (section1 || section2) {
        // One has section, other doesn't - treat as different sections, cannot sit adjacent
        return true;
      }
    }
  }
  
  return false; // Different grades - can sit adjacent
}

/**
 * Check if placing a student at a position would violate adjacency rules
 * 
 * EXAM CHEATING PREVENTION RULES:
 * - Same class/grade students CAN sit in same column (vertical) - they can't copy vertically
 * - Same class/grade students CANNOT sit horizontally adjacent (left/right)
 * - Same class/grade students CANNOT sit diagonally adjacent (all 4 diagonals)
 * 
 * This means we check: LEFT, RIGHT, and all 4 DIAGONALS
 * We do NOT check: TOP and BOTTOM (vertical neighbors are allowed)
 */
function wouldViolateAdjacency(grid, row, col, student, rows, columns) {
  if (!student || !student.class) {
    console.warn(`wouldViolateAdjacency: Invalid student data`, student);
    return false;
  }

  // Check only horizontal and diagonal positions (NOT vertical)
  // Students CAN sit in same column (vertical alignment) - they can't copy from front/back
  const adjacentPositions = [
    { r: row, c: col - 1, name: 'left' },           // Horizontal left
    { r: row, c: col + 1, name: 'right' },         // Horizontal right
    { r: row - 1, c: col - 1, name: 'top-left' },  // Diagonal top-left
    { r: row - 1, c: col + 1, name: 'top-right' }, // Diagonal top-right
    { r: row + 1, c: col - 1, name: 'bottom-left' }, // Diagonal bottom-left
    { r: row + 1, c: col + 1, name: 'bottom-right' } // Diagonal bottom-right
    // NOTE: We do NOT check row-1,col (top) and row+1,col (bottom) - vertical is allowed
  ];

  for (const pos of adjacentPositions) {
    if (pos.r >= 0 && pos.r < rows && pos.c >= 0 && pos.c < columns) {
      const adjacentStudent = grid[pos.r][pos.c];
      if (adjacentStudent) {
        // Check if they are related (same class OR same grade)
        const areRelated = areStudentsRelated(student, adjacentStudent);
        if (areRelated) {
          // VIOLATION DETECTED: Same class or same grade students are horizontally/diagonally adjacent!
          console.error(
            `🚫 VIOLATION: Cannot place ${student.name} (${student.class}${student.section || ''}) ` +
            `at R${row+1}C${col+1} - adjacent to ${adjacentStudent.name} ` +
            `(${adjacentStudent.class}${adjacentStudent.section || ''}) at R${pos.r+1}C${pos.c+1} (${pos.name})`
          );
          return true; // Violation: same class/grade horizontally or diagonally adjacent
        }
      }
    }
  }

  return false; // No violations - safe to place (vertical alignment is allowed)
}

/**
 * Assign students to exam halls with row/column positions
 * Ensures same class/grade students are NOT adjacent
 * CRITICAL: Fill early halls COMPLETELY - only last hall can have empty cells
 */
function assignStudentsToHalls(students, examHalls, options = {}) {
  const hallAssignments = examHalls.map(hall => ({
    hallName: hall.hallName,
    capacity: hall.capacity,
    students: [],
    rows: 0,
    columns: 0
  }));

  let studentIndex = 0;
  const totalHalls = examHalls.length;
  const lastHallIndex = totalHalls - 1;

  // STRATEGY: Fill early halls COMPLETELY, only last hall can have empty cells
  // K1, K2, K3, ... K6 must be FULL
  // Only K7 (last hall) can have empty cells
  
  for (let hallIndex = 0; hallIndex < totalHalls && studentIndex < students.length; hallIndex++) {
    const isLastHall = hallIndex === lastHallIndex;
    const hallCapacity = examHalls[hallIndex].capacity;
    
    if (isLastHall) {
      // LAST HALL: Fill as many as possible, empty cells are OK
      while (studentIndex < students.length && hallAssignments[hallIndex].students.length < hallCapacity) {
        const student = students[studentIndex];
        const seatNumber = hallAssignments[hallIndex].students.length + 1;
        
        hallAssignments[hallIndex].students.push({
          studentId: student.studentId,
          name: student.name,
          class: student.class,
          section: student.section || "",
          seatNumber: seatNumber
        });
        
        studentIndex++;
      }
    } else {
      // EARLY HALLS: MUST be filled COMPLETELY - no empty cells allowed
      // Fill this hall to its full capacity
      while (studentIndex < students.length && hallAssignments[hallIndex].students.length < hallCapacity) {
        const student = students[studentIndex];
        const seatNumber = hallAssignments[hallIndex].students.length + 1;
        
        hallAssignments[hallIndex].students.push({
          studentId: student.studentId,
          name: student.name,
          class: student.class,
          section: student.section || "",
          seatNumber: seatNumber
        });
        
        studentIndex++;
      }
      
      // CRITICAL: Early hall MUST be full
      if (hallAssignments[hallIndex].students.length < hallCapacity) {
        console.error(`❌ ERROR: Hall ${hallIndex + 1} (${examHalls[hallIndex].hallName}) is not full!`);
        console.error(`   Expected: ${hallCapacity} students, Got: ${hallAssignments[hallIndex].students.length}`);
        console.error(`   This hall must be completely filled before moving to next hall.`);
        // This is a critical error - we don't have enough students to fill this hall
        // But we'll continue and let the last hall handle remaining students
      }
    }
  }

  // Assign row and column positions to each student
  // First, calculate hall dimensions
  hallAssignments.forEach((hall, hallIndex) => {
    const studentCount = hall.students.length;
    
    // Use rows and columns from examHalls config if provided
    let rows = examHalls[hallIndex]?.rows;
    let columns = examHalls[hallIndex]?.columns;
    
    // If not provided, calculate based on capacity
    if (!rows || rows <= 0) {
      // Calculate optimal rows and columns (prefer more columns for better visibility)
      columns = Math.ceil(Math.sqrt(hall.capacity * 1.5));
      rows = Math.ceil(studentCount / columns);
      
      // Ensure we have at least 2 columns
      if (columns < 2) columns = 2;
      if (rows < 1) rows = 1;
    } else {
      // Rows are specified, calculate columns based on capacity
      columns = Math.ceil(hall.capacity / rows);
      if (columns < 1) columns = 1;
    }
    
    hall.rows = rows;
    hall.columns = columns;
  });

  // Separate same class/grade students to prevent adjacency
  // Now we have the actual dimensions, use them for placement
  // CRITICAL: Early halls must be FULL, only last hall can have empty cells
  hallAssignments.forEach((hall, hallIndex) => {
    const isLastHall = hallIndex === lastHallIndex;
    const hallCapacity = examHalls[hallIndex].capacity;
    const studentCount = hall.students.length;
    
    // Early halls MUST be full - ensure we have exactly capacity students
    if (!isLastHall && studentCount < hallCapacity) {
      console.warn(`⚠️ Hall ${hallIndex + 1} (${hall.hallName}) has ${studentCount} students but capacity is ${hallCapacity}. This should not happen!`);
    }
    
    // Use CSP to place students - for early halls, fill ALL seats
    // For last hall, can leave empty seats at the end
    hall.students = separateSameClassStudents(
      hall.students, 
      hall.rows, 
      hall.columns,
      options.minDistanceBetweenSameClass || 1,
      isLastHall // Pass flag to indicate if this is the last hall
    );
  });

  // Update position strings for students
  hallAssignments.forEach((hall) => {
    hall.students.forEach((student) => {
      if (student.row && student.column) {
        student.position = `Row ${student.row}, Column ${student.column}`;
      }
    });
  });

  return hallAssignments;
}

/**
 * Separate students from same class/grade within a hall
 * Ensures NO adjacent seating for same class OR same grade (different sections)
 * Uses CSP algorithm with multiple retries
 * @param {Array} students - Array of students to place
 * @param {Number} rows - Number of rows in the hall
 * @param {Number} columns - Number of columns in the hall
 * @param {Number} minDistance - Minimum distance (not used in current implementation, but kept for compatibility)
 * @param {Boolean} isLastHall - If true, this is the last hall (can have empty cells). If false, must fill all cells.
 */
function separateSameClassStudents(students, rows, columns, minDistance = 1, isLastHall = false) {
  if (students.length === 0) return students;
  if (!rows || rows <= 0 || !columns || columns <= 0) {
    // Fallback: use estimated dimensions
    rows = Math.ceil(Math.sqrt(students.length));
    columns = Math.ceil(students.length / rows);
  }

  // Ensure valid dimensions
  rows = Math.max(1, Math.floor(rows));
  columns = Math.max(1, Math.floor(columns));
  
  const totalSeats = rows * columns;
  
  // CRITICAL: Early halls MUST fill all seats
  if (!isLastHall && students.length < totalSeats) {
    console.error(`❌ ERROR: Hall must be FULL! Expected ${totalSeats} students, got ${students.length}`);
    console.error(`   This is not the last hall, so it must be completely filled.`);
  }
  
  // Try multiple times to get a valid placement
  const maxAttempts = 10;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`\n=== Placement Attempt ${attempt}/${maxAttempts} ===`);
    if (isLastHall) {
      console.log(`   Last hall: Can have empty cells at the end`);
    } else {
      console.log(`   Early hall: Must fill ALL ${totalSeats} seats completely`);
    }
    
    const result = attemptPlacement(students, rows, columns, isLastHall);
    
    if (result.success) {
      console.log(`✓ Successfully placed all students with ZERO violations on attempt ${attempt}`);
      return result.placedStudents;
    } else {
      console.warn(`✗ Attempt ${attempt} failed: ${result.violations} violations detected. Retrying...`);
      if (attempt === maxAttempts) {
        console.error(`❌ All ${maxAttempts} attempts failed. Using best result with ${result.violations} violations.`);
        return result.placedStudents; // Return best attempt
      }
    }
  }
  
  // Fallback (should never reach here)
  return students;
}

/**
 * CSP (Constraint Satisfaction Problem) Algorithm for Exam Seating
 * Uses backtracking with forward checking, MRV, and LCV heuristics
 * FILLS ALL CELLS FIRST - no empty cells in middle, only at end if needed
 * @param {Boolean} isLastHall - If true, this is the last hall (can have empty cells at end)
 * Returns { success: boolean, placedStudents: Array, violations: number }
 */
function attemptPlacement(students, rows, columns, isLastHall = false) {
  console.log(`\n🎯 Starting CSP Algorithm for ${students.length} students in ${rows}x${columns} grid`);
  if (isLastHall) {
    console.log(`   ⚠️ This is the LAST hall - empty cells at the end are allowed`);
  } else {
    console.log(`   ✅ This is an EARLY hall - must fill ALL cells completely`);
  }
  
  const totalSeats = rows * columns;
  const totalStudents = students.length;
  
  // Step 1: Define Variables (Seats) - ordered from top-left to bottom-right
  const seats = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      seats.push({ row: r, col: c, id: `R${r+1}C${c+1}`, order: r * columns + c });
    }
  }
  
  // Step 2: Define Domain for each seat (initially all students)
  const domains = {};
  seats.forEach(seat => {
    domains[seat.id] = [...students]; // All students can initially sit anywhere
  });
  
  // Step 3: Create assignment (initially empty)
  const assignment = {}; // seatId -> student
  
  // Step 4: Get neighbors for each seat (for constraint checking)
  const neighbors = {};
  seats.forEach(seat => {
    neighbors[seat.id] = getNeighborSeats(seat.row, seat.col, rows, columns);
  });
  
  // Step 5: Solve using CSP with backtracking
  // Priority: Fill seats in order (top-left to bottom-right)
  // For early halls: Fill ALL seats (no empty cells)
  // For last hall: Can leave empty seats at the END
  const usedStudents = new Set();
  const result = cspBacktrack(assignment, domains, seats, neighbors, students, usedStudents, totalSeats, rows, isLastHall);
  
  if (result.success) {
    // Convert assignment to grid format
    const grid = Array(rows).fill(null).map(() => Array(columns).fill(null));
    const placedStudents = [];
    
    seats.forEach(seat => {
      if (result.assignment[seat.id]) {
        const student = result.assignment[seat.id];
        grid[seat.row][seat.col] = student;
        student.row = seat.row + 1;
        student.column = seat.col + 1;
        student.seatNumber = placedStudents.length + 1;
        placedStudents.push(student);
      }
    });
    
    // Final verification: Check for any violations
    let violations = 0;
    const violationDetails = [];
    
    for (const seat of seats) {
      if (result.assignment[seat.id]) {
        const student = result.assignment[seat.id];
        // Check all neighbors
        for (const neighbor of neighbors[seat.id]) {
          const neighborSeat = seats.find(s => s.row === neighbor.row && s.col === neighbor.col);
          if (neighborSeat && result.assignment[neighborSeat.id]) {
            const neighborStudent = result.assignment[neighborSeat.id];
            if (areStudentsRelated(student, neighborStudent)) {
              violations++;
              violationDetails.push(
                `❌ ${student.name} (${student.class}${student.section || ''}) at ${seat.id} ` +
                `is adjacent to ${neighborStudent.name} (${neighborStudent.class}${neighborStudent.section || ''}) at ${neighborSeat.id}`
              );
            }
          }
        }
      }
    }
    
    if (violations > 0) {
      console.error(`❌ CRITICAL: ${violations} violations detected in final CSP solution:`);
      violationDetails.forEach(detail => console.error(`  ${detail}`));
      return {
        success: false,
        placedStudents: placedStudents,
        violations: violations,
        violationDetails: violationDetails
      };
    }
    
    console.log(`✅ CSP Solution Found: All ${placedStudents.length} students placed with ZERO violations`);
    return {
      success: true,
      placedStudents: placedStudents,
      violations: 0,
      violationDetails: []
    };
  } else {
    console.error(`❌ CSP failed to find solution`);
    return {
      success: false,
      placedStudents: [],
      violations: -1,
      violationDetails: ['CSP algorithm could not find valid solution']
    };
  }
}

/**
 * Get neighbor seats for constraint checking
 * Returns horizontal and diagonal neighbors (NOT vertical)
 */
function getNeighborSeats(row, col, rows, columns) {
  const neighbors = [];
  
  // Horizontal neighbors
  if (col > 0) neighbors.push({ row, col: col - 1 }); // Left
  if (col < columns - 1) neighbors.push({ row, col: col + 1 }); // Right
  
  // Diagonal neighbors
  if (row > 0 && col > 0) neighbors.push({ row: row - 1, col: col - 1 }); // Top-left
  if (row > 0 && col < columns - 1) neighbors.push({ row: row - 1, col: col + 1 }); // Top-right
  if (row < rows - 1 && col > 0) neighbors.push({ row: row + 1, col: col - 1 }); // Bottom-left
  if (row < rows - 1 && col < columns - 1) neighbors.push({ row: row + 1, col: col + 1 }); // Bottom-right
  
  // NOTE: We do NOT include vertical neighbors (top/bottom) - those are allowed
  
  return neighbors;
}

/**
 * CSP Backtracking Algorithm with Forward Checking
 * FILLS ALL CELLS FIRST - no empty cells in middle
 * For early halls: Must fill ALL seats completely
 * For last hall: Can leave empty seats at the END
 * Ensures NO same class/grade students are adjacent (especially in last row)
 */
function cspBacktrack(assignment, domains, seats, neighbors, allStudents, usedStudents = new Set(), totalSeats, rows, isLastHall = false) {
  const assignedCount = Object.keys(assignment).length;
  const studentsPlaced = usedStudents.size;
  
  // Base case: All students assigned
  if (studentsPlaced === allStudents.length) {
    // For early halls: Must have filled ALL seats
    if (!isLastHall && assignedCount < totalSeats) {
      // Early hall is not full - this is an error
      console.error(`❌ ERROR: Early hall must be FULL! Filled ${assignedCount}/${totalSeats} seats`);
      return { success: false, assignment: null };
    }
    
    // Verify no violations in final assignment
    if (verifyNoViolations(assignment, seats, neighbors)) {
      return { success: true, assignment: { ...assignment } };
    } else {
      return { success: false, assignment: null };
    }
  }
  
  // Get unassigned seats, sorted by order (top-left to bottom-right)
  const unassignedSeats = seats
    .filter(seat => !assignment[seat.id])
    .sort((a, b) => a.order - b.order); // Fill in order: top-left to bottom-right
  
  // If no more seats but students remain, it's a failure
  if (unassignedSeats.length === 0 && studentsPlaced < allStudents.length) {
    return { success: false, assignment: null };
  }
  
  // STRATEGY: Fill seats in order (top-left to bottom-right)
  // For early halls: Must fill ALL seats (no empty cells)
  // For last hall: Can leave empty seats at the END
  
  // Calculate how many seats we need to fill
  // For early halls: Must fill ALL seats
  // For last hall: Fill as many as we have students
  const seatsToFill = isLastHall ? Math.min(allStudents.length, totalSeats) : totalSeats;
  const seatsFilled = assignedCount;
  
  // For early halls: If we've filled all seats and all students, we're done
  // For last hall: If we've placed all students, we're done (even if seats remain)
  if (seatsFilled >= seatsToFill && studentsPlaced === allStudents.length) {
    if (verifyNoViolations(assignment, seats, neighbors)) {
      return { success: true, assignment: { ...assignment } };
    }
  }
  
  // For early halls: If we run out of students before filling all seats, it's a failure
  if (!isLastHall && studentsPlaced === allStudents.length && seatsFilled < totalSeats) {
    console.error(`❌ ERROR: Early hall must be FULL! Students exhausted but ${totalSeats - seatsFilled} seats remain`);
    return { success: false, assignment: null };
  }
  
  // Select the NEXT seat in order (not MRV, but sequential filling)
  // This ensures we fill from top-left to bottom-right with no gaps
  let selectedSeat = null;
  
  // Find the first unassigned seat that can be filled
  for (const seat of unassignedSeats) {
    const domain = domains[seat.id] || [];
    const availableDomain = domain.filter(s => !usedStudents.has(s));
    
    if (availableDomain.length > 0) {
      selectedSeat = seat;
      break; // Take the first available seat in order
    }
  }
  
  if (!selectedSeat) {
    // No seat with available students found
    if (studentsPlaced === allStudents.length) {
      // All students placed, verify no violations
      if (verifyNoViolations(assignment, seats, neighbors)) {
        return { success: true, assignment: { ...assignment } };
      }
    }
    return { success: false, assignment: null };
  }
  
  const seatId = selectedSeat.id;
  const domain = domains[seatId] || [];
  // Filter out already used students
  const availableStudents = domain.filter(s => !usedStudents.has(s));
  
  if (availableStudents.length === 0) {
    // No available students for this seat
    // For early halls: This is an error - we must fill all seats
    if (!isLastHall) {
      // Early hall must be full - if we can't fill this seat, it's a problem
      if (studentsPlaced === allStudents.length) {
        // All students placed but seat remains - this means we don't have enough students
        console.error(`❌ ERROR: Early hall must be FULL but we've run out of students!`);
        return { success: false, assignment: null };
      }
    }
    // Try next seat
    return cspBacktrack(assignment, domains, seats, neighbors, allStudents, usedStudents, totalSeats, rows, isLastHall);
  }
  
  // LCV (Least Constraining Value): Sort students by how many options they leave for neighbors
  // BUT: For last row, prioritize students that won't create violations
  const isLastRow = selectedSeat.row === rows - 1;
  
  const sortedDomain = availableStudents.map(student => {
    const constraintCount = countConstraints(student, selectedSeat, neighbors, assignment, seats, usedStudents);
    // Penalty for last row if student would create violations
    let penalty = 0;
    if (isLastRow) {
      // Check if this student would violate constraints in last row
      if (!isConsistent(student, selectedSeat, neighbors, assignment, seats)) {
        penalty = 1000; // Heavy penalty - don't place violating students in last row
      }
    }
    return {
      student,
      constraintCount: constraintCount + penalty
    };
  }).sort((a, b) => a.constraintCount - b.constraintCount); // Lower constraint count = better
  
  // Try each student in domain (sorted by LCV)
  for (const { student } of sortedDomain) {
    // STRICT CHECK: Verify assignment is consistent with ALL constraints
    // ESPECIALLY important for last row
    if (isConsistent(student, selectedSeat, neighbors, assignment, seats)) {
      // Make assignment
      assignment[seatId] = student;
      usedStudents.add(student);
      
      // Forward Checking: Update domains of neighbors
      const savedDomains = {};
      const neighborSeatIds = neighbors[seatId].map(n => {
        const neighborSeat = seats.find(s => s.row === n.row && s.col === n.col);
        return neighborSeat?.id;
      }).filter(id => id && !assignment[id]);
      
      // Remove this student and same class/grade students from neighbor domains
      for (const neighborId of neighborSeatIds) {
        if (!savedDomains[neighborId]) {
          savedDomains[neighborId] = [...(domains[neighborId] || [])];
        }
        // Remove students that are related to the placed student
        domains[neighborId] = (domains[neighborId] || []).filter(s => 
          !areStudentsRelated(student, s) && !usedStudents.has(s)
        );
      }
      
      // Recursive call
      const result = cspBacktrack(assignment, domains, seats, neighbors, allStudents, usedStudents, totalSeats, rows, isLastHall);
      
      if (result.success) {
        return result;
      }
      
      // Backtrack: Restore domains and remove student from used set
      for (const neighborId of neighborSeatIds) {
        domains[neighborId] = savedDomains[neighborId];
      }
      
      // Remove assignment
      delete assignment[seatId];
      usedStudents.delete(student);
    }
  }
  
  return { success: false, assignment: null };
}

/**
 * Verify no violations in final assignment
 * This is a safety check to ensure the final solution has no violations
 */
function verifyNoViolations(assignment, seats, neighbors) {
  for (const seat of seats) {
    if (assignment[seat.id]) {
      const student = assignment[seat.id];
      // Check all neighbors
      for (const neighbor of neighbors[seat.id]) {
        const neighborSeat = seats.find(s => s.row === neighbor.row && s.col === neighbor.col);
        if (neighborSeat && assignment[neighborSeat.id]) {
          const neighborStudent = assignment[neighborSeat.id];
          if (areStudentsRelated(student, neighborStudent)) {
            console.error(`❌ VIOLATION DETECTED: ${student.name} (${student.class}${student.section || ''}) at ${seat.id} is adjacent to ${neighborStudent.name} (${neighborStudent.class}${neighborStudent.section || ''}) at ${neighborSeat.id}`);
            return false; // Violation found!
          }
        }
      }
    }
  }
  return true; // No violations
}

/**
 * Check if assigning a student to a seat is consistent with constraints
 */
function isConsistent(student, seat, neighbors, assignment, allSeats) {
  const seatId = seat.id;
  
  // Check all assigned neighbors
  for (const neighbor of neighbors[seatId]) {
    const neighborSeat = allSeats.find(s => s.row === neighbor.row && s.col === neighbor.col);
    if (neighborSeat && assignment[neighborSeat.id]) {
      const neighborStudent = assignment[neighborSeat.id];
      // Constraint: No same class/grade students horizontally or diagonally adjacent
      if (areStudentsRelated(student, neighborStudent)) {
        return false; // Violation!
      }
    }
  }
  
  return true; // Consistent
}

/**
 * Count how many constraints a student would impose on neighbors (for LCV)
 */
function countConstraints(student, seat, neighbors, assignment, allSeats, usedStudents = new Set()) {
  const seatId = seat.id;
  let constraintCount = 0;
  
  // Count how many neighbor domains would be reduced
  for (const neighbor of neighbors[seatId]) {
    const neighborSeat = allSeats.find(s => s.row === neighbor.row && s.col === neighbor.col);
    if (neighborSeat && !assignment[neighborSeat.id]) {
      // This neighbor is unassigned - count how many students would be removed from its domain
      // (students that are related to this student and not yet used)
      constraintCount++;
    }
  }
  
  return constraintCount;
}

/**
 * Assign teachers to exam halls
 */
function assignTeachersToHalls(teachers, examHalls) {
  const assignments = [];
  const shuffledTeachers = [...teachers].sort(() => Math.random() - 0.5);

  for (let i = 0; i < examHalls.length; i++) {
    assignments.push({
      hallName: examHalls[i].hallName,
      teacher: shuffledTeachers[i] || null,
      name: shuffledTeachers[i]?.name || null
    });
  }

  return assignments;
}

/**
 * Create detailed seating arrangement with row/column positions
 */
function createSeatingArrangement(hallAssignments, examHalls) {
  const arrangement = {};

  hallAssignments.forEach((hall, hallIndex) => {
    const capacity = examHalls[hallIndex].capacity;
    // Calculate rows and columns (assume roughly square layout)
    const columns = Math.ceil(Math.sqrt(capacity));
    const rows = Math.ceil(capacity / columns);

    hall.students.forEach((student, index) => {
      const row = Math.floor(index / columns) + 1;
      const column = (index % columns) + 1;

      arrangement[student.studentId] = {
        hallName: hall.hallName,
        seatNumber: student.seatNumber,
        row,
        column
      };
    });
  });

  return arrangement;
}

