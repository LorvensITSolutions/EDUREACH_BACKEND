import express from 'express';
import {
  createAnnouncement,
  getAnnouncements,
  togglePin
} from '../controllers/announcement.controller.js';
import { protectRoute, adminRoute } from '../middleware/auth.middleware.js';
import { deleteAnnouncement } from '../controllers/announcement.controller.js';

const router = express.Router();

router.post('/', protectRoute, adminRoute, createAnnouncement);
router.get('/', getAnnouncements);
router.patch('/:id/pin', protectRoute, adminRoute, togglePin);
router.delete("/:id", protectRoute, adminRoute, deleteAnnouncement);

export default router;
