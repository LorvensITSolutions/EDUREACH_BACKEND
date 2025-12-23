// utils/teacherValidation.js

/**
 * Validates teacher assignment data
 * @param {Object} data - Assignment data
 * @param {string} data.teacherId - Teacher MongoDB ObjectId
 * @param {string} data.className - Class name
 * @param {string} data.section - Section
 * @returns {Object} Validation result
 */
export const validateTeacherAssignment = (data) => {
  const errors = [];
  const warnings = [];

  // Required field validation
  if (!data.teacherId || typeof data.teacherId !== 'string' || data.teacherId.trim().length === 0) {
    errors.push('Teacher ID (MongoDB ObjectId) is required and must be a non-empty string');
  }

  if (!data.className || typeof data.className !== 'string' || data.className.trim().length === 0) {
    errors.push('Class name is required and must be a non-empty string');
  }

  if (!data.section || typeof data.section !== 'string' || data.section.trim().length === 0) {
    errors.push('Section is required and must be a non-empty string');
  }

  // MongoDB ObjectId validation
  if (data.teacherId && data.teacherId.trim()) {
    const teacherId = data.teacherId.trim();
    if (!teacherId.match(/^[0-9a-fA-F]{24}$/)) {
      errors.push('Teacher ID must be a valid MongoDB ObjectId (24 character hex string)');
    }
  }

  // Format validation
  if (data.className && data.className.trim()) {
    const className = data.className.trim();
    // Check if class name is numeric or contains valid characters
    if (!/^[0-9]+$/.test(className) && !/^[A-Za-z0-9\s-]+$/.test(className)) {
      warnings.push('Class name should be numeric (e.g., "8", "10") or alphanumeric');
    }
  }

  if (data.section && data.section.trim()) {
    const section = data.section.trim();
    // Check if section is a single letter or short string
    if (section.length > 3) {
      warnings.push('Section should typically be a single letter (e.g., "A", "B") or short identifier');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    sanitizedData: {
      teacherId: data.teacherId?.trim(),
      className: data.className?.trim(),
      section: data.section?.trim()
    }
  };
};

/**
 * Validates teacher creation data
 * @param {Object} data - Teacher data
 * @returns {Object} Validation result
 */
export const validateTeacherData = (data) => {
  const errors = [];
  const warnings = [];

  // Required field validation
  if (!data.teacherId || typeof data.teacherId !== 'string' || data.teacherId.trim().length === 0) {
    errors.push('Teacher ID is required and must be a non-empty string');
  }

  if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
    errors.push('Name is required and must be a non-empty string');
  }

  // Teacher ID format validation
  if (data.teacherId && data.teacherId.trim()) {
    const teacherId = data.teacherId.trim();
    // Allow alphanumeric teacher IDs (e.g., T24001, TEACHER001)
    if (!/^[A-Za-z0-9]+$/.test(teacherId)) {
      errors.push('Teacher ID must contain only alphanumeric characters');
    }
    if (teacherId.length < 3) {
      warnings.push('Teacher ID should be at least 3 characters long');
    }
  }

  // Phone validation (optional)
  if (data.phone && data.phone.trim()) {
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    if (!phoneRegex.test(data.phone.trim().replace(/\s/g, ''))) {
      warnings.push('Phone number format may be invalid');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    sanitizedData: {
      teacherId: data.teacherId?.trim(),
      name: data.name?.trim(),
      phone: data.phone?.trim(),
      qualification: data.qualification?.trim(),
      subject: data.subject?.trim()
    }
  };
};

/**
 * Checks for duplicate section assignments
 * @param {Array} existingAssignments - Current section assignments
 * @param {Object} newAssignment - New assignment to check
 * @returns {boolean} True if duplicate exists
 */
export const checkDuplicateAssignment = (existingAssignments, newAssignment) => {
  return existingAssignments.some(
    (assignment) => 
      assignment.className === newAssignment.className && 
      assignment.section === newAssignment.section
  );
};

/**
 * Formats section assignments for display
 * @param {Array} assignments - Section assignments
 * @returns {string} Formatted string
 */
export const formatSectionAssignments = (assignments) => {
  if (!assignments || assignments.length === 0) {
    return 'No sections assigned';
  }
  
  return assignments
    .map(assignment => `${assignment.className}-${assignment.section}`)
    .join(', ');
};
