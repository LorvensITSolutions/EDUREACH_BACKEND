// Common response patterns to reduce duplicate code

// Success response helper
const sendSuccessResponse = (res, data, message = "Success", statusCode = 200) => {
  return res.status(statusCode).json({
    status: "success",
    message,
    data,
  });
};

// Error response helper
const sendErrorResponse = (res, error, statusCode = 500) => {
  return res.status(statusCode).json({
    error: error.message || error || "Internal Server Error",
  });
};

// Pagination response helper
const sendPaginatedResponse = (res, data, pagination) => {
  return res.status(200).json({
    status: "success",
    data,
    pagination,
  });
};

// Standard error handler for async functions
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Common pagination calculation
const calculatePagination = (page, limit, total) => {
  const currentPage = parseInt(page) || 1;
  const itemsPerPage = parseInt(limit) || 20;
  const totalPages = Math.ceil(total / itemsPerPage);

  return {
    currentPage,
    totalPages,
    totalRecords: total,
    itemsPerPage,
    hasNextPage: currentPage < totalPages,
    hasPrevPage: currentPage > 1,
  };
};

// Common query builder for search and filters
const buildQuery = (filters) => {
  const query = {};

  if (filters.search) {
    query.$or = [
      { name: { $regex: filters.search, $options: "i" } },
      { email: { $regex: filters.search, $options: "i" } },
      { employeeId: { $regex: filters.search, $options: "i" } },
    ];
  }

  if (filters.status && filters.status !== "all") {
    query.status = filters.status;
  }

  if (filters.department) {
    query.department = filters.department;
  }

  if (filters.employeeId) {
    query.employeeId = filters.employeeId;
  }

  if (filters.type && filters.type !== "all") {
    query.type = filters.type;
  }

  return query;
};

module.exports = {
  sendSuccessResponse,
  sendErrorResponse,
  sendPaginatedResponse,
  asyncHandler,
  calculatePagination,
  buildQuery,
}; 