import User from "../models/user.model.js";
import Student from "../models/student.model.js";
import Parent from "../models/parent.model.js";
import Teacher from "../models/teacher.model.js";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { sendEmail } from "../utils/emailService.js";

// Store reset tokens temporarily (in production, use Redis or database)
const resetTokens = new Map();

// Generate reset token
const generateResetToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Request password reset
export const requestPasswordReset = async (req, res) => {
  try {
    const { username, userType } = req.body;

    if (!username || !userType) {
      return res.status(400).json({ 
        success: false, 
        message: "Username and user type are required" 
      });
    }

    let user;
    let userInfo = {};

    // Find user based on type
    if (userType === "student") {
      // Find student by studentId
      const student = await Student.findOne({ studentId: username }).populate('userId');
      if (student && student.userId) {
        user = student.userId;
        userInfo = {
          name: student.name,
          email: user.email,
          studentId: student.studentId,
          class: student.class,
          section: student.section
        };
      }
    } else if (userType === "parent") {
      // Find parent by username (PS25001 format)
      const parent = await Parent.findOne({ 
        $or: [
          { username: username },
          { username: username.replace('P', '') } // Handle both PS25001 and S25001
        ]
      }).populate('userId');
      
      if (parent && parent.userId) {
        user = parent.userId;
        userInfo = {
          name: parent.name,
          email: user.email,
          parentUsername: parent.username
        };
      }
    } else if (userType === "teacher") {
      // Find teacher by teacherId
      const teacher = await Teacher.findOne({ teacherId: username }).populate('userId');
      if (teacher && teacher.userId) {
        user = teacher.userId;
        userInfo = {
          name: teacher.name,
          email: user.email,
          teacherId: teacher.teacherId,
          subject: teacher.subject,
          qualification: teacher.qualification
        };
      }
    }

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found. Please check your username and user type." 
      });
    }

    // Generate reset token
    const resetToken = generateResetToken();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Store token with user info
    resetTokens.set(resetToken, {
      userId: user._id,
      username,
      userType,
      userInfo,
      expiresAt
    });

    // Clean up expired tokens
    for (const [token, data] of resetTokens.entries()) {
      if (data.expiresAt < new Date()) {
        resetTokens.delete(token);
      }
    }

    // In a real application, you would send an email here
    // For now, we'll return the token for testing purposes
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}&username=${username}`;

    // TODO: Send email with reset link
    // await sendEmail({
    //   to: user.email,
    //   subject: 'Password Reset Request',
    //   html: `
    //     <h2>Password Reset Request</h2>
    //     <p>Hello ${userInfo.name},</p>
    //     <p>You have requested to reset your password. Click the link below to reset your password:</p>
    //     <a href="${resetUrl}" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a>
    //     <p>This link will expire in 15 minutes.</p>
    //     <p>If you didn't request this, please ignore this email.</p>
    //   `
    // });

    console.log(`Password reset requested for ${userType}: ${username}`);
    console.log(`Reset URL: ${resetUrl}`);

    res.status(200).json({
      success: true,
      message: "Password reset instructions sent! Please check your email or contact admin for the reset link.",
      // For development/testing - remove in production
      resetUrl: process.env.NODE_ENV === 'development' ? resetUrl : undefined
    });

  } catch (error) {
    console.error("Password reset request error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error. Please try again later." 
    });
  }
};

// Validate reset token
export const validateResetToken = async (req, res) => {
  try {
    const { token, username } = req.body;

    if (!token || !username) {
      return res.status(400).json({ 
        valid: false, 
        message: "Token and username are required" 
      });
    }

    const tokenData = resetTokens.get(token);

    if (!tokenData) {
      return res.status(400).json({ 
        valid: false, 
        message: "Invalid or expired reset token" 
      });
    }

    if (tokenData.expiresAt < new Date()) {
      resetTokens.delete(token);
      return res.status(400).json({ 
        valid: false, 
        message: "Reset token has expired" 
      });
    }

    if (tokenData.username !== username) {
      return res.status(400).json({ 
        valid: false, 
        message: "Invalid token for this username" 
      });
    }

    res.status(200).json({
      valid: true,
      message: "Token is valid",
      userInfo: tokenData.userInfo
    });

  } catch (error) {
    console.error("Token validation error:", error);
    res.status(500).json({ 
      valid: false, 
      message: "Server error" 
    });
  }
};

// Reset password
export const resetPassword = async (req, res) => {
  try {
    const { token, username, newPassword } = req.body;

    if (!token || !username || !newPassword) {
      return res.status(400).json({ 
        success: false, 
        message: "Token, username, and new password are required" 
      });
    }

    // Validate password strength
    if (newPassword.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: "Password must be at least 6 characters long" 
      });
    }

    const tokenData = resetTokens.get(token);

    if (!tokenData) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid or expired reset token" 
      });
    }

    if (tokenData.expiresAt < new Date()) {
      resetTokens.delete(token);
      return res.status(400).json({ 
        success: false, 
        message: "Reset token has expired" 
      });
    }

    if (tokenData.username !== username) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid token for this username" 
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user password
    const user = await User.findByIdAndUpdate(
      tokenData.userId,
      { 
        password: hashedPassword,
        mustChangePassword: false // Reset the must change password flag
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    // Delete the used token
    resetTokens.delete(token);

    console.log(`Password reset successful for ${tokenData.userType}: ${username}`);

    res.status(200).json({
      success: true,
      message: "Password reset successfully! You can now login with your new password."
    });

  } catch (error) {
    console.error("Password reset error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error. Please try again later." 
    });
  }
};

// Admin reset password (for admin to reset any user's password)
export const adminResetPassword = async (req, res) => {
  try {
    console.log("Admin reset password request received:", {
      body: req.body,
      user: req.user,
      headers: req.headers
    });
    
    const { username, userType, newPassword } = req.body;

    if (!username || !userType || !newPassword) {
      return res.status(400).json({ 
        success: false, 
        message: "Username, user type, and new password are required" 
      });
    }

    let user;

    // Find user based on type
    if (userType === "student") {
      const student = await Student.findOne({ studentId: username }).populate('userId');
      if (student && student.userId) {
        user = student.userId;
      }
    } else if (userType === "parent") {
      const parent = await Parent.findOne({ 
        $or: [
          { username: username },
          { username: username.replace('P', '') }
        ]
      }).populate('userId');
      
      if (parent && parent.userId) {
        user = parent.userId;
      }
    } else if (userType === "teacher") {
      const teacher = await Teacher.findOne({ teacherId: username }).populate('userId');
      if (teacher && teacher.userId) {
        user = teacher.userId;
      }
    }

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user password
    await User.findByIdAndUpdate(user._id, {
      password: hashedPassword,
      mustChangePassword: true // Force user to change password on next login
    });

    console.log(`Admin reset password for ${userType}: ${username}`);

    res.status(200).json({
      success: true,
      message: "Password reset successfully by admin"
    });

  } catch (error) {
    console.error("Admin password reset error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error" 
    });
  }
};
