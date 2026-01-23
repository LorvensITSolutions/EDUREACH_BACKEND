import Student from "../models/student.model.js";
import Teacher from "../models/teacher.model.js";
import Admission from "../models/admission.model.js";
import FeePayment from "../models/feePayment.model.js";
import Attendance from "../models/attendance.model.js";
import Event from "../models/event.model.js";
import Assignment from "../models/assignment.model.js";
import FeeStructure from "../models/FeeStructure.model.js";
import CustomFee from "../models/customFee.model.js";
import Parent from "../models/parent.model.js";
import User from "../models/user.model.js";
import mongoose from "mongoose";
import { getAcademicYear } from "../config/appConfig.js";
import { getCurrentAcademicYear, getAcademicYearDateRange, getPreviousAcademicYear } from "../utils/academicYear.js";

// ===========================================
// STUDENT ANALYTICS ENDPOINTS
// ===========================================

// Controller for students count by class
export const getStudentsByClass = async (req, res) => {
  try {
    const data = await Student.aggregate([
      { $group: { _id: "$class", count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    
    // Format data for charts
    let formattedData = data.map(item => ({
      name: item._id || 'Unknown',
      count: item.count,
      value: item.count
    }));
    
    // No dummy data - only show real data
    
    res.status(200).json({
      success: true,
      data: formattedData,
      total: formattedData.reduce((sum, item) => sum + item.count, 0)
    });
  } catch (error) {
    console.error("Error in getStudentsByClass:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

// Get students by section within a class
export const getStudentsBySection = async (req, res) => {
  try {
    const { class: className } = req.query;
    const matchStage = className ? { class: className } : {};
    
    const data = await Student.aggregate([
      { $match: matchStage },
      { $group: { _id: { class: "$class", section: "$section" }, count: { $sum: 1 } } },
      { $sort: { "_id.class": 1, "_id.section": 1 } }
    ]);
    res.status(200).json(data);
  } catch (error) {
    console.error("Error in getStudentsBySection:", error);
    res.status(500).json({ message: "Server error", error });
  }
};

// Get admission trends by month
export const getAdmissionTrends = async (req, res) => {
  try {
    const { year = new Date().getFullYear(), status } = req.query;
    
    const matchStage = {
      $expr: { $eq: [{ $year: "$createdAt" }, parseInt(year)] }
    };
    
    if (status) matchStage.status = status;
    
    const data = await Admission.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: { $month: "$createdAt" },
          count: { $sum: 1 }
        }
      },
      { $sort: { "_id": 1 } }
    ]);
    
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let formatted = months.map((month, index) => {
      const found = data.find(item => item._id === index + 1);
      return { month, count: found ? found.count : 0 };
    });
    
    // No dummy data - only show real data
    
    res.status(200).json(formatted);
  } catch (error) {
    console.error("Error in getAdmissionTrends:", error);
    res.status(500).json({ message: "Server error", error });
  }
};

// Get attendance patterns
export const getAttendancePatterns = async (req, res) => {
  try {
    const { startDate, endDate, class: className } = req.query;
    
    const matchStage = {};
    if (startDate && endDate) {
      matchStage.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }
    if (className) {
      matchStage.student = { $in: await Student.find({ class: className }).distinct('_id') };
    }
    
    const data = await Attendance.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
            status: "$status"
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { "_id.date": 1 } }
    ]);
    
    res.status(200).json(data);
  } catch (error) {
    console.error("Error in getAttendancePatterns:", error);
    res.status(500).json({ message: "Server error", error });
  }
};

// Get attendance summary by class
export const getAttendanceSummary = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const matchStage = {};
    
    if (startDate && endDate) {
      matchStage.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }
    
    const data = await Attendance.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: "students",
          localField: "student",
          foreignField: "_id",
          as: "studentInfo"
        }
      },
      { $unwind: "$studentInfo" },
      {
        $group: {
          _id: "$studentInfo.class",
          totalDays: { $sum: 1 },
          presentDays: { $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] } },
          absentDays: { $sum: { $cond: [{ $eq: ["$status", "absent"] }, 1, 0] } }
        }
      },
      {
        $addFields: {
          attendanceRate: { $multiply: [{ $divide: ["$presentDays", "$totalDays"] }, 100] }
        }
      },
      { $sort: { "_id": 1 } }
    ]);
    
    res.status(200).json(data);
  } catch (error) {
    console.error("Error in getAttendanceSummary:", error);
    res.status(500).json({ message: "Server error", error });
  }
};

// ===========================================
// FINANCIAL ANALYTICS ENDPOINTS
// ===========================================

// Get fee collection rates by month
export const getFeeCollectionRates = async (req, res) => {
  try {
    const { year = new Date().getFullYear(), class: className } = req.query;
    const academicYear = getAcademicYear();
    
    const matchStage = {
      $expr: { $eq: [{ $year: "$createdAt" }, parseInt(year)] },
      status: { $in: ["paid", "success"] },
      academicYear: academicYear
    };
    
    if (className) {
      const studentIds = await Student.find({ class: className }).distinct('_id');
      matchStage.student = { $in: studentIds };
    }
    
    const data = await FeePayment.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: { $month: "$createdAt" },
          totalCollected: { $sum: "$amountPaid" },
          totalLateFees: { $sum: "$lateFee" },
          paymentCount: { $sum: 1 },
          averageAmount: { $avg: "$amountPaid" }
        }
      },
      { $sort: { "_id": 1 } }
    ]);
    
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let formatted = months.map((month, index) => {
      const found = data.find(item => item._id === index + 1);
      return {
        month,
        totalCollected: found ? found.totalCollected : 0,
        totalLateFees: found ? found.totalLateFees : 0,
        paymentCount: found ? found.paymentCount : 0,
        averageAmount: found ? Math.round(found.averageAmount) : 0
      };
    });
    
    // No dummy data - only show real data
    
    res.status(200).json({
      success: true,
      data: formatted,
      totalCollected: formatted.reduce((sum, item) => sum + item.totalCollected, 0),
      totalPayments: formatted.reduce((sum, item) => sum + item.paymentCount, 0)
    });
  } catch (error) {
    console.error("Error in getFeeCollectionRates:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

// Get outstanding payments - using your actual fee status logic
export const getOutstandingPayments = async (req, res) => {
  try {
    const { class: className, limit = 50 } = req.query;
    const academicYear = getAcademicYear();
    
    // Get all students with optional class filter
    const studentFilter = className ? { class: className } : {};
    const students = await Student.find(studentFilter)
      .populate("parent", "name email phone")
      .lean();
    
    const outstandingPayments = [];
    
    for (const student of students) {
      // Get fee structure (custom or default)
      const customFee = await CustomFee.findOne({
        student: student._id,
        academicYear,
      }).lean();
      
      const defaultStructure = await FeeStructure.findOne({
        class: student.class,
        section: student.section,
        academicYear,
      }).lean();
      
      const feeStructureToUse = customFee || defaultStructure;
      if (!feeStructureToUse) continue;
      
      const baseFee = feeStructureToUse.totalFee || 0;
      const dueDate = customFee?.dueDate || feeStructureToUse?.dueDate;
      
      // Get paid payments
      const payments = await FeePayment.find({
        student: student._id,
        academicYear,
        status: "paid",
      }).lean();
      
      const totalPaid = payments.reduce((sum, p) => {
        return sum + (p.amountPaid || 0) + (p.lateFee || 0);
      }, 0);
      
      // Calculate late fees if overdue
      let overdueDays = 0;
      let lateFee = 0;
      if (dueDate && new Date() > new Date(dueDate) && totalPaid < baseFee) {
        overdueDays = Math.ceil((new Date() - new Date(dueDate)) / (1000 * 60 * 60 * 24));
        const perDayLateFee = customFee?.lateFeePerDay || 0;
        lateFee = overdueDays * perDayLateFee;
      }
      
      const totalDue = baseFee + lateFee;
      const remaining = totalDue - totalPaid;
      
      if (remaining > 0) {
        outstandingPayments.push({
          _id: student._id,
          studentName: student.name,
          studentClass: student.class,
          studentSection: student.section,
          parentName: student.parent?.name || 'N/A',
          parentEmail: student.parent?.email || 'N/A',
          parentPhone: student.parent?.phone || 'N/A',
          totalOutstanding: remaining,
          baseFee,
          lateFee,
          overdueDays,
          lastPaymentDate: payments[0]?.paidAt || null,
          paymentCount: payments.length
        });
      }
    }
    
    // Sort by outstanding amount and limit
    outstandingPayments.sort((a, b) => b.totalOutstanding - a.totalOutstanding);
    const limited = outstandingPayments.slice(0, parseInt(limit));
    
    res.status(200).json({
      success: true,
      data: limited,
      total: outstandingPayments.length,
      totalOutstanding: outstandingPayments.reduce((sum, p) => sum + p.totalOutstanding, 0)
    });
  } catch (error) {
    console.error("Error in getOutstandingPayments:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

// Get payment methods analysis
export const getPaymentMethodsAnalysis = async (req, res) => {
  try {
    const { year = new Date().getFullYear(), class: className } = req.query;
    const academicYear = getAcademicYear();
    
    const matchStage = {
      $expr: { $eq: [{ $year: "$createdAt" }, parseInt(year)] },
      status: { $in: ["paid", "success"] },
      academicYear: academicYear
    };
    
    if (className) {
      const studentIds = await Student.find({ class: className }).distinct('_id');
      matchStage.student = { $in: studentIds };
    }
    
    const data = await FeePayment.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: "$paymentMethod",
          totalAmount: { $sum: "$amountPaid" },
          totalLateFees: { $sum: "$lateFee" },
          paymentCount: { $sum: 1 },
          averageAmount: { $avg: "$amountPaid" }
        }
      },
      { $sort: { totalAmount: -1 } }
    ]);
    
    // Format data for charts
    const formattedData = data.map(item => ({
      name: item._id === 'online' ? 'Online Payment' : 
            item._id === 'cash' ? 'Cash Payment' : 
            item._id === 'cheque' ? 'Cheque Payment' : 
            item._id === 'bank_transfer' ? 'Bank Transfer' : 
            item._id || 'Unknown',
      totalAmount: item.totalAmount,
      totalLateFees: item.totalLateFees,
      paymentCount: item.paymentCount,
      averageAmount: Math.round(item.averageAmount)
    }));
    
    res.status(200).json({
      success: true,
      data: formattedData,
      totalAmount: data.reduce((sum, item) => sum + item.totalAmount, 0),
      totalPayments: data.reduce((sum, item) => sum + item.paymentCount, 0)
    });
  } catch (error) {
    console.error("Error in getPaymentMethodsAnalysis:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

// Get fee structure by class
export const getFeeStructureByClass = async (req, res) => {
  try {
    const { academicYear = new Date().getFullYear().toString() } = req.query;
    
    const data = await FeeStructure.aggregate([
      { $match: { academicYear } },
      {
        $group: {
          _id: "$class",
          totalFee: { $first: "$totalFee" },
          breakdown: { $first: "$breakdown" },
          sectionCount: { $sum: 1 }
        }
      },
      { $sort: { "_id": 1 } }
    ]);
    
    res.status(200).json(data);
  } catch (error) {
    console.error("Error in getFeeStructureByClass:", error);
    res.status(500).json({ message: "Server error", error });
  }
};

// Get late fee analytics
export const getLateFeeAnalytics = async (req, res) => {
  try {
    const { year = new Date().getFullYear(), class: className } = req.query;
    
    const matchStage = {
      $expr: { $eq: [{ $year: "$createdAt" }, parseInt(year)] },
      lateFee: { $gt: 0 }
    };
    
    if (className) {
      matchStage.student = { $in: await Student.find({ class: className }).distinct('_id') };
    }
    
    const data = await FeePayment.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: { $month: "$createdAt" },
          totalLateFees: { $sum: "$lateFee" },
          latePaymentCount: { $sum: 1 },
          averageLateFee: { $avg: "$lateFee" }
        }
      },
      { $sort: { "_id": 1 } }
    ]);
    
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const formatted = months.map((month, index) => {
      const found = data.find(item => item._id === index + 1);
      return {
        month,
        totalLateFees: found ? found.totalLateFees : 0,
        latePaymentCount: found ? found.latePaymentCount : 0,
        averageLateFee: found ? found.averageLateFee : 0
      };
    });
    
    res.status(200).json(formatted);
  } catch (error) {
    console.error("Error in getLateFeeAnalytics:", error);
    res.status(500).json({ message: "Server error", error });
  }
};

// ===========================================
// ACADEMIC PERFORMANCE ENDPOINTS
// ===========================================

// Get assignment completion rates
export const getAssignmentCompletionRates = async (req, res) => {
  try {
    const { class: className, section } = req.query;
    
    const matchStage = {};
    if (className) matchStage.class = className;
    if (section) matchStage.section = section;
    
    const data = await Assignment.aggregate([
      { $match: matchStage },
      {
        $project: {
          title: 1,
          class: 1,
          section: 1,
          dueDate: 1,
          totalStudents: { 
            $size: { 
              $ifNull: ["$submissions", []] 
            } 
          },
          completedStudents: {
            $size: {
              $filter: {
                input: { $ifNull: ["$submissions", []] },
                cond: { $ne: ["$$this.file", null] }
              }
            }
          },
          evaluatedStudents: {
            $size: {
              $filter: {
                input: { $ifNull: ["$evaluations", []] },
                cond: { $ne: ["$$this.marks", null] }
              }
            }
          }
        }
      },
      {
        $addFields: {
          completionRate: {
            $cond: {
              if: { $gt: ["$totalStudents", 0] },
              then: {
                $multiply: [
                  { $divide: ["$completedStudents", "$totalStudents"] },
                  100
                ]
              },
              else: 0
            }
          },
          evaluationRate: {
            $cond: {
              if: { $gt: ["$totalStudents", 0] },
              then: {
                $multiply: [
                  { $divide: ["$evaluatedStudents", "$totalStudents"] },
                  100
                ]
              },
              else: 0
            }
          }
        }
      },
      { $sort: { dueDate: -1 } }
    ]);
    
    res.status(200).json(data);
  } catch (error) {
    console.error("Error in getAssignmentCompletionRates:", error);
    res.status(500).json({ message: "Server error", error });
  }
};

// Get teacher workload
export const getTeacherWorkload = async (req, res) => {
  try {
    const data = await Teacher.aggregate([
      {
        $lookup: {
          from: "assignments",
          localField: "_id",
          foreignField: "teacherId",
          as: "assignments"
        }
      },
      {
        $project: {
          name: 1,
          subject: 1,
          qualification: 1,
          sectionAssignments: 1,
          totalAssignments: { $size: { $ifNull: ["$assignments", []] } },
          pendingEvaluations: {
            $size: {
              $filter: {
                input: { $ifNull: ["$assignments", []] },
                cond: { 
                  $lt: [
                    { $size: { $ifNull: ["$$this.evaluations", []] } }, 
                    { $size: { $ifNull: ["$$this.submissions", []] } }
                  ] 
                }
              }
            }
          },
          recentAssignments: {
            $slice: [
              {
                $map: {
                  input: { $slice: [{ $ifNull: ["$assignments", []] }, -5] },
                  as: "assignment",
                  in: {
                    title: "$$assignment.title",
                    dueDate: "$$assignment.dueDate",
                    class: "$$assignment.class",
                    section: "$$assignment.section"
                  }
                }
              },
              5
            ]
          }
        }
      },
      { $sort: { totalAssignments: -1 } }
    ]);
    
    res.status(200).json(data);
  } catch (error) {
    console.error("Error in getTeacherWorkload:", error);
    res.status(500).json({ message: "Server error", error });
  }
};

// ===========================================
// REAL-TIME KPIs ENDPOINTS
// ===========================================

// Get active students count
export const getActiveStudentsCount = async (req, res) => {
  try {
    const { class: className } = req.query;
    
    const matchStage = {};
    if (className) matchStage.class = className;
    
    const totalStudents = await Student.countDocuments(matchStage);
    
    // Students with recent attendance (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const activeStudents = await Attendance.aggregate([
      {
        $match: {
          date: { $gte: thirtyDaysAgo },
          status: "present"
        }
      },
      { $group: { _id: "$student" } },
      { $count: "activeCount" }
    ]);
    
    res.status(200).json({
      totalStudents,
      activeStudents: activeStudents[0]?.activeCount || 0,
      inactiveStudents: totalStudents - (activeStudents[0]?.activeCount || 0)
    });
  } catch (error) {
    console.error("Error in getActiveStudentsCount:", error);
    res.status(500).json({ message: "Server error", error });
  }
};

// Get pending admissions count
export const getPendingAdmissionsCount = async (req, res) => {
  try {
    const statusCounts = await Admission.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]);
    
    const totalPending = statusCounts
      .filter(item => ['draft', 'submitted', 'reviewed'].includes(item._id))
      .reduce((sum, item) => sum + item.count, 0);
    
    const totalProcessed = statusCounts
      .filter(item => ['accepted', 'rejected'].includes(item._id))
      .reduce((sum, item) => sum + item.count, 0);
    
    res.status(200).json({
      statusBreakdown: statusCounts,
      totalPending,
      totalProcessed,
      totalApplications: statusCounts.reduce((sum, item) => sum + item.count, 0)
    });
  } catch (error) {
    console.error("Error in getPendingAdmissionsCount:", error);
    res.status(500).json({ message: "Server error", error });
  }
};

// Get upcoming events
export const getUpcomingEvents = async (req, res) => {
  try {
    const { limit = 10, category } = req.query;
    
    const matchStage = {
      date: { $gte: new Date() }
    };
    
    if (category) matchStage.category = category;
    
    const data = await Event.find(matchStage)
      .sort({ date: 1 })
      .limit(parseInt(limit))
      .select('title description date time location category rsvpUsers')
      .populate('rsvpUsers', 'name email');
    
    res.status(200).json(data);
  } catch (error) {
    console.error("Error in getUpcomingEvents:", error);
    res.status(500).json({ message: "Server error", error });
  }
};

// Get teacher-specific analytics dashboard
export const getTeacherAnalyticsDashboard = async (req, res) => {
  try {
    const user = req.user;
    
    if (user.role !== "teacher") {
      return res.status(403).json({ message: "Access denied" });
    }

    const teacher = await Teacher.findById(user.teacherId);
    
    if (!teacher) {
      return res.status(404).json({ message: "Teacher not found" });
    }

    const { academicYear: academicYearParam, class: className, section: sectionName } = req.query;
    
    // Use provided academic year or default to current academic year
    const academicYear = academicYearParam || getCurrentAcademicYear();
    
    // Get date range for the academic year
    const { startDate, endDate } = getAcademicYearDateRange(academicYear);
    
    // ✅ Debug logging for date issues
    console.log('Academic Year Debug Info:', {
      academicYear,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    });

    // Get assigned classes
    const assignedClasses = teacher.sectionAssignments.map(assignment => 
      `${assignment.className}-${assignment.section}`
    );

    // If no assigned classes, return empty data
    if (!teacher.sectionAssignments || teacher.sectionAssignments.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          overview: {
            totalStudents: 0,
            averageAttendance: 0,
            assignmentsCreated: 0,
            pendingEvaluations: 0,
            assignedClasses: [],
            topStudents: [],
            recentActivity: []
          },
          attendanceData: [],
          classPerformance: [],
          studentProgress: [],
          assignmentStats: [],
          attendanceTrends: [],
          classComparison: [],
          recentActivity: []
        }
      });
    }

    // Helper function to determine academic year from a date
    const getAcademicYearFromDate = (date) => {
      if (!date) return null;
      const dateObj = new Date(date);
      const year = dateObj.getFullYear();
      const month = dateObj.getMonth(); // 0-11
      
      // Academic year runs from June (5) to May (4)
      if (month >= 5) { // June to December
        return `${year}-${year + 1}`;
      } else { // January to May
        return `${year - 1}-${year}`;
      }
    };

    // Helper function to get student's class for a specific academic year
    const getStudentClassForAcademicYear = (student, targetAcademicYear) => {
      const promotionHistory = student.promotionHistory || [];
      const currentAcadYear = getCurrentAcademicYear();
      const currentStartYear = parseInt(currentAcadYear.split('-')[0]);
      const targetStartYear = parseInt(targetAcademicYear.split('-')[0]);
      
      // For future academic years, only include students who were actually promoted/enrolled
      const isFutureYear = targetStartYear > currentStartYear;
      
      // Check if there's a revert record for this academic year (takes precedence)
      const revertRecord = promotionHistory.find(
        p => p.academicYear === targetAcademicYear && p.promotionType === 'reverted'
      );
      
      // Check if student was promoted IN this academic year (and not reverted)
      const promotionInThisYear = promotionHistory.find(
        p => p.academicYear === targetAcademicYear && 
             p.promotionType === 'promoted' && 
             !p.reverted
      );
      
      if (revertRecord) {
        return {
          displayClass: revertRecord.toClass,
          displaySection: revertRecord.toSection,
          isValid: true
        };
      }
      
      if (promotionInThisYear) {
        // Student was promoted in this year - show them in their OLD class (fromClass)
        return {
          displayClass: promotionInThisYear.fromClass,
          displaySection: promotionInThisYear.fromSection,
          isValid: true
        };
      }
      
      // Check if student was promoted in the PREVIOUS academic year (affects this year)
      const previousAcademicYear = getPreviousAcademicYear(targetAcademicYear);
      const revertInPreviousYear = promotionHistory.find(
        p => p.academicYear === previousAcademicYear && p.promotionType === 'reverted'
      );
      
      if (revertInPreviousYear) {
        return {
          displayClass: revertInPreviousYear.toClass,
          displaySection: revertInPreviousYear.toSection,
          isValid: true
        };
      }
      
      const promotionInPreviousYear = promotionHistory.find(
        p => p.academicYear === previousAcademicYear && 
             p.promotionType === 'promoted' && 
             !p.reverted
      );
      
      if (promotionInPreviousYear) {
        // Student was promoted in previous year - show them in their NEW class (toClass) for this year
        return {
          displayClass: promotionInPreviousYear.toClass,
          displaySection: promotionInPreviousYear.toSection,
          isValid: true
        };
      }
      
      // For future academic years, don't use current class as fallback
      // Only include students who have explicit promotion records
      if (isFutureYear) {
        return {
          displayClass: null,
          displaySection: null,
          isValid: false
        };
      }
      
      // For current or past academic years, use current class if no promotions
      // But exclude graduated students if they graduated in an academic year before the target year
      if (student.status === 'graduated' || student.class === 'Graduated' || student.class === 'graduated') {
        const graduationDate = student.graduationDate ? new Date(student.graduationDate) : null;
        if (graduationDate) {
          // Determine which academic year the student graduated in
          const graduationAcademicYear = getAcademicYearFromDate(graduationDate);
          
          if (graduationAcademicYear) {
            const [gradStartYear] = graduationAcademicYear.split('-').map(y => parseInt(y));
            const [targetStartYear] = targetAcademicYear.split('-').map(y => parseInt(y));
            
            // If student graduated in an academic year before the target one, exclude them
            if (gradStartYear < targetStartYear) {
              return {
                displayClass: null,
                displaySection: null,
                isValid: false
              };
            }
            // If student graduated in the same or future academic year, include them
          } else {
            // Fallback: use date comparison if we can't determine academic year
            const { startDate: yearStartDate } = getAcademicYearDateRange(targetAcademicYear);
            if (graduationDate < yearStartDate) {
              return {
                displayClass: null,
                displaySection: null,
                isValid: false
              };
            }
          }
        } else {
          // If status is graduated but no graduation date, exclude from future academic years
          const [targetStartYear] = targetAcademicYear.split('-').map(y => parseInt(y));
          const [currentStartYear] = getCurrentAcademicYear().split('-').map(y => parseInt(y));
          if (targetStartYear > currentStartYear) {
            return {
              displayClass: null,
              displaySection: null,
              isValid: false
            };
          }
        }
      }
      
      // No promotion affecting this year - use current class (only for current/past years)
      return {
        displayClass: student.class,
        displaySection: student.section,
        isValid: true
      };
    };

    // Get all students that might be in assigned classes (we'll filter by academic year after)
    // Don't exclude graduated students at query level - we'll filter by graduation date later
    const allPossibleStudents = await Student.find({}).populate('parent');
    
    // Filter students by their class in the selected academic year
    // Exclude graduated students if they graduated in an academic year BEFORE the selected academic year
    const { startDate: academicYearStartDate } = getAcademicYearDateRange(academicYear);
    
    // Parse selected academic year for comparison
    const [selectedStartYear] = academicYear.split('-').map(y => parseInt(y));
    
    const students = allPossibleStudents.filter(student => {
      // Check if student graduated - exclude if graduation academic year is before selected academic year
      if (student.status === 'graduated' || student.class === 'Graduated' || student.class === 'graduated') {
        const graduationDate = student.graduationDate ? new Date(student.graduationDate) : null;
        
        if (graduationDate) {
          // Determine which academic year the student graduated in
          const graduationAcademicYear = getAcademicYearFromDate(graduationDate);
          
          if (graduationAcademicYear) {
            const [gradStartYear] = graduationAcademicYear.split('-').map(y => parseInt(y));
            
            // If student graduated in an academic year before the selected one, exclude them
            if (gradStartYear < selectedStartYear) {
              return false;
            }
            
            // If student graduated in the same academic year as selected, include them (they were there for part of the year)
            // If student graduated in a future academic year, include them (they haven't graduated yet)
          } else {
            // If we can't determine graduation academic year, use date comparison as fallback
            if (graduationDate < academicYearStartDate) {
              return false;
            }
          }
        } else {
          // If status is graduated but no graduation date, exclude from future academic years
          // For current/past academic years, we might still want to include them if they were active
          // But to be safe, if they're marked as graduated without a date, exclude them from future years
          if (selectedStartYear > parseInt(getCurrentAcademicYear().split('-')[0])) {
            return false;
          }
        }
      }
      
      const { displayClass, displaySection, isValid } = getStudentClassForAcademicYear(student, academicYear);
      
      // Skip if student is not valid for this academic year
      if (!isValid || !displayClass || !displaySection) {
        return false;
      }
      
      // Check if this student's class-section matches any of the teacher's assigned classes
      return teacher.sectionAssignments.some(assignment => 
        assignment.className === displayClass && assignment.section === displaySection
      );
    });

    console.log('Total students found for academic year:', academicYear, ':', students.length);
    console.log('Assigned classes:', teacher.sectionAssignments);

    // Filter by specific class and section if requested
    let filteredStudents = students;
    if (className && className !== 'all') {
      const [classNum, section] = className.split('-');
      filteredStudents = students.filter(s => {
        const { displayClass, displaySection } = getStudentClassForAcademicYear(s, academicYear);
        return displayClass === classNum && displaySection === section;
      });
    }
    
    // Additional section filtering if section is specified separately
    if (sectionName && sectionName !== 'all' && className && className !== 'all') {
      const [classNum] = className.split('-');
      filteredStudents = filteredStudents.filter(s => {
        const { displayClass, displaySection } = getStudentClassForAcademicYear(s, academicYear);
        return displayClass === classNum && displaySection === sectionName;
      });
    }
    
    console.log('Filtered Students count:', filteredStudents.length);
    console.log('Filtered Students details:', filteredStudents.map(s => ({
      name: s.name,
      currentClass: s.class,
      currentSection: s.section,
      academicYearClass: getStudentClassForAcademicYear(s, academicYear)
    })));

    const filteredStudentIds = filteredStudents.map(s => s._id);

    // Get attendance data
    const attendanceData = await Attendance.aggregate([
      {
        $match: {
          student: { $in: filteredStudentIds },
          date: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $lookup: {
          from: "students",
          localField: "student",
          foreignField: "_id",
          as: "studentInfo"
        }
      },
      { $unwind: "$studentInfo" },
      {
        $group: {
          _id: {
            date: { 
              $dateToString: { 
                format: "%Y-%m-%d", 
                date: "$date",
                timezone: "Asia/Kolkata" // ✅ Fix timezone to prevent date offset
              } 
            },
            class: "$studentInfo.class",
            section: "$studentInfo.section"
          },
          present: { $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ["$status", "absent"] }, 1, 0] } },
          total: { $sum: 1 }
        }
      },
      {
        $addFields: {
          attendanceRate: { $multiply: [{ $divide: ["$present", "$total"] }, 100] }
        }
      },
      { $sort: { "_id.date": 1 } }
    ]);



    // Get assignment data with proper class-section filtering
    const assignmentData = await Assignment.aggregate([
      {
        $match: {
          teacherId: teacher._id,
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $lookup: {
          from: "students",
          let: { assignmentClass: "$class", assignmentSection: "$section" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$class", "$$assignmentClass"] },
                    { $eq: ["$section", "$$assignmentSection"] }
                  ]
                }
              }
            }
          ],
          as: "assignedStudents"
        }
      },
      {
        $addFields: {
          totalStudents: { $size: "$assignedStudents" },
          submittedCount: { $size: { $ifNull: ["$submissions", []] } },
          evaluatedCount: { $size: { $ifNull: ["$evaluations", []] } },
          // Debug: Show actual submission details
          submissionDetails: {
            $map: {
              input: { $ifNull: ["$submissions", []] },
              as: "sub",
              in: {
                studentId: "$$sub.studentId",
                submittedAt: "$$sub.submittedAt"
              }
            }
          }
        }
      },
      {
        $addFields: {
          completionRate: {
            $cond: {
              if: { $gt: ["$totalStudents", 0] },
              then: { $multiply: [{ $divide: ["$submittedCount", "$totalStudents"] }, 100] },
              else: 0
            }
          },
          evaluationRate: {
            $cond: {
              if: { $gt: ["$submittedCount", 0] },
              then: { $multiply: [{ $divide: ["$evaluatedCount", "$submittedCount"] }, 100] },
              else: 0
            }
          }
        }
      },
      { $sort: { createdAt: -1 } }
    ]);

    // Calculate overview statistics
    const totalStudents = filteredStudents.length;
    const totalAttendanceRecords = await Attendance.countDocuments({
      student: { $in: filteredStudentIds },
      date: { $gte: startDate, $lte: endDate }
    });

    const presentRecords = await Attendance.countDocuments({
      student: { $in: filteredStudentIds },
      date: { $gte: startDate, $lte: endDate },
      status: "present"
    });

    const averageAttendance = totalAttendanceRecords > 0 
      ? Math.round((presentRecords / totalAttendanceRecords) * 100) 
      : 0;

    const assignmentsCreated = assignmentData.length;
    const pendingEvaluations = assignmentData.reduce((sum, assignment) => 
      sum + (assignment.submittedCount - assignment.evaluatedCount), 0
    );

    // Get top performing students
    const studentPerformance = await Attendance.aggregate([
      {
        $match: {
          student: { $in: filteredStudentIds },
          date: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: "$student",
          presentDays: { $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] } },
          totalDays: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: "students",
          localField: "_id",
          foreignField: "_id",
          as: "studentInfo"
        }
      },
      { $unwind: "$studentInfo" },
      {
        $addFields: {
          attendanceRate: { $multiply: [{ $divide: ["$presentDays", "$totalDays"] }, 100] }
        }
      },
      { $sort: { attendanceRate: -1 } },
      { $limit: 5 }
    ]);

    const topStudents = studentPerformance.map(student => ({
      id: student._id,
      name: student.studentInfo.name,
      class: student.studentInfo.class,
      section: student.studentInfo.section,
      attendanceRate: Math.round(student.attendanceRate)
    }));

    // Format data for charts
    const attendanceTrends = attendanceData.reduce((acc, record) => {
      const date = record._id.date;
      const existing = acc.find(item => item.date === date);
      
      if (existing) {
        existing.present += record.present;
        existing.absent += record.absent;
      } else {
        acc.push({
          date,
          present: record.present,
          absent: record.absent
        });
      }
      
      return acc;
    }, []).sort((a, b) => new Date(a.date) - new Date(b.date));

    // Filter section assignments based on selected class/section
    let filteredSectionAssignments = teacher.sectionAssignments;
    
    if (className && className !== 'all') {
      const [classNum, section] = className.split('-');
      filteredSectionAssignments = teacher.sectionAssignments.filter(assignment => 
        assignment.className === classNum && assignment.section === section
      );
    }
    
    // Additional section filtering if section is specified separately
    if (sectionName && sectionName !== 'all' && className && className !== 'all') {
      const [classNum] = className.split('-');
      filteredSectionAssignments = filteredSectionAssignments.filter(assignment => 
        assignment.className === classNum && assignment.section === sectionName
      );
    }

    const classPerformance = filteredSectionAssignments.map(assignment => {
      const classData = attendanceData.filter(record => 
        record._id.class === assignment.className && 
        record._id.section === assignment.section
      );
      
      const totalPresent = classData.reduce((sum, record) => sum + record.present, 0);
      const totalAbsent = classData.reduce((sum, record) => sum + record.absent, 0);
      const totalRecords = totalPresent + totalAbsent;
      
      const attendanceRate = totalRecords > 0 ? Math.round((totalPresent / totalRecords) * 100) : 0;
      
      const classAssignments = assignmentData.filter(assignment => 
        assignment.class === assignment.className
      );
      
      const avgCompletionRate = classAssignments.length > 0
        ? Math.round(classAssignments.reduce((sum, a) => sum + a.completionRate, 0) / classAssignments.length)
        : 0;

      return {
        class: `${assignment.className}-${assignment.section}`,
        attendanceRate,
        assignmentCompletion: avgCompletionRate
      };
    });

    // Debug logging
    console.log('Teacher Analytics Request:', { academicYear, className, sectionName });
    console.log('Assigned Classes:', assignedClasses);
    console.log('Total Students Found:', students.length);
    console.log('Filtered Students:', filteredStudents.length);
    console.log('Filtered Section Assignments:', filteredSectionAssignments.length);
    console.log('Total Assignments Found:', assignmentData.length);
    console.log('Assignments with submissions:', assignmentData.filter(a => a.submittedCount > 0).length);
    console.log('Total submissions across all assignments:', assignmentData.reduce((sum, a) => sum + a.submittedCount, 0));
    console.log('Assignment Data:', assignmentData.map(a => ({
      title: a.title,
      class: a.class,
      section: a.section,
      totalStudents: a.totalStudents,
      submittedCount: a.submittedCount,
      completionRate: a.completionRate,
      submissions: a.submissions?.length || 0,
      evaluations: a.evaluations?.length || 0,
      createdAt: a.createdAt,
      submissionDetails: a.submissionDetails || []
    })));
    console.log('Class Performance Data:', classPerformance);

    // Calculate student progress distribution based on all students, not just those with attendance records
    const allStudentsProgress = await Promise.all(filteredStudents.map(async (student) => {
      const attendanceRecord = await Attendance.aggregate([
        {
          $match: {
            student: student._id,
            date: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: null,
            presentDays: { $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] } },
            totalDays: { $sum: 1 }
          }
        }
      ]);
      
      const attendanceRate = attendanceRecord.length > 0 && attendanceRecord[0].totalDays > 0
        ? Math.round((attendanceRecord[0].presentDays / attendanceRecord[0].totalDays) * 100)
        : 0;
      
      return {
        studentId: student._id,
        attendanceRate
      };
    }));

    const studentProgress = [
      { name: "Excellent (90%+)", value: allStudentsProgress.filter(s => s.attendanceRate >= 90).length },
      { name: "Good (80-89%)", value: allStudentsProgress.filter(s => s.attendanceRate >= 80 && s.attendanceRate < 90).length },
      { name: "Average (70-79%)", value: allStudentsProgress.filter(s => s.attendanceRate >= 70 && s.attendanceRate < 80).length },
      { name: "Needs Improvement (<70%)", value: allStudentsProgress.filter(s => s.attendanceRate < 70).length }
    ];

    // Monthly assignment statistics
    const monthlyStats = assignmentData.reduce((acc, assignment) => {
      const month = new Date(assignment.createdAt).toLocaleDateString('en-US', { month: 'short' });
      const existing = acc.find(item => item.month === month);
      
      if (existing) {
        existing.created += 1;
        existing.submitted += assignment.submittedCount;
        existing.completionRate = Math.round((existing.submitted / (existing.created * totalStudents)) * 100);
      } else {
        acc.push({
          month,
          created: 1,
          submitted: assignment.submittedCount,
          completionRate: Math.round((assignment.submittedCount / totalStudents) * 100)
        });
      }
      
      return acc;
    }, []);

    // No dummy data - only show real assignment statistics


    const responseData = {
      overview: {
        totalStudents,
        averageAttendance,
        assignmentsCreated,
        pendingEvaluations,
        assignedClasses: assignedClasses,
        topStudents,
        academicYear
      },
      attendanceData,
      classPerformance,
      studentProgress,
      assignmentStats: monthlyStats,
      attendanceTrends,
      classComparison: classPerformance
    };

    // Debug logging
    console.log('Assignment Stats:', monthlyStats);
    console.log('Student Progress:', studentProgress);
    console.log('Total Students:', totalStudents);

    res.status(200).json({
      success: true,
      data: responseData
    });

  } catch (error) {
    console.error("Error in getTeacherAnalyticsDashboard:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
  }
};

// Get comprehensive dashboard summary with all analytics
export const getDashboardSummary = async (req, res) => {
  try {
    const academicYear = getAcademicYear();
    const today = new Date();
    const todayStart = new Date(today.setHours(0, 0, 0, 0));
    const yesterday = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    const [
      // Basic counts
      totalStudents,
      totalTeachers,
      totalParents,
      pendingAdmissions,
      upcomingEvents,
      recentPayments,
      attendanceToday,
      totalFeeCollected,
      pendingOfflinePayments,
      
      // Detailed analytics
      studentsByClass,
      studentsBySection,
      admissionTrends,
      attendanceSummary,
      feeCollectionRates,
      outstandingPayments,
      paymentMethodsAnalysis,
      recentEvents,
      admissionStatusBreakdown,
      monthlyAttendance,
      feeStructureByClass,
      lateFeeAnalytics
    ] = await Promise.all([
      // Basic counts
      Student.countDocuments(),
      Teacher.countDocuments(),
      Parent.countDocuments(),
      Admission.countDocuments({ status: { $in: ['draft', 'submitted', 'reviewed'] } }),
      Event.countDocuments({ date: { $gte: new Date() } }),
      FeePayment.countDocuments({
        status: { $in: ['paid', 'success'] },
        createdAt: { $gte: yesterday }
      }),
      Attendance.countDocuments({
        date: { $gte: todayStart },
        status: 'present'
      }),
      FeePayment.aggregate([
        { 
          $match: { 
            status: { $in: ['paid', 'success'] },
            academicYear: academicYear
          } 
        },
        { 
          $group: { 
            _id: null, 
            total: { $sum: "$amountPaid" },
            count: { $sum: 1 }
          } 
        }
      ]),
      FeePayment.countDocuments({
        status: 'pending_verification',
        paymentMethod: 'cash'
      }),
      
      // Detailed analytics
      Student.aggregate([
        { $group: { _id: "$class", count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      Student.aggregate([
        { $group: { _id: { class: "$class", section: "$section" }, count: { $sum: 1 } } },
        { $sort: { "_id.class": 1, "_id.section": 1 } }
      ]),
      Admission.aggregate([
        {
          $group: {
            _id: { $month: "$createdAt" },
            count: { $sum: 1 }
          }
        },
        { $sort: { "_id": 1 } }
      ]),
      Attendance.aggregate([
        {
          $lookup: {
            from: "students",
            localField: "student",
            foreignField: "_id",
            as: "studentInfo"
          }
        },
        { $unwind: "$studentInfo" },
        {
          $group: {
            _id: "$studentInfo.class",
            totalDays: { $sum: 1 },
            presentDays: { $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] } },
            absentDays: { $sum: { $cond: [{ $eq: ["$status", "absent"] }, 1, 0] } }
          }
        },
        {
          $addFields: {
            attendanceRate: { $multiply: [{ $divide: ["$presentDays", "$totalDays"] }, 100] }
          }
        },
        { $sort: { "_id": 1 } }
      ]),
      FeePayment.aggregate([
        { 
          $match: { 
            $expr: { $eq: [{ $year: "$createdAt" }, today.getFullYear()] },
            status: { $in: ["paid", "success"] },
            academicYear: academicYear
          } 
        },
        {
          $group: {
            _id: { $month: "$createdAt" },
            totalCollected: { $sum: "$amountPaid" },
            totalLateFees: { $sum: "$lateFee" },
            paymentCount: { $sum: 1 }
          }
        },
        { $sort: { "_id": 1 } }
      ]),
      FeePayment.aggregate([
        { 
          $match: { 
            status: { $in: ["pending", "failed"] },
            academicYear: academicYear
          } 
        },
        {
          $lookup: {
            from: "students",
            localField: "student",
            foreignField: "_id",
            as: "studentInfo"
          }
        },
        { $unwind: "$studentInfo" },
        {
          $lookup: {
            from: "parents",
            localField: "parent",
            foreignField: "_id",
            as: "parentInfo"
          }
        },
        { $unwind: "$parentInfo" },
        {
          $group: {
            _id: "$student",
            studentName: { $first: "$studentInfo.name" },
            studentClass: { $first: "$studentInfo.class" },
            studentSection: { $first: "$studentInfo.section" },
            parentName: { $first: "$parentInfo.name" },
            parentEmail: { $first: "$parentInfo.email" },
            totalOutstanding: { $sum: "$amountPaid" },
            lastPaymentDate: { $max: "$createdAt" }
          }
        },
        { $sort: { totalOutstanding: -1 } },
        { $limit: 10 }
      ]),
      FeePayment.aggregate([
        { 
          $match: { 
            $expr: { $eq: [{ $year: "$createdAt" }, today.getFullYear()] },
            status: { $in: ["paid", "success"] },
            academicYear: academicYear
          } 
        },
        {
          $group: {
            _id: "$paymentMethod",
            totalAmount: { $sum: "$amountPaid" },
            paymentCount: { $sum: 1 }
          }
        },
        { $sort: { totalAmount: -1 } }
      ]),
      Event.find({ date: { $gte: new Date() } })
        .sort({ date: 1 })
        .limit(5)
        .select('title description date time location category')
        .lean(),
      Admission.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 }
          }
        }
      ]),
      Attendance.aggregate([
        {
          $match: {
            date: { $gte: thisMonth }
          }
        },
        {
          $group: {
            _id: { $dayOfMonth: "$date" },
            present: { $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] } },
            absent: { $sum: { $cond: [{ $eq: ["$status", "absent"] }, 1, 0] } }
          }
        },
        { $sort: { "_id": 1 } }
      ]),
      FeeStructure.aggregate([
        { $match: { academicYear } },
        {
          $group: {
            _id: "$class",
            totalFee: { $first: "$totalFee" },
            sectionCount: { $sum: 1 }
          }
        },
        { $sort: { "_id": 1 } }
      ]),
      FeePayment.aggregate([
        { 
          $match: { 
            $expr: { $eq: [{ $year: "$createdAt" }, today.getFullYear()] },
            lateFee: { $gt: 0 },
            academicYear: academicYear
          } 
        },
        {
          $group: {
            _id: { $month: "$createdAt" },
            totalLateFees: { $sum: "$lateFee" },
            latePaymentCount: { $sum: 1 }
          }
        },
        { $sort: { "_id": 1 } }
      ])
    ]);
    
    const feeStats = totalFeeCollected[0] || { total: 0, count: 0 };
    
    // Format data for charts
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    
    const formattedAdmissionTrends = months.map((month, index) => {
      const found = admissionTrends.find(item => item._id === index + 1);
      return { month, count: found ? found.count : 0 };
    });
    
    const formattedFeeCollectionRates = months.map((month, index) => {
      const found = feeCollectionRates.find(item => item._id === index + 1);
      return {
        month,
        totalCollected: found ? found.totalCollected : 0,
        totalLateFees: found ? found.totalLateFees : 0,
        paymentCount: found ? found.paymentCount : 0
      };
    });
    
    const formattedStudentsByClass = studentsByClass.map(item => ({
      name: item._id || 'Unknown',
      count: item.count,
      value: item.count
    }));
    
    const formattedPaymentMethods = paymentMethodsAnalysis.map(item => ({
      name: item._id === 'online' ? 'Online Payment' : 
            item._id === 'cash' ? 'Cash Payment' : 
            item._id === 'cheque' ? 'Cheque Payment' : 
            item._id === 'bank_transfer' ? 'Bank Transfer' : 
            item._id || 'Unknown',
      totalAmount: item.totalAmount,
      paymentCount: item.paymentCount
    }));
    
    res.status(200).json({
      success: true,
      data: {
        // Basic metrics
        totalStudents,
        totalTeachers,
        totalParents,
        pendingAdmissions,
        upcomingEvents,
        recentPayments,
        attendanceToday,
        totalFeeCollected: feeStats.total,
        totalFeePayments: feeStats.count,
        pendingOfflinePayments,
        academicYear,
        
        // Chart data
        studentsByClass: formattedStudentsByClass,
        studentsBySection,
        admissionTrends: formattedAdmissionTrends,
        attendanceSummary,
        feeCollectionRates: formattedFeeCollectionRates,
        outstandingPayments,
        paymentMethodsAnalysis: formattedPaymentMethods,
        recentEvents,
        admissionStatusBreakdown,
        monthlyAttendance,
        feeStructureByClass,
        lateFeeAnalytics,
        
        // Additional computed metrics
        collectionRate: feeStats.total > 0 ? 
          ((feeStats.total / (feeStats.total + (outstandingPayments.reduce((sum, payment) => sum + (payment.totalOutstanding || 0), 0)))) * 100).toFixed(1) : 0,
        averageAttendance: attendanceSummary?.length > 0 ? 
          (attendanceSummary.reduce((sum, item) => sum + (item.attendanceRate || 0), 0) / attendanceSummary.length).toFixed(1) : 0,
        totalRevenue: feeStats.total + outstandingPayments.reduce((sum, payment) => sum + (payment.totalOutstanding || 0), 0),
        studentGrowthRate: formattedAdmissionTrends.reduce((sum, month) => sum + (month.count || 0), 0)
      }
    });
  } catch (error) {
    console.error("Error in getDashboardSummary:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

