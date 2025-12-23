

// controllers/chatbot.controller.js
import { redis } from "../lib/redis.js";
import Student from "../models/student.model.js";
import Parent from "../models/parent.model.js";
import Teacher from "../models/teacher.model.js";
import FeePayment from "../models/feePayment.model.js";
import Attendance from "../models/attendance.model.js";
import CustomFee from "../models/customFee.model.js";
import FeeStructure from "../models/FeeStructure.model.js";
import Announcement from "../models/announcement.model.js";
import { TimetableModel } from "../models/timetableModel.js";
import { sendEmail } from "../utils/emailService.js";
import { sendWhatsApp } from "../utils/sendWhatsApp.js";
import { getAcademicYear } from "../config/appConfig.js";

// Helper function to validate studentId format (e.g., S190775)
const isValidStudentId = (id) => {
  return /^S\d{6}$/.test(id);
};

// Helper function to search students by name (fuzzy search)
const searchStudentsByName = async (searchTerm, limit = 10) => {
  const regex = new RegExp(searchTerm, 'i'); // Case-insensitive regex
  return await Student.find({
    $or: [
      { name: { $regex: regex } },
      { studentId: { $regex: regex } }
    ]
  })
  .select('name studentId class section rollNumber')
  .limit(limit)
  .lean();
};

// Helper function to find student by ID or name
const findStudentByIdOrName = async (identifier) => {
  console.log('Searching for student with identifier:', identifier);
  
  // First try to find by studentId if it matches the format
  if (isValidStudentId(identifier)) {
    console.log('Valid student ID format, searching by studentId:', identifier);
    const student = await Student.findOne({ studentId: identifier });
    console.log('Student found by ID:', student ? `${student.name} (${student.studentId})` : 'Not found');
    return student;
  }
  
  // If not a valid studentId format, search by name
  console.log('Not valid student ID format, searching by name:', identifier);
  const students = await Student.find({
    name: { $regex: new RegExp(`^${identifier}$`, 'i') }
  }).limit(1);
  
  console.log('Students found by name:', students.length);
  return students.length > 0 ? students[0] : null;
};

const adminHelp = `
🤖 Admin Chatbot Commands:
/select <studentId/name>  → Select a student by ID (S190***) or name
/search <name>            → Search students by name (partial matches)
/student                  → Show selected student's profile
/attendance               → Show attendance summary
/payment                  → Show fee payment history
/parent                   → Show parent details
/teacher <teacherId>      → Get teacher profile & assignments
/reminder                 → Send pending fee reminder
/verifyOffline <paymentId> → Verify offline cash payment
/pendingOffline           → List pending offline payments
/stats                    → Show school statistics (students, teachers, parents)
/strength                 → Show total strength by class

📧 Communication Commands:
/behaviorEmail <name> <message> → Send behavior email to parent
/behaviorWhatsApp <name> <message> → Send behavior WhatsApp to parent
/behaviorBoth <name> <message> → Send behavior message via both email & WhatsApp

📅 Timetable Commands:
/timetable                → Show latest timetable overview
/classTimetable <class>   → Show timetable for specific class (e.g., 10-A)
/teacherTimetable <name>  → Show timetable for specific teacher
/myTimetable              → Show your teacher timetable (if you're a teacher)
/studentTimetable <class> → Show timetable for student's class
/timetableStats           → Show timetable statistics

📢 Announcement Commands:
/announcements            → List recent announcements
/announcement <id>        → Show specific announcement details
/urgentAnnouncements      → Show high priority announcements
/announcementStats        → Show announcement reach statistics

/help                     → Show this help menu

💡 Tips: 
• Use /select with student ID like S190775 or name like "John Doe"
• Use /search to find students by partial name matches
• Use /classTimetable 10-A for specific class timetables
• Use /behaviorEmail John "Good behavior in class today"
• Names are case-insensitive and support partial matching
`;

export const adminChatbotHandler = async (req, res) => {
  try {
    const { message } = req.body;
    const userId = req.user._id.toString();
    if (!message) return res.status(400).json({ reply: "⚠️ Please provide a message.", context: {} });

    const sessionKey = `chatbot:session:${userId}`;
    let session = await redis.get(sessionKey);
    session = session ? JSON.parse(session) : {};

    let reply = "❌ Command not recognized. Type /help for options.";

    // --- HELP ---
    if (message.startsWith("/help")) {
      reply = adminHelp;
    }

    // --- DEBUG STUDENT ID ---
    else if (message.startsWith("/debugStudent")) {
      const identifier = message.split(" ").slice(1).join(" ").trim();
      if (!identifier) {
        reply = "⚠️ Please provide a student ID or name to debug.\n\nExample: /debugStudent S190775";
      } else {
        console.log('=== DEBUG STUDENT ID ===');
        console.log('Input:', identifier);
        console.log('Is valid format:', isValidStudentId(identifier));
        
        // Check exact match
        const exactMatch = await Student.findOne({ studentId: identifier });
        console.log('Exact match:', exactMatch ? `${exactMatch.name} (${exactMatch.studentId})` : 'Not found');
        
        // Check case-insensitive match
        const caseInsensitiveMatch = await Student.findOne({ 
          studentId: { $regex: new RegExp(`^${identifier}$`, 'i') } 
        });
        console.log('Case-insensitive match:', caseInsensitiveMatch ? `${caseInsensitiveMatch.name} (${caseInsensitiveMatch.studentId})` : 'Not found');
        
        // Check partial match
        const partialMatches = await Student.find({ 
          studentId: { $regex: new RegExp(identifier, 'i') } 
        }).limit(5);
        console.log('Partial matches:', partialMatches.length);
        
        // Check name match
        const nameMatches = await Student.find({ 
          name: { $regex: new RegExp(identifier, 'i') } 
        }).limit(5);
        console.log('Name matches:', nameMatches.length);
        
        reply = `🔍 Debug Results for "${identifier}":
        
Format Valid: ${isValidStudentId(identifier)}
Exact Match: ${exactMatch ? `${exactMatch.name} (${exactMatch.studentId})` : 'Not found'}
Case-Insensitive: ${caseInsensitiveMatch ? `${caseInsensitiveMatch.name} (${caseInsensitiveMatch.studentId})` : 'Not found'}
Partial ID Matches: ${partialMatches.length}
Name Matches: ${nameMatches.length}

${partialMatches.length > 0 ? `Partial ID Matches:\n${partialMatches.map(s => `• ${s.name} (${s.studentId})`).join('\n')}\n` : ''}
${nameMatches.length > 0 ? `Name Matches:\n${nameMatches.map(s => `• ${s.name} (${s.studentId})`).join('\n')}` : ''}`;
        
        console.log('=== END DEBUG STUDENT ID ===');
      }
    }

    // --- SELECT STUDENT ---
    else if (message.startsWith("/select")) {
      const identifier = message.split(" ").slice(1).join(" ").trim();
      if (!identifier) {
        reply = "⚠️ Please provide a student ID or name.\n\nExamples:\n• /select S190*** /select John Doe\n• /select john";
      } else {
        console.log('=== SELECT STUDENT DEBUG ===');
        console.log('Input identifier:', identifier);
        console.log('Is valid student ID format:', isValidStudentId(identifier));
        
        const student = await findStudentByIdOrName(identifier);
        console.log('Student found:', student ? `${student.name} (${student.studentId})` : 'Not found');
        
        if (!student) {
          // Try alternative search methods
          console.log('Trying alternative search methods...');
          
          // Try case-insensitive studentId search
          const studentById = await Student.findOne({ 
            studentId: { $regex: new RegExp(`^${identifier}$`, 'i') } 
          });
          
          if (studentById) {
            console.log('Found student by case-insensitive ID search:', studentById.name);
            session.selectedStudent = studentById._id.toString();
            await redis.setex(sessionKey, 3600, JSON.stringify(session));
            reply = `✅ Student selected: ${studentById.name} (${studentById.class}${studentById.section}) - ID: ${studentById.studentId}`;
          } else {
          // If exact match not found, show suggestions
          const suggestions = await searchStudentsByName(identifier, 5);
            console.log('Suggestions found:', suggestions.length);
            
          if (suggestions.length > 0) {
            reply = `❌ Student not found. Did you mean one of these?\n\n${suggestions.map((s, idx) => 
              `${idx + 1}. ${s.name} (${s.studentId}) - Class ${s.class}${s.section}`
            ).join('\n')}\n\nUse the exact name or student ID from the list above.`;
          } else {
            reply = "❌ Student not found. Please check the name or student ID.\n\nUse /search <name> to find students by partial name matches.";
            }
          }
        } else {
          session.selectedStudent = student._id.toString();
          await redis.setex(sessionKey, 3600, JSON.stringify(session));
          reply = `✅ Student selected: ${student.name} (${student.class}${student.section}) - ID: ${student.studentId}`;
        }
        console.log('=== END SELECT STUDENT DEBUG ===');
      }
    }

    // --- SEARCH STUDENTS ---
    else if (message.startsWith("/search")) {
      const searchTerm = message.split(" ").slice(1).join(" ").trim();
      if (!searchTerm) {
        reply = "⚠️ Please provide a search term.\n\nExample: /search john";
      } else {
        const students = await searchStudentsByName(searchTerm, 10);
        if (students.length === 0) {
          reply = `❌ No students found matching "${searchTerm}".`;
        } else {
          reply = `🔍 Found ${students.length} student(s) matching "${searchTerm}":\n\n${students.map((s, idx) => 
            `${idx + 1}. ${s.name} (${s.studentId}) - Class ${s.class}${s.section}${s.rollNumber ? ` - Roll: ${s.rollNumber}` : ''}`
          ).join('\n')}\n\nUse /select with the exact name or student ID to select a student.`;
        }
      }
    }

    // --- SHOW STUDENT PROFILE ---
    else if (message === "/student") {
      if (!session.selectedStudent) reply = "⚠️ No student selected. Use /select <studentId/name> or /search <name>";
      else {
        const student = await Student.findById(session.selectedStudent).populate("parent");
        if (!student) reply = "❌ Student not found.";
        else {
          reply = `👦 Student Info:
Student ID: ${student.studentId}
Name: ${student.name}
Class: ${student.class}${student.section}
Roll No: ${student.rollNumber || "N/A"}
Admission No: ${student.admissionNumber || "N/A"}
Parent: ${student.parent ? student.parent.name : "N/A"}
Email: ${student.parent ? student.parent.email : "N/A"}
Phone: ${student.parent ? student.parent.phone : "N/A"}`;
        }
      }
    }

    // --- SHOW ATTENDANCE ---
    else if (message === "/attendance") {
      if (!session.selectedStudent) reply = "⚠️ No student selected. Use /select <studentId/name> or /search <name>";
      else {
        const attendanceRecords = await Attendance.find({ student: session.selectedStudent });
        const totalDays = attendanceRecords.length;
        const presentDays = attendanceRecords.filter(r => r.status === "present").length;
        const absentDays = totalDays - presentDays;
        reply = `📅 Attendance Summary:
Total Days: ${totalDays}
Present: ${presentDays}
Absent: ${absentDays}`;
      }
    }

    // --- SHOW PAYMENT HISTORY ---
    else if (message === "/payment") {
      if (!session.selectedStudent) reply = "⚠️ No student selected. Use /select <studentId/name> or /search <name>";
      else {
        const student = await Student.findById(session.selectedStudent).populate("parent");
        if (!student) reply = "❌ Student not found.";
        
        const academicYear = getAcademicYear();
        
        // Get fee structure (custom or standard)
        const customFee = await CustomFee.findOne({ student: student._id, academicYear });
        const standardFee = await FeeStructure.findOne({
          class: student.class,
          section: student.section,
          academicYear,
        });
        
        const feeStructure = customFee || standardFee;
        if (!feeStructure) {
          reply = "❌ No fee structure found for this student.";
        } else {
          // Get payment history
        const payments = await FeePayment.find({
          student: session.selectedStudent,
          academicYear,
        }).sort({ paidAt: -1 }).lean();

          // Calculate totals
          const totalFeeAmount = feeStructure.totalFee || 0;
          const totalPaid = payments
            .filter(p => p.status === "paid")
            .reduce((sum, p) => sum + (p.amountPaid || 0) + (p.lateFee || 0), 0);
          const totalDue = totalFeeAmount - totalPaid;
          
          // Calculate late fees
          let overdueDays = 0;
          let lateFee = 0;
          if (feeStructure.dueDate && new Date() > new Date(feeStructure.dueDate)) {
            overdueDays = Math.floor((new Date() - new Date(feeStructure.dueDate)) / (1000 * 60 * 60 * 24));
            lateFee = overdueDays * (feeStructure.lateFeePerDay || 0);
          }
          
          const grandTotal = totalFeeAmount + lateFee;
          const remainingDue = grandTotal - totalPaid;

          reply = `💳 Fee Information for ${student.name} (${student.studentId}):
          
📊 Fee Summary:
• Total Fee Amount: ₹${totalFeeAmount.toLocaleString()}
• Amount Paid: ₹${totalPaid.toLocaleString()}
• Due Amount: ₹${Math.max(0, totalDue).toLocaleString()}
• Late Fee: ₹${lateFee.toLocaleString()}
• Grand Total: ₹${grandTotal.toLocaleString()}
• Remaining Due: ₹${Math.max(0, remainingDue).toLocaleString()}

${feeStructure.dueDate ? `📅 Due Date: ${new Date(feeStructure.dueDate).toLocaleDateString()}` : ''}
${overdueDays > 0 ? `⚠️ Overdue by: ${overdueDays} days` : ''}

💳 Payment History (${payments.length} transactions):`;

          if (payments.length === 0) {
            reply += "\n• No payments recorded yet.";
          } else {
          payments.forEach((p, idx) => {
              const paymentDate = p.paidAt ? new Date(p.paidAt).toLocaleDateString() : "N/A";
              const statusIcon = p.status === "paid" ? "✅" : p.status === "pending" ? "⏳" : "❌";
              reply += `\n${idx + 1}. ${statusIcon} ₹${p.amountPaid || 0} + Late Fee: ₹${p.lateFee || 0} | Status: ${p.status} | Date: ${paymentDate}`;
            });
          }
          
          // Payment status summary
          if (remainingDue <= 0) {
            reply += "\n\n✅ Fee Status: Fully Paid";
          } else if (totalPaid > 0) {
            reply += `\n\n⚠️ Fee Status: Partially Paid (${Math.round((totalPaid / grandTotal) * 100)}% complete)`;
          } else {
            reply += "\n\n❌ Fee Status: Not Paid";
          }
        }
      }
    }

    // --- SHOW PARENT DETAILS ---
    else if (message === "/parent") {
      if (!session.selectedStudent) reply = "⚠️ No student selected. Use /select <studentId/name> or /search <name>";
      else {
        const student = await Student.findById(session.selectedStudent).populate("parent");
        if (!student?.parent) reply = "❌ Parent info not found.";
        else {
          reply = `👨 Parent Info:
Name: ${student.parent.name}
Email: ${student.parent.email}
Phone: ${student.parent.phone || "N/A"}`;
        }
      }
    }

    // --- SEND FEE REMINDER ---
    else if (message === "/reminder") {
      if (!session.selectedStudent) reply = "⚠️ No student selected. Use /select <studentId/name> or /search <name>";
      else {
        const student = await Student.findById(session.selectedStudent).populate("parent");
        const academicYear = getAcademicYear();
        if (!student?.parent) reply = "❌ Parent info not found.";

        const customFee = await CustomFee.findOne({ student: student._id, academicYear });
        const standardFee = await FeeStructure.findOne({
          class: student.class,
          section: student.section,
          academicYear,
        });
        if (!customFee && !standardFee) return res.json({ reply: "❌ No fee structure found.", context: { selectedStudent: session.selectedStudent } });

        const totalDue = customFee?.totalFee || standardFee.totalFee;
        const dueDate = customFee?.dueDate || null;
        const perDayLateFee = customFee?.lateFeePerDay || 0;

        const paidPayments = await FeePayment.find({ student: student._id, academicYear, status: "paid" });
        const totalPaid = paidPayments.reduce((sum, p) => sum + (p.amountPaid || 0) + (p.lateFee || 0), 0);

        let overdueDays = 0;
        let lateFee = 0;
        if (dueDate && new Date() > new Date(dueDate)) {
          overdueDays = Math.floor((new Date() - new Date(dueDate)) / (1000 * 60 * 60 * 24));
          lateFee = overdueDays * perDayLateFee;
        }
        const grandTotal = totalDue + lateFee;

        if (totalPaid >= grandTotal) reply = "✅ Fee already fully paid.";
        else {
          const text = `Dear ${student.parent.name}, Fee for ${student.name} is pending. Total Remaining: ₹${grandTotal - totalPaid}`;
          await sendEmail({ to: student.parent.email, subject: "Fee Reminder", text });
          if (student.parent.phone) await sendWhatsApp({ to: `+91${student.parent.phone}`, message: text });
          reply = "📢 Fee reminder sent via Email & WhatsApp.";
        }
      }
    }

    // --- VERIFY OFFLINE PAYMENT ---
    else if (message.startsWith("/verifyOffline")) {
      const paymentId = message.split(" ")[1];
      if (!paymentId) reply = "⚠️ Provide paymentId to verify.";
      else {
        const feePayment = await FeePayment.findById(paymentId).populate("student").populate("parent");
        if (!feePayment) reply = "❌ Payment not found.";
        else if (feePayment.status !== "pending_verification") reply = "❌ Payment is not pending verification.";
        else {
          feePayment.status = "paid";
          feePayment.verifiedBy = req.user._id;
          feePayment.verifiedAt = new Date();
          feePayment.paidAt = new Date();
          await feePayment.save();
          reply = `✅ Offline payment verified for ${feePayment.student.name}, Amount: ₹${feePayment.amountPaid}`;
        }
      }
    }

    // --- LIST PENDING OFFLINE PAYMENTS ---
    else if (message === "/pendingOffline") {
      const pendingPayments = await FeePayment.find({ status: "pending_verification", paymentMethod: "cash" })
        .populate("student parent")
        .sort({ createdAt: -1 });
      if (!pendingPayments.length) reply = "✅ No pending offline payments.";
      else {
        reply = "💰 Pending Offline Payments:\n";
        pendingPayments.forEach((p, idx) => {
          reply += `${idx + 1}. ${p.student.name} | Amount: ₹${p.amountPaid} | Parent: ${p.parent.name} | Payment ID: ${p._id}\n`;
        });
      }
    }

    // --- SHOW SCHOOL STATISTICS ---
    else if (message === "/stats") {
      const totalStudents = await Student.countDocuments();
      const totalTeachers = await Teacher.countDocuments();
      const totalParents = await Parent.countDocuments();
      
      // Get students by class
      const studentsByClass = await Student.aggregate([
        {
          $group: {
            _id: { class: "$class", section: "$section" },
            count: { $sum: 1 }
          }
        },
        { $sort: { "_id.class": 1, "_id.section": 1 } }
      ]);

      reply = `📊 School Statistics:
Total Students: ${totalStudents}
Total Teachers: ${totalTeachers}
Total Parents: ${totalParents}

📚 Students by Class:
${studentsByClass.map(s => `${s._id.class}${s._id.section}: ${s.count} students`).join('\n')}`;
    }

    // --- SHOW STRENGTH BY CLASS ---
    else if (message === "/strength") {
      const studentsByClass = await Student.aggregate([
        {
          $group: {
            _id: { class: "$class", section: "$section" },
            count: { $sum: 1 }
          }
        },
        { $sort: { "_id.class": 1, "_id.section": 1 } }
      ]);

      const totalStudents = studentsByClass.reduce((sum, s) => sum + s.count, 0);

      reply = `👥 Total Strength: ${totalStudents} students

📚 Class-wise Distribution:
${studentsByClass.map(s => `Class ${s._id.class}${s._id.section}: ${s.count} students`).join('\n')}`;
    }

    // --- SHOW LATEST TIMETABLE OVERVIEW ---
    else if (message === "/timetable") {
      const latestTimetable = await TimetableModel.findOne().sort({ createdAt: -1 });
      if (!latestTimetable) {
        reply = "❌ No timetable found. Please generate a timetable first.";
      } else {
        const classCount = latestTimetable.classes.length;
        const days = latestTimetable.days.join(", ");
        const periodsPerDay = latestTimetable.periodsPerDay;
        
        reply = `📅 Latest Timetable Overview:
Classes: ${classCount}
Days: ${days}
Periods per day: ${periodsPerDay}
Created: ${new Date(latestTimetable.createdAt).toLocaleDateString()}

Available classes:
${latestTimetable.classes.map((cls, idx) => `${idx + 1}. ${cls.name}`).join('\n')}

Use /classTimetable <class> to see specific class timetable.`;
      }
    }

    // --- SHOW CLASS TIMETABLE ---
    else if (message.startsWith("/classTimetable")) {
      const className = message.split(" ").slice(1).join(" ").trim();
      if (!className) {
        reply = "⚠️ Please provide a class name.\n\nExample: /classTimetable 10-A";
      } else {
        const latestTimetable = await TimetableModel.findOne().sort({ createdAt: -1 });
        if (!latestTimetable) {
          reply = "❌ No timetable found.";
        } else {
          const classObj = latestTimetable.classes.find(cls => 
            cls.name.toLowerCase() === className.toLowerCase()
          );
          
          if (!classObj) {
            const availableClasses = latestTimetable.classes.map(cls => cls.name).join(", ");
            reply = `❌ Class "${className}" not found.\n\nAvailable classes: ${availableClasses}`;
          } else {
            const days = latestTimetable.days;
            const periodsPerDay = latestTimetable.periodsPerDay;
            
            reply = `📅 Timetable for Class ${classObj.name}:\n\n`;
            
            // Create timetable grid
            for (let period = 1; period <= periodsPerDay; period++) {
              reply += `Period ${period}: `;
              const periodSlots = days.map(day => {
                const dayTimetable = classObj.timetable[day];
                if (dayTimetable && dayTimetable[period - 1]) {
                  const slot = dayTimetable[period - 1];
                  return `${day}: ${slot.subject} (${slot.teacher})`;
                }
                return `${day}: -`;
              });
              reply += periodSlots.join(" | ") + "\n";
            }
          }
        }
      }
    }

    // --- SHOW TEACHER TIMETABLE ---
    else if (message.startsWith("/teacherTimetable")) {
      const teacherName = message.split(" ").slice(1).join(" ").trim();
      if (!teacherName) {
        reply = "⚠️ Please provide a teacher name.\n\nExample: /teacherTimetable John Smith";
      } else {
        const latestTimetable = await TimetableModel.findOne().sort({ createdAt: -1 });
        if (!latestTimetable) {
          reply = "❌ No timetable found.";
        } else {
          const teacherSlots = [];
          for (const classObj of latestTimetable.classes) {
            const { name: className, timetable } = classObj;
            for (const day of latestTimetable.days) {
              const periods = timetable[day];
              if (Array.isArray(periods)) {
                periods.forEach((slot, periodIdx) => {
                  if (slot && slot.teacher.toLowerCase().includes(teacherName.toLowerCase())) {
                    teacherSlots.push({
                      class: className,
                      day,
                      period: periodIdx + 1,
                      subject: slot.subject,
                      teacher: slot.teacher
                    });
                  }
                });
              }
            }
          }
          
          if (teacherSlots.length === 0) {
            reply = `❌ No timetable found for teacher "${teacherName}".`;
          } else {
            reply = `👨‍🏫 Timetable for ${teacherName}:\n\n`;
            teacherSlots.forEach(slot => {
              reply += `${slot.day} - Period ${slot.period}: ${slot.subject} (Class ${slot.class})\n`;
            });
          }
        }
      }
    }

    // --- SHOW MY TIMETABLE (for teachers) ---
    else if (message === "/myTimetable") {
      const teacherName = req.user.name;
      const latestTimetable = await TimetableModel.findOne().sort({ createdAt: -1 });
      if (!latestTimetable) {
        reply = "❌ No timetable found.";
      } else {
        const teacherSlots = [];
        for (const classObj of latestTimetable.classes) {
          const { name: className, timetable } = classObj;
          for (const day of latestTimetable.days) {
            const periods = timetable[day];
            if (Array.isArray(periods)) {
              periods.forEach((slot, periodIdx) => {
                if (slot && slot.teacher === teacherName) {
                  teacherSlots.push({
                    class: className,
                    day,
                    period: periodIdx + 1,
                    subject: slot.subject,
                    teacher: slot.teacher
                  });
                }
              });
            }
          }
        }
        
        if (teacherSlots.length === 0) {
          reply = `❌ No timetable found for you (${teacherName}).`;
        } else {
          reply = `👨‍🏫 Your Timetable (${teacherName}):\n\n`;
          teacherSlots.forEach(slot => {
            reply += `${slot.day} - Period ${slot.period}: ${slot.subject} (Class ${slot.class})\n`;
          });
        }
      }
    }

    // --- SHOW STUDENT TIMETABLE ---
    else if (message.startsWith("/studentTimetable")) {
      const className = message.split(" ").slice(1).join(" ").trim();
      if (!className) {
        reply = "⚠️ Please provide a class name.\n\nExample: /studentTimetable 10-A";
      } else {
        const latestTimetable = await TimetableModel.findOne().sort({ createdAt: -1 });
        if (!latestTimetable) {
          reply = "❌ No timetable found.";
        } else {
          const classObj = latestTimetable.classes.find(cls => 
            cls.name.toLowerCase() === className.toLowerCase()
          );
          
          if (!classObj) {
            const availableClasses = latestTimetable.classes.map(cls => cls.name).join(", ");
            reply = `❌ Class "${className}" not found.\n\nAvailable classes: ${availableClasses}`;
          } else {
            const days = latestTimetable.days;
            const periodsPerDay = latestTimetable.periodsPerDay;
            
            reply = `📚 Your Class Timetable (${classObj.name}):\n\n`;
            
            // Create student-friendly timetable
            for (let period = 1; period <= periodsPerDay; period++) {
              reply += `Period ${period}: `;
              const periodSlots = days.map(day => {
                const dayTimetable = classObj.timetable[day];
                if (dayTimetable && dayTimetable[period - 1]) {
                  const slot = dayTimetable[period - 1];
                  return `${day}: ${slot.subject}`;
                }
                return `${day}: -`;
              });
              reply += periodSlots.join(" | ") + "\n";
            }
          }
        }
      }
    }

    // --- SHOW TIMETABLE STATISTICS ---
    else if (message === "/timetableStats") {
      const latestTimetable = await TimetableModel.findOne().sort({ createdAt: -1 });
      if (!latestTimetable) {
        reply = "❌ No timetable found.";
      } else {
        const classCount = latestTimetable.classes.length;
        const days = latestTimetable.days.length;
        const periodsPerDay = latestTimetable.periodsPerDay;
        const totalSlots = classCount * days * periodsPerDay;
        
        // Count teachers
        const teachers = new Set();
        latestTimetable.classes.forEach(classObj => {
          Object.values(classObj.timetable).forEach(dayTimetable => {
            if (Array.isArray(dayTimetable)) {
              dayTimetable.forEach(slot => {
                if (slot && slot.teacher) {
                  teachers.add(slot.teacher);
                }
              });
            }
          });
        });
        
        // Count subjects
        const subjects = new Set();
        latestTimetable.classes.forEach(classObj => {
          Object.values(classObj.timetable).forEach(dayTimetable => {
            if (Array.isArray(dayTimetable)) {
              dayTimetable.forEach(slot => {
                if (slot && slot.subject) {
                  subjects.add(slot.subject);
                }
              });
            }
          });
        });
        
        reply = `📊 Timetable Statistics:
Classes: ${classCount}
Days: ${days}
Periods per day: ${periodsPerDay}
Total time slots: ${totalSlots}
Teachers involved: ${teachers.size}
Subjects covered: ${subjects.size}

Classes: ${latestTimetable.classes.map(cls => cls.name).join(", ")}
Days: ${latestTimetable.days.join(", ")}`;
      }
    }

    // --- SEND BEHAVIOR EMAIL ---
    else if (message.startsWith("/behaviorEmail")) {
      const parts = message.split(" ").slice(1);
      if (parts.length < 2) {
        reply = "⚠️ Please provide student name and message.\n\nExample: /behaviorEmail John \"Good behavior in class today\"";
      } else {
        const studentName = parts[0];
        const behaviorMessage = parts.slice(1).join(" ").replace(/"/g, "");
        
        // Find student by name
        const student = await Student.findOne({
          name: { $regex: new RegExp(`^${studentName}$`, 'i') }
        }).populate("parent");
        
        if (!student) {
          reply = `❌ Student "${studentName}" not found. Please check the name.`;
        } else if (!student.parent) {
          reply = `❌ Parent information not found for ${student.name}.`;
        } else {
          const emailSubject = `Behavior Update for ${student.name} (${student.class}${student.section})`;
          const emailText = `Dear ${student.parent.name},

This is to inform you about your child's behavior:

Student: ${student.name}
Class: ${student.class}${student.section}
Student ID: ${student.studentId}
Date: ${new Date().toLocaleDateString()}

Message: ${behaviorMessage}

Please feel free to contact us if you have any questions.

Best regards,
School Administration`;

          try {
            await sendEmail({ 
              to: student.parent.email, 
              subject: emailSubject, 
              text: emailText 
            });
            reply = `✅ Behavior email sent successfully to ${student.parent.name} (${student.parent.email}) for ${student.name}.`;
          } catch (error) {
            reply = `❌ Failed to send email: ${error.message}`;
          }
        }
      }
    }

    // --- SEND BEHAVIOR WHATSAPP ---
    else if (message.startsWith("/behaviorWhatsApp")) {
      const parts = message.split(" ").slice(1);
      if (parts.length < 2) {
        reply = "⚠️ Please provide student name and message.\n\nExample: /behaviorWhatsApp John \"Good behavior in class today\"";
      } else {
        const studentName = parts[0];
        const behaviorMessage = parts.slice(1).join(" ").replace(/"/g, "");
        
        // Find student by name
        const student = await Student.findOne({
          name: { $regex: new RegExp(`^${studentName}$`, 'i') }
        }).populate("parent");
        
        if (!student) {
          reply = `❌ Student "${studentName}" not found. Please check the name.`;
        } else if (!student.parent || !student.parent.phone) {
          reply = `❌ Parent phone number not found for ${student.name}.`;
        } else {
          const whatsappMessage = `Dear ${student.parent.name},

Behavior Update for ${student.name} (${student.class}${student.section}):

${behaviorMessage}

Date: ${new Date().toLocaleDateString()}

Best regards,
School Administration`;

          try {
            await sendWhatsApp({ 
              to: `+91${student.parent.phone}`, 
              message: whatsappMessage 
            });
            reply = `✅ Behavior WhatsApp sent successfully to ${student.parent.name} (+91${student.parent.phone}) for ${student.name}.`;
          } catch (error) {
            reply = `❌ Failed to send WhatsApp: ${error.message}`;
          }
        }
      }
    }

    // --- SEND BEHAVIOR BOTH EMAIL AND WHATSAPP ---
    else if (message.startsWith("/behaviorBoth")) {
      const parts = message.split(" ").slice(1);
      if (parts.length < 2) {
        reply = "⚠️ Please provide student name and message.\n\nExample: /behaviorBoth John \"Good behavior in class today\"";
      } else {
        const studentName = parts[0];
        const behaviorMessage = parts.slice(1).join(" ").replace(/"/g, "");
        
        // Find student by name
        const student = await Student.findOne({
          name: { $regex: new RegExp(`^${studentName}$`, 'i') }
        }).populate("parent");
        
        if (!student) {
          reply = `❌ Student "${studentName}" not found. Please check the name.`;
        } else if (!student.parent) {
          reply = `❌ Parent information not found for ${student.name}.`;
        } else {
          const emailSubject = `Behavior Update for ${student.name} (${student.class}${student.section})`;
          const emailText = `Dear ${student.parent.name},

This is to inform you about your child's behavior:

Student: ${student.name}
Class: ${student.class}${student.section}
Student ID: ${student.studentId}
Date: ${new Date().toLocaleDateString()}

Message: ${behaviorMessage}

Please feel free to contact us if you have any questions.

Best regards,
School Administration`;

          const whatsappMessage = `Dear ${student.parent.name},

Behavior Update for ${student.name} (${student.class}${student.section}):

${behaviorMessage}

Date: ${new Date().toLocaleDateString()}

Best regards,
School Administration`;

          let emailSent = false;
          let whatsappSent = false;
          let errors = [];

          // Send email
          if (student.parent.email) {
            try {
              await sendEmail({ 
                to: student.parent.email, 
                subject: emailSubject, 
                text: emailText 
              });
              emailSent = true;
            } catch (error) {
              errors.push(`Email: ${error.message}`);
            }
          }

          // Send WhatsApp
          if (student.parent.phone) {
            try {
              await sendWhatsApp({ 
                to: `+91${student.parent.phone}`, 
                message: whatsappMessage 
              });
              whatsappSent = true;
            } catch (error) {
              errors.push(`WhatsApp: ${error.message}`);
            }
          }

          // Prepare response
          let response = `📧📱 Behavior message sent for ${student.name}:\n`;
          if (emailSent) response += `✅ Email sent to ${student.parent.email}\n`;
          if (whatsappSent) response += `✅ WhatsApp sent to +91${student.parent.phone}\n`;
          if (errors.length > 0) {
            response += `❌ Errors: ${errors.join(", ")}`;
          }
          if (!emailSent && !whatsappSent) {
            response = `❌ Failed to send both email and WhatsApp. Please check parent contact information.`;
          }

          reply = response;
        }
      }
    }

    // --- LIST RECENT ANNOUNCEMENTS ---
    else if (message === "/announcements") {
      const announcements = await Announcement.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();

      if (!announcements.length) {
        reply = "📢 No announcements found.";
      } else {
        reply = "📢 Recent Announcements:\n\n";
        announcements.forEach((announcement, idx) => {
          const priority = announcement.priority === 'high' ? '🔴' : announcement.priority === 'medium' ? '🟡' : '🟢';
          const pinned = announcement.pinned ? '📌 ' : '';
          const date = new Date(announcement.date).toLocaleDateString();
          reply += `${idx + 1}. ${pinned}${priority} ${announcement.title}\n`;
          reply += `   Category: ${announcement.category} | Date: ${date}\n`;
          reply += `   ID: ${announcement._id}\n\n`;
        });
      }
    }

    // --- SHOW SPECIFIC ANNOUNCEMENT ---
    else if (message.startsWith("/announcement")) {
      const announcementId = message.split(" ")[1];
      if (!announcementId) {
        reply = "⚠️ Please provide an announcement ID. Use /announcements to see available IDs.";
      } else {
        const announcement = await Announcement.findById(announcementId);
        if (!announcement) {
          reply = "❌ Announcement not found. Please check the ID.";
        } else {
          const priority = announcement.priority === 'high' ? '🔴' : announcement.priority === 'medium' ? '🟡' : '🟢';
          const pinned = announcement.pinned ? '📌 ' : '';
          const date = new Date(announcement.date).toLocaleDateString();
          const time = new Date(announcement.date).toLocaleTimeString();
          
          reply = `📢 ${pinned}${priority} ${announcement.title}

📅 Date: ${date} at ${time}
🏷️ Category: ${announcement.category}
⚡ Priority: ${announcement.priority.toUpperCase()}

📝 Content:
${announcement.content}

📊 WhatsApp Stats:
• Total: ${announcement.whatsappStats?.total || 0}
• Sent: ${announcement.whatsappStats?.sent || 0}
• Failed: ${announcement.whatsappStats?.failed || 0}

🆔 ID: ${announcement._id}`;
        }
      }
    }

    // --- SHOW URGENT ANNOUNCEMENTS ---
    else if (message === "/urgentAnnouncements") {
      const urgentAnnouncements = await Announcement.find({
        priority: 'high',
        pinned: true
      })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

      if (!urgentAnnouncements.length) {
        reply = "🔴 No urgent announcements found.";
      } else {
        reply = "🔴 Urgent Announcements:\n\n";
        urgentAnnouncements.forEach((announcement, idx) => {
          const date = new Date(announcement.date).toLocaleDateString();
          reply += `${idx + 1}. 📌🔴 ${announcement.title}\n`;
          reply += `   Category: ${announcement.category} | Date: ${date}\n`;
          reply += `   ${announcement.content.substring(0, 100)}${announcement.content.length > 100 ? '...' : ''}\n`;
          reply += `   ID: ${announcement._id}\n\n`;
        });
      }
    }

    // --- SHOW ANNOUNCEMENT STATISTICS ---
    else if (message === "/announcementStats") {
      const totalAnnouncements = await Announcement.countDocuments();
      const announcementsByPriority = await Announcement.aggregate([
        {
          $group: {
            _id: "$priority",
            count: { $sum: 1 }
          }
        }
      ]);

      const announcementsByCategory = await Announcement.aggregate([
        {
          $group: {
            _id: "$category",
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ]);

      const recentAnnouncements = await Announcement.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select('title whatsappStats createdAt')
        .lean();

      const totalWhatsAppSent = recentAnnouncements.reduce((sum, ann) => sum + (ann.whatsappStats?.sent || 0), 0);
      const totalWhatsAppFailed = recentAnnouncements.reduce((sum, ann) => sum + (ann.whatsappStats?.failed || 0), 0);

      reply = `📊 Announcement Statistics:

📈 Overview:
• Total Announcements: ${totalAnnouncements}
• WhatsApp Messages Sent: ${totalWhatsAppSent}
• WhatsApp Messages Failed: ${totalWhatsAppFailed}
• Success Rate: ${totalWhatsAppSent > 0 ? Math.round(((totalWhatsAppSent - totalWhatsAppFailed) / totalWhatsAppSent) * 100) : 0}%

⚡ By Priority:
${announcementsByPriority.map(p => `• ${p._id.toUpperCase()}: ${p.count}`).join('\n')}

🏷️ By Category:
${announcementsByCategory.map(c => `• ${c._id}: ${c.count}`).join('\n')}

📢 Recent Announcements Performance:
${recentAnnouncements.map(ann => {
  const sent = ann.whatsappStats?.sent || 0;
  const failed = ann.whatsappStats?.failed || 0;
  const successRate = sent > 0 ? Math.round(((sent - failed) / sent) * 100) : 0;
  return `• ${ann.title}: ${sent} sent, ${failed} failed (${successRate}% success)`;
}).join('\n')}`;
    }

    // --- SAVE SESSION ---
    await redis.setex(sessionKey, 3600, JSON.stringify(session));

    // --- RETURN REPLY + CONTEXT ---
    res.status(200).json({
      reply,
      context: {
        selectedStudent: session.selectedStudent || null,
      },
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ reply: "⚠️ Something went wrong.", context: {} });
  }
};
