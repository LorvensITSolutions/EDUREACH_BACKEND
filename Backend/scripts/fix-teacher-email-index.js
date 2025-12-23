// Fix teacher email index issue
// This script removes the unique index on email field and drops the email field from existing documents

import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    console.log("Error connecting to MONGODB", error.message);
    process.exit(1);
  }
};

const fixTeacherEmailIndex = async () => {
  try {
    await connectDB();
    
    const db = mongoose.connection.db;
    const collection = db.collection('teachers');
    
    console.log("🔍 Checking existing indexes...");
    const indexes = await collection.indexes();
    console.log("Current indexes:", indexes.map(idx => ({ name: idx.name, key: idx.key })));
    
    // Drop the email unique index if it exists
    try {
      await collection.dropIndex({ email: 1 });
      console.log("✅ Dropped email unique index");
    } catch (error) {
      if (error.code === 27) {
        console.log("ℹ️  Email index doesn't exist, skipping...");
      } else {
        console.log("⚠️  Error dropping email index:", error.message);
      }
    }
    
    // Remove email field from all existing teacher documents
    console.log("🧹 Removing email field from existing teacher documents...");
    const result = await collection.updateMany(
      { email: { $exists: true } },
      { $unset: { email: "" } }
    );
    console.log(`✅ Updated ${result.modifiedCount} teacher documents`);
    
    // Create new index on teacherId if it doesn't exist
    try {
      await collection.createIndex({ teacherId: 1 }, { unique: true });
      console.log("✅ Created unique index on teacherId");
    } catch (error) {
      if (error.code === 85) {
        console.log("ℹ️  teacherId index already exists");
      } else {
        console.log("⚠️  Error creating teacherId index:", error.message);
      }
    }
    
    console.log("🎉 Teacher email index fix completed successfully!");
    
  } catch (error) {
    console.error("❌ Error fixing teacher email index:", error);
  } finally {
    await mongoose.connection.close();
    console.log("🔌 Database connection closed");
  }
};

// Run the fix
fixTeacherEmailIndex();
