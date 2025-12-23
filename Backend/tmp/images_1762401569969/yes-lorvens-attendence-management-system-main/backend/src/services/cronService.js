const cron = require('node-cron');
const AutoPunchOutService = require('./autoPunchOutService');
const AttendanceStatusService = require('./attendanceStatusService');

class CronService {
  constructor() {
    this.autoPunchOutJob = null;
    this.endOfDayStatusJob = null;
    this.isInitialized = false;
  }

  /**
   * Initialize all cron jobs
   */
  init() {
    if (this.isInitialized) {
      console.log('Cron service already initialized');
      return;
    }

    console.log('Initializing cron service...');

    // Auto punch-out job (now marks as absent) - runs every day at 11:30 PM (23:30)
    this.autoPunchOutJob = cron.schedule('30 23 * * *', async () => {
      console.log('Running scheduled end-of-day absence marking job...');
      try {
        const results = await AutoPunchOutService.autoPunchOutEmployees();
        console.log('Scheduled end-of-day absence marking completed:', results);
      } catch (error) {
        console.error('Scheduled end-of-day absence marking failed:', error);
      }
    }, {
      scheduled: true,
      timezone: "Asia/Kolkata" // IST timezone
    });

    console.log('End-of-day absence marking job scheduled for 11:30 PM IST daily');

    // End-of-day status update job - runs every day at 11:30 PM (23:30)
    this.endOfDayStatusJob = cron.schedule('30 23 * * *', async () => {
      console.log('Running scheduled end-of-day status update job...');
      try {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1); // Process yesterday's attendance
        const results = await AttendanceStatusService.batchUpdateAttendanceStatus(yesterday);
        console.log('Scheduled end-of-day status update completed:', results);
      } catch (error) {
        console.error('Scheduled end-of-day status update failed:', error);
      }
    }, {
      scheduled: true,
      timezone: "Asia/Kolkata" // IST timezone
    });

    console.log('End-of-day status update job scheduled for 11:30 PM IST daily');

    this.isInitialized = true;
    console.log('Cron service initialized successfully');
  }

  /**
   * Stop all cron jobs
   */
  stop() {
    if (this.autoPunchOutJob) {
      this.autoPunchOutJob.stop();
      console.log('End-of-day absence marking job stopped');
    }
    if (this.endOfDayStatusJob) {
      this.endOfDayStatusJob.stop();
      console.log('End-of-day status update job stopped');
    }
    this.isInitialized = false;
    console.log('Cron service stopped');
  }

  /**
   * Get status of all cron jobs
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      autoPunchOutJob: {
        scheduled: this.autoPunchOutJob ? this.autoPunchOutJob.getStatus() : 'not_initialized',
        nextRun: this.autoPunchOutJob ? this.getNextRunTime() : null
      },
      endOfDayStatusJob: {
        scheduled: this.endOfDayStatusJob ? this.endOfDayStatusJob.getStatus() : 'not_initialized',
        nextRun: this.endOfDayStatusJob ? this.getEndOfDayNextRunTime() : null
      }
    };
  }

  /**
   * Get next run time for end-of-day absence marking job
   */
  getNextRunTime() {
    if (!this.autoPunchOutJob) return null;
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 30, 0); // 11:30 PM today
    
    // If it's past 11:30 PM today, schedule for tomorrow
    if (now > today) {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    }
    
    return today;
  }

  /**
   * Get next run time for end-of-day status update job
   */
  getEndOfDayNextRunTime() {
    if (!this.endOfDayStatusJob) return null;
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 30, 0); // 11:30 PM today
    
    // If it's past 11:30 PM today, schedule for tomorrow
    if (now > today) {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    }
    
    return today;
  }
}

// Create singleton instance
const cronService = new CronService();

module.exports = cronService; 