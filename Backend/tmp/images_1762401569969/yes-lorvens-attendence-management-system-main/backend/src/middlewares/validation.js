const { body, param, query, validationResult } = require("express-validator");

// Middleware to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log("Validation errors:", errors.array());
    return res.status(400).json({
      error: "Validation failed",
      details: errors.array().map((err) => ({
        field: err.path,
        message: err.msg,
        value: err.value,
      })),
    });
  }
  next();
};

// Validation rules for user registration
const validateRegistration = [
  body("name")
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Name must be between 2 and 100 characters"),

  body("email")
    .isEmail()
    .normalizeEmail()
    .withMessage("Please provide a valid email address"),

  body("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters long")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage(
      "Password must contain at least one uppercase letter, one lowercase letter, and one number"
    ),

  body("employeeId")
    .trim()
    .isLength({ min: 3, max: 20 })
    .withMessage("Employee ID must be between 3 and 20 characters")
    .matches(/^[A-Za-z0-9\-_\.]+$/)
    .withMessage(
      "Employee ID can contain letters, numbers, hyphens, underscores, and dots"
    ),

  body("department")
    .trim()
    .isIn([
      "ENGINEERING",
      "HR",
      "MANAGEMENT",
      "SALES",
      "MARKETING",
      "FINANCE",
      "IT",
      "OPERATIONS",
    ])
    .withMessage("Please select a valid department"),

  body("role")
    .optional()
    .isIn(["employee", "admin"])
    .withMessage("Role must be either employee or admin"),

  handleValidationErrors,
];

// Validation rules for user login
const validateLogin = [
  // body('email')
  //   .isEmail()
  //   .normalizeEmail()
  //   .withMessage('Please provide a valid email address'),

  // body('password')
  //   .notEmpty()
  //   .withMessage('Password is required'),

  handleValidationErrors,
];

// Validation rules for password change
const validatePasswordChange = [
  body("currentPassword")
    .notEmpty()
    .withMessage("Current password is required"),

  body("newPassword")
    .isLength({ min: 8 })
    .withMessage("New password must be at least 8 characters long")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage(
      "New password must contain at least one uppercase letter, one lowercase letter, and one number"
    ),

  body("confirmPassword")
    .optional()
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error("Password confirmation does not match password");
      }
      return true;
    }),

  handleValidationErrors,
];

// Validation rules for forgot password
const validateForgotPassword = [
  body("email")
    .isEmail()
    .normalizeEmail()
    .withMessage("Please provide a valid email address"),

  handleValidationErrors,
];

// Validation rules for reset password
const validateResetPassword = [
  body("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters long")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage(
      "Password must contain at least one uppercase letter, one lowercase letter, and one number"
    ),

  handleValidationErrors,
];

// Validation rules for registration password setting
const validateRegistrationPassword = [
  body("userId")
    .notEmpty()
    .withMessage("User ID is required"),

  body("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters long")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage(
      "Password must contain at least one uppercase letter, one lowercase letter, and one number"
    ),

  handleValidationErrors,
];

// Validation rules for employee creation (admin)
const validateEmployeeCreation = [
  body("name")
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Name must be between 2 and 100 characters"),

  body("email")
    .isEmail()
    .normalizeEmail()
    .withMessage("Please provide a valid email address"),

  body("department")
    .trim()
    .isIn([
      "ENGINEERING",
      "HR",
      "MANAGEMENT",
      "SALES",
      "MARKETING",
      "FINANCE",
      "IT",
      "OPERATIONS",
    ])
    .withMessage("Please select a valid department"),

  body("role")
    .optional()
    .isIn(["employee", "admin"])
    .withMessage("Role must be either employee or admin"),

  handleValidationErrors,
];

// Validation rules for profile update (employee)
const validateProfileUpdate = [
  body("name")
    .optional()
    .trim()
    .custom((value) => {
      if (value === "" || value === null || value === undefined) {
        return true; // Allow empty values
      }
      if (value.length < 2 || value.length > 100) {
        throw new Error("Name must be between 2 and 100 characters");
      }
      return true;
    }),

  body("department")
    .optional()
    .trim()
    .custom((value) => {
      if (value === "" || value === null || value === undefined) {
        return true; // Allow empty values
      }
      const validDepartments = [
        "ENGINEERING",
        "HR",
        "MANAGEMENT",
        "SALES",
        "MARKETING",
        "FINANCE",
        "IT",
        "OPERATIONS",
      ];
      if (!validDepartments.includes(value)) {
        throw new Error("Please select a valid department");
      }
      return true;
    }),

  body("mobileNumber")
    .optional()
    .trim()
    .custom((value) => {
      if (value === "" || value === null || value === undefined) {
        return true; // Allow empty values
      }
      if (value.length < 10 || value.length > 15) {
        throw new Error("Mobile number must be between 10 and 15 characters");
      }
      return true;
    }),

  body("addressLine")
    .optional()
    .trim()
    .custom((value) => {
      if (value === "" || value === null || value === undefined) {
        return true; // Allow empty values
      }
      if (value.length < 5 || value.length > 200) {
        throw new Error("Address must be between 5 and 200 characters");
      }
      return true;
    }),

  body("bloodGroup")
    .optional()
    .trim()
    .custom((value) => {
      if (value === "" || value === null || value === undefined) {
        return true; // Allow empty values
      }
      const validBloodGroups = [
        "A+",
        "A-",
        "B+",
        "B-",
        "AB+",
        "AB-",
        "O+",
        "O-",
      ];
      if (!validBloodGroups.includes(value)) {
        throw new Error("Please select a valid blood group");
      }
      return true;
    }),

  handleValidationErrors,
];

// Validation rules for employee update (admin)
const validateEmployeeUpdate = [
  param("id").isMongoId().withMessage("Invalid employee ID"),

  body("name")
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Name must be between 2 and 100 characters"),

  body("email")
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage("Please provide a valid email address"),

  body("department")
    .optional()
    .trim()
    .isIn([
      "ENGINEERING",
      "HR",
      "MANAGEMENT",
      "SALES",
      "MARKETING",
      "FINANCE",
      "IT",
      "OPERATIONS",
    ])
    .withMessage("Please select a valid department"),

  body("role")
    .optional()
    .isIn(["employee", "admin"])
    .withMessage("Role must be either employee or admin"),

  body("status")
    .optional()
    .isIn(["pending", "active", "inactive"])
    .withMessage("Status must be either pending, active, or inactive"),

  handleValidationErrors,
];

// Validation rules for attendance punch in/out
const validateAttendanceAction = [
  body("location")
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage("Location must not exceed 200 characters"),

  body("notes")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("Notes must not exceed 500 characters"),

  handleValidationErrors,
];

// Validation rules for manual attendance entry (admin)
const validateManualAttendanceEntry = [
  body("employeeId").isMongoId().withMessage("Invalid employee ID"),

  body("date").isISO8601().withMessage("Invalid date format"),

  body("punchIn")
    .optional()
    .custom((value) => {
      if (value && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
        throw new Error(
          "Invalid punch in time format. Expected YYYY-MM-DDTHH:MM"
        );
      }
      return true;
    })
    .withMessage("Invalid punch in time format"),

  body("punchOut")
    .optional()
    .custom((value) => {
      if (value && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
        throw new Error(
          "Invalid punch out time format. Expected YYYY-MM-DDTHH:MM"
        );
      }
      return true;
    })
    .withMessage("Invalid punch out time format"),

  body("reason")
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage("Reason must not exceed 200 characters"),

  handleValidationErrors,
];

// Validation rules for date range queries
const validateDateRange = [
  query("startDate")
    .optional()
    .isISO8601()
    .withMessage("Invalid start date format"),

  query("endDate")
    .optional()
    .isISO8601()
    .withMessage("Invalid end date format"),

  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),

  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100"),

  handleValidationErrors,
];

// Validation rules for employee search
const validateEmployeeSearch = [
  query("search")
    .optional()
    .trim()
    .isLength({ min: 2 })
    .withMessage("Search term must be at least 2 characters"),

  query("department")
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("Department must be between 2 and 50 characters"),

  query("status")
    .optional()
    .isIn(["pending", "active", "inactive"])
    .withMessage("Status must be either pending, active, or inactive"),

  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),

  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100"),

  handleValidationErrors,
];

// Validation rules for MongoDB ObjectId
const validateObjectId = [
  param("id").isMongoId().withMessage("Invalid ID format"),

  handleValidationErrors,
];

// Validation rules for export format
const validateExportFormat = [
  query("format")
    .isIn(["pdf", "csv", "excel"])
    .withMessage("Export format must be pdf, csv, or excel"),

  handleValidationErrors,
];

// Custom validation for date range
const validateDateRangeLogic = (req, res, next) => {
  const { startDate, endDate } = req.query;

  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start > end) {
      return res.status(400).json({
        error: "Start date cannot be after end date",
      });
    }

    // Check if date range is not more than 1 year
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > 365) {
      return res.status(400).json({
        error: "Date range cannot exceed 1 year",
      });
    }
  }

  next();
};

// Validation rules for account verification
const validateAccountVerification = [
  body("token")
    .notEmpty()
    .withMessage("Verification token is required"),

  body("fullName")
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Full name must be between 2 and 100 characters"),

  body("gender")
    .isIn(["male", "female", "other"])
    .withMessage("Gender must be male, female, or other"),

  body("bloodGroup")
    .optional()
    .isIn(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"])
    .withMessage("Please select a valid blood group"),

  body("mobileNumber")
    .matches(/^[0-9]{10}$/)
    .withMessage("Please provide a valid 10-digit mobile number"),

  body("state").trim().notEmpty().withMessage("State is required"),

  body("addressLine").trim().notEmpty().withMessage("Address is required"),

  // Optional experience fields
  body("previousCompany")
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage("Previous company name must not exceed 100 characters"),

  body("jobTitle")
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage("Job title must not exceed 100 characters"),

  body("startDate")
    .optional()
    .custom((value) => {
      if (value && value !== "") {
        const date = new Date(value);
        if (isNaN(date.getTime())) {
          throw new Error("Invalid start date format");
        }
      }
      return true;
    }),

  body("endDate")
    .optional()
    .custom((value) => {
      if (value && value !== "") {
        const date = new Date(value);
        if (isNaN(date.getTime())) {
          throw new Error("Invalid end date format");
        }
      }
      return true;
    }),

  body("jobDescription")
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage("Job description must not exceed 1000 characters"),

  handleValidationErrors,
];

// Validation rules for request creation
const validateRequestCreation = [
  body("type")
    .isIn(["leave", "od", "work_from_home"])
    .withMessage("Request type must be leave, od, or work_from_home"),

  body("startDate").isISO8601().withMessage("Invalid start date format"),

  body("startTime")
    .optional()
    .custom((value) => {
      if (value && !/^([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/.test(value)) {
        throw new Error("Start time must be in HH:MM:SS format (24-hour)");
      }
      return true;
    }),

  body("endDate").isISO8601().withMessage("Invalid end date format"),

  body("endTime")
    .optional()
    .custom((value) => {
      if (value && !/^([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/.test(value)) {
        throw new Error("End time must be in HH:MM:SS format (24-hour)");
      }
      return true;
    }),

  body("reason")
    .trim()
    .isLength({ min: 10, max: 50 })
    .withMessage("Reason must be between 10 and 50 characters"),

  handleValidationErrors,
];

// Validation rules for request status update
const validateRequestStatusUpdate = [
  param("requestId").isMongoId().withMessage("Invalid request ID"),

  body("status")
    .isIn(["approved", "rejected"])
    .withMessage("Status must be either approved or rejected"),

  body("adminComments")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("Admin comments must not exceed 500 characters"),

  handleValidationErrors,
];

module.exports = {
  handleValidationErrors,
  validateRegistration,
  validateLogin,
  validatePasswordChange,
  validateForgotPassword,
  validateResetPassword,
  validateRegistrationPassword,
  validateEmployeeCreation,
  validateProfileUpdate,
  validateEmployeeUpdate,
  validateAttendanceAction,
  validateManualAttendanceEntry,
  validateDateRange,
  validateEmployeeSearch,
  validateObjectId,
  validateExportFormat,
  validateDateRangeLogic,
  validateAccountVerification,
  validateRequestCreation,
  validateRequestStatusUpdate,
};
