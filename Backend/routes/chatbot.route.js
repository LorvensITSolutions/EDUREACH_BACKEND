// routes/chatbot.routes.js
import express from "express";
import { protectRoute, adminRoute } from "../middleware/auth.middleware.js";
import { adminChatbotHandler } from "../controllers/chatbot.controller.js";

const router = express.Router();

// ✅ Admin-only chatbot
router.post("/", protectRoute, adminRoute, adminChatbotHandler);

export default router;
