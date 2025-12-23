// Test script to verify the enhanced analytics API
import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

// Mock the enhanced analytics controller for testing
const mockController = {
  getComprehensiveDashboardAnalytics: (req, res) => {
    res.json({
      success: true,
      data: {
        kpis: {
          totalStudents: 500,
          totalTeachers: 45,
          totalFeeCollected: 1500000,
          collectionEfficiency: 85,
          attendanceToday: 460,
          teacherAttendanceToday: 43
        },
        charts: {
          studentsByClass: [
            { name: "Grade 10", count: 45, value: 45 },
            { name: "Grade 11", count: 38, value: 38 },
            { name: "Grade 12", count: 42, value: 42 }
          ],
          feeCollectionRates: [
            { month: "2024-01", totalCollected: 120000 },
            { month: "2024-02", totalCollected: 135000 }
          ]
        },
        recentActivities: {
          events: [
            { _id: "1", title: "Sports Day", location: "Ground", date: new Date(), category: "Sports" }
          ]
        },
        performance: {
          averageAttendanceRate: 92,
          collectionEfficiency: 85,
          admissionGrowthRate: 12
        }
      }
    });
  }
};

// Test route
app.get('/api/enhanced-analytics/comprehensive', mockController.getComprehensiveDashboardAnalytics);

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Test server running on http://localhost:${PORT}`);
  console.log('Test endpoint: http://localhost:3001/api/enhanced-analytics/comprehensive');
});
