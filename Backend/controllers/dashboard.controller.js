import Student from "../models/student.model.js";
import Teacher from "../models/teacher.model.js";
import Parent from "../models/parent.model.js";
import FeePayment from "../models/feePayment.model.js";
import Attendance from "../models/attendance.model.js";
import Event from "../models/event.model.js";
import Admission from "../models/admission.model.js";
import User from "../models/user.model.js";
import mongoose from "mongoose";

// ===========================================
// COMPREHENSIVE DASHBOARD ANALYTICS
// ===========================================

// Get comprehensive dashboard data
export const getDashboardAnalytics = async (req, res) => {
  try {
    const academicYear = req.query.academicYear || new Date().getFullYear();
    
    // Get all basic counts
    const [
      totalStudents,
      totalTeachers,
      totalParents,
      totalEmployees,
      totalAdmissions,
      totalEvents
    ] = await Promise.all([
      Student.countDocuments(),
      Teacher.countDocuments(),
      Parent.countDocuments(),
      User.countDocuments({ role: { $in: ['teacher', 'admin', 'librarian'] } }),
      Admission.countDocuments({ academicYear }),
      Event.countDocuments()
    ]);

    // Get students by class
    const studentsByClass = await Student.aggregate([
      {
        $group: {
          _id: "$class",
          count: { $sum: 1 },
          boys: {
            $sum: {
              $cond: [{ $eq: ["$gender", "male"] }, 1, 0]
            }
          },
          girls: {
            $sum: {
              $cond: [{ $eq: ["$gender", "female"] }, 1, 0]
            }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get attendance data for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayAttendance = await Attendance.aggregate([
      {
        $match: {
          date: { $gte: today, $lt: tomorrow }
        }
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]);

    // Get financial data
    const financialData = await FeePayment.aggregate([
      {
        $group: {
          _id: null,
          totalCollected: { $sum: "$amountPaid" },
          totalLateFees: { $sum: "$lateFee" },
          totalPayments: { $sum: 1 }
        }
      }
    ]);

    // Get monthly fee collection trends
    const monthlyFeeData = await FeePayment.aggregate([
      {
        $group: {
          _id: {
            year: { $year: "$paymentDate" },
            month: { $month: "$paymentDate" }
          },
          totalCollected: { $sum: "$amountPaid" },
          totalLateFees: { $sum: "$lateFee" },
          paymentCount: { $sum: 1 }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);

    // Get today's financial data
    const todayFinancial = await FeePayment.aggregate([
      {
        $match: {
          paymentDate: { $gte: today, $lt: tomorrow }
        }
      },
      {
        $group: {
          _id: null,
          todayIncome: { $sum: "$amountPaid" },
          todayLateFees: { $sum: "$lateFee" }
        }
      }
    ]);

    // Get monthly financial data
    const currentMonth = new Date();
    const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);

    const monthlyFinancial = await FeePayment.aggregate([
      {
        $match: {
          paymentDate: { $gte: monthStart, $lte: monthEnd }
        }
      },
      {
        $group: {
          _id: null,
          monthlyIncome: { $sum: "$amountPaid" },
          monthlyLateFees: { $sum: "$lateFee" }
        }
      }
    ]);

    // Get birthday data
    const todayBirthdays = await Student.aggregate([
      {
        $match: {
          $expr: {
            $and: [
              { $eq: [{ $dayOfMonth: "$birthDate" }, today.getDate()] },
              { $eq: [{ $month: "$birthDate" }, today.getMonth() + 1] }
            ]
          }
        }
      },
      { $count: "count" }
    ]);

    const staffBirthdays = await User.aggregate([
      {
        $match: {
          $expr: {
            $and: [
              { $eq: [{ $dayOfMonth: "$birthDate" }, today.getDate()] },
              { $eq: [{ $month: "$birthDate" }, today.getMonth() + 1] }
            ]
          }
        }
      },
      { $count: "count" }
    ]);

    // Get teacher breakdown
    const teacherBreakdown = await User.aggregate([
      {
        $match: { role: { $in: ['teacher', 'admin', 'librarian'] } }
      },
      {
        $group: {
          _id: "$role",
          count: { $sum: 1 }
        }
      }
    ]);

    // Format data for frontend
    const formattedStudentsByClass = studentsByClass.map(item => ({
      name: item._id || 'Unknown',
      count: item.count,
      boys: item.boys || 0,
      girls: item.girls || 0
    }));

    // Format monthly fee data
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const formattedMonthlyFeeData = months.map((month, index) => {
      const found = monthlyFeeData.find(item => item._id.month === index + 1);
      return {
        month,
        totalCollected: found ? found.totalCollected : 0,
        totalLateFees: found ? found.totalLateFees : 0,
        paymentCount: found ? found.paymentCount : 0
      };
    });

    // Calculate attendance summary
    const attendanceSummary = {
      totalPresent: todayAttendance.find(item => item._id === 'present')?.count || 0,
      totalAbsent: todayAttendance.find(item => item._id === 'absent')?.count || 0,
      totalLate: todayAttendance.find(item => item._id === 'late')?.count || 0,
      notMarked: totalStudents - (todayAttendance.reduce((sum, item) => sum + item.count, 0))
    };

    // Calculate financial summary
    const financialSummary = {
      totalCollected: financialData[0]?.totalCollected || 0,
      totalLateFees: financialData[0]?.totalLateFees || 0,
      totalPayments: financialData[0]?.totalPayments || 0,
      todayIncome: todayFinancial[0]?.todayIncome || 0,
      todayLateFees: todayFinancial[0]?.todayLateFees || 0,
      monthlyIncome: monthlyFinancial[0]?.monthlyIncome || 0,
      monthlyLateFees: monthlyFinancial[0]?.monthlyLateFees || 0
    };

    // Calculate teacher breakdown
    const teacherSummary = {
      teachers: teacherBreakdown.find(item => item._id === 'teacher')?.count || 0,
      admins: teacherBreakdown.find(item => item._id === 'admin')?.count || 0,
      librarians: teacherBreakdown.find(item => item._id === 'librarian')?.count || 0,
      otherStaff: teacherBreakdown.find(item => !['teacher', 'admin', 'librarian'].includes(item._id))?.count || 0
    };

    res.status(200).json({
      success: true,
      data: {
        // Basic counts
        totalStudents,
        totalTeachers,
        totalParents,
        totalEmployees,
        totalAdmissions,
        totalEvents,
        
        // Student data
        studentsByClass: formattedStudentsByClass,
        
        // Attendance data
        attendanceSummary,
        
        // Financial data
        financialSummary,
        monthlyFeeData: formattedMonthlyFeeData,
        
        // Birthday data
        todayStudentBirthdays: todayBirthdays[0]?.count || 0,
        todayStaffBirthdays: staffBirthdays[0]?.count || 0,
        
        // Staff breakdown
        teacherSummary,
        
        // Academic year
        academicYear
      }
    });

  } catch (error) {
    console.error("Error in getDashboardAnalytics:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};

// Get income vs expense data
export const getIncomeExpenseData = async (req, res) => {
  try {
    const days = req.query.days || 10;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get income data (fee payments)
    const incomeData = await FeePayment.aggregate([
      {
        $match: {
          paymentDate: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: "$paymentDate" },
            month: { $month: "$paymentDate" },
            day: { $dayOfMonth: "$paymentDate" }
          },
          income: { $sum: "$amountPaid" },
          lateFees: { $sum: "$lateFee" }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } }
    ]);

    // Format data for charts
    const formattedData = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      
      const dayData = incomeData.find(item => 
        item._id.day === date.getDate() && 
        item._id.month === date.getMonth() + 1
      );
      
      formattedData.push({
        date: date.toISOString().split('T')[0],
        day: date.getDate(),
        month: date.toLocaleDateString('en-US', { month: 'short' }),
        income: dayData ? dayData.income : 0,
        expense: 0, // You can add expense tracking later
        lateFees: dayData ? dayData.lateFees : 0
      });
    }

    res.status(200).json({
      success: true,
      data: formattedData
    });

  } catch (error) {
    console.error("Error in getIncomeExpenseData:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};

// Get attendance inspection data
export const getAttendanceInspectionData = async (req, res) => {
  try {
    const days = req.query.days || 7;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get student attendance data
    const studentAttendance = await Attendance.aggregate([
      {
        $match: {
          date: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: "$date" },
            month: { $month: "$date" },
            day: { $dayOfMonth: "$date" }
          },
          studentCount: { $sum: 1 }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } }
    ]);

    // Get teacher attendance data
    const teacherAttendance = await mongoose.model('TeacherAttendance').aggregate([
      {
        $match: {
          date: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: "$date" },
            month: { $month: "$date" },
            day: { $dayOfMonth: "$date" }
          },
          teacherCount: { $sum: 1 }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } }
    ]);

    // Format data for charts
    const formattedData = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      
      const studentData = studentAttendance.find(item => 
        item._id.day === date.getDate() && 
        item._id.month === date.getMonth() + 1
      );
      
      const teacherData = teacherAttendance.find(item => 
        item._id.day === date.getDate() && 
        item._id.month === date.getMonth() + 1
      );
      
      formattedData.push({
        date: date.toISOString().split('T')[0],
        day: date.getDate(),
        month: date.toLocaleDateString('en-US', { month: 'short' }),
        students: studentData ? studentData.studentCount : 0,
        teachers: teacherData ? teacherData.teacherCount : 0
      });
    }

    res.status(200).json({
      success: true,
      data: formattedData
    });

  } catch (error) {
    console.error("Error in getAttendanceInspectionData:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};

// Get annual fee summary
export const getAnnualFeeSummary = async (req, res) => {
  try {
    const year = req.query.year || new Date().getFullYear();
    
    const feeData = await FeePayment.aggregate([
      {
        $match: {
          $expr: {
            $eq: [{ $year: "$paymentDate" }, year]
          }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: "$paymentDate" },
            month: { $month: "$paymentDate" }
          },
          totalCollected: { $sum: "$amountPaid" },
          totalLateFees: { $sum: "$lateFee" },
          paymentCount: { $sum: 1 }
        }
      },
      { $sort: { "_id.month": 1 } }
    ]);

    // Format data for charts
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const formattedData = months.map((month, index) => {
      const found = feeData.find(item => item._id.month === index + 1);
      return {
        month,
        totalCollected: found ? found.totalCollected : 0,
        totalLateFees: found ? found.totalLateFees : 0,
        paymentCount: found ? found.paymentCount : 0
      };
    });

    // Calculate totals
    const totals = {
      totalDues: 0, // You can calculate this based on fee structure
      totalCollected: feeData.reduce((sum, item) => sum + item.totalCollected, 0),
      totalRemaining: 0 // Calculate based on dues - collected
    };

    res.status(200).json({
      success: true,
      data: {
        monthlyData: formattedData,
        totals
      }
    });

  } catch (error) {
    console.error("Error in getAnnualFeeSummary:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};
