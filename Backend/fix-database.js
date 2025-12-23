// Quick database fix for teacher email index issue
// Run this with: node fix-database.js

import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const fixDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");
    
    const db = mongoose.connection.db;
    const collection = db.collection('teachers');
    
    // Drop the email unique index
    try {
      await collection.dropIndex({ email: 1 });
      console.log("✅ Dropped email unique index");
    } catch (error) {
      console.log("ℹ️  Email index doesn't exist or already dropped");
    }
    
    // Remove email field from all documents
    const result = await collection.updateMany(
      {},
      { $unset: { email: "" } }
    );
    console.log(`✅ Removed email field from ${result.modifiedCount} documents`);
    
    console.log("🎉 Database fix completed!");
    
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
};

fixDatabase();
