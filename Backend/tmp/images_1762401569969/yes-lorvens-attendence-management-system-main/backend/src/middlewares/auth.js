const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Middleware to protect routes
const protect = async (req, res, next) => {
  try {
    let token;

    // Check if token exists in headers
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    // Check if token exists
    if (!token) {
      return res.status(401).json({
        error: "You are not logged in. Please log in to get access.",
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if user still exists
    const currentUser = await User.findById(decoded.id).select("+password");
    if (!currentUser) {
      return res.status(401).json({
        error: "The user belonging to this token no longer exists.",
      });
    }

    // Check if user changed password after token was issued
    if (currentUser.changedPasswordAfter(decoded.iat)) {
      return res.status(401).json({
        error: "User recently changed password! Please log in again.",
      });
    }

    // Check if user is active
    if (currentUser.status !== "active") {
      return res.status(401).json({
        error:
          "Your account has been deactivated. Please contact administrator.",
      });
    }

    // Grant access to protected route
    req.user = currentUser;
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        error: "Invalid token. Please log in again.",
      });
    }
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        error: "Your token has expired! Please log in again.",
      });
    }

    return res.status(500).json({
      error: "Authentication error. Please try again.",
    });
  }
};

// Middleware to restrict to certain roles
const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: "You do not have permission to perform this action.",
      });
    }
    next();
  };
};

// Middleware to check if user is admin
const requireAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({
      error: "Admin access required.",
    });
  }
  next();
};

// Middleware to check if user is employee
const requireEmployee = (req, res, next) => {
  if (req.user.role !== "employee" && req.user.role !== "admin") {
    return res.status(403).json({
      error: "Employee access required.",
    });
  }
  next();
};

// Middleware to update last login
const updateLastLogin = async (req, res, next) => {
  try {
    if (req.user) {
      await req.user.updateLastLogin();
    }
    next();
  } catch (error) {
    next();
  }
};

// Middleware to check desktop-only access
const desktopOnly = (req, res, next) => {
  // Check if mobile access is allowed via environment variable
  const acceptMobile = process.env.ACCEPT_MOBILE === "true";

  if (acceptMobile) {
    // If mobile access is allowed, skip the check
    return next();
  }

  const userAgent = req.get("User-Agent") || "";
  const isMobile =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      userAgent
    );

  if (isMobile) {
    return res.status(403).json({
      error: "Mobile access is not allowed. Please use a desktop or laptop.",
      code: "MOBILE_ACCESS_BLOCKED",
    });
  }

  next();
};

// Flexible mobile access middleware that can be configured per route
const mobileAccess = (allowMobile = false) => {
  return (req, res, next) => {
    // Check if mobile access is allowed via environment variable or route parameter
    const acceptMobile = process.env.ACCEPT_MOBILE === "true" || allowMobile;

    if (acceptMobile) {
      // If mobile access is allowed, skip the check
      return next();
    }

    const userAgent = req.get("User-Agent") || "";
    const isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        userAgent
      );

    if (isMobile) {
      return res.status(403).json({
        error: "Mobile access is not allowed. Please use a desktop or laptop.",
        code: "MOBILE_ACCESS_BLOCKED",
      });
    }

    next();
  };
};

// Middleware to get user from token (optional authentication)
const optionalAuth = async (req, res, next) => {
  try {
    let token;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const currentUser = await User.findById(decoded.id);

      if (currentUser && currentUser.status === "active") {
        req.user = currentUser;
      }
    }

    next();
  } catch (error) {
    // Continue without authentication if token is invalid
    next();
  }
};

module.exports = {
  protect,
  restrictTo,
  requireAdmin,
  requireEmployee,
  updateLastLogin,
  desktopOnly,
  mobileAccess,
  optionalAuth,
};
