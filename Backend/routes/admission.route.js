import express from 'express';
import { createApplication, getAllApplications, getApplicationById, reviewApplication, exportAcceptedStudentsToExcel } from '../controllers/admission.controller.js';
import { adminRoute, protectRoute } from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/', createApplication);
router.get('/', protectRoute, adminRoute, getAllApplications);
router.get('/export/accepted', protectRoute, adminRoute, exportAcceptedStudentsToExcel);
router.get('/:id', protectRoute, adminRoute, getApplicationById);
router.put('/:id/review', protectRoute, adminRoute, reviewApplication);

export default router;
