import mongoose from 'mongoose';

async function dropEmailIndex() {
  try {
    // Try common MongoDB connection strings
    const connectionStrings = [
      'mongodb://localhost:27017/test',
      'mongodb://127.0.0.1:27017/test',
      'mongodb://localhost:27017/school_hub',
      'mongodb://127.0.0.1:27017/school_hub'
    ];
    
    let connected = false;
    for (const uri of connectionStrings) {
      try {
        console.log(`Trying to connect to: ${uri}`);
        await mongoose.connect(uri);
        console.log(`Connected to MongoDB: ${uri}`);
        connected = true;
        break;
      } catch (error) {
        console.log(`Failed to connect to ${uri}: ${error.message}`);
      }
    }
    
    if (!connected) {
      console.error('Could not connect to any MongoDB instance');
      process.exit(1);
    }
    
    // Drop the email index from users collection
    try {
      const result = await mongoose.connection.db.collection('users').dropIndex('email_1');
      console.log('Email index dropped successfully:', result);
    } catch (indexError) {
      if (indexError.code === 27) {
        console.log('Email index does not exist or already dropped');
      } else {
        console.error('Error dropping email index:', indexError.message);
      }
    }
    
    // List remaining indexes to confirm
    const indexes = await mongoose.connection.db.collection('users').listIndexes().toArray();
    console.log('Remaining indexes:');
    indexes.forEach(idx => {
      console.log(`- ${idx.name}: ${JSON.stringify(idx.key)}`);
    });
    
    console.log('Email index removal completed successfully!');
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

dropEmailIndex();