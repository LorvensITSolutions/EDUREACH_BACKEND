const mongoose = require('mongoose');
require('dotenv').config();

// Import User model
const User = require('../src/models/User');

const cleanupInvitations = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find users with expired invitation tokens
    const expiredUsers = await User.find({
      invitationTokenExpires: { $lt: Date.now() },
      invitationToken: { $exists: true, $ne: null }
    });

    console.log(`Found ${expiredUsers.length} users with expired invitation tokens`);

    // Clear expired invitation tokens
    if (expiredUsers.length > 0) {
      await User.updateMany(
        {
          invitationTokenExpires: { $lt: Date.now() },
          invitationToken: { $exists: true, $ne: null }
        },
        {
          $unset: {
            invitationToken: 1,
            invitationTokenExpires: 1
          }
        }
      );
      console.log('Cleared expired invitation tokens');
    }

    // Find users with invitation tokens but no expiration
    const invalidUsers = await User.find({
      invitationToken: { $exists: true, $ne: null },
      invitationTokenExpires: { $exists: false }
    });

    console.log(`Found ${invalidUsers.length} users with invalid invitation tokens`);

    // Clear invalid invitation tokens
    if (invalidUsers.length > 0) {
      await User.updateMany(
        {
          invitationToken: { $exists: true, $ne: null },
          invitationTokenExpires: { $exists: false }
        },
        {
          $unset: {
            invitationToken: 1,
            invitationTokenExpires: 1
          }
        }
      );
      console.log('Cleared invalid invitation tokens');
    }

    console.log('Cleanup completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error during cleanup:', error);
    process.exit(1);
  }
};

cleanupInvitations(); 