// Node.js script to check and fix missing students in assignment submissions
// Usage: node fixMissingStudents.js

import mongoose from 'mongoose';

const MONGO_URI = 'mongodb://localhost:27017/YOUR_DB_NAME'; // Change to your DB name

const assignmentSchema = new mongoose.Schema({}, { strict: false, collection: 'assignments' });
const studentSchema = new mongoose.Schema({}, { strict: false, collection: 'students' });

const Assignment = mongoose.model('Assignment', assignmentSchema);
const Student = mongoose.model('Student', studentSchema);

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  // Get all unique studentIds from submissions
  const assignments = await Assignment.find({}, { submissions: 1 });
  const studentIds = new Set();
  assignments.forEach(a => {
    (a.submissions || []).forEach(s => {
      if (s.studentId) studentIds.add(s.studentId.toString());
    });
  });

  // Check which studentIds are missing
  const missing = [];
  for (const id of studentIds) {
    const exists = await Student.findById(id);
    if (!exists) missing.push(id);
  }

  if (missing.length === 0) {
    console.log('No missing students!');
  } else {
    console.log('Missing studentIds:', missing);
    // Optionally, create placeholder students
    for (const id of missing) {
      await Student.create({ _id: id, name: 'Unknown', email: 'unknown@example.com' });
      console.log('Inserted placeholder for', id);
    }
    console.log('Inserted placeholders for all missing students.');
  }

  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
