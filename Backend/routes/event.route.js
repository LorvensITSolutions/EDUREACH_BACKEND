import express from 'express';
import { createEvent, getEvents, toggleRSVP, deleteEvent } from '../controllers/event.controller.js';
import { protectRoute, adminRoute } from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/', protectRoute, adminRoute, createEvent);
router.get('/', getEvents);
router.patch('/:id/rsvp', protectRoute, toggleRSVP);
router.delete('/:id', protectRoute, adminRoute, deleteEvent);

export default router;