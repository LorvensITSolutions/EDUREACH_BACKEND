const mongoose = require("mongoose");
const Attendance = require("../models/Attendance");

/**
 * Ensures MongoDB indexes match the current schema and cleans up stale indexes.
 * This specifically fixes legacy indexes like { user: 1, date: 1 } that would
 * conflict with the current { employee: 1, date: 1 } unique index.
 */
async function ensureIndexes() {
  try {
    // Sync schema-defined indexes (creates missing, drops extraneous)
    await Attendance.syncIndexes();

    // Extra safety: if a legacy index on { user: 1, date: 1 } exists, drop it.
    const collection = mongoose.connection.collection("attendances");
    const indexes = await collection.indexes();
    const legacy = indexes.find(
      (idx) => idx.key && Object.keys(idx.key).length === 2 && idx.key.user === 1 && idx.key.date === 1
    );
    if (legacy && legacy.name) {
      await collection.dropIndex(legacy.name);
      // Recreate the correct unique index if needed (syncIndexes should have done this already)
      await collection.createIndex({ employee: 1, date: 1 }, { unique: true, name: "employee_1_date_1" });
    }
    return true;
  } catch (error) {
    // Do not crash the app; just log a warning
    console.warn("Index maintenance warning:", error.message);
    return false;
  }
}

module.exports = { ensureIndexes };


