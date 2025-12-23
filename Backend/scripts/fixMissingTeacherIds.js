// scripts/fixMissingTeacherIds.js
import mongoose from "mongoose";
import Teacher from "../models/teacher.model.js";
import { generateTeacherId } from "../utils/credentialGenerator.js";
import dotenv from "dotenv";

dotenv.config();

const fixMissingTeacherIds = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/school_db");
    console.log("Connected to MongoDB");

    // Find all teachers without teacherId
    const teachersWithoutId = await Teacher.find({ teacherId: { $exists: false } });
    console.log(`Found ${teachersWithoutId.length} teachers without teacherId`);

    if (teachersWithoutId.length === 0) {
      console.log("All teachers already have teacherId");
      return;
    }

    // Generate teacherId for each teacher
    for (const teacher of teachersWithoutId) {
      try {
        const newTeacherId = await generateTeacherId();
        teacher.teacherId = newTeacherId;
        await teacher.save();
        console.log(`✅ Generated teacherId ${newTeacherId} for teacher: ${teacher.name}`);
      } catch (error) {
        console.error(`❌ Failed to generate teacherId for teacher ${teacher.name}:`, error.message);
      }
    }

    console.log("✅ Migration completed successfully");
  } catch (error) {
    console.error("❌ Migration failed:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  }
};

// Run the migration
fixMissingTeacherIds();
