const express = require("express");
const router = express.Router();
const { protect, requireAdmin } = require("../middlewares/auth");
const {
  validateRequestCreation,
  validateRequestStatusUpdate,
} = require("../middlewares/validation");
const {
  createRequest,
  getEmployeeRequests,
  getAllRequests,
  updateRequestStatus,
  getRequestStats,
  deleteRequest,
} = require("../controllers/requestController");

// Employee routes
router.post("/", protect, validateRequestCreation, createRequest);
router.get("/employee", protect, getEmployeeRequests);
router.get("/stats", protect, getRequestStats);
router.delete("/:requestId", protect, deleteRequest);

// Admin routes
router.get("/", protect, requireAdmin, getAllRequests);
router.put(
  "/:requestId/status",
  protect,
  requireAdmin,
  validateRequestStatusUpdate,
  updateRequestStatus
);

module.exports = router;
