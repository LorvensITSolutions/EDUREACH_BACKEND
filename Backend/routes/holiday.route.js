// routes/holiday.route.js
import express from 'express';
import {
  getAllHolidays,
  getHolidayById,
  checkHoliday,
  createHoliday,
  updateHoliday,
  deleteHoliday,
  bulkCreateHolidays
} from '../controllers/holiday.controller.js';
import { protectRoute, adminRoute } from '../middleware/auth.middleware.js';

const router = express.Router();

// Public route - check if a date is a holiday (used by attendance marking)
router.get('/check', checkHoliday);

// Get holidays - accessible to all authenticated users (teachers, admins, etc.) for viewing
router.get('/', protectRoute, getAllHolidays);

// Admin routes - manage holidays (create, update, delete)
router.get('/:id', protectRoute, adminRoute, getHolidayById);
router.post('/', protectRoute, adminRoute, createHoliday);
router.post('/bulk', protectRoute, adminRoute, bulkCreateHolidays);
router.put('/:id', protectRoute, adminRoute, updateHoliday);
router.delete('/:id', protectRoute, adminRoute, deleteHoliday);

export default router;
