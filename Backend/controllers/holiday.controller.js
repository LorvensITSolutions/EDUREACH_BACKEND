// controllers/holiday.controller.js
import Holiday from '../models/holiday.model.js';
import { getCurrentAcademicYear } from '../utils/academicYear.js';

// Get all holidays (admin only)
export const getAllHolidays = async (req, res) => {
  try {
    const { academicYear, year, month } = req.query;
    
    let query = { isActive: true };
    
    // Filter by academic year if provided
    if (academicYear) {
      query.academicYear = academicYear;
    }
    
    // Filter by year if provided
    if (year) {
      const startDate = new Date(`${year}-01-01`);
      const endDate = new Date(`${year}-12-31`);
      query.date = { $gte: startDate, $lte: endDate };
    }
    
    // Filter by month if provided
    if (month && year) {
      const monthNum = parseInt(month, 10);
      // Use UTC dates to avoid timezone issues
      const startDate = new Date(Date.UTC(year, monthNum - 1, 1, 0, 0, 0, 0));
      const endDate = new Date(Date.UTC(year, monthNum, 1, 0, 0, 0, 0));
      query.date = { $gte: startDate, $lt: endDate };
    }
    
    const holidays = await Holiday.find(query)
      .populate('createdBy', 'name email')
      .sort({ date: 1 });
    
    res.status(200).json({
      success: true,
      count: holidays.length,
      holidays
    });
  } catch (error) {
    console.error('Error fetching holidays:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Get single holiday by ID
export const getHolidayById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const holiday = await Holiday.findById(id).populate('createdBy', 'name email');
    
    if (!holiday) {
      return res.status(404).json({
        success: false,
        message: 'Holiday not found'
      });
    }
    
    res.status(200).json({
      success: true,
      holiday
    });
  } catch (error) {
    console.error('Error fetching holiday:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Check if a date is a holiday
export const checkHoliday = async (req, res) => {
  try {
    const { date } = req.query;
    
    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date is required'
      });
    }
    
    // Parse date string to avoid timezone issues
    let targetDate;
    if (typeof date === 'string' && date.match(/^\d{4}-\d{2}-\d{2}/)) {
      // Parse YYYY-MM-DD format directly as UTC
      const [year, month, day] = date.split('-').map(Number);
      targetDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    } else {
      targetDate = new Date(date);
      targetDate = new Date(Date.UTC(
        targetDate.getUTCFullYear(),
        targetDate.getUTCMonth(),
        targetDate.getUTCDate(),
        0, 0, 0, 0
      ));
    }
    
    const nextDay = new Date(targetDate);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    
    // Check if the date is a Sunday (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
    // Use UTC to get consistent day of week
    const dayOfWeek = targetDate.getUTCDay();
    const isSunday = dayOfWeek === 0;
    
    // Check for holiday in database
    const holiday = await Holiday.findOne({
      date: { $gte: targetDate, $lt: nextDay },
      isActive: true
    });
    
    // If it's a Sunday, return Sunday as a holiday
    if (isSunday) {
      return res.status(200).json({
        success: true,
        isHoliday: true,
        holiday: holiday || {
          name: 'Sunday',
          description: 'Weekly holiday',
          type: 'other',
          isSunday: true
        },
        isSunday: true
      });
    }
    
    res.status(200).json({
      success: true,
      isHoliday: !!holiday,
      holiday: holiday || null,
      isSunday: false
    });
  } catch (error) {
    console.error('Error checking holiday:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Create holiday (admin only)
export const createHoliday = async (req, res) => {
  try {
    const { name, date, description, type, academicYear } = req.body;
    
    if (!name || !date) {
      return res.status(400).json({
        success: false,
        message: 'Name and date are required'
      });
    }
    
    // Parse and normalize date - handle YYYY-MM-DD format to avoid timezone issues
    let dateToStore;
    if (typeof date === 'string' && date.match(/^\d{4}-\d{2}-\d{2}/)) {
      // Parse YYYY-MM-DD format directly as UTC midnight to preserve the calendar day
      const [year, month, day] = date.split('-').map(Number);
      dateToStore = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    } else {
      // Fallback for other date formats - parse and convert to UTC
      const parsedDate = new Date(date);
      dateToStore = new Date(Date.UTC(
        parsedDate.getUTCFullYear(),
        parsedDate.getUTCMonth(),
        parsedDate.getUTCDate(),
        0, 0, 0, 0
      ));
    }
    
    // Check if holiday already exists for this date
    // Use UTC date range to match stored dates
    const dayStart = new Date(dateToStore);
    const dayEnd = new Date(dateToStore);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
    
    const existingHoliday = await Holiday.findOne({
      date: { $gte: dayStart, $lte: dayEnd },
      isActive: true
    });
    
    if (existingHoliday) {
      return res.status(400).json({
        success: false,
        message: 'A holiday already exists for this date'
      });
    }
    
    // Get current academic year if not provided
    const currentAcadYear = academicYear || getCurrentAcademicYear();
    
    const holiday = await Holiday.create({
      name,
      date: dateToStore,
      description: description || '',
      type: type || 'school',
      academicYear: currentAcadYear,
      createdBy: req.user._id
    });
    
    const populatedHoliday = await Holiday.findById(holiday._id)
      .populate('createdBy', 'name email');
    
    res.status(201).json({
      success: true,
      message: 'Holiday created successfully',
      holiday: populatedHoliday
    });
  } catch (error) {
    console.error('Error creating holiday:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'A holiday already exists for this date'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Update holiday (admin only)
export const updateHoliday = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, date, description, type, isActive } = req.body;
    
    const holiday = await Holiday.findById(id);
    
    if (!holiday) {
      return res.status(404).json({
        success: false,
        message: 'Holiday not found'
      });
    }
    
    // If date is being updated, check for conflicts
    if (date) {
      // Parse date string to avoid timezone issues
      let dateToStore;
      if (typeof date === 'string' && date.match(/^\d{4}-\d{2}-\d{2}/)) {
        // Parse YYYY-MM-DD format directly as UTC midnight
        const [year, month, day] = date.split('-').map(Number);
        dateToStore = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
      } else {
        // Fallback for other date formats
        const parsedDate = new Date(date);
        dateToStore = new Date(Date.UTC(
          parsedDate.getUTCFullYear(),
          parsedDate.getUTCMonth(),
          parsedDate.getUTCDate(),
          0, 0, 0, 0
        ));
      }
      
      const dayStart = new Date(dateToStore);
      const dayEnd = new Date(dateToStore);
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
      
      const existingHoliday = await Holiday.findOne({
        _id: { $ne: id },
        date: { $gte: dayStart, $lte: dayEnd },
        isActive: true
      });
      
      if (existingHoliday) {
        return res.status(400).json({
          success: false,
          message: 'A holiday already exists for this date'
        });
      }
      
      holiday.date = dateToStore;
    }
    
    if (name) holiday.name = name;
    if (description !== undefined) holiday.description = description;
    if (type) holiday.type = type;
    if (isActive !== undefined) holiday.isActive = isActive;
    
    await holiday.save();
    
    const updatedHoliday = await Holiday.findById(holiday._id)
      .populate('createdBy', 'name email');
    
    res.status(200).json({
      success: true,
      message: 'Holiday updated successfully',
      holiday: updatedHoliday
    });
  } catch (error) {
    console.error('Error updating holiday:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Delete holiday (admin only)
export const deleteHoliday = async (req, res) => {
  try {
    const { id } = req.params;
    
    const holiday = await Holiday.findById(id);
    
    if (!holiday) {
      return res.status(404).json({
        success: false,
        message: 'Holiday not found'
      });
    }
    
    // Soft delete by setting isActive to false
    holiday.isActive = false;
    await holiday.save();
    
    res.status(200).json({
      success: true,
      message: 'Holiday deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting holiday:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Bulk create holidays (admin only)
export const bulkCreateHolidays = async (req, res) => {
  try {
    const { holidays } = req.body;
    
    if (!Array.isArray(holidays) || holidays.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Holidays array is required'
      });
    }
    
    const currentAcadYear = getCurrentAcademicYear();
    const createdHolidays = [];
    const errors = [];
    
    for (const holidayData of holidays) {
      try {
        const { name, date, description, type } = holidayData;
        
        if (!name || !date) {
          errors.push({ date, error: 'Name and date are required' });
          continue;
        }
        
        // Parse date string to avoid timezone issues
        let dateToStore;
        if (typeof date === 'string' && date.match(/^\d{4}-\d{2}-\d{2}/)) {
          // Parse YYYY-MM-DD format directly as UTC midnight
          const [year, month, day] = date.split('-').map(Number);
          dateToStore = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
        } else {
          // Fallback for other date formats
          const parsedDate = new Date(date);
          dateToStore = new Date(Date.UTC(
            parsedDate.getUTCFullYear(),
            parsedDate.getUTCMonth(),
            parsedDate.getUTCDate(),
            0, 0, 0, 0
          ));
        }
        
        const dayStart = new Date(dateToStore);
        const dayEnd = new Date(dateToStore);
        dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
        
        // Check if holiday already exists
        const existing = await Holiday.findOne({
          date: { $gte: dayStart, $lte: dayEnd },
          isActive: true
        });
        
        if (existing) {
          errors.push({ date, error: 'Holiday already exists for this date' });
          continue;
        }
        
        const holiday = await Holiday.create({
          name,
          date: dateToStore,
          description: description || '',
          type: type || 'school',
          academicYear: currentAcadYear,
          createdBy: req.user._id
        });
        
        createdHolidays.push(holiday);
      } catch (error) {
        errors.push({ date: holidayData.date, error: error.message });
      }
    }
    
    res.status(201).json({
      success: true,
      message: `Created ${createdHolidays.length} holiday(s)`,
      created: createdHolidays.length,
      holidays: createdHolidays,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error bulk creating holidays:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};
