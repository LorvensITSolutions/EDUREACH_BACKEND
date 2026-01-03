import express from "express";

import { adminRoute, parentRoute, protectRoute } from "../middleware/auth.middleware.js";
import { createFeeStructure,  getFeeStructureForAllChildren} from "../controllers/fee.controller.js";

import {
  getAllFeeStructures,
  deleteStructure,
  updateStructure
} from "../controllers/fee.controller.js";

import { sendWhatsApp } from "../utils/sendWhatsApp.js";
import { createPaymentOrder,  getAllStudentsFeeStatus,  getMyPayments, sendFeeReminder, verifyPayment, verifyOfflinePayment, getPendingOfflinePayments, generatePaymentReceipt, downloadReceipt, getAvailableClasses } from "../controllers/payment.controller.js";
import { createOrUpdateCustomFee, getAllCustomFees, updateCustomFee } from "../controllers/customFee.controller.js";
const router = express.Router();

router.post("/create-order", protectRoute, createPaymentOrder);
router.post("/create-fee-structure", protectRoute, adminRoute, createFeeStructure);
router.get("/fee-structure", protectRoute, parentRoute, getFeeStructureForAllChildren);
router.post("/verify", protectRoute, verifyPayment);
router.get("/my-payments", protectRoute, parentRoute, getMyPayments);

//admin-specific routes

router.get("/all", protectRoute, adminRoute, getAllFeeStructures);
router.put("/:id", protectRoute, adminRoute, updateStructure);
router.delete("/:id", protectRoute, adminRoute, deleteStructure);

// ✅ ADMIN: Fee Tracking and Reminders
router.get("/fee-defaulters", protectRoute, adminRoute, getAllStudentsFeeStatus);   // Get student status (paid/unpaid)
router.get("/available-classes", protectRoute, adminRoute, getAvailableClasses);   // Get available classes for academic year
router.post("/send-reminder/:studentId", protectRoute, adminRoute, sendFeeReminder);
router.post("/custom-fee", protectRoute, adminRoute, createOrUpdateCustomFee);
router.get("/custom-fees", protectRoute, adminRoute, getAllCustomFees);
router.put("/custom-fee/:customFeeId", protectRoute, adminRoute, updateCustomFee);

// ✅ ADMIN: Offline Payment Verification
router.post("/verify-offline/:paymentId", protectRoute, adminRoute, verifyOfflinePayment);
router.get("/pending-offline", protectRoute, adminRoute, getPendingOfflinePayments);

// ✅ Receipt Generation (for both parents and admins)
router.post("/generate-receipt/:paymentId", protectRoute, generatePaymentReceipt);
router.get("/receipt/:paymentId", protectRoute, downloadReceipt);


// Manual reminder
router.get("/test-whatsapp", async (req, res) => {
  try {
    await sendWhatsApp({
      to: '+918074446902',
      message: '✅ WhatsApp test message from EduReach!',
    });
    res.json({ success: true, message: "Message sent" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


export default router;
