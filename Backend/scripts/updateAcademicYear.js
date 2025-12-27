/**
 * Script to update all students with current academic year
 * Run this once to set currentAcademicYear for all existing students
 * 
 * Usage: node scripts/updateAcademicYear.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Student from '../models/student.model.js';

dotenv.config();

// Get current academic year in "YYYY-YYYY" format
const getCurrentAcademicYear = () => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  // If June or later, academic year is currentYear-nextYear, else previousYear-currentYear
  if (currentMonth >= 5) {
    return `${currentYear}-${currentYear + 1}`;
  } else {
    return `${currentYear - 1}-${currentYear}`;
  }
};

const updateAcademicYear = async () => {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      console.error('❌ MONGO_URI not found in environment variables');
      process.exit(1);
    }
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    const currentAcademicYear = getCurrentAcademicYear();
    console.log(`📅 Current Academic Year: ${currentAcademicYear}`);

    // Find all students without currentAcademicYear or with invalid format
    const students = await Student.find({});
    console.log(`📊 Total students found: ${students.length}`);

    let updated = 0;
    let skipped = 0;

    for (const student of students) {
      // Check if student has currentAcademicYear and if it's in correct format
      const hasValidAcademicYear = student.currentAcademicYear && 
        student.currentAcademicYear.includes('-') &&
        student.currentAcademicYear.split('-').length === 2;

      if (!hasValidAcademicYear) {
        // Update student with current academic year
        student.currentAcademicYear = currentAcademicYear;
        await student.save();
        updated++;
        console.log(`✅ Updated ${student.name} (${student.studentId}) - Set academic year to ${currentAcademicYear}`);
      } else {
        skipped++;
        console.log(`⏭️  Skipped ${student.name} (${student.studentId}) - Already has academic year: ${student.currentAcademicYear}`);
      }
    }

    console.log('\n📊 Summary:');
    console.log(`   Total students: ${students.length}`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`\n✅ Academic year update completed!`);

    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating academic year:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
};

// Run the update
updateAcademicYear();

