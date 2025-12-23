const jwt = require("jsonwebtoken");
const User = require("../models/User");
const crypto = require("crypto");
const emailService = require("../services/emailService");
const { sendSuccessResponse, sendErrorResponse } = require("../utils/responseHelpers");

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "24h",
  });
};

// Create and send token response
const createSendToken = (user, statusCode, res) => {
  const token = generateToken(user._id);
  user.password = undefined;

  res.status(statusCode).json({
    status: "success",
    token,
    data: { user },
  });
};

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res) => {
  try {
    const { name, email, password, employeeId, department, role } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { employeeId }],
    });

    if (existingUser) {
      return sendErrorResponse(res, "User with this email or employee ID already exists", 400);
    }

    // Validate role
    const validRoles = ["employee", "admin"];
    const userRole = role && validRoles.includes(role) ? role : "employee";

    // Create new user
    const user = await User.create({
      name,
      email,
      password,
      employeeId,
      department,
      role: userRole,
    });

    user.password = undefined;

    return sendSuccessResponse(res, { user }, "User registered successfully", 201);
  } catch (error) {
    return sendErrorResponse(res, "Registration failed. Please try again.");
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return sendErrorResponse(res, "Please provide email and password", 400);
    }

    // Check if user exists && password is correct
    const user = await User.findOne({ email: email.toLowerCase() }).select(
      "+password"
    );

    if (!user) {
      return sendErrorResponse(res, "Incorrect email or password", 401);
    }

    // Check if user is active
    if (user.status === "inactive") {
      return sendErrorResponse(res, "Your account has been deactivated. Please contact administrator.", 401);
    }

    // Check password
    const isPasswordCorrect = await user.correctPassword(
      password,
      user.password
    );

    if (!isPasswordCorrect) {
      return sendErrorResponse(res, "Incorrect email or password", 401);
    }

    // Update last login
    await user.updateLastLogin();

    createSendToken(user, 200, res);
  } catch (error) {
    return sendErrorResponse(res, "Login failed. Please try again.");
  }
};

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
const logout = async (req, res) => {
  try {
    return sendSuccessResponse(res, null, "Logged out successfully");
  } catch (error) {
    return sendErrorResponse(res, "Logout failed. Please try again.");
  }
};

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    return sendSuccessResponse(res, { user });
  } catch (error) {
    return sendErrorResponse(res, "Failed to get user information");
  }
};

// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id).select("+password");

    if (!(await user.correctPassword(currentPassword, user.password))) {
      return sendErrorResponse(res, "Current password is incorrect", 401);
    }

    user.password = newPassword;
    await user.save();

    createSendToken(user, 200, res);
  } catch (error) {
    return sendErrorResponse(res, "Failed to change password. Please try again.");
  }
};

// @desc    Forgot password
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return sendErrorResponse(res, "There is no user with this email address", 404);
    }

    // Generate reset token
    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });

    // Create reset URL
    const resetURL = `${
      process.env.FRONTEND_URL || "http://localhost:3000"
    }/reset-password/${resetToken}`;

    try {
      await emailService.sendPasswordResetEmail(user, resetToken);

      return sendSuccessResponse(res, null, "Password reset instructions sent to your email");
    } catch (emailError) {
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save({ validateBeforeSave: false });

      return sendErrorResponse(res, "Failed to send password reset email. Please try again later.");
    }
  } catch (error) {
    return sendErrorResponse(res, "Failed to process password reset request. Please try again.");
  }
};

// @desc    Reset password
// @route   PUT /api/auth/reset-password/:token
// @access  Public
const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) {
      return sendErrorResponse(res, "Token is invalid or has expired", 400);
    }

    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    createSendToken(user, 200, res);
  } catch (error) {
    return sendErrorResponse(res, "Failed to reset password. Please try again.");
  }
};

// @desc    Create default admin user
// @route   POST /api/auth/create-admin
// @access  Public (only for initial setup)
const createDefaultAdmin = async (req, res) => {
  try {
    const existingAdmin = await User.findOne({ role: "admin" });
    if (existingAdmin) {
      return sendErrorResponse(res, "Admin user already exists", 400);
    }

    const admin = await User.create({
      name: "System Administrator",
      email: "admin@xcompany.com",
      password: "admin123",
      employeeId: "ADMIN001",
      department: "IT",
      role: "admin",
    });

    return sendSuccessResponse(res, {
        user: {
          id: admin._id,
          name: admin.name,
          email: admin.email,
          employeeId: admin.employeeId,
          role: admin.role,
        },
    }, "Default admin user created successfully", 201);
  } catch (error) {
    return sendErrorResponse(res, "Failed to create admin user");
  }
};

// @desc    Step 1: Initial registration with basic info
// @route   POST /api/auth/register-step1
// @access  Public
const registerStep1 = async (req, res) => {
  try {
    const { name, email, employeeId, department, role } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { employeeId }],
    });

    if (existingUser) {
      return sendErrorResponse(res, "User with this email or employee ID already exists", 400);
    }

    // Validate role
    const validRoles = ["employee", "admin"];
    const userRole = role && validRoles.includes(role) ? role : "employee";

    // Create new user with basic info
    const user = await User.create({
      name,
      email,
      employeeId,
      department,
      role: userRole,
      status: "pending",
      registrationStep: 1,
    });

    // Generate email verification token
    const verificationToken = user.createEmailVerificationToken();
    await user.save({ validateBeforeSave: false });

    // Send verification email
    try {
      await emailService.sendEmailVerification(user, verificationToken);
    } catch (emailError) {
      console.error("Failed to send verification email:", emailError);
      // Don't fail the request if email fails
    }

    return sendSuccessResponse(res, {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        employeeId: user.employeeId,
        department: user.department,
        role: user.role,
        registrationStep: user.registrationStep,
      },
    }, "Registration step 1 completed. Please check your email for verification.", 201);
  } catch (error) {
    return sendErrorResponse(res, "Registration failed. Please try again.");
  }
};

// @desc    Step 2: Verify email and add personal details
// @route   POST /api/auth/register-step2
// @access  Public
const registerStep2 = async (req, res) => {
  try {
    const { token, mobileNumber, gender, bloodGroup, addressLine, state } = req.body;

    if (!token) {
      return sendErrorResponse(res, "Verification token is required", 400);
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    // First try to find user by invitation token
    let user = await User.findOne({
      invitationToken: hashedToken,
      invitationTokenExpires: { $gt: Date.now() },
    });

    // If not found by invitation token, try email verification token (for backward compatibility)
    if (!user) {
      user = await User.findOne({
        emailVerificationToken: hashedToken,
        emailVerificationExpires: { $gt: Date.now() },
      });
    }

    if (!user) {
      return sendErrorResponse(res, "Verification token is invalid or has expired", 400);
    }

    // Update personal details
    user.mobileNumber = mobileNumber;
    user.gender = gender;
    user.bloodGroup = bloodGroup;
    user.addressLine = addressLine;
    user.state = state;
    user.registrationStep = 2;

    // If user was found by invitation token, mark email as verified
    if (user.invitationToken) {
      user.isEmailVerified = true;
      user.invitationToken = undefined;
      user.invitationTokenExpires = undefined;
    } else {
      // If user was found by email verification token, clear those fields
      user.emailVerificationToken = undefined;
      user.emailVerificationExpires = undefined;
    }

    await user.save();

    return sendSuccessResponse(res, {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        employeeId: user.employeeId,
        department: user.department,
        role: user.role,
        registrationStep: user.registrationStep,
      },
    }, "Personal details updated successfully.");
  } catch (error) {
    return sendErrorResponse(res, "Failed to update personal details. Please try again.");
  }
};

// @desc    Step 3: Add experience details
// @route   POST /api/auth/register-step3
// @access  Public
const registerStep3 = async (req, res) => {
  try {
    const { userId, previousCompany, jobTitle, startDate, endDate, jobDescription } = req.body;

    const user = await User.findById(userId);

    if (!user) {
      return sendErrorResponse(res, "User not found", 404);
    }

    if (!user.isEmailVerified) {
      return sendErrorResponse(res, "Email must be verified before proceeding", 400);
    }

    // Update experience details
    user.previousCompany = previousCompany;
    user.jobTitle = jobTitle;
    user.startDate = startDate;
    user.endDate = endDate;
    user.jobDescription = jobDescription;
    user.registrationStep = 3;

    await user.save();

    return sendSuccessResponse(res, {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        employeeId: user.employeeId,
        department: user.department,
        role: user.role,
        registrationStep: user.registrationStep,
      },
    }, "Experience details updated successfully.");
  } catch (error) {
    return sendErrorResponse(res, "Failed to update experience details. Please try again.");
  }
};

// @desc    Step 4: Set password and complete registration
// @route   POST /api/auth/register-step4
// @access  Public
const registerStep4 = async (req, res) => {
  try {
    const { userId, password } = req.body;

    const user = await User.findById(userId);

    if (!user) {
      return sendErrorResponse(res, "User not found", 404);
    }

    if (!user.isEmailVerified) {
      return sendErrorResponse(res, "Email must be verified before proceeding", 400);
    }

    if (user.registrationStep < 3) {
      return sendErrorResponse(res, "Please complete previous steps first", 400);
    }

    // Set password and complete registration
    user.password = password;
    user.status = "active";
    user.registrationStep = 4;

    await user.save();

    // Send welcome email
    try {
      await emailService.sendWelcomeEmail(user);
    } catch (emailError) {
      console.error("Failed to send welcome email:", emailError);
    }

    return sendSuccessResponse(res, {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        employeeId: user.employeeId,
        department: user.department,
        role: user.role,
        status: user.status,
        registrationStep: user.registrationStep,
      },
    }, "Registration completed successfully! You can now log in to your account.");
  } catch (error) {
    return sendErrorResponse(res, "Failed to complete registration. Please try again.");
  }
};

// @desc    Verify invitation token
// @route   POST /api/auth/verify-invitation
// @access  Public
const verifyInvitation = async (req, res) => {
  try {
    const { token } = req.params;

    console.log("Verifying invitation token:", token);

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    console.log("Hashed token:", hashedToken);

    const user = await User.findOne({
      invitationToken: hashedToken,
      invitationTokenExpires: { $gt: Date.now() },
    });

    console.log("Found user:", user ? user.email : "No user found");

    if (!user) {
      // Check if token exists but is expired
      const expiredUser = await User.findOne({ invitationToken: hashedToken });
      if (expiredUser) {
        return sendErrorResponse(res, "Invitation token has expired", 400);
      }
      return sendErrorResponse(res, "Invitation token is invalid", 400);
    }

    return sendSuccessResponse(res, {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        employeeId: user.employeeId,
        department: user.department,
        role: user.role,
        status: user.status,
      },
    }, "Invitation verified successfully.");
  } catch (error) {
    console.error("Error verifying invitation:", error);
    return sendErrorResponse(res, "Failed to verify invitation. Please try again.");
  }
};

// @desc    Resend email verification
// @route   POST /api/auth/resend-verification
// @access  Public
const resendVerification = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return sendErrorResponse(res, "User not found", 404);
    }

    if (user.isEmailVerified) {
      return sendErrorResponse(res, "Email is already verified", 400);
    }

    // Generate new verification token
    const verificationToken = user.createEmailVerificationToken();
    await user.save({ validateBeforeSave: false });

    // Send verification email
    try {
      await emailService.sendEmailVerification(user, verificationToken);
    } catch (emailError) {
      console.error("Failed to send verification email:", emailError);
      return sendErrorResponse(res, "Failed to send verification email. Please try again later.");
    }

    return sendSuccessResponse(res, null, "Verification email sent successfully.");
  } catch (error) {
    return sendErrorResponse(res, "Failed to resend verification email. Please try again.");
  }
};

// @desc    Create super admin user
// @route   POST /api/auth/create-super-admin
// @access  Public (only for initial setup)
const createSuperAdmin = async (req, res) => {
  try {
    const existingUsers = await User.countDocuments();
    
    if (existingUsers > 0) {
      return sendErrorResponse(res, "Super admin already exists or users exist in the system", 400);
    }

    const superAdmin = await User.create({
      name: "Super Administrator",
      email: "superadmin@yopmail.com",
      password: "Admin@123",
      employeeId: "SUPER001",
      department: "IT",
      role: "admin",
      status: "active",
      isEmailVerified: true,
      registrationStep: 4,
    });

    return sendSuccessResponse(res, {
        user: {
          id: superAdmin._id,
          name: superAdmin.name,
          email: superAdmin.email,
          employeeId: superAdmin.employeeId,
          role: superAdmin.role,
        },
    }, "Super admin user created successfully", 201);
  } catch (error) {
    console.error("Error creating super admin:", error);
    return sendErrorResponse(res, "Failed to create super admin user");
  }
};

// @desc    Initialize super admin if no users exist
// @access  Internal
const initializeSuperAdmin = async () => {
  try {
    const existingUsers = await User.countDocuments();
    
    if (existingUsers === 0) {
      console.log("No users found in database. Creating super admin...");
      
      const superAdmin = await User.create({
        name: "Super Administrator",
        email: "superadmin@yopmail.com",
        password: "Admin@123",
        employeeId: "SUPER001",
        department: "IT",
        role: "admin",
        status: "active",
        isEmailVerified: true,
        registrationStep: 4,
      });

      console.log("✅ Super admin created successfully:");
      console.log(`   Email: ${superAdmin.email}`);
      console.log(`   Password: Admin@123`);
      console.log(`   Employee ID: ${superAdmin.employeeId}`);
      console.log(`   Role: ${superAdmin.role}`);
      
      return superAdmin;
    } else {
      console.log("Users already exist in database. Skipping super admin creation.");
      return null;
    }
  } catch (error) {
    console.error("❌ Error creating super admin:", error);
    return null;
  }
};

module.exports = {
  register,
  login,
  logout,
  getMe,
  changePassword,
  forgotPassword,
  resetPassword,
  createDefaultAdmin,
  registerStep1,
  registerStep2,
  registerStep3,
  registerStep4,
  verifyInvitation,
  resendVerification,
  createSuperAdmin,
  initializeSuperAdmin,
};
