const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const authRoutes = require("./routes/auth");
const employeeRoutes = require("./routes/employee");
const adminRoutes = require("./routes/admin");
const configRoutes = require("./routes/config");
const requestRoutes = require("./routes/requests");
const notificationRoutes = require("./routes/notifications");
const cronService = require("./services/cronService");
const { ensureIndexes } = require("./services/indexMaintenanceService");
const { initializeSuperAdmin } = require("./controllers/authController");

const app = express();
const PORT = process.env.PORT || 5000;

// Security Middleware
app.use(helmet());

// Rate limiting disabled for development
// Uncomment the following code for production use:

/*
const isDevelopment = process.env.NODE_ENV === 'development';
const maxRequests = isDevelopment ? 2000 : 1000;

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: maxRequests,
  message: { error: "Too many requests from this IP, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skipFailedRequests: false,
  onLimitReached: (req, res) => {
    // Rate limit reached logging
  }
});

app.use("/api/", limiter);

const configLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100,
  message: { error: "Too many config requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skipFailedRequests: false,
});
*/

// CORS Configuration
app.use(
  cors({
    origin: "https://attendance.lorvensit.com", // ✅ must be exact frontend URL
    credentials: true, // ✅ allow cookies
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Body Parser
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Health Check
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    database:
      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/employee", employeeRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/config", configRoutes);
app.use("/api/requests", requestRoutes);
app.use("/api/notifications", notificationRoutes);

// 404 Handler
app.use("*", (req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Global Error Handler
app.use((err, req, res, next) => {
  // Log rate limiting errors specifically
  if (err.statusCode === 429) {
    // Rate limit exceeded logging
  }

  res.status(err.statusCode || 500).json({
    error: err.message || "Internal Server Error",
  });
});

// MongoDB Connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ Connected to MongoDB");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  }
};

// Start server
const startServer = async () => {
  await connectDB();

  // Initialize super admin if no users exist
  try {
    await initializeSuperAdmin();
  } catch (error) {
    console.error("❌ Super admin initialization error:", error);
  }

  // Ensure DB indexes are correct (fix legacy indexes)
  try {
    await ensureIndexes();
    console.log("✅ Index maintenance completed");
  } catch (error) {
    console.warn("⚠️ Index maintenance encountered issues:", error.message);
  }

  // Initialize cron service for auto punch-out
  try {
    cronService.init();
    console.log("✅ Cron service initialized");
  } catch (error) {
    console.error("❌ Cron service initialization error:", error);
  }

  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📧 Super Admin Email: superadmin@yopmail.com`);
    console.log(`🔑 Super Admin Password: Admin@123`);
  });
};

startServer();

module.exports = app;
