const express = require("express");
const {
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
} = require("../controllers/authController");

const { protect, desktopOnly } = require("../middlewares/auth");

const {
  validateRegistration,
  validateLogin,
  validatePasswordChange,
  validateForgotPassword,
  validateResetPassword,
  validateRegistrationPassword,
  validateAccountVerification,
} = require("../middlewares/validation");

const router = express.Router();

// Apply desktop-only middleware to all routes
router.use(desktopOnly);

// Public routes
router.post("/register", validateRegistration, register);
router.post("/login", validateLogin, login);
router.post("/forgot-password", validateForgotPassword, forgotPassword);
router.put("/reset-password/:token", validateResetPassword, resetPassword);

// Step-by-step registration routes
router.post("/register-step1", validateRegistration, registerStep1);
router.post("/register-step2", validateAccountVerification, registerStep2);
router.post("/register-step3", registerStep3);
router.post("/register-step4", validateRegistrationPassword, registerStep4);
router.get("/verify-invitation/:token", verifyInvitation);
router.post("/resend-verification", resendVerification);

// Initial setup routes (remove in production)
router.post("/create-super-admin", createSuperAdmin);

// Debug route for testing invitation (remove in production)
router.post("/create-test-invitation", async (req, res) => {
  try {
    const { email, name, employeeId, department } = req.body;
    
    const user = await User.create({
      name: name || "Test User",
      email: email || "test@example.com",
      employeeId: employeeId || "TEST001",
      department: department || "IT",
      role: "employee",
      status: "pending",
    });

    const invitationToken = await user.generateInvitationToken();
    
    console.log("Created test invitation token:", invitationToken);
    
    return res.json({
      success: true,
      message: "Test invitation created",
      token: invitationToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        employeeId: user.employeeId,
      }
    });
  } catch (error) {
    console.error("Error creating test invitation:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create test invitation"
    });
  }
});

// Protected routes
router.use(protect);
router.get("/me", getMe);
router.put("/change-password", validatePasswordChange, changePassword);
router.post("/logout", logout);

module.exports = router;
