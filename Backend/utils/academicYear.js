/**
 * Academic Year Utility Functions
 * Handles academic year in "YYYY-YYYY" format (e.g., "2025-2026")
 */

/**
 * Get current academic year in "YYYY-YYYY" format
 * Assumes academic year runs from June to May (standard in many countries)
 * You can modify this if your academic year runs differently (e.g., Jan-Dec)
 */
export const getCurrentAcademicYear = () => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-11 (Jan = 0, Dec = 11)
  
  // If current month is June (5) or later, academic year is currentYear-nextYear
  // If current month is before June, academic year is previousYear-currentYear
  if (currentMonth >= 5) { // June (5) to December (11)
    return `${currentYear}-${currentYear + 1}`;
  } else { // January (0) to May (4)
    return `${currentYear - 1}-${currentYear}`;
  }
};

/**
 * Get date range for an academic year
 * @param {string} academicYear - Format: "2025-2026"
 * @returns {Object} - { startDate, endDate }
 */
export const getAcademicYearDateRange = (academicYear) => {
  if (!academicYear || !academicYear.includes('-')) {
    // Fallback to current year if invalid format
    const currentYear = new Date().getFullYear();
    return {
      startDate: new Date(currentYear, 0, 1), // January 1
      endDate: new Date(currentYear, 11, 31, 23, 59, 59, 999) // December 31
    };
  }

  const [startYear, endYear] = academicYear.split('-').map(y => parseInt(y));
  
  // Academic year typically runs from June to May
  // You can change this to January-December if needed
  const startDate = new Date(startYear, 5, 1); // June 1
  const endDate = new Date(endYear, 4, 30, 23, 59, 59, 999); // May 31
  
  return { startDate, endDate };
};

/**
 * Get next academic year
 * @param {string} academicYear - Format: "2025-2026"
 * @returns {string} - Next academic year "2026-2027"
 */
export const getNextAcademicYear = (academicYear) => {
  if (!academicYear || !academicYear.includes('-')) {
    return getCurrentAcademicYear();
  }

  const [startYear, endYear] = academicYear.split('-').map(y => parseInt(y));
  return `${startYear + 1}-${endYear + 1}`;
};

/**
 * Get previous academic year
 * @param {string} academicYear - Format: "2025-2026"
 * @returns {string} - Previous academic year "2024-2025"
 */
export const getPreviousAcademicYear = (academicYear) => {
  if (!academicYear || !academicYear.includes('-')) {
    const current = getCurrentAcademicYear();
    const [startYear, endYear] = current.split('-').map(y => parseInt(y));
    return `${startYear - 1}-${endYear - 1}`;
  }

  const [startYear, endYear] = academicYear.split('-').map(y => parseInt(y));
  return `${startYear - 1}-${endYear - 1}`;
};

/**
 * Validate academic year format
 * @param {string} academicYear - Should be "YYYY-YYYY"
 * @returns {boolean}
 */
export const isValidAcademicYear = (academicYear) => {
  if (!academicYear || typeof academicYear !== 'string') return false;
  
  const parts = academicYear.split('-');
  if (parts.length !== 2) return false;
  
  const [startYear, endYear] = parts.map(y => parseInt(y));
  if (isNaN(startYear) || isNaN(endYear)) return false;
  if (endYear !== startYear + 1) return false; // End year should be start year + 1
  
  return true;
};

/**
 * Format academic year for display
 * @param {string} academicYear - Format: "2025-2026"
 * @returns {string} - Formatted: "2025-26" or "2025-2026"
 */
export const formatAcademicYear = (academicYear, short = false) => {
  if (!academicYear || !academicYear.includes('-')) return academicYear;
  
  if (short) {
    const [startYear, endYear] = academicYear.split('-');
    return `${startYear}-${endYear.slice(-2)}`; // "2025-26"
  }
  
  return academicYear; // "2025-2026"
};

