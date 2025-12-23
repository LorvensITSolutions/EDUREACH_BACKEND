// /scripts/fixParentUserLinks.js

import mongoose from "mongoose";
import dotenv from "dotenv";
import Parent from "../models/parent.model.js";
import User from "../models/user.model.js";

dotenv.config(); // Load .env

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/test";

const fixParentLinks = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB");

    // Find parents that are missing userId
    const parentsWithoutUserId = await Parent.find({ userId: { $exists: false } });

    console.log(`🔍 Found ${parentsWithoutUserId.length} parent(s) without userId`);

    for (const parent of parentsWithoutUserId) {
      const user = await User.findOne({ email: parent.email, role: "parent" });

      if (user) {
        parent.userId = user._id;
        await parent.save();
        console.log(`✅ Linked parent ${parent.email} to user ${user._id}`);
      } else {
        console.warn(`❌ No user found for parent email: ${parent.email}`);
      }
    }

    console.log("✅ Done fixing parent-user links.");
    process.exit(0);
  } catch (err) {
    console.error("❌ Script error:", err);
    process.exit(1);
  }
};

fixParentLinks();
