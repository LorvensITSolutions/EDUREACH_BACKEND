const { sendSuccessResponse, sendErrorResponse } = require("../utils/responseHelpers");

// @desc    Get application configuration
// @route   GET /api/config
// @access  Public
const getConfig = async (req, res) => {
  try {
    const config = {
      acceptMobile: process.env.ACCEPT_MOBILE === "true",
      frontendUrl: process.env.FRONTEND_URL,
      environment: process.env.NODE_ENV,
      features: {
        invitationSystem: true,
        emailNotifications: true,
        mobileAccess: process.env.ACCEPT_MOBILE === "true",
      },
    };

    return sendSuccessResponse(res, { config });
  } catch (error) {
    return sendErrorResponse(res, "Failed to get configuration");
  }
};

module.exports = {
  getConfig,
};
