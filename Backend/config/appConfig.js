// Centralized application config and defaults

export const appConfig = {
  // TODO: make dynamic via DB Setting or ENV
  academicYear: "2025-2026",
  perDayLateFeeDefault: 10,
  // Maximum items per page for paginated endpoints
  maxPageSize: 100,
};

export function getAcademicYear() {
  return appConfig.academicYear;
}


