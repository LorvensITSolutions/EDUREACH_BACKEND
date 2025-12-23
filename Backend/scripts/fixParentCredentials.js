import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { generateParentCredentials } from '../utils/credentialGenerator.js';

// Load environment variables
dotenv.config();

const fixParentCredentials = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/test');
    console.log('Connected to MongoDB');

    // Import models
    const Parent = (await import('../models/parent.model.js')).default;
    const Student = (await import('../models/student.model.js')).default;

    // Find all parents without generatedCredentials
    const parentsWithoutCredentials = await Parent.find({
      $or: [
        { generatedCredentials: { $exists: false } },
        { generatedCredentials: null },
        { 'generatedCredentials.username': { $exists: false } }
      ]
    }).populate('children');

    console.log(`Found ${parentsWithoutCredentials.length} parents without credentials`);

    for (const parent of parentsWithoutCredentials) {
      try {
        // Find the first child to get student ID
        const firstChild = parent.children && parent.children.length > 0 ? parent.children[0] : null;
        
        if (firstChild) {
          // Generate credentials based on student ID
          const credentials = await generateParentCredentials(firstChild.studentId);
          
          // Update parent with credentials
          await Parent.findByIdAndUpdate(parent._id, {
            generatedCredentials: credentials
          });
          
          console.log(`✅ Fixed parent ${parent.name} with credentials: ${credentials.username}`);
        } else {
          // No children - generate sequential parent ID
          const { generateParentId } = await import('../utils/credentialGenerator.js');
          const parentId = await generateParentId();
          const credentials = {
            username: `P${parentId}`,
            password: `EDU${parentId}`,
            generatedAt: new Date()
          };
          
          await Parent.findByIdAndUpdate(parent._id, {
            generatedCredentials: credentials
          });
          
          console.log(`✅ Fixed parent ${parent.name} with sequential credentials: ${credentials.username}`);
        }
      } catch (error) {
        console.error(`❌ Error fixing parent ${parent.name}:`, error.message);
      }
    }

    console.log('✅ Parent credentials fix completed!');
    
    // Verify the fix
    const parentsWithCredentials = await Parent.find({
      'generatedCredentials.username': { $exists: true }
    });
    
    console.log(`✅ ${parentsWithCredentials.length} parents now have credentials`);
    
    // Show some examples
    const sampleParents = await Parent.find({
      'generatedCredentials.username': { $exists: true }
    }).limit(5).select('name generatedCredentials.username');
    
    console.log('Sample parent credentials:');
    sampleParents.forEach(p => {
      console.log(`  ${p.name}: ${p.generatedCredentials.username}`);
    });

  } catch (error) {
    console.error('Error fixing parent credentials:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

// Run the script
fixParentCredentials();
