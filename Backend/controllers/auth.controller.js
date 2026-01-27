import { redis } from "../lib/redis.js";
import User from "../models/user.model.js";
import Student from "../models/student.model.js";
import DeviceTrust from "../models/deviceTrust.model.js";
import jwt from "jsonwebtoken";
import { sendEmail } from "../utils/emailService.js";
import crypto from "crypto";
import bcrypt from "bcryptjs";

/**
 * Helper function to get phone number for a user
 * For students, returns parent's phone number if user doesn't have one
 * @param {Object} user - User document
 * @returns {Promise<string|null>} - Phone number or null
 */
async function getUserPhoneNumber(user) {
  // If user has a phone number, use it
  if (user.phone) {
    return user.phone;
  }

  // For students, get parent's phone number
  if (user.role === "student" && user.studentId) {
    try {
      const student = await Student.findById(user.studentId).populate("parent");
      if (student && student.parent && student.parent.phone) {
        return student.parent.phone;
      }
    } catch (error) {
      console.error("Error fetching parent phone for student:", error);
    }
  }

  return null;
}

const generateTokens = (userId) => {
	const accessToken = jwt.sign({ userId }, process.env.ACCESS_TOKEN_SECRET, {
		expiresIn: "2h", // Changed from 15m to 2h
	});

	const refreshToken = jwt.sign({ userId }, process.env.REFRESH_TOKEN_SECRET, {
		expiresIn: "7d",
	});

	return { accessToken, refreshToken };
};

const storeRefreshToken = async (userId, refreshToken) => {
	await redis.set(`refresh_token:${userId}`, refreshToken, "EX", 7 * 24 * 60 * 60); // 7days
};

const setCookies = (res, accessToken, refreshToken) => {
	// For cross-origin requests (frontend on different domain than backend)
	// Use 'none' with 'secure: true' to allow cookies in cross-origin requests
	// Note: 'secure: true' with 'sameSite: none' is required for cross-origin cookies
	// Even for localhost HTTP -> HTTPS, browsers allow this in modern versions
	res.cookie("accessToken", accessToken, {
		httpOnly: true, // prevent XSS attacks, cross site scripting attack
		secure: true, // Required for sameSite: 'none' (works even with HTTP localhost -> HTTPS backend)
		sameSite: "none", // Allow cookies in cross-origin requests
		maxAge: 2 * 60 * 60 * 1000, // 2 hours (changed from 15 minutes)
		path: "/", // Ensure cookie is available for all paths
	});
	res.cookie("refreshToken", refreshToken, {
		httpOnly: true, // prevent XSS attacks, cross site scripting attack
		secure: true, // Required for sameSite: 'none'
		sameSite: "none", // Allow cookies in cross-origin requests
		maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
		path: "/", // Ensure cookie is available for all paths
	});
};

export const signup = async (req, res) => {
  const { email, password, name, role } = req.body;

  try {
    // Validate required fields
    if (!email || !password || !name) {
      return res.status(400).json({ message: "Email, password, and name are required" });
    }

    // Set default role if not provided
    const userRole = role || "admin"; // Default to admin if no role specified

    // Validate role
    const validRoles = ["admin", "teacher", "student", "parent", "librarian"];
    if (!validRoles.includes(userRole)) {
      return res.status(400).json({ 
        message: "Invalid role. Must be one of: " + validRoles.join(", ") 
      });
    }

    const userExists = await User.findOne({ email });
    if (userExists) return res.status(400).json({ message: "User already exists" });

    const user = await User.create({ name, email, password, role: userRole });

    if (userRole === "teacher") {
      const Teacher = (await import('../models/teacher.model.js')).default;
      const teacher = await Teacher.create({
        name,
        email,
        userId: user._id,
      });
      user.teacherId = teacher._id;
      await user.save();
    }

    const { accessToken, refreshToken } = generateTokens(user._id);
    await storeRefreshToken(user._id, refreshToken);
    setCookies(res, accessToken, refreshToken);

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.log("Signup error", error.message);
    res.status(500).json({ message: error.message });
  }
};

export const login = async (req, res) => {
	try {
		const { email, password } = req.body;
		
		console.log("Login attempt:", { email, passwordLength: password?.length });
		
		// Support both email and ID-based login
		// Check if input looks like an email (contains @) or is an ID
		const isEmail = email.includes('@');
		let user;
		
		if (isEmail) {
			// Traditional email login for teachers and admins
			console.log("Email login attempt:", email);
			user = await User.findOne({ email }).select("+password +role +twoFactorEnabled +twoFactorVerified +email2FAEnabled +email +sms2FAEnabled +phone +mustChangePassword");
		} else {
			// ID-based login for students and parents
			console.log("ID-based login attempt:", email);
			
			// For students: find by studentId reference
			if (email.startsWith('S') || /^\d/.test(email)) {
				// This is likely a student ID
				const Student = (await import('../models/student.model.js')).default;
				const student = await Student.findOne({ studentId: email });
				if (student) {
					user = await User.findOne({ studentId: student._id }).select("+password +role +twoFactorEnabled +twoFactorVerified +email2FAEnabled +email +sms2FAEnabled +phone +mustChangePassword");
				}
			} else if (email.startsWith('T')) {
				// This is likely a teacher ID
				console.log("Teacher ID login attempt:", email);
				const Teacher = (await import('../models/teacher.model.js')).default;
				const teacher = await Teacher.findOne({ teacherId: email });
				console.log('Teacher found by ID:', teacher ? { id: teacher._id, teacherId: teacher.teacherId } : 'No teacher found');
				
				if (teacher) {
					user = await User.findOne({ teacherId: teacher._id }).select("+password +role +twoFactorEnabled +twoFactorVerified +email2FAEnabled +email +sms2FAEnabled +phone +mustChangePassword");
					console.log('User found for teacher:', user ? { id: user._id, role: user.role } : 'No user found');
				}
			} else if (email.startsWith('P')) {
				// This is likely a parent ID
				const Parent = (await import('../models/parent.model.js')).default;
				
				// Debug: Let's see what parent credentials exist
				const allParents = await Parent.find({}).select('generatedCredentials.username name');
				console.log('All parent credentials in database:', allParents.map(p => ({ 
					username: p.generatedCredentials?.username, 
					name: p.name 
				})));
				
				// Try to find parent by generated credentials username
				let parent = await Parent.findOne({ 
					'generatedCredentials.username': email
				});
				
				console.log('Parent found by username:', parent ? { id: parent._id, username: parent.generatedCredentials?.username } : 'No parent found');
				
				// If not found, try the legacy pattern (P + Student ID)
				if (!parent && email.startsWith('PS')) {
					const studentId = email.substring(1); // Remove 'P' prefix to get student ID
					console.log('Looking for student with ID:', studentId);
					const Student = (await import('../models/student.model.js')).default;
					const student = await Student.findOne({ studentId });
					console.log('Student found:', student ? { id: student._id, studentId: student.studentId } : 'No student found');
					if (student) {
						parent = await Parent.findOne({ children: student._id });
						console.log('Parent found by student relationship:', parent ? { id: parent._id, username: parent.generatedCredentials?.username } : 'No parent found');
					}
				}
				
				if (parent) {
					user = await User.findOne({ parentId: parent._id }).select("+password +role +twoFactorEnabled +twoFactorVerified +email2FAEnabled +email +sms2FAEnabled +phone +mustChangePassword");
					console.log('User found for parent:', user ? { id: user._id, role: user.role } : 'No user found');
				}
			}
			
			// Fallback: try to find by any remaining email patterns
			if (!user) {
				user = await User.findOne({ 
					$or: [
						{ email: email },
						{ email: `${email}@school.local` }
					]
				}).select("+password +role +twoFactorEnabled +twoFactorVerified +email2FAEnabled +email +sms2FAEnabled +phone +mustChangePassword");
			}
		}

		console.log("User found:", user ? { id: user._id, email: user.email, role: user.role } : "No user found");

		if (user && (await user.comparePassword(password))) {
			console.log("Password match successful");
			
			// Check for trusted device first
			const deviceToken = req.headers["device-token"] || req.cookies?.deviceToken || req.body?.deviceToken;
			// Support both nested deviceInfo format and direct properties for backward compatibility
			const deviceInfo = req.body?.deviceInfo || {
				screenResolution: req.body?.screenResolution,
				timezone: req.body?.timezone,
				userAgent: req.body?.userAgent,
				platform: req.body?.platform,
				deviceType: req.body?.deviceType,
			};
			let isDeviceTrusted = false;
			
			// Debug: Log cookie information
			console.log("🔍 Device Trust Check:", {
				userId: user._id.toString(),
				hasDeviceTokenCookie: !!req.cookies?.deviceToken,
				deviceTokenFromCookie: req.cookies?.deviceToken ? req.cookies.deviceToken.substring(0, 10) + "..." : null,
				deviceTokenFromHeader: !!req.headers["device-token"],
				deviceTokenFromBody: !!req.body?.deviceToken,
				hasDeviceInfo: !!deviceInfo.screenResolution,
			});
			
			// Try to find trusted device by deviceToken first
			if (deviceToken) {
				try {
					const trustedDevice = await DeviceTrust.findOne({
						userId: user._id,
						deviceToken,
						isActive: true,
						expiresAt: { $gt: new Date() },
					});
					
					if (trustedDevice) {
						isDeviceTrusted = true;
						// Update last used timestamp
						trustedDevice.lastUsed = new Date();
						await trustedDevice.save();
						console.log("✅ Device is trusted (by token), skipping 2FA");
					} else {
						console.log("❌ Device token not found or expired in database");
					}
				} catch (deviceError) {
					console.error("Error checking device trust:", deviceError);
					// Continue with 2FA check if device trust check fails
				}
			}
			
			// If not found by token, try to find by device fingerprint (for same device, different token)
			if (!isDeviceTrusted && deviceInfo.screenResolution && deviceInfo.timezone) {
				try {
					const { generateDeviceFingerprint } = await import("../utils/deviceFingerprint.js");
					// Build request object with device info from frontend
					const reqWithDeviceInfo = {
						...req,
						headers: req.headers || {},
						body: { 
							...req.body, 
							screenResolution: deviceInfo.screenResolution, 
							timezone: deviceInfo.timezone,
							platform: deviceInfo.platform || "",
							deviceType: deviceInfo.deviceType || "",
							userAgent: deviceInfo.userAgent || "",
							deviceInfo: deviceInfo, // Also pass as nested object
						},
					};
					const deviceFingerprint = generateDeviceFingerprint(reqWithDeviceInfo);
					
					console.log("🔍 Checking device trust by fingerprint:", {
						userId: user._id.toString(),
						fingerprint: deviceFingerprint.substring(0, 16) + "...",
						screenResolution: deviceInfo.screenResolution,
						timezone: deviceInfo.timezone,
						platform: deviceInfo.platform,
					});
					
					const trustedDevice = await DeviceTrust.findOne({
						userId: user._id,
						deviceFingerprint,
						isActive: true,
						expiresAt: { $gt: new Date() },
					});
					
					if (trustedDevice) {
						isDeviceTrusted = true;
						// Update last used timestamp and sync the deviceToken cookie
						trustedDevice.lastUsed = new Date();
						await trustedDevice.save();
						
						// Update the cookie with the existing deviceToken so future logins work
						res.cookie("deviceToken", trustedDevice.deviceToken, {
							httpOnly: true,
							secure: process.env.NODE_ENV === "production",
							sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
							path: "/",
							maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
						});
						
						console.log("✅ Device is trusted (by fingerprint), skipping 2FA", {
							deviceId: trustedDevice._id.toString(),
							deviceToken: trustedDevice.deviceToken.substring(0, 10) + "...",
						});
					} else {
						console.log("❌ Device fingerprint not found or expired in database", {
							searchedFingerprint: deviceFingerprint.substring(0, 16) + "...",
						});
					}
				} catch (deviceError) {
					console.error("Error checking device trust by fingerprint:", deviceError);
					// Continue with 2FA check if device trust check fails
				}
			}
			
			if (!deviceToken && (!deviceInfo.screenResolution || !deviceInfo.timezone)) {
				console.log("⚠️ No device token or device info found in request");
			}
			
			// If device is trusted, skip 2FA and proceed with login
			if (isDeviceTrusted) {
				const { accessToken, refreshToken } = generateTokens(user._id);
				await storeRefreshToken(user._id, refreshToken);
				setCookies(res, accessToken, refreshToken);

				// Only include mustChangePassword if it's explicitly true
				const response = {
					_id: user._id,
					name: user.name,
					email: user.email,
					role: user.role,
					requires2FA: false,
					requiresEmail2FA: false,
					requiresSMS2FA: false,
					deviceTrusted: true,
					accessToken,
					refreshToken,
				};
				
				// Only add mustChangePassword if it's true (explicitly check for true)
				if (user.mustChangePassword === true) {
					response.mustChangePassword = true;
				}

				return res.json(response);
			}
			
			// Check if TOTP 2FA is enabled (takes highest priority)
			if (user.twoFactorEnabled && user.twoFactorVerified) {
				// TOTP 2FA is enabled - require code verification before login
				return res.status(200).json({
					requires2FA: true,
					userId: user._id.toString(),
					message: "Please enter your 2FA code to complete login",
				});
			}
			
			// Check if SMS 2FA is enabled (second priority)
			if (user.sms2FAEnabled) {
				// Get phone number (user's phone or parent's phone for students)
				const phoneNumber = await getUserPhoneNumber(user);
				
				if (phoneNumber) {
					// SMS 2FA is enabled - send code and require verification
					try {
						const crypto = (await import("crypto")).default;
						const { redis } = await import("../lib/redis.js");
						const { sendSMS, formatPhoneNumber } = await import("../utils/smsService.js");
						
						// Generate 6-digit code
						const code = crypto.randomInt(100000, 999999).toString();
						
						// Store code in Redis with 10 minutes expiration
						const codeKey = `sms_2fa:${user._id}`;
						await redis.set(codeKey, code, "EX", 10 * 60); // 10 minutes

						// Format phone number to E.164 format
						const formattedPhone = formatPhoneNumber(phoneNumber);
						if (!formattedPhone) {
							return res.status(400).json({ 
								message: "Invalid phone number format. Please update your phone number." 
							});
						}

						// Send SMS with code
						const smsMessage = `Your login verification code is: ${code}. This code will expire in 10 minutes. Do not share this code with anyone.`;

						await sendSMS(formattedPhone, smsMessage);

						console.log(`✅ SMS 2FA code sent to ${formattedPhone} for user ${user._id}`);
						
						// Mask phone number in response
						const maskedPhone = formattedPhone.slice(0, -4) + "****";
						
						return res.status(200).json({
							requiresSMS2FA: true,
							userId: user._id.toString(),
							phoneMasked: maskedPhone,
							message: "A verification code has been sent to your phone. Please check your SMS.",
						});
					} catch (smsError) {
						console.error("Failed to send SMS 2FA code:", smsError);
						return res.status(500).json({ 
							message: "Failed to send verification code. Please check your phone number and try again later." 
						});
					}
				} else {
					// SMS 2FA is enabled but no phone number available
					return res.status(400).json({ 
						message: user.role === "student"
							? "SMS 2FA is enabled but no phone number found. Please ensure your parent has a phone number registered."
							: "SMS 2FA is enabled but no phone number found. Please update your phone number."
					});
				}
			}
			
			// Check if email 2FA is enabled (third priority)
			if (user.email2FAEnabled && user.email) {
				// Email 2FA is enabled - send code and require verification
				try {
					const crypto = (await import("crypto")).default;
					const { redis } = await import("../lib/redis.js");
					const { sendEmail } = await import("../utils/emailService.js");
					
					// Generate 6-digit code
					const code = crypto.randomInt(100000, 999999).toString();
					
					// Store code in Redis with 10 minutes expiration
					const codeKey = `email_2fa:${user._id}`;
					await redis.set(codeKey, code, "EX", 10 * 60); // 10 minutes

					// Send email with code
					const emailSubject = "Your Login Verification Code";
					const emailHtml = `
						<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
							<h2 style="color: #333;">Login Verification Code</h2>
							<p>Hello ${user.name},</p>
							<p>You have requested to log in to your account. Please use the following verification code:</p>
							<div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0; border-radius: 5px;">
								<h1 style="color: #007bff; font-size: 32px; margin: 0; letter-spacing: 5px;">${code}</h1>
							</div>
							<p>This code will expire in <strong>10 minutes</strong>.</p>
							<p>If you didn't request this code, please ignore this email or contact support if you have concerns.</p>
							<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
							<p style="color: #666; font-size: 12px;">This is an automated message. Please do not reply to this email.</p>
						</div>
					`;

					await sendEmail({
						to: user.email,
						subject: emailSubject,
						html: emailHtml,
					});

					console.log(`✅ Email 2FA code sent to ${user.email} for user ${user._id}`);
					
					return res.status(200).json({
						requiresEmail2FA: true,
						userId: user._id.toString(),
						message: "A verification code has been sent to your email. Please check your inbox.",
					});
				} catch (emailError) {
					console.error("Failed to send email 2FA code:", emailError);
					return res.status(500).json({ 
						message: "Failed to send verification code. Please try again later." 
					});
				}
			}

			// No 2FA or not verified - proceed with normal login
			const { accessToken, refreshToken } = generateTokens(user._id);
			await storeRefreshToken(user._id, refreshToken);
			setCookies(res, accessToken, refreshToken);

			// Only include mustChangePassword if it's explicitly true
			const response = {
				_id: user._id,
				name: user.name,
				email: user.email,
				role: user.role,
				requires2FA: false,
				requiresEmail2FA: false,
				requiresSMS2FA: false,
			};
			
			// Only add mustChangePassword if it's true (explicitly check for true)
			if (user.mustChangePassword === true) {
				response.mustChangePassword = true;
			}

			res.json(response);
		} else {
			console.log("Login failed - invalid credentials");
			res.status(400).json({ message: "Invalid username/email or password" });
		}
	} catch (error) {
		console.log("Error in login controller", error.message);
		res.status(500).json({ message: error.message });
	}
};

export const logout = async (req, res) => {
	try {
		const refreshToken = req.cookies.refreshToken;
		if (refreshToken) {
			const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
			await redis.del(`refresh_token:${decoded.userId}`);
		}

		// Clear access and refresh tokens, but keep deviceToken cookie for device trust
		res.clearCookie("accessToken", { path: "/" });
		res.clearCookie("refreshToken", { path: "/" });
		// Note: We intentionally do NOT clear deviceToken cookie here
		// so that device trust persists across logout/login
		res.json({ message: "Logged out successfully" });
	} catch (error) {
		console.log("Error in logout controller", error.message);
		res.status(500).json({ message: "Server error", error: error.message });
	}
};

// this will refresh the access token
// Supports: cookie (refreshToken) for web, req.body.refreshToken for React Native / non-cookie clients
export const refreshToken = async (req, res) => {
	try {
		const refreshToken = req.cookies.refreshToken || req.body?.refreshToken;

		if (!refreshToken) {
			return res.status(401).json({ message: "No refresh token provided" });
		}

		const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
		const storedToken = await redis.get(`refresh_token:${decoded.userId}`);

		if (storedToken !== refreshToken) {
			return res.status(401).json({ message: "Invalid refresh token" });
		}

		const accessToken = jwt.sign({ userId: decoded.userId }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "2h" }); // Changed from 15m to 2h

		res.cookie("accessToken", accessToken, {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "strict",
			maxAge: 2 * 60 * 60 * 1000, // 2 hours (changed from 15 minutes)
		});

		// Include accessToken in body for mobile clients that cannot use cookies
		res.json({ message: "Token refreshed successfully", accessToken });
	} catch (error) {
		console.log("Error in refreshToken controller", error.message);
		res.status(500).json({ message: "Server error", error: error.message });
	}
};

export const getProfile = async (req, res) => {
	try {
		const user = req.user;
		let profileData = { ...user.toObject() };

		// ✅ Get role-specific profile data with avatar
		if (user.role === "teacher" && user.teacherId) {
			const Teacher = (await import('../models/teacher.model.js')).default;
			const teacherProfile = await Teacher.findById(user.teacherId);
			if (teacherProfile) {
				profileData.avatar = teacherProfile.image || user.avatar;
				profileData.teacherProfile = {
					teacherId: teacherProfile.teacherId,
					qualification: teacherProfile.qualification,
					subject: teacherProfile.subject,
					phone: teacherProfile.phone
				};
			}
		} else if (user.role === "student" && user.studentId) {
			const Student = (await import('../models/student.model.js')).default;
			const studentProfile = await Student.findById(user.studentId);
			if (studentProfile) {
				profileData.avatar = studentProfile.image || user.avatar;
				profileData.studentProfile = {
					studentId: studentProfile.studentId,
					class: studentProfile.class,
					section: studentProfile.section,
					birthDate: studentProfile.birthDate
				};
			}
		} else if (user.role === "parent" && user.parentId) {
			const Parent = (await import('../models/parent.model.js')).default;
			const parentProfile = await Parent.findById(user.parentId);
			if (parentProfile) {
				profileData.avatar = parentProfile.image || user.avatar;
				profileData.parentProfile = {
					phone: parentProfile.phone,
					address: parentProfile.address
				};
			}
		}

		// ✅ Remove password from response
		delete profileData.password;

		res.json(profileData);
	} catch (error) {
		console.error("Get profile error:", error.message);
		res.status(500).json({ message: "Server error", error: error.message });
	}
};

// 📬 Forgot Password
export const forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    const token = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    await redis.set(`reset_token:${hashedToken}`, user._id.toString(), "EX", 15 * 60); // 15 mins
    await sendEmail({
      to: email,
      subject: 'Password Reset Request',
      html: `
        <h2>Password Reset Request</h2>
        <p>You have requested to reset your password. Click the link below to reset your password:</p>
        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${token}" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a>
        <p>This link will expire in 15 minutes.</p>
        <p>If you didn't request this, please ignore this email.</p>
      `
    });

    res.json({ message: "Password reset link sent" });
  } catch (error) {
    console.error("Forgot password error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};


// 🔐 Reset Password
export const resetPassword = async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  try {
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    const userId = await redis.get(`reset_token:${hashedToken}`);

    if (!userId) return res.status(400).json({ message: "Token expired or invalid" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.password = password; // triggers bcrypt pre-save hook
    await user.save();

    await redis.del(`reset_token:${hashedToken}`);

    res.json({ message: "Password has been reset successfully" });
  } catch (error) {
    console.error("Reset password error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

// POST /api/auth/change-password
export const changePassword = async (req, res) => {
  try {
    const userId = req.user._id; // from protectRoute middleware
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Both current and new passwords are required." });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Current password is incorrect." });
    }

    user.password = newPassword; // will be hashed in pre-save
	user.mustChangePassword = false; // ✅ set this to false after first change
    await user.save();

    res.status(200).json({ message: "Password changed successfully." });
  } catch (err) {
    console.error("Change password error:", err.message);
    res.status(500).json({ message: "Password change failed", error: err.message });
  }
};