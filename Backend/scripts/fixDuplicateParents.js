import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const fixDuplicateParents = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/test');
    console.log('Connected to MongoDB');

    // Import models
    const Parent = (await import('../models/parent.model.js')).default;
    const Student = (await import('../models/student.model.js')).default;
    const User = (await import('../models/user.model.js')).default;

    // Find parents with same name and phone but different credentials
    const parents = await Parent.find({}).populate('children');
    
    // Group by name + phone
    const parentGroups = {};
    parents.forEach(parent => {
      const key = `${parent.name}_${parent.phone}`;
      if (!parentGroups[key]) {
        parentGroups[key] = [];
      }
      parentGroups[key].push(parent);
    });

    // Process groups with multiple parents
    for (const [key, group] of Object.entries(parentGroups)) {
      if (group.length > 1) {
        console.log(`\nFound ${group.length} parents with same name/phone: ${key}`);
        
        // Keep the first parent, merge others
        const primaryParent = group[0];
        const duplicateParents = group.slice(1);
        
        console.log(`Primary parent: ${primaryParent.generatedCredentials?.username}`);
        console.log(`Duplicate parents: ${duplicateParents.map(p => p.generatedCredentials?.username).join(', ')}`);
        
        // Merge all children to primary parent
        for (const duplicateParent of duplicateParents) {
          // Move children to primary parent
          await Student.updateMany(
            { parent: duplicateParent._id },
            { parent: primaryParent._id }
          );
          
          // Update parent's children array
          await Parent.findByIdAndUpdate(primaryParent._id, {
            $addToSet: { children: { $each: duplicateParent.children } }
          });
          
          // Delete duplicate parent's user account
          if (duplicateParent.userId) {
            await User.findByIdAndDelete(duplicateParent.userId);
          }
          
          // Delete duplicate parent
          await Parent.findByIdAndDelete(duplicateParent._id);
          
          console.log(`Merged parent ${duplicateParent.generatedCredentials?.username} into ${primaryParent.generatedCredentials?.username}`);
        }
      }
    }

    console.log('\n✅ Duplicate parents fixed!');
    
    // Verify the fix
    const remainingParents = await Parent.find({}).populate('children');
    console.log(`\nRemaining parents: ${remainingParents.length}`);
    
    remainingParents.forEach(p => {
      console.log(`Parent: ${p.name} (${p.phone})`);
      console.log(`Username: ${p.generatedCredentials?.username}`);
      console.log(`Children: ${p.children.map(c => c.studentId).join(', ')}`);
      console.log('---');
    });

  } catch (error) {
    console.error('Error fixing duplicate parents:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

// Run the script
fixDuplicateParents();

