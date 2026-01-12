/**
 * Migration script to fix CustomFee collection index
 * 
 * This script:
 * 1. Drops the old unique index on 'student' only (if it exists)
 * 2. Creates a compound unique index on 'student' and 'academicYear'
 * 
 * This allows multiple custom fees per student (one per academic year)
 * 
 * Usage: node scripts/fixCustomFeeIndex.js
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import CustomFee from "../models/customFee.model.js";
import { connectDB } from "../lib/db.js";

// Load environment variables
dotenv.config();

const fixCustomFeeIndex = async () => {
  try {
    // Connect to database
    await connectDB();

    const collection = mongoose.connection.db.collection("customfees");
    
    // Get all indexes
    const indexes = await collection.indexes();
    indexes.forEach((idx, i) => {
      console.log(`  ${i + 1}. ${JSON.stringify(idx.key)} - ${idx.unique ? 'UNIQUE' : 'NON-UNIQUE'}`);
    });

    // Check if old index on 'student' only exists
    const oldIndex = indexes.find(
      idx => idx.key && idx.key.student === 1 && !idx.key.academicYear && idx.unique
    );

    if (oldIndex) {
      try {
        await collection.dropIndex("student_1");
        console.log("✅ Dropped old index on 'student'");
      } catch (err) {
        if (err.code === 27) {
          console.log("ℹ️  Index 'student_1' doesn't exist (might have different name)");
        } else {
          // Try to drop by key pattern
          try {
            await collection.dropIndex({ student: 1 });
            console.log("✅ Dropped old index on 'student' (by key pattern)");
          } catch (err2) {
            console.error("❌ Error dropping old index:", err2.message);
            // Continue anyway - might already be dropped
          }
        }
      }
    } else {
      console.log("\nℹ️  No old unique index on 'student' only found");
    }

    // Check if compound index already exists
    const compoundIndex = indexes.find(
      idx => idx.key && idx.key.student === 1 && idx.key.academicYear === 1 && idx.unique
    );

    if (compoundIndex) {
      console.log("\n✅ Compound unique index on 'student' and 'academicYear' already exists");
    } else {
      console.log("\n📝 Creating compound unique index on 'student' and 'academicYear'...");
      try {
        // Create the compound unique index
        await CustomFee.collection.createIndex(
          { student: 1, academicYear: 1 },
          { unique: true, name: "student_1_academicYear_1" }
        );
        console.log("✅ Created compound unique index on 'student' and 'academicYear'");
      } catch (err) {
        console.error("❌ Error creating compound index:", err.message);
        throw err;
      }
    }

    // Verify final indexes
    const finalIndexes = await collection.indexes();
    console.log("\n📋 Final indexes:");
    finalIndexes.forEach((idx, i) => {
      console.log(`  ${i + 1}. ${JSON.stringify(idx.key)} - ${idx.unique ? 'UNIQUE' : 'NON-UNIQUE'}`);
    });



  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log("\n🔌 Database connection closed");
    process.exit(0);
  }
};

// Run the migration
fixCustomFeeIndex();
