const mongoose = require("mongoose");
require("dotenv").config();

// Import the User model
const User = require("../src/models/User");

const createSuperAdmin = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ Connected to MongoDB");

    // Check if users already exist
    const existingUsers = await User.countDocuments();
    
    if (existingUsers > 0) {
      console.log("❌ Users already exist in the database. Cannot create super admin.");
      console.log("   If you want to create a super admin, please clear the database first.");
      process.exit(1);
    }

    // Create super admin user
    const superAdmin = await User.create({
      name: "Super Administrator",
      email: "superadmin@yopmail.com",
      password: "Admin@123",
      employeeId: "SUPER001",
      department: "IT",
      role: "admin",
      status: "active",
      isEmailVerified: true,
      registrationStep: 4,
    });

    console.log("✅ Super admin created successfully!");
    console.log("📋 User Details:");
    console.log(`   Name: ${superAdmin.name}`);
    console.log(`   Email: ${superAdmin.email}`);
    console.log(`   Password: Admin@123`);
    console.log(`   Employee ID: ${superAdmin.employeeId}`);
    console.log(`   Department: ${superAdmin.department}`);
    console.log(`   Role: ${superAdmin.role}`);
    console.log(`   Status: ${superAdmin.status}`);
    console.log("");
    console.log("🔐 You can now login with these credentials:");
    console.log("   Email: superadmin@yopmail.com");
    console.log("   Password: Admin@123");

  } catch (error) {
    console.error("❌ Error creating super admin:", error);
  } finally {
    // Close the database connection
    await mongoose.connection.close();
    console.log("🔌 Database connection closed");
    process.exit(0);
  }
};

// Run the script
createSuperAdmin(); 