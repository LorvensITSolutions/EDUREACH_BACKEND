import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import Student from "../models/student.model.js";
import Parent from "../models/parent.model.js";

// Middleware to protect all routes
export const protectRoute = async (req, res, next) => {
	try {
		const accessToken = req.cookies.accessToken;

		if (!accessToken) {
			return res.status(401).json({ message: "Unauthorized - No access token provided" });
		}

		const decoded = jwt.verify(accessToken, process.env.ACCESS_TOKEN_SECRET);
		const user = await User.findById(decoded.userId).select("-password");

		if (!user) {
			return res.status(401).json({ message: "User not found" });
		}

		req.user = user; // Attach user to request
		next();
	} catch (error) {
		console.error("Error in protectRoute middleware:", error.message);
		if (error.name === "TokenExpiredError") {
			return res.status(401).json({ message: "Unauthorized - Access token expired" });
		}
		return res.status(401).json({ message: "Unauthorized - Invalid access token" });
	}
};

// Admin only
export const adminRoute = (req, res, next) => {
	if (req.user && req.user.role === "admin") {
		return next();
	}
	return res.status(403).json({ message: "Access denied - Admin only" });
};

// Teacher only
export const teacherRoute = (req, res, next) => {
	if (req.user && req.user.role === "teacher") {
		return next();
	}
	return res.status(403).json({ message: "Access denied - Teachers only" });
};

// Student only with student data enrichment
export const studentRoute = async (req, res, next) => {
	try {
		if (req.user && req.user.role === "student") {
			// Find student by userId reference instead of email
			const studentProfile = await Student.findOne({ userId: req.user._id });

			if (!studentProfile) {
				return res.status(404).json({ message: "Student profile not found" });
			}

			// Attach extra student info to req.user
			req.user.section = studentProfile.section;
			req.user.class = studentProfile.class;
			req.user.studentId = studentProfile._id;

			return next();
		} else {
			return res.status(403).json({ message: "Access denied - Students only" });
		}
	} catch (error) {
		console.error("Error in studentRoute middleware:", error.message);
		return res.status(500).json({ message: "Internal server error" });
	}
};

export const studentOrTeacherRoute = async (req, res, next) => {
  try {
    const role = req.user?.role;

    if (role === "student" || role === "teacher") {
      return next();
    } else {
      return res.status(403).json({ message: "Access denied - Only for students or teachers" });
    }
  } catch (error) {
    console.error("Error in studentOrTeacherRoute:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const parentRoute = async (req, res, next) => {
  try {
    if (req.user?.role === "parent") {
      return next();
    } else {
      return res.status(403).json({ message: "Access denied - Parents only" });
    }
  } catch (error) {
    return res.status(500).json({ message: "Internal server error" });
  }
};


export const allowRoles = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ message: "Access denied" });
  }
  next();
};

export const LibrarianRoute = (req, res, next) => {
  if (req.user.role !== "librarian") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
};
