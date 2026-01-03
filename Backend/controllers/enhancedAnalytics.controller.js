import FeePayment from "../models/feePayment.model.js";
import FeeStructure from "../models/FeeStructure.model.js";
import CustomFee from "../models/customFee.model.js";
import Student from "../models/student.model.js";
import Parent from "../models/parent.model.js";
import Teacher from "../models/teacher.model.js";
import Attendance from "../models/attendance.model.js";
import TeacherAttendance from "../models/TeacherAttendance.js";
import { getAcademicYear } from "../config/appConfig.js";
import { getCurrentAcademicYear, isValidAcademicYear, getPreviousAcademicYear, getNextAcademicYear } from "../utils/academicYear.js";
import { cache, cacheKeys, invalidateCache } from "../lib/redis.js";

// 🔧 Utility – always build day range in UTC to avoid timezone drift
const getUtcDayRange = (date) => {
  const start = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    0, 0, 0, 0
  ));

  const end = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    23, 59, 59, 999
  ));

  return { start, end };
};

// 🗑️ CACHE INVALIDATION FUNCTIONS
export const invalidateAnalyticsCache = async (type = 'all', academicYear = '') => {
  try {
    console.log(`🗑️ Invalidating analytics cache for type: ${type}, academicYear: ${academicYear}`);
    
    switch (type) {
      case 'dashboard':
        await invalidateCache.dashboard(academicYear);
        break;
      case 'attendance':
        await invalidateCache.attendance();
        break;
      case 'fees':
        await invalidateCache.fees();
        break;
      case 'performance':
        await invalidateCache.performance();
        break;
      case 'all':
      default:
        await invalidateCache.analytics();
        break;
    }
    
    console.log(`✅ Analytics cache invalidated successfully for type: ${type}`);
    return true;
  } catch (error) {
    console.error('❌ Error invalidating analytics cache:', error);
    return false;
  }
};

// 📊 COMPREHENSIVE DASHBOARD ANALYTICS
export const getComprehensiveDashboardAnalytics = async (req, res) => {
  try {
    // Get academic year from query parameter, or use current academic year as default
    const requestedAcademicYear = req.query.academicYear;
    const academicYear = (requestedAcademicYear && isValidAcademicYear(requestedAcademicYear)) 
      ? requestedAcademicYear 
      : getCurrentAcademicYear();
    
    console.log("📊 Dashboard Analytics - Academic Year:", {
      requested: requestedAcademicYear,
      using: academicYear,
      isValid: requestedAcademicYear ? isValidAcademicYear(requestedAcademicYear) : 'N/A'
    });
    
    const { date } = req.query; // Get date from query parameter
    
    // Use provided date or default to today
    const targetDate = date ? new Date(date) : new Date();
    const today = targetDate;
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    // Generate cache key for this request
    const cacheKey = cacheKeys.analytics.dashboard(date || 'today', academicYear);
    
    // Try to get cached data first
    const cachedData = await cache.get(cacheKey);
    if (cachedData) {
      console.log('📊 Serving dashboard analytics from Redis cache');
      return res.status(200).json({
        success: true,
        data: cachedData,
        cached: true,
        cacheKey: cacheKey
      });
    }
    
    console.log('📊 Generating fresh dashboard analytics data');
    
    console.log("=== DASHBOARD DATE DEBUG ===");
    console.log("Requested Date:", date);
    console.log("Target Date:", targetDate.toLocaleString());
    console.log("Target Date ISO:", targetDate.toISOString());
    
    // Get date ranges
    const startOfMonth = new Date(currentYear, currentMonth, 1);
    const startOfYear = new Date(currentYear, 0, 1);
    const lastMonth = new Date(currentYear, currentMonth - 1, 1);
    const endOfLastMonth = new Date(currentYear, currentMonth, 0);

    // 📈 BASIC COUNTS
    const totalStudents = await Student.countDocuments();
    const totalTeachers = await Teacher.countDocuments();
    const totalParents = await Parent.countDocuments();

    // 💰 REVENUE METRICS
    const totalRevenue = await FeePayment.aggregate([
      { $match: { status: "paid", academicYear } },
      { $group: { _id: null, total: { $sum: { $add: ["$amountPaid", { $ifNull: ["$lateFee", 0] }] } } } }
    ]);

    const monthlyRevenue = await FeePayment.aggregate([
      { 
        $match: { 
          status: "paid", 
          academicYear,
          paidAt: { $gte: startOfMonth }
        } 
      },
      { $group: { _id: null, total: { $sum: { $add: ["$amountPaid", { $ifNull: ["$lateFee", 0] }] } } } }
    ]);

    // 👥 ATTENDANCE METRICS (Real data from attendance models)
    // Use targetDate instead of currentDate for attendance calculations
    const currentDate = targetDate;
    const { start: startOfDay, end: endOfDay } = getUtcDayRange(currentDate);
    
   

    // Get total enrolled students count (all classes and sections)
    const totalEnrolledStudents = await Student.countDocuments();
    
    // Get today's student attendance records
    const todayStudentAttendance = await Attendance.aggregate([
      {
        $match: {
          date: { $gte: startOfDay, $lte: endOfDay }
        }
      },
      {
        $group: {
          _id: null,
          attendanceRecordsCount: { $sum: 1 },
          studentsPresent: {
            $sum: {
              $cond: [{ $eq: ["$status", "present"] }, 1, 0]
            }
          },
          studentsAbsent: {
            $sum: {
              $cond: [{ $eq: ["$status", "absent"] }, 1, 0]
            }
          }
        }
      }
    ]);

    console.log("=== STUDENT ATTENDANCE AGGREGATION DEBUG ===");
    console.log("Query Date Range:", { startOfDay, endOfDay });
    console.log("Raw Aggregation Result:", todayStudentAttendance);
    
    // Also check raw attendance records for debugging
    const rawStudentAttendance = await Attendance.find({
      date: { $gte: startOfDay, $lte: endOfDay }
    }).populate('student', 'name studentId class section');
    
    console.log("Raw Student Attendance Records:", rawStudentAttendance.length);
    if (rawStudentAttendance.length > 0) {
      console.log("Sample Records:");
      rawStudentAttendance.slice(0, 3).forEach(record => {
        console.log(`- Student: ${record.student?.name || 'Unknown'} (${record.student?.studentId || 'No ID'}), Status: ${record.status}, Date: ${record.date}`);
      });
    }
    
    // Calculate today's attendance summary
    const attendanceData = todayStudentAttendance[0] || { studentsPresent: 0, studentsAbsent: 0, attendanceRecordsCount: 0 };
    const attendanceToday = attendanceData.studentsPresent;
    const studentsAbsent = attendanceData.studentsAbsent;
    const studentsNotMarked = totalEnrolledStudents - attendanceData.attendanceRecordsCount;
    const totalMarkedToday = attendanceData.attendanceRecordsCount;
    
  
    // Get total enrolled teachers count
    const totalEnrolledTeachers = await Teacher.countDocuments();
    
    // Get today's teacher attendance records
    const todayTeacherAttendance = await TeacherAttendance.aggregate([
      {
        $match: {
          date: { $gte: startOfDay, $lte: endOfDay }
        }
      },
      {
        $group: {
          _id: null,
          attendanceRecordsCount: { $sum: 1 },
          teachersPresent: {
            $sum: {
              $cond: [{ $eq: ["$status", "present"] }, 1, 0]
            }
          },
          teachersAbsent: {
            $sum: {
              $cond: [{ $eq: ["$status", "absent"] }, 1, 0]
            }
          }
        }
      }
    ]);

    // Calculate attendance metrics
    const teacherAttendanceData = todayTeacherAttendance[0] || { teachersPresent: 0, teachersAbsent: 0, attendanceRecordsCount: 0 };
    
    // For teachers: Show present teachers from attendance records
    const teacherAttendanceToday = teacherAttendanceData.teachersPresent;
    const teachersAbsent = teacherAttendanceData.teachersAbsent;
    const teachersNotMarked = totalEnrolledTeachers - teacherAttendanceData.attendanceRecordsCount;



    // 📊 COLLECTION EFFICIENCY
    const totalExpectedFee = await Student.aggregate([
      {
        $lookup: {
          from: "feestructures",
          let: { studentClass: "$class", studentSection: "$section" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$class", "$$studentClass"] },
                    { $eq: ["$section", "$$studentSection"] },
                    { $eq: ["$academicYear", academicYear] }
                  ]
                }
              }
            }
          ],
          as: "feeStructure"
        }
      },
      {
        $group: {
          _id: null,
          totalExpected: { 
            $sum: { 
              $cond: [
                { $gt: [{ $size: "$feeStructure" }, 0] },
                { $arrayElemAt: ["$feeStructure.totalFee", 0] },
                0
              ]
            }
          }
        }
      }
    ]);

    const totalCollectedFee = totalRevenue[0]?.total || 0;
    const totalExpectedFeeAmount = totalExpectedFee[0]?.totalExpected || 0;
    
    // Safe division with validation
    const collectionEfficiency = totalExpectedFeeAmount > 0 
      ? Math.round((totalCollectedFee / totalExpectedFeeAmount) * 100)
      : 0;
    
    // Validate collection efficiency is within reasonable bounds
    const validatedCollectionEfficiency = Math.min(Math.max(collectionEfficiency, 0), 100);

    // 📈 GROWTH RATES
    const lastYearStudents = Math.floor(totalStudents * 0.88); // Mock 12% growth
    const admissionGrowthRate = totalStudents > 0 
      ? Math.round(((totalStudents - lastYearStudents) / lastYearStudents) * 100)
      : 0;

    // 📊 CHART DATA - Academic Year Aware Students By Class
    // Helper function to determine which class a student should appear in for the selected academic year
    const getStudentClassForAcademicYear = (student, targetAcademicYear) => {
      const promotionHistory = student.promotionHistory || [];
      
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
        // Student's promotion was reverted - show them in the class they were reverted to
        return revertRecord.toClass;
      }
      
      if (promotionInThisYear) {
        // Student was promoted in this year (and not reverted) - show them in their OLD class (fromClass)
        return promotionInThisYear.fromClass;
      }
      
      // Check if student was promoted in the PREVIOUS academic year (affects this year)
      const previousAcademicYear = getPreviousAcademicYear(targetAcademicYear);
      const promotionInPreviousYear = promotionHistory.find(
        p => p.academicYear === previousAcademicYear && 
             p.promotionType === 'promoted' && 
             !p.reverted
      );
      
      const revertInPreviousYear = promotionHistory.find(
        p => p.academicYear === previousAcademicYear && p.promotionType === 'reverted'
      );
      
      if (revertInPreviousYear) {
        // Promotion was reverted in previous year - show them in the class they were reverted to
        return revertInPreviousYear.toClass;
      }
      
      if (promotionInPreviousYear) {
        // Student was promoted in previous year (and not reverted) - show them in their NEW class (toClass) for this year
        return promotionInPreviousYear.toClass;
      }
      
      // No promotion affecting this year - use current class
      return student.class;
    };

    // Check if viewing future academic year (only show students with promotion/hold-back records)
    const currentAcadYear = getCurrentAcademicYear();
    // Compare academic years by extracting start year
    const currentStartYear = parseInt(currentAcadYear.split('-')[0]);
    const selectedStartYear = parseInt(academicYear.split('-')[0]);
    const isFutureAcademicYear = selectedStartYear > currentStartYear;
    
    console.log(`📊 StudentsByClass - Academic Year: ${academicYear}, Current: ${currentAcadYear}, Is Future: ${isFutureAcademicYear}`);
    
    // Fetch all students
    const allStudents = await Student.find({}).lean();
    console.log(`📊 Total students in database: ${allStudents.length}`);
    
    // Process students and determine their display class for the selected academic year
    const studentsWithDisplayClass = allStudents.map(student => {
      const displayClass = getStudentClassForAcademicYear(student, academicYear);
      const promotionHistory = student.promotionHistory || [];
      
      // Check if student has any promotion/hold-back record for the previous academic year
      // (which would affect their class in the selected academic year)
      const previousAcademicYear = getPreviousAcademicYear(academicYear);
      const hasRecordForPreviousYear = promotionHistory.some(
        p => p.academicYear === previousAcademicYear && 
             (p.promotionType === 'promoted' || p.promotionType === 'hold-back') &&
             !p.reverted
      );
      
      // Check if student has a promotion/hold-back record directly in the selected academic year
      const hasRecordForSelectedYear = promotionHistory.some(
        p => p.academicYear === academicYear && 
             (p.promotionType === 'promoted' || p.promotionType === 'hold-back') &&
             !p.reverted
      );
      
      return {
        student,
        displayClass,
        hasRecordForPreviousYear,
        hasRecordForSelectedYear
      };
    });
    
    // If viewing future academic year, ONLY show students who have promotion/hold-back records
    let filteredStudents = studentsWithDisplayClass;
    if (isFutureAcademicYear) {
      filteredStudents = studentsWithDisplayClass.filter(item => {
        // For future years, student must have a promotion/hold-back record in the previous year
        // OR a promotion/hold-back record in the selected year itself
        return item.hasRecordForPreviousYear || item.hasRecordForSelectedYear;
      });
      console.log(`📊 Filtered to ${filteredStudents.length} students with promotion records for future academic year ${academicYear} (from ${allStudents.length} total students)`);
    } else {
      // For current or past academic years, show all students
      console.log(`📊 Showing all ${filteredStudents.length} students for academic year ${academicYear}`);
    }
    
    // Group by display class
    const studentsByClassMap = new Map();
    filteredStudents.forEach(({ displayClass }) => {
      const count = studentsByClassMap.get(displayClass) || 0;
      studentsByClassMap.set(displayClass, count + 1);
    });
    
    // Convert to array format
    const studentsByClass = Array.from(studentsByClassMap.entries())
      .map(([_id, count]) => ({ _id, count }))
      .sort((a, b) => {
        // Sort: Nursery, LKG, then numeric classes
        const classOrder = { 'Nursery': 1, 'LKG': 2, 'UKG': 3 };
        const aOrder = classOrder[a._id];
        const bOrder = classOrder[b._id];
        if (aOrder !== undefined && bOrder !== undefined) return aOrder - bOrder;
        if (aOrder !== undefined) return -1;
        if (bOrder !== undefined) return 1;
        const aNum = parseInt(a._id);
        const bNum = parseInt(b._id);
        if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
        return String(a._id).localeCompare(String(b._id));
      });

    // Validate studentsByClass data
    const validatedStudentsByClass = Array.isArray(studentsByClass) ? studentsByClass : [];

    // Get fee collection data for the last 12 months to ensure we have enough data points
    const twelveMonthsAgo = new Date(currentYear, currentMonth - 11, 1);

    const feeCollectionRates = await FeePayment.aggregate([
      {
        $match: {
          status: "paid",
          academicYear,
          paidAt: { $gte: twelveMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: "$paidAt" },
            month: { $month: "$paidAt" }
          },
          totalCollected: { $sum: { $add: ["$amountPaid", { $ifNull: ["$lateFee", 0] }] } },
          paymentCount: { $sum: 1 }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);

    // Validate fee collection rates data and fill missing months
    const validatedFeeCollectionRates = Array.isArray(feeCollectionRates) ? feeCollectionRates : [];
    
    // Create a map of existing data for quick lookup
    const existingDataMap = new Map();
    validatedFeeCollectionRates.forEach(item => {
      const key = `${item._id.year}-${item._id.month}`;
      existingDataMap.set(key, item);
    });
    
    // Generate data for all months in the last 12 months
    const completeFeeCollectionData = [];
    for (let i = 11; i >= 0; i--) {
      const date = new Date(currentYear, currentMonth - i, 1);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const key = `${year}-${month}`;
      
      if (existingDataMap.has(key)) {
        const existingItem = existingDataMap.get(key);
        completeFeeCollectionData.push({
          month: `${year}-${month.toString().padStart(2, '0')}`,
          totalCollected: existingItem.totalCollected,
          paymentCount: existingItem.paymentCount || 0
        });
      } else {
        // Add zero values for months with no payments
        completeFeeCollectionData.push({
          month: `${year}-${month.toString().padStart(2, '0')}`,
          totalCollected: 0,
          paymentCount: 0
        });
      }
    }

    // 🎯 RECENT ACTIVITIES
    const recentPayments = await FeePayment.find({ status: "paid" })
      .populate("student", "name class section")
      .populate("parent", "name")
      .sort({ paidAt: -1 })
      .limit(5)
      .lean();

    const recentActivities = {
      events: [
        {
          _id: "1",
          title: "Annual Sports Day",
          location: "School Ground",
          date: new Date(),
          category: "Sports"
        },
        {
          _id: "2", 
          title: "Parent-Teacher Meeting",
          location: "Main Hall",
          date: new Date(Date.now() - 86400000),
          category: "Academic"
        }
      ],
      admissions: [],
      attendance: [],
      payments: recentPayments.map(payment => ({
        _id: payment._id,
        title: `Payment received from ${payment.parent?.name}`,
        location: `${payment.student?.class} ${payment.student?.section}`,
        date: payment.paidAt,
        category: "Payment"
      }))
    };

    // 📊 PERFORMANCE METRICS
    const performanceMetrics = {
      averageAttendanceRate: 92,
      collectionEfficiency: validatedCollectionEfficiency,
      admissionGrowthRate,
      avgTeacherAttendance: 95,
      totalRevenue: totalCollectedFee,
      studentGrowthRate: admissionGrowthRate,
      teacherPerformanceMetrics: [
        { teacherName: "Sarah Johnson", attendanceRate: 98, performanceScore: 95 },
        { teacherName: "Michael Chen", attendanceRate: 96, performanceScore: 92 },
        { teacherName: "Emily Davis", attendanceRate: 94, performanceScore: 89 }
      ]
    };

    // 📊 ATTENDANCE TRENDS
    const attendanceTrends = [
      { monthName: "Jan", attendanceRate: 88, punctualityRate: 85 },
      { monthName: "Feb", attendanceRate: 90, punctualityRate: 87 },
      { monthName: "Mar", attendanceRate: 92, punctualityRate: 89 },
      { monthName: "Apr", attendanceRate: 94, punctualityRate: 91 },
      { monthName: "May", attendanceRate: 95, punctualityRate: 93 },
      { monthName: "Jun", attendanceRate: 96, punctualityRate: 94 }
    ];

    const responseData = {
      kpis: {
        totalStudents,
        totalTeachers,
        totalParents,
        pendingAdmissions: 12,
        upcomingEvents: 8,
        recentPayments: recentPayments.length,
        // Enhanced attendance metrics
        attendanceToday,
        teacherAttendanceToday,
        studentsAbsent,
        teachersAbsent,
        studentsNotMarked,
        teachersNotMarked,
        totalEnrolledStudents,
        totalEnrolledTeachers,
        // Today's attendance summary
        totalMarkedToday,
        // Calculate attendance percentages
        attendancePercentage: totalEnrolledStudents > 0 ? Math.round((attendanceToday / totalEnrolledStudents) * 100) : 0,
        teacherAttendancePercentage: totalEnrolledTeachers > 0 ? Math.round((teacherAttendanceToday / totalEnrolledTeachers) * 100) : 0,
        // Marked attendance percentage (of total students)
        markedAttendancePercentage: totalEnrolledStudents > 0 ? Math.round((totalMarkedToday / totalEnrolledStudents) * 100) : 0,
        // Financial metrics
        totalFeeCollected: totalCollectedFee,
        monthlyFeeCollected: monthlyRevenue[0]?.total || 0,
        weeklyFeeCollected: Math.floor(totalCollectedFee / 52),
        pendingOfflinePayments: await FeePayment.countDocuments({ 
          status: "pending_verification",
          paymentMethod: "cash",
          academicYear
        }),
        averageAttendanceRate: 92,
        collectionEfficiency: validatedCollectionEfficiency,
        admissionGrowthRate,
        avgTeacherAttendance: 95
      },
      charts: {
        studentsByClass: validatedStudentsByClass.map(item => ({
          name: `Grade ${item._id}`,
          count: item.count,
          value: item.count
        })),
        studentsBySection: [],
        admissionTrends: [],
        attendanceSummary: [],
        feeCollectionRates: completeFeeCollectionData,
        outstandingPayments: [],
        paymentMethodsAnalysis: [],
        lateFeeAnalytics: [],
        teacherWorkload: [],
        teacherAttendanceSummary: []
      },
      recentActivities,
      performance: performanceMetrics,
      attendanceTrends,
      academicYear
    };

    // Cache the response data for 5 minutes (300 seconds)
    await cache.set(cacheKey, responseData, 300);
    console.log('📊 Dashboard analytics data cached successfully');

    res.status(200).json({
      success: true,
      data: responseData,
      cached: false,
      cacheKey: cacheKey
    });
  } catch (error) {
    console.error("Comprehensive dashboard error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch comprehensive dashboard data",
      error: error.message
    });
  }
};

// 📊 REAL-TIME UPDATES
export const getRealTimeDashboardUpdates = async (req, res) => {
  try {
    // Get academic year from query parameter, or use current academic year as default
    const requestedAcademicYear = req.query.academicYear;
    const academicYear = (requestedAcademicYear && isValidAcademicYear(requestedAcademicYear)) 
      ? requestedAcademicYear 
      : getCurrentAcademicYear();
    const { date } = req.query; // Get date from query parameter
    
    // Use provided date or default to today
    const targetDate = date ? new Date(date) : new Date();
    const today = targetDate;
    const { start: startOfDay, end: endOfDay } = getUtcDayRange(today);

    // Generate cache key for real-time data (shorter TTL for real-time data)
    const cacheKey = cacheKeys.analytics.realTime(date || 'today', academicYear);
    
    // Try to get cached data first (shorter cache for real-time data)
    const cachedData = await cache.get(cacheKey);
    if (cachedData) {
      console.log('⚡ Serving real-time updates from Redis cache');
      return res.status(200).json({
        success: true,
        data: cachedData,
        cached: true,
        cacheKey: cacheKey
      });
    }
    
    console.log('⚡ Generating fresh real-time updates data');

    console.log("=== REAL-TIME UPDATES DEBUG ===");
    console.log("Requested Date:", date);
    console.log("Target Date:", targetDate.toLocaleString());
    console.log("Start of Day (Local):", startOfDay);
    console.log("End of Day (Local):", endOfDay);
    console.log("Start of Day (UTC):", startOfDay.toISOString());
    console.log("End of Day (UTC):", endOfDay.toISOString());

    // Real-time metrics
    const recentPayments = await FeePayment.countDocuments({
      status: "paid",
      academicYear,
      paidAt: { $gte: startOfDay }
    });

    // Get real-time attendance data with proper date range
    const realTimeStudentAttendance = await Attendance.aggregate([
      {
        $match: {
          date: { $gte: startOfDay, $lte: endOfDay }
        }
      },
      {
        $group: {
          _id: null,
          attendanceRecordsCount: { $sum: 1 },
          studentsPresent: {
            $sum: {
              $cond: [{ $eq: ["$status", "present"] }, 1, 0]
            }
          },
          studentsAbsent: {
            $sum: {
              $cond: [{ $eq: ["$status", "absent"] }, 1, 0]
            }
          }
        }
      }
    ]);

    const realTimeTeacherAttendance = await TeacherAttendance.aggregate([
      {
        $match: {
          date: { $gte: startOfDay, $lte: endOfDay }
        }
      },
      {
        $group: {
          _id: null,
          attendanceRecordsCount: { $sum: 1 },
          teachersPresent: {
            $sum: {
              $cond: [{ $eq: ["$status", "present"] }, 1, 0]
            }
          },
          teachersAbsent: {
            $sum: {
              $cond: [{ $eq: ["$status", "absent"] }, 1, 0]
            }
          }
        }
      }
    ]);

    // Enhanced real-time attendance calculation
    const totalEnrolledStudents = await Student.countDocuments();
    const totalEnrolledTeachers = await Teacher.countDocuments();
    
    const attendanceData = realTimeStudentAttendance[0] || { studentsPresent: 0, studentsAbsent: 0, attendanceRecordsCount: 0 };
    const teacherAttendanceData = realTimeTeacherAttendance[0] || { teachersPresent: 0, teachersAbsent: 0, attendanceRecordsCount: 0 };
    
    const attendanceToday = attendanceData.studentsPresent;
    const teacherAttendanceToday = teacherAttendanceData.teachersPresent;
    const studentsAbsent = attendanceData.studentsAbsent;
    const teachersAbsent = teacherAttendanceData.teachersAbsent;
    const studentsNotMarked = totalEnrolledStudents - attendanceData.attendanceRecordsCount;
    const teachersNotMarked = totalEnrolledTeachers - teacherAttendanceData.attendanceRecordsCount;
    const pendingOfflinePayments = await FeePayment.countDocuments({
      status: "pending_verification",
      paymentMethod: "cash",
      academicYear
    });

    const responseData = {
      recentPayments,
      // Enhanced attendance metrics
      attendanceToday,
      teacherAttendanceToday,
      studentsAbsent,
      teachersAbsent,
      studentsNotMarked,
      teachersNotMarked,
      totalEnrolledStudents,
      totalEnrolledTeachers,
      // Calculate attendance percentages
      attendancePercentage: totalEnrolledStudents > 0 ? Math.round((attendanceToday / totalEnrolledStudents) * 100) : 0,
      teacherAttendancePercentage: totalEnrolledTeachers > 0 ? Math.round((teacherAttendanceToday / totalEnrolledTeachers) * 100) : 0,
      pendingOfflinePayments,
      timestamp: new Date()
    };

    // Cache the response data for 1 minute (60 seconds) - shorter TTL for real-time data
    await cache.set(cacheKey, responseData, 60);
    console.log('⚡ Real-time updates data cached successfully');

    res.status(200).json({
      success: true,
      data: responseData,
      cached: false,
      cacheKey: cacheKey
    });
  } catch (error) {
    console.error("Real-time updates error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch real-time updates" 
    });
  }
};

// 🚨 REAL-TIME ALERTS
export const getRealTimeAlerts = async (req, res) => {
  try {
    const academicYear = getAcademicYear();
    
    // Generate mock alerts based on real data
    const alerts = [];
    
    // Check for overdue payments
    const overduePayments = await FeePayment.aggregate([
      {
        $lookup: {
          from: "students",
          localField: "student",
          foreignField: "_id",
          as: "studentData"
        }
      },
      {
        $lookup: {
          from: "feestructures",
          let: { studentClass: { $arrayElemAt: ["$studentData.class", 0] }, studentSection: { $arrayElemAt: ["$studentData.section", 0] } },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$class", "$$studentClass"] },
                    { $eq: ["$section", "$$studentSection"] },
                    { $eq: ["$academicYear", academicYear] }
                  ]
                }
              }
            }
          ],
          as: "feeStructure"
        }
      },
      {
        $match: {
          "feeStructure.dueDate": { $lt: new Date() },
          status: { $ne: "paid" }
        }
      },
      { $limit: 3 }
    ]);

    overduePayments.forEach(payment => {
      alerts.push({
        id: `overdue-${payment._id}`,
        title: "Overdue Payment Alert",
        message: `Payment overdue for ${payment.studentData[0]?.name || 'Student'}`,
        severity: "high",
        timestamp: new Date(),
        type: "payment"
      });
    });

    // Check for pending offline payments
    const pendingOffline = await FeePayment.countDocuments({
      status: "pending_verification",
      paymentMethod: "cash",
      academicYear
    });

    if (pendingOffline > 0) {
      alerts.push({
        id: "pending-offline",
        title: "Pending Offline Payments",
        message: `${pendingOffline} offline payments require verification`,
        severity: "medium",
        timestamp: new Date(),
        type: "verification"
      });
    }

    // Mock system alerts
    alerts.push({
      id: "system-health",
      title: "System Performance",
      message: "All systems running optimally",
      severity: "low",
      timestamp: new Date(),
      type: "system"
    });

    const summary = {
      totalAlerts: alerts.length,
      highPriority: alerts.filter(a => a.severity === 'high').length,
      mediumPriority: alerts.filter(a => a.severity === 'medium').length,
      lowPriority: alerts.filter(a => a.severity === 'low').length
    };

    res.status(200).json({
      success: true,
      data: {
        alerts,
        summary,
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error("Real-time alerts error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch real-time alerts" 
    });
  }
};

// 💰 INCOME VS EXPENSE DATA
export const getFeeCollectionStatusData = async (req, res) => {
  try {
    const { days = 10, class: filterClass, section: filterSection } = req.query;
    // Get academic year from query parameter, or use current academic year as default
    const requestedAcademicYear = req.query.academicYear;
    const academicYear = (requestedAcademicYear && isValidAcademicYear(requestedAcademicYear)) 
      ? requestedAcademicYear 
      : getCurrentAcademicYear();
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (days * 24 * 60 * 60 * 1000));

    // Generate cache key for fee collection data
    const filters = { days, class: filterClass, section: filterSection, academicYear };
    const cacheKey = cacheKeys.analytics.feeCollection(filters);
    
    // Try to get cached data first
    const cachedData = await cache.get(cacheKey);
    if (cachedData) {
      console.log('💰 Serving fee collection data from Redis cache');
      return res.status(200).json({
        success: true,
        data: cachedData,
        cached: true,
        cacheKey: cacheKey
      });
    }
    
    console.log('💰 Generating fresh fee collection data');

    console.log("Fee collection filters:", { days, filterClass, filterSection, academicYear });
    console.log("Applied filters - Class:", filterClass || "All", "Section:", filterSection || "All");

    // Get total amount due from fee structures (sum all totalFee values)
    const feeStructures = await FeeStructure.find({ academicYear }).lean();
    
    // Filter fee structures based on selected filters
    let filteredFeeStructures = feeStructures;
    if (filterClass || filterSection) {
      console.log("Filtering fee structures with:", { filterClass, filterSection });
      filteredFeeStructures = feeStructures.filter(fs => {
        const classMatch = !filterClass || fs.class === filterClass;
        const sectionMatch = !filterSection || fs.section === filterSection;
        const matches = classMatch && sectionMatch;
        console.log(`Fee Structure ${fs.class}-${fs.section}: classMatch=${classMatch}, sectionMatch=${sectionMatch}, matches=${matches}`);
        return matches;
      });
    }
    
    // Get student counts for each class-section (for display purposes only)
    const studentCounts = await Student.aggregate([
      {
        $match: {
          ...(filterClass && { class: filterClass }),
          ...(filterSection && { section: filterSection })
        }
      },
      {
        $group: {
          _id: { class: "$class", section: "$section" },
          studentCount: { $sum: 1 }
        }
      }
    ]);
    
    console.log("Student counts by class-section:", studentCounts);
    
    // Debug: Check if there are any students at all
    const totalStudents = await Student.countDocuments();
    console.log("Total students in database:", totalStudents);
    
    // Debug: Get sample students to see their structure
    const sampleStudents = await Student.find({}).limit(3).lean();
    console.log("Sample students:", sampleStudents);
    
    // Debug: Check students with specific class-section combinations
    const studentsInClass5C = await Student.find({ class: "5", section: "C" }).lean();
    const studentsInClass10A = await Student.find({ class: "10", section: "A" }).lean();
    const studentsInClass5D = await Student.find({ class: "5", section: "D" }).lean();
    
    console.log("Students in Class 5-C:", studentsInClass5C.length, studentsInClass5C);
    console.log("Students in Class 10-A:", studentsInClass10A.length, studentsInClass10A);
    console.log("Students in Class 5-D:", studentsInClass5D.length, studentsInClass5D);
    
    // Calculate total amount due - FeeStructure.totalFee is the fee per student
    let totalAmountDue = 0;
    const classSectionDetails = [];
    
    filteredFeeStructures.forEach(feeStructure => {
      // Find student count for this class-section
      const studentData = studentCounts.find(sc => 
        sc._id.class === feeStructure.class && sc._id.section === feeStructure.section
      );
      const studentCount = studentData ? studentData.studentCount : 0;
      
      // Calculate total amount due for this class-section (fee per student × number of students)
      const classSectionTotal = feeStructure.totalFee * studentCount;
      totalAmountDue += classSectionTotal;
      
      classSectionDetails.push({
        class: feeStructure.class,
        section: feeStructure.section,
        feePerStudent: feeStructure.totalFee,
        studentCount: studentCount,
        totalAmount: classSectionTotal
      });
      
      console.log(`Class ${feeStructure.class}-${feeStructure.section}: ₹${feeStructure.totalFee} per student × ${studentCount} students = ₹${classSectionTotal}`);
    });
    
    console.log("Fee structures found:", feeStructures.length);
    console.log("Filtered fee structures:", filteredFeeStructures.length);
    console.log("Class-section details:", classSectionDetails);
    console.log("Total amount due calculated:", totalAmountDue);

    // Get unique classes and sections from fee structures for filter options
    const uniqueClasses = [...new Set(feeStructures.map(fs => fs.class))].sort();
    const uniqueSections = [...new Set(feeStructures.map(fs => fs.section))].sort();
    
    console.log("Available classes for filtering:", uniqueClasses);
    console.log("Available sections for filtering:", uniqueSections);

    // Build match conditions for payments
    const paymentMatch = {
      status: "paid",
      academicYear
      // Remove date range filter temporarily to debug
      // paidAt: { $gte: startDate, $lte: endDate }
    };

    // Add class and section filters if provided
    if (filterClass) {
      paymentMatch.class = filterClass;
    }
    if (filterSection) {
      paymentMatch.section = filterSection;
    }

    console.log("Payment match conditions:", paymentMatch);

    // Debug: Check what payments exist without filters first
    const allPayments = await FeePayment.find({ status: "paid", academicYear }).lean();
    console.log("All paid payments in database:", allPayments.length);
    if (allPayments.length > 0) {
      console.log("Sample payment:", allPayments[0]);
      console.log("Payment classes and sections:", allPayments.map(p => ({ class: p.class, section: p.section })));
    }

    // Debug: Check payments with current filters
    const filteredPayments = await FeePayment.find(paymentMatch).lean();
    console.log("Filtered payments found:", filteredPayments.length);
    if (filteredPayments.length > 0) {
      console.log("Filtered payment sample:", filteredPayments[0]);
    }

    // Get amount paid by students with filters (join with Student to get class/section)
    const amountPaid = await FeePayment.aggregate([
      {
        $match: {
          status: "paid",
          academicYear
        }
      },
      {
        $lookup: {
          from: "students",
          localField: "student",
          foreignField: "_id",
          as: "studentData"
        }
      },
      {
        $unwind: "$studentData"
      },
      {
        $match: {
          ...(filterClass && { "studentData.class": filterClass }),
          ...(filterSection && { "studentData.section": filterSection })
        }
      },
      {
        $group: {
          _id: {
            year: { $year: "$paidAt" },
            month: { $month: "$paidAt" },
            day: { $dayOfMonth: "$paidAt" },
            class: "$studentData.class",
            section: "$studentData.section"
          },
          amountPaid: { $sum: { $add: ["$amountPaid", { $ifNull: ["$lateFee", 0] }] } },
          paymentCount: { $sum: 1 }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } }
    ]);

    console.log("Found payments:", amountPaid.length);
    amountPaid.forEach(payment => {
      console.log(`Payment: ${payment._id.day}-${payment._id.month} Class ${payment._id.class}-${payment._id.section}: ₹${payment.amountPaid} (${payment.paymentCount} payments)`);
    });

    // Get total paid overall (not just for the date range) - join with Student
    const totalPaidOverall = await FeePayment.aggregate([
      {
        $match: {
          status: "paid",
          academicYear
        }
      },
      {
        $lookup: {
          from: "students",
          localField: "student",
          foreignField: "_id",
          as: "studentData"
        }
      },
      {
        $unwind: "$studentData"
      },
      {
        $match: {
          ...(filterClass && { "studentData.class": filterClass }),
          ...(filterSection && { "studentData.section": filterSection })
        }
      },
      {
        $group: {
          _id: null,
          totalPaid: { $sum: { $add: ["$amountPaid", { $ifNull: ["$lateFee", 0] }] } }
        }
      }
    ]);

    console.log("Total paid overall aggregation result:", totalPaidOverall);

    const totalPaidAmount = totalPaidOverall[0]?.totalPaid || 0;
    const outstandingAmount = totalAmountDue - totalPaidAmount;

    // Format data for chart
    const chartData = amountPaid.map(item => ({
      day: `${item._id.day}-${item._id.month.toString().padStart(2, '0')}`,
      amountPaid: item.amountPaid,
      paymentCount: item.paymentCount,
      class: item._id.class,
      section: item._id.section,
      // For each day, show the outstanding amount
      outstandingAmount: Math.max(0, outstandingAmount)
    }));

    // If no payment data, create empty data points
    if (chartData.length === 0) {
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date(endDate.getTime() - (i * 24 * 60 * 60 * 1000));
        chartData.push({
          day: `${date.getDate()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`,
          amountPaid: 0,
          paymentCount: 0,
          class: filterClass || 'All',
          section: filterSection || 'All',
          outstandingAmount: outstandingAmount
        });
      }
    }

    console.log("Final calculation results:");
    console.log("Applied filters - Class:", filterClass || "All", "Section:", filterSection || "All");
    console.log("Total amount due (filtered):", totalAmountDue);
    console.log("Total amount paid:", totalPaidAmount);
    console.log("Outstanding amount:", outstandingAmount);
    console.log("Collection rate:", totalAmountDue > 0 ? Math.round((totalPaidAmount / totalAmountDue) * 100) : 0);

    const responseData = {
      chartData,
      filterOptions: {
        classes: uniqueClasses,
        sections: uniqueSections
      },
      classSectionDetails: classSectionDetails,
      summary: {
        totalAmountDue: totalAmountDue,
        totalAmountPaid: totalPaidAmount,
        outstandingAmount: outstandingAmount,
        collectionRate: totalAmountDue > 0 ? Math.round((totalPaidAmount / totalAmountDue) * 100) : 0,
        filters: {
          class: filterClass || null,
          section: filterSection || null,
          days: days
        }
      }
    };

    // Cache the response data for 10 minutes (600 seconds)
    await cache.set(cacheKey, responseData, 600);
    console.log('💰 Fee collection data cached successfully');

    res.status(200).json({
      success: true,
      data: responseData,
      cached: false,
      cacheKey: cacheKey
    });

  } catch (error) {
    console.error("Fee collection status error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch fee collection status data",
      error: error.message
    });
  }
};

// Get payment methods analysis data
export const getPaymentMethodsData = async (req, res) => {
  try {
    // Get academic year from query parameter, or use current academic year as default
    const requestedAcademicYear = req.query.academicYear;
    const academicYear = (requestedAcademicYear && isValidAcademicYear(requestedAcademicYear)) 
      ? requestedAcademicYear 
      : getCurrentAcademicYear();
    
    // Generate cache key for payment methods data
    const cacheKey = cacheKeys.analytics.paymentMethods(academicYear);
    
    // Try to get cached data first
    const cachedData = await cache.get(cacheKey);
    if (cachedData) {
      console.log('💳 Serving payment methods data from Redis cache');
      return res.status(200).json({
        success: true,
        data: cachedData,
        cached: true,
        cacheKey: cacheKey
      });
    }
    
    console.log('💳 Generating fresh payment methods data for academic year:', academicYear);

    // Get payment methods distribution
    const paymentMethods = await FeePayment.aggregate([
      {
        $match: {
          status: "paid",
          academicYear: academicYear
        }
      },
      {
        $group: {
          _id: "$paymentMethod",
          count: { $sum: 1 },
          totalAmount: { $sum: { $add: ["$amountPaid", { $ifNull: ["$lateFee", 0] }] } },
          avgAmount: { $avg: { $add: ["$amountPaid", { $ifNull: ["$lateFee", 0] }] } }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    console.log("Payment methods aggregation result:", paymentMethods);

    // Enhanced data formatting with better method mapping
    const methodMapping = {
      'online': 'online',
      'cash': 'cash', 
      'cheque': 'cheque',
      'bank_transfer': 'bank_transfer',
      'card': 'card',
      'upi': 'upi',
      'netbanking': 'online',
      'wallet': 'online',
      'credit_card': 'card',
      'debit_card': 'card'
    };

    const chartData = paymentMethods.map(item => {
      const method = methodMapping[item._id] || 'online';
      return {
        method: method,
        count: item.count,
        totalAmount: item.totalAmount,
        avgAmount: Math.round(item.avgAmount || 0),
        percentage: 0 // Will be calculated on frontend
      };
    });

    // If no data, return empty array (no dummy data)
    if (chartData.length === 0) {
      console.log("No payment methods data found - returning empty array");
      const emptyData = {
        paymentMethods: [],
        summary: {
          totalPayments: 0,
          totalAmount: 0,
          methodsCount: 0,
          mostPopularMethod: null,
          avgPaymentAmount: 0
        }
      };
      
      // Cache empty data for 5 minutes
      await cache.set(cacheKey, emptyData, 300);
      
      return res.status(200).json({
        success: true,
        data: emptyData,
        cached: false,
        cacheKey: cacheKey
      });
    }

    // Calculate totals
    const totalPayments = chartData.reduce((sum, item) => sum + item.count, 0);
    const totalAmount = chartData.reduce((sum, item) => sum + item.totalAmount, 0);

    // Calculate percentages
    chartData.forEach(item => {
      item.percentage = totalPayments > 0 ? Math.round((item.count / totalPayments) * 100) : 0;
    });

    console.log("Payment methods data processed:", {
      chartData,
      totalPayments,
      totalAmount
    });

    const responseData = {
      paymentMethods: chartData,
      summary: {
        totalPayments,
        totalAmount,
        methodsCount: chartData.length,
        mostPopularMethod: chartData[0]?.method || 'online',
        avgPaymentAmount: totalPayments > 0 ? Math.round(totalAmount / totalPayments) : 0
      }
    };

    // Cache the response data for 15 minutes (900 seconds)
    await cache.set(cacheKey, responseData, 900);
    console.log('💳 Payment methods data cached successfully');

    res.status(200).json({
      success: true,
      data: responseData,
      cached: false,
      cacheKey: cacheKey
    });

  } catch (error) {
    console.error("Payment methods data error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch payment methods data",
      error: error.message
    });
  }
};

export const getIncomeExpenseData = async (req, res) => {
  try {
    const { days = 10 } = req.query;
    // Get academic year from query parameter, or use current academic year as default
    const requestedAcademicYear = req.query.academicYear;
    const academicYear = (requestedAcademicYear && isValidAcademicYear(requestedAcademicYear)) 
      ? requestedAcademicYear 
      : getCurrentAcademicYear();
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (days * 24 * 60 * 60 * 1000));

    const incomeData = await FeePayment.aggregate([
      {
        $match: {
          status: "paid",
          academicYear,
          paidAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: "$paidAt" },
            month: { $month: "$paidAt" },
            day: { $dayOfMonth: "$paidAt" }
          },
          income: { $sum: { $add: ["$amountPaid", { $ifNull: ["$lateFee", 0] }] } }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } }
    ]);

    // Mock expense data
    const expenseData = incomeData.map(item => ({
      ...item,
      expense: Math.floor(item.income * 0.6) // Mock 60% expense ratio
    }));

    res.status(200).json({
      success: true,
      data: expenseData.map(item => ({
        day: `${item._id.day}-${item._id.month.toString().padStart(2, '0')}`,
        income: item.income,
        expense: item.expense
      }))
    });
  } catch (error) {
    console.error("Income expense data error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch income expense data" 
    });
  }
};

// 📊 ATTENDANCE INSPECTION DATA WITH ADVANCED FILTERING
export const getAttendanceInspectionData = async (req, res) => {
  try {
    const { days = 30, month = '', chartType = 'radial' } = req.query;
    
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (days * 24 * 60 * 60 * 1000));

    console.log(`Fetching attendance data from ${startDate.toISOString()} to ${endDate.toISOString()}`);
    console.log(`Filters: days=${days}, month=${month}, chartType=${chartType}`);

    // Build match conditions
    const baseMatch = {
      date: { $gte: startDate, $lte: endDate }
    };
    
    console.log(`Base match condition:`, baseMatch);

    // Add month filter if specified
    if (month) {
      baseMatch.$expr = {
        $eq: [{ $month: "$date" }, parseInt(month)]
      };
    }

    // ===========================================
    // SIMPLIFIED ATTENDANCE DATA PROCESSING
    // ===========================================

    // ===========================================
    // DAILY AGGREGATED DATA
    // ===========================================
    const dailyStudentAttendance = await Attendance.aggregate([
      {
        $match: baseMatch
      },
      {
        $group: {
          _id: {
            year: { $year: "$date" },
            month: { $month: "$date" },
            day: { $dayOfMonth: "$date" }
          },
          totalStudents: { $sum: 1 },
          studentsPresent: {
            $sum: {
              $cond: [{ $eq: ["$status", "present"] }, 1, 0]
            }
          },
          studentsAbsent: {
            $sum: {
              $cond: [{ $eq: ["$status", "absent"] }, 1, 0]
            }
          }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } }
    ]);

    const dailyTeacherAttendance = await TeacherAttendance.aggregate([
      {
        $match: baseMatch
      },
      {
        $group: {
          _id: {
            year: { $year: "$date" },
            month: { $month: "$date" },
            day: { $dayOfMonth: "$date" }
          },
          totalTeachers: { $sum: 1 },
          teachersPresent: {
            $sum: {
              $cond: [{ $eq: ["$status", "present"] }, 1, 0]
            }
          },
          teachersAbsent: {
            $sum: {
              $cond: [{ $eq: ["$status", "absent"] }, 1, 0]
            }
          }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } }
    ]);

    // ===========================================
    // PROCESS DATA FOR CHARTS
    // ===========================================
    
    // Create maps for easy lookup
    const studentMap = new Map();
    dailyStudentAttendance.forEach(item => {
      const key = `${item._id.year}-${item._id.month}-${item._id.day}`;
      studentMap.set(key, item);
    });

    const teacherMap = new Map();
    dailyTeacherAttendance.forEach(item => {
      const key = `${item._id.year}-${item._id.month}-${item._id.day}`;
      teacherMap.set(key, item);
    });

    // Generate daily attendance data
    const attendanceData = [];
    const currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      const year = currentDate.getFullYear();
      const monthNum = currentDate.getMonth() + 1;
      const day = currentDate.getDate();
      const key = `${year}-${monthNum}-${day}`;
      
      const studentData = studentMap.get(key);
      const teacherData = teacherMap.get(key);
      
      attendanceData.push({
        date: `${day}-${monthNum.toString().padStart(2, '0')}`,
        studentsPresent: studentData?.studentsPresent || 0,
        studentsAbsent: studentData?.studentsAbsent || 0,
        teachersPresent: teacherData?.teachersPresent || 0,
        teachersAbsent: teacherData?.teachersAbsent || 0,
        totalStudents: studentData?.totalStudents || 0,
        totalTeachers: teacherData?.totalTeachers || 0
      });
      
      currentDate.setDate(currentDate.getDate() + 1);
    }

    console.log(`Generated ${attendanceData.length} days of attendance data`);

    // Calculate enhanced summary statistics
    const totalStudentRecords = dailyStudentAttendance.reduce((sum, item) => sum + item.totalStudents, 0);
    const totalTeacherRecords = dailyTeacherAttendance.reduce((sum, item) => sum + item.totalTeachers, 0);
    
    const averageStudentAttendance = attendanceData.length > 0 ? 
      Math.round(attendanceData.reduce((sum, item) => sum + (item.studentsPresent / Math.max(item.totalStudents, 1)), 0) / attendanceData.length * 100) : 0;
    
    const averageTeacherAttendance = attendanceData.length > 0 ? 
      Math.round(attendanceData.reduce((sum, item) => sum + (item.teachersPresent / Math.max(item.totalTeachers, 1)), 0) / attendanceData.length * 100) : 0;

    console.log(`Calculated averages - Students: ${averageStudentAttendance}%, Teachers: ${averageTeacherAttendance}%`);
    console.log(`Total records - Students: ${totalStudentRecords}, Teachers: ${totalTeacherRecords}`);

    res.status(200).json({
      success: true,
      data: attendanceData,
      summary: {
        totalDays: attendanceData.length,
        totalStudentRecords,
        totalTeacherRecords,
        averageStudentAttendance,
        averageTeacherAttendance,
        filters: {
          days: parseInt(days),
          month: month || null,
          chartType
        },
        // Additional insights
        insights: {
          bestStudentDay: attendanceData.reduce((best, current) => 
            (current.studentsPresent / Math.max(current.totalStudents, 1)) > 
            (best.studentsPresent / Math.max(best.totalStudents, 1)) ? current : best
          ),
          bestTeacherDay: attendanceData.reduce((best, current) => 
            (current.teachersPresent / Math.max(current.totalTeachers, 1)) > 
            (best.teachersPresent / Math.max(best.totalTeachers, 1)) ? current : best
          ),
          totalPresentStudents: attendanceData.reduce((sum, item) => sum + item.studentsPresent, 0),
          totalAbsentStudents: attendanceData.reduce((sum, item) => sum + item.studentsAbsent, 0),
          totalPresentTeachers: attendanceData.reduce((sum, item) => sum + item.teachersPresent, 0),
          totalAbsentTeachers: attendanceData.reduce((sum, item) => sum + item.teachersAbsent, 0)
        }
      }
    });
  } catch (error) {
    console.error("Attendance inspection data error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch attendance inspection data",
      error: error.message
    });
  }
};

// 📊 ANNUAL FEE SUMMARY
export const getAnnualFeeSummary = async (req, res) => {
  try {
    // Get academic year from query parameter, or use current academic year as default
    const requestedAcademicYear = req.query.academicYear;
    const academicYear = (requestedAcademicYear && isValidAcademicYear(requestedAcademicYear)) 
      ? requestedAcademicYear 
      : getCurrentAcademicYear();
    
    const feeSummary = await FeePayment.aggregate([
      {
        $match: {
          status: "paid",
          academicYear
        }
      },
      {
        $group: {
          _id: {
            year: { $year: "$paidAt" },
            month: { $month: "$paidAt" }
          },
          totalCollected: { $sum: { $add: ["$amountPaid", { $ifNull: ["$lateFee", 0] }] } },
          paymentCount: { $sum: 1 }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        monthlyData: feeSummary,
        totalCollected: feeSummary.reduce((sum, item) => sum + item.totalCollected, 0),
        totalPayments: feeSummary.reduce((sum, item) => sum + item.paymentCount, 0)
      }
    });
  } catch (error) {
    console.error("Annual fee summary error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch annual fee summary" 
    });
  }
};

// 👨‍🏫 TEACHER PERFORMANCE ANALYTICS
export const getTeacherPerformanceAnalytics = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    
    // Mock teacher performance data
    const teacherPerformance = [
      { teacherName: "Sarah Johnson", attendanceRate: 98, performanceScore: 95 },
      { teacherName: "Michael Chen", attendanceRate: 96, performanceScore: 92 },
      { teacherName: "Emily Davis", attendanceRate: 94, performanceScore: 89 },
      { teacherName: "David Wilson", attendanceRate: 92, performanceScore: 87 },
      { teacherName: "Lisa Brown", attendanceRate: 90, performanceScore: 85 }
    ];

    res.status(200).json({
      success: true,
      data: {
        teacherPerformanceMetrics: teacherPerformance,
        averageAttendance: teacherPerformance.reduce((sum, t) => sum + t.attendanceRate, 0) / teacherPerformance.length,
        averagePerformance: teacherPerformance.reduce((sum, t) => sum + t.performanceScore, 0) / teacherPerformance.length
      }
    });
  } catch (error) {
    console.error("Teacher performance analytics error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch teacher performance analytics" 
    });
  }
};

// 📈 PERFORMANCE TRENDS
export const getPerformanceTrends = async (req, res) => {
  try {
    const { months = 6 } = req.query;
    
    // Mock performance trends data
    const trends = [];
    for (let i = months - 1; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      trends.push({
        monthName: date.toLocaleDateString('en-US', { month: 'short' }),
        attendanceRate: Math.floor(Math.random() * 10) + 85,
        punctualityRate: Math.floor(Math.random() * 10) + 80,
        collectionRate: Math.floor(Math.random() * 15) + 75
      });
    }

    res.status(200).json({
      success: true,
      data: {
        attendanceTrends: trends,
        performanceTrends: trends
      }
    });
  } catch (error) {
    console.error("Performance trends error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch performance trends" 
    });
  }
};

// 👨‍🎓 STUDENT ATTENDANCE ANALYTICS
export const getStudentAttendanceAnalytics = async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      class: studentClass, 
      section, 
      status, 
      days = 30,
      groupBy = 'daily' // daily, weekly, monthly, class, section
    } = req.query;

    // Calculate date range
    const endDateObj = endDate ? new Date(endDate) : new Date();
    const startDateObj = startDate ? new Date(startDate) : new Date(endDateObj.getTime() - (days * 24 * 60 * 60 * 1000));
    
    // Generate cache key for student attendance data
    const filters = { startDate, endDate, class: studentClass, section, status, days, groupBy };
    const cacheKey = cacheKeys.analytics.attendance.student(filters);
    
    // Try to get cached data first
    const cachedData = await cache.get(cacheKey);
    if (cachedData) {
      console.log('👨‍🎓 Serving student attendance analytics from Redis cache');
      return res.status(200).json({
        success: true,
        data: cachedData,
        cached: true,
        cacheKey: cacheKey
      });
    }
    
    console.log('👨‍🎓 Generating fresh student attendance analytics data');
    console.log(`Fetching student attendance from ${startDateObj.toISOString()} to ${endDateObj.toISOString()}`);

    // Build match conditions
    const baseMatch = {
      date: { $gte: startDateObj, $lte: endDateObj }
    };

    // Add filters
    if (status) {
      baseMatch.status = status;
    }

    // Build aggregation pipeline based on groupBy
    let groupStage, sortStage;
    
    switch (groupBy) {
      case 'daily':
        groupStage = {
          _id: {
            year: { $year: "$date" },
            month: { $month: "$date" },
            day: { $dayOfMonth: "$date" }
          }
        };
        sortStage = { "_id.year": 1, "_id.month": 1, "_id.day": 1 };
        break;
      case 'weekly':
        groupStage = {
          _id: {
            year: { $year: "$date" },
            week: { $week: "$date" }
          }
        };
        sortStage = { "_id.year": 1, "_id.week": 1 };
        break;
      case 'monthly':
        groupStage = {
          _id: {
            year: { $year: "$date" },
            month: { $month: "$date" }
          }
        };
        sortStage = { "_id.year": 1, "_id.month": 1 };
        break;
      case 'class':
        groupStage = { _id: "$studentClass" };
        sortStage = { "_id": 1 };
        break;
      case 'section':
        groupStage = { _id: "$studentSection" };
        sortStage = { "_id": 1 };
        break;
      default:
        groupStage = {
          _id: {
            year: { $year: "$date" },
            month: { $month: "$date" },
            day: { $dayOfMonth: "$date" }
          }
        };
        sortStage = { "_id.year": 1, "_id.month": 1, "_id.day": 1 };
    }

    // Main aggregation pipeline
    const pipeline = [
      {
        $lookup: {
          from: "students",
          localField: "student",
          foreignField: "_id",
          as: "studentData"
        }
      },
      {
        $unwind: "$studentData"
      },
      {
        $addFields: {
          studentClass: "$studentData.class",
          studentSection: "$studentData.section",
          studentName: "$studentData.name"
        }
      },
      {
        $match: {
          ...baseMatch,
          ...(studentClass && { studentClass: studentClass }),
          ...(section && { studentSection: section })
        }
      },
      {
        $group: {
          _id: groupStage,
          totalStudents: { $sum: 1 },
          studentsPresent: {
            $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] }
          },
          studentsAbsent: {
            $sum: { $cond: [{ $eq: ["$status", "absent"] }, 1, 0] }
          },
          studentsLate: {
            $sum: { $cond: [{ $eq: ["$status", "late"] }, 1, 0] }
          },
          uniqueStudents: { $addToSet: "$student" },
          classDistribution: {
            $push: {
              class: "$studentClass",
              section: "$studentSection",
              status: "$status"
            }
          }
        }
      },
      {
        $addFields: {
          attendanceRate: {
            $cond: [
              { $gt: ["$totalStudents", 0] },
              { $round: [{ $multiply: [{ $divide: ["$studentsPresent", "$totalStudents"] }, 100] }, 2] },
              0
            ]
          },
          uniqueStudentCount: { $size: "$uniqueStudents" }
        }
      },
      { $sort: sortStage }
    ];

    const attendanceData = await Attendance.aggregate(pipeline);
    
    console.log(`Student attendance aggregation result:`, attendanceData.length, 'records');
    console.log(`Sample attendance data:`, attendanceData.slice(0, 2));

    // Get class-wise summary
    const classSummary = await Attendance.aggregate([
      {
        $lookup: {
          from: "students",
          localField: "student",
          foreignField: "_id",
          as: "studentData"
        }
      },
      {
        $unwind: "$studentData"
      },
      {
        $match: {
          date: { $gte: startDateObj, $lte: endDateObj }
        }
      },
      {
        $group: {
          _id: {
            class: "$studentData.class",
            section: "$studentData.section"
          },
          totalRecords: { $sum: 1 },
          presentRecords: {
            $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] }
          },
          absentRecords: {
            $sum: { $cond: [{ $eq: ["$status", "absent"] }, 1, 0] }
          },
          uniqueStudents: { $addToSet: "$student" }
        }
      },
      {
        $addFields: {
          attendanceRate: {
            $cond: [
              { $gt: ["$totalRecords", 0] },
              { $round: [{ $multiply: [{ $divide: ["$presentRecords", "$totalRecords"] }, 100] }, 2] },
              0
            ]
          },
          studentCount: { $size: "$uniqueStudents" }
        }
      },
      { $sort: { "_id.class": 1, "_id.section": 1 } }
    ]);

    // Calculate overall statistics
    const totalRecords = attendanceData.reduce((sum, item) => sum + item.totalStudents, 0);
    const totalPresent = attendanceData.reduce((sum, item) => sum + item.studentsPresent, 0);
    const totalAbsent = attendanceData.reduce((sum, item) => sum + item.studentsAbsent, 0);
    const overallAttendanceRate = totalRecords > 0 ? Math.round((totalPresent / totalRecords) * 100) : 0;

    // Get unique students count
    const uniqueStudents = await Attendance.distinct("student", {
      date: { $gte: startDateObj, $lte: endDateObj }
    });

    const responseData = {
      attendanceData: attendanceData.map(item => {
        try {
          const date = groupBy === 'daily' ? 
            `${item._id?.day || 0}-${(item._id?.month || 0).toString().padStart(2, '0')}-${item._id?.year || 0}` :
            groupBy === 'weekly' ?
            `Week ${item._id?.week || 0}, ${item._id?.year || 0}` :
            groupBy === 'monthly' ?
            `${item._id?.year || 0}-${(item._id?.month || 0).toString().padStart(2, '0')}` :
            item._id;
          
          return {
            ...item,
            date
          };
        } catch (error) {
          console.error('Error formatting date for student attendance:', error, 'Item:', item);
          return {
            ...item,
            date: 'Invalid Date'
          };
        }
      }),
      classSummary,
      summary: {
        totalRecords,
        totalPresent,
        totalAbsent,
        overallAttendanceRate,
        uniqueStudents: uniqueStudents.length,
        dateRange: {
          startDate: startDateObj,
          endDate: endDateObj
        },
        filters: {
          class: studentClass || null,
          section: section || null,
          status: status || null,
          groupBy
        }
      }
    };

    // Cache the response data for 10 minutes (600 seconds)
    await cache.set(cacheKey, responseData, 600);
    console.log('👨‍🎓 Student attendance analytics data cached successfully');

    res.status(200).json({
      success: true,
      data: responseData,
      cached: false,
      cacheKey: cacheKey
    });

  } catch (error) {
    console.error("Student attendance analytics error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch student attendance analytics",
      error: error.message
    });
  }
};

// 👨‍🏫 TEACHER ATTENDANCE ANALYTICS
export const getTeacherAttendanceAnalytics = async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      subject, 
      status, 
      teacherId,
      days = 30,
      groupBy = 'daily' // daily, weekly, monthly, subject, teacher
    } = req.query;

    // Calculate date range
    const endDateObj = endDate ? new Date(endDate) : new Date();
    const startDateObj = startDate ? new Date(startDate) : new Date(endDateObj.getTime() - (days * 24 * 60 * 60 * 1000));
    
    console.log(`Fetching teacher attendance from ${startDateObj.toISOString()} to ${endDateObj.toISOString()}`);

    // Build match conditions
    const baseMatch = {
      date: { $gte: startDateObj, $lte: endDateObj }
    };

    // Add filters
    if (status) {
      baseMatch.status = status;
    }
    if (subject) {
      baseMatch.subject = subject;
    }
    if (teacherId) {
      baseMatch.teacher = teacherId;
    }

    // Build aggregation pipeline based on groupBy
    let groupStage, sortStage;
    
    switch (groupBy) {
      case 'daily':
        groupStage = {
          _id: {
            year: { $year: "$date" },
            month: { $month: "$date" },
            day: { $dayOfMonth: "$date" }
          }
        };
        sortStage = { "_id.year": 1, "_id.month": 1, "_id.day": 1 };
        break;
      case 'weekly':
        groupStage = {
          _id: {
            year: { $year: "$date" },
            week: { $week: "$date" }
          }
        };
        sortStage = { "_id.year": 1, "_id.week": 1 };
        break;
      case 'monthly':
        groupStage = {
          _id: {
            year: { $year: "$date" },
            month: { $month: "$date" }
          }
        };
        sortStage = { "_id.year": 1, "_id.month": 1 };
        break;
      case 'subject':
        groupStage = { _id: "$subject" };
        sortStage = { "_id": 1 };
        break;
      case 'teacher':
        groupStage = { 
          _id: "$teacher",
          teacherName: { $first: "$teacherName" },
          teacherId: { $first: "$teacherId" }
        };
        sortStage = { "teacherName": 1 };
        break;
      default:
        groupStage = {
          _id: {
            year: { $year: "$date" },
            month: { $month: "$date" },
            day: { $dayOfMonth: "$date" }
          }
        };
        sortStage = { "_id.year": 1, "_id.month": 1, "_id.day": 1 };
    }

    // Main aggregation pipeline
    const pipeline = [
      {
        $match: baseMatch
      },
      {
        $group: {
          _id: groupStage,
          totalTeachers: { $sum: 1 },
          teachersPresent: {
            $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] }
          },
          teachersAbsent: {
            $sum: { $cond: [{ $eq: ["$status", "absent"] }, 1, 0] }
          },
          teachersLate: {
            $sum: { $cond: [{ $eq: ["$status", "late"] }, 1, 0] }
          },
          teachersHalfDay: {
            $sum: { $cond: [{ $eq: ["$status", "half-day"] }, 1, 0] }
          },
          teachersSickLeave: {
            $sum: { $cond: [{ $eq: ["$status", "sick-leave"] }, 1, 0] }
          },
          teachersPersonalLeave: {
            $sum: { $cond: [{ $eq: ["$status", "personal-leave"] }, 1, 0] }
          },
          teachersEmergencyLeave: {
            $sum: { $cond: [{ $eq: ["$status", "emergency-leave"] }, 1, 0] }
          },
          uniqueTeachers: { $addToSet: "$teacher" },
          subjectDistribution: {
            $push: {
              subject: "$subject",
              teacherName: "$teacherName",
              status: "$status"
            }
          }
        }
      },
      {
        $addFields: {
          attendanceRate: {
            $cond: [
              { $gt: ["$totalTeachers", 0] },
              { $round: [{ $multiply: [{ $divide: ["$teachersPresent", "$totalTeachers"] }, 100] }, 2] },
              0
            ]
          },
          uniqueTeacherCount: { $size: "$uniqueTeachers" }
        }
      },
      { $sort: sortStage }
    ];

    const attendanceData = await TeacherAttendance.aggregate(pipeline);
    
    console.log(`Teacher attendance aggregation result:`, attendanceData.length, 'records');
    console.log(`Sample teacher attendance data:`, attendanceData.slice(0, 2));

    // Get subject-wise summary
    const subjectSummary = await TeacherAttendance.aggregate([
      {
        $match: {
          date: { $gte: startDateObj, $lte: endDateObj }
        }
      },
      {
        $group: {
          _id: "$subject",
          totalRecords: { $sum: 1 },
          presentRecords: {
            $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] }
          },
          absentRecords: {
            $sum: { $cond: [{ $eq: ["$status", "absent"] }, 1, 0] }
          },
          lateRecords: {
            $sum: { $cond: [{ $eq: ["$status", "late"] }, 1, 0] }
          },
          uniqueTeachers: { $addToSet: "$teacher" }
        }
      },
      {
        $addFields: {
          attendanceRate: {
            $cond: [
              { $gt: ["$totalRecords", 0] },
              { $round: [{ $multiply: [{ $divide: ["$presentRecords", "$totalRecords"] }, 100] }, 2] },
              0
            ]
          },
          teacherCount: { $size: "$uniqueTeachers" }
        }
      },
      { $sort: { "_id": 1 } }
    ]);

    // Get individual teacher performance
    const teacherPerformance = await TeacherAttendance.aggregate([
      {
        $match: {
          date: { $gte: startDateObj, $lte: endDateObj }
        }
      },
      {
        $group: {
          _id: {
            teacher: "$teacher",
            teacherName: "$teacherName",
            teacherId: "$teacherId",
            subject: "$subject"
          },
          totalDays: { $sum: 1 },
          presentDays: {
            $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] }
          },
          absentDays: {
            $sum: { $cond: [{ $eq: ["$status", "absent"] }, 1, 0] }
          },
          lateDays: {
            $sum: { $cond: [{ $eq: ["$status", "late"] }, 1, 0] }
          },
          halfDays: {
            $sum: { $cond: [{ $eq: ["$status", "half-day"] }, 1, 0] }
          },
          sickLeaveDays: {
            $sum: { $cond: [{ $eq: ["$status", "sick-leave"] }, 1, 0] }
          }
        }
      },
      {
        $addFields: {
          attendanceRate: {
            $cond: [
              { $gt: ["$totalDays", 0] },
              { $round: [{ $multiply: [{ $divide: ["$presentDays", "$totalDays"] }, 100] }, 2] },
              0
            ]
          },
          punctualityRate: {
            $cond: [
              { $gt: ["$totalDays", 0] },
              { $round: [{ $multiply: [{ $divide: [{ $subtract: ["$presentDays", "$lateDays"] }, "$totalDays"] }, 100] }, 2] },
              0
            ]
          }
        }
      },
      { $sort: { "attendanceRate": -1 } }
    ]);

    // Calculate overall statistics
    const totalRecords = attendanceData.reduce((sum, item) => sum + item.totalTeachers, 0);
    const totalPresent = attendanceData.reduce((sum, item) => sum + item.teachersPresent, 0);
    const totalAbsent = attendanceData.reduce((sum, item) => sum + item.teachersAbsent, 0);
    const overallAttendanceRate = totalRecords > 0 ? Math.round((totalPresent / totalRecords) * 100) : 0;

    // Get unique teachers count
    const uniqueTeachers = await TeacherAttendance.distinct("teacher", {
      date: { $gte: startDateObj, $lte: endDateObj }
    });

    res.status(200).json({
      success: true,
      data: {
        attendanceData: attendanceData.map(item => {
          try {
            const date = groupBy === 'daily' ? 
              `${item._id?.day || 0}-${(item._id?.month || 0).toString().padStart(2, '0')}-${item._id?.year || 0}` :
              groupBy === 'weekly' ?
              `Week ${item._id?.week || 0}, ${item._id?.year || 0}` :
              groupBy === 'monthly' ?
              `${item._id?.year || 0}-${(item._id?.month || 0).toString().padStart(2, '0')}` :
              groupBy === 'teacher' ?
              item._id?.teacherName || item._id :
              item._id;
            
            return {
              ...item,
              date
            };
          } catch (error) {
            console.error('Error formatting date for teacher attendance:', error, 'Item:', item);
            return {
              ...item,
              date: 'Invalid Date'
            };
          }
        }),
        subjectSummary,
        teacherPerformance,
        summary: {
          totalRecords,
          totalPresent,
          totalAbsent,
          overallAttendanceRate,
          uniqueTeachers: uniqueTeachers.length,
          dateRange: {
            startDate: startDateObj,
            endDate: endDateObj
          },
          filters: {
            subject: subject || null,
            status: status || null,
            teacherId: teacherId || null,
            groupBy
          }
        }
      }
    });

  } catch (error) {
    console.error("Teacher attendance analytics error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch teacher attendance analytics",
      error: error.message
    });
  }
};

// 📊 ATTENDANCE COMPARATIVE ANALYTICS
export const getAttendanceComparativeAnalytics = async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      days = 30,
      compareWith = 'previous' // previous, lastYear, custom
    } = req.query;

    const endDateObj = endDate ? new Date(endDate) : new Date();
    const startDateObj = startDate ? new Date(startDate) : new Date(endDateObj.getTime() - (days * 24 * 60 * 60 * 1000));
    
    // Calculate comparison period
    let compareStartDate, compareEndDate;
    const periodLength = endDateObj.getTime() - startDateObj.getTime();
    
    switch (compareWith) {
      case 'previous':
        compareEndDate = new Date(startDateObj.getTime() - 1);
        compareStartDate = new Date(compareEndDate.getTime() - periodLength);
        break;
      case 'lastYear':
        compareStartDate = new Date(startDateObj.getFullYear() - 1, startDateObj.getMonth(), startDateObj.getDate());
        compareEndDate = new Date(endDateObj.getFullYear() - 1, endDateObj.getMonth(), endDateObj.getDate());
        break;
      default:
        compareStartDate = new Date(startDateObj.getTime() - periodLength);
        compareEndDate = new Date(startDateObj.getTime() - 1);
    }

    // Current period student attendance
    const currentStudentAttendance = await Attendance.aggregate([
      {
        $match: {
          date: { $gte: startDateObj, $lte: endDateObj }
        }
      },
      {
        $group: {
          _id: null,
          totalStudents: { $sum: 1 },
          studentsPresent: {
            $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] }
          }
        }
      }
    ]);

    // Comparison period student attendance
    const compareStudentAttendance = await Attendance.aggregate([
      {
        $match: {
          date: { $gte: compareStartDate, $lte: compareEndDate }
        }
      },
      {
        $group: {
          _id: null,
          totalStudents: { $sum: 1 },
          studentsPresent: {
            $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] }
          }
        }
      }
    ]);

    // Current period teacher attendance
    const currentTeacherAttendance = await TeacherAttendance.aggregate([
      {
        $match: {
          date: { $gte: startDateObj, $lte: endDateObj }
        }
      },
      {
        $group: {
          _id: null,
          totalTeachers: { $sum: 1 },
          teachersPresent: {
            $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] }
          }
        }
      }
    ]);

    // Comparison period teacher attendance
    const compareTeacherAttendance = await TeacherAttendance.aggregate([
      {
        $match: {
          date: { $gte: compareStartDate, $lte: compareEndDate }
        }
      },
      {
        $group: {
          _id: null,
          totalTeachers: { $sum: 1 },
          teachersPresent: {
            $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] }
          }
        }
      }
    ]);

    // Calculate rates and comparisons
    const currentStudentRate = currentStudentAttendance[0]?.totalStudents > 0 ? 
      Math.round((currentStudentAttendance[0].studentsPresent / currentStudentAttendance[0].totalStudents) * 100) : 0;
    
    const compareStudentRate = compareStudentAttendance[0]?.totalStudents > 0 ? 
      Math.round((compareStudentAttendance[0].studentsPresent / compareStudentAttendance[0].totalStudents) * 100) : 0;

    const currentTeacherRate = currentTeacherAttendance[0]?.totalTeachers > 0 ? 
      Math.round((currentTeacherAttendance[0].teachersPresent / currentTeacherAttendance[0].totalTeachers) * 100) : 0;
    
    const compareTeacherRate = compareTeacherAttendance[0]?.totalTeachers > 0 ? 
      Math.round((compareTeacherAttendance[0].teachersPresent / compareTeacherAttendance[0].totalTeachers) * 100) : 0;

    res.status(200).json({
      success: true,
      data: {
        currentPeriod: {
          startDate: startDateObj,
          endDate: endDateObj,
          studentAttendance: {
            total: currentStudentAttendance[0]?.totalStudents || 0,
            present: currentStudentAttendance[0]?.studentsPresent || 0,
            rate: currentStudentRate
          },
          teacherAttendance: {
            total: currentTeacherAttendance[0]?.totalTeachers || 0,
            present: currentTeacherAttendance[0]?.teachersPresent || 0,
            rate: currentTeacherRate
          }
        },
        comparisonPeriod: {
          startDate: compareStartDate,
          endDate: compareEndDate,
          studentAttendance: {
            total: compareStudentAttendance[0]?.totalStudents || 0,
            present: compareStudentAttendance[0]?.studentsPresent || 0,
            rate: compareStudentRate
          },
          teacherAttendance: {
            total: compareTeacherAttendance[0]?.totalTeachers || 0,
            present: compareTeacherAttendance[0]?.teachersPresent || 0,
            rate: compareTeacherRate
          }
        },
        comparison: {
          studentAttendanceChange: currentStudentRate - compareStudentRate,
          teacherAttendanceChange: currentTeacherRate - compareTeacherRate,
          studentAttendanceTrend: currentStudentRate > compareStudentRate ? 'up' : 
                                 currentStudentRate < compareStudentRate ? 'down' : 'stable',
          teacherAttendanceTrend: currentTeacherRate > compareTeacherRate ? 'up' : 
                                 currentTeacherRate < compareTeacherRate ? 'down' : 'stable'
        }
      }
    });

  } catch (error) {
    console.error("Attendance comparative analytics error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch attendance comparative analytics",
      error: error.message
    });
  }
};