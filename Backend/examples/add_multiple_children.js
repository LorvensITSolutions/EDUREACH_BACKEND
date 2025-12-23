// Example: Adding multiple children for the same parent
import { generateStudentId, generateStudentCredentials, generateParentCredentialsByEmail } from '../utils/credentialGenerator.js';
import Student from '../models/student.model.js';
import Parent from '../models/parent.model.js';
import User from '../models/user.model.js';

// Example function to add multiple children for same parent
export const addMultipleChildrenForParent = async (parentInfo, childrenInfo) => {
  try {
    const { parentName, parentEmail, parentPhone } = parentInfo;
    
    // 1. Check if parent already exists
    let parent = await Parent.findOne({ email: parentEmail });
    
    if (!parent) {
      // Create parent with credentials
      const parentCredentials = await generateParentCredentialsByEmail(parentEmail);
      
      const parentUser = await User.create({
        name: parentName,
        email: parentEmail,
        password: parentCredentials.password,
        role: "parent",
        mustChangePassword: true,
      });

      parent = await Parent.create({
        userId: parentUser._id,
        name: parentName,
        email: parentEmail,
        phone: parentPhone || "",
        generatedCredentials: parentCredentials
      });

      parentUser.parentId = parent._id;
      await parentUser.save();
      
      console.log(`✅ Created new parent: ${parentName} with credentials: ${parentCredentials.username}/${parentCredentials.password}`);
    } else {
      console.log(`✅ Using existing parent: ${parentName} with credentials: ${parent.generatedCredentials.username}/${parent.generatedCredentials.password}`);
    }

    // 2. Add all children to the same parent
    const createdChildren = [];
    
    for (const childInfo of childrenInfo) {
      const { name, email, class: className, section, birthDate } = childInfo;
      
      // Generate student ID and credentials
      const studentId = await generateStudentId();
      const studentCredentials = await generateStudentCredentials(studentId);
      
      // Create student
      const student = await Student.create({
        studentId,
        name,
        email: email || `${studentId}@school.local`,
        class: className,
        section,
        birthDate: birthDate ? new Date(birthDate) : new Date(),
        parent: parent._id,
        generatedCredentials: {
          username: studentCredentials.username,
          password: studentCredentials.password
        }
      });

      // Create student user
      const studentUser = await User.create({
        name,
        email: email || `${studentId}@school.local`,
        password: studentCredentials.password,
        role: "student",
        mustChangePassword: true,
        studentId: student._id,
      });

      student.userId = studentUser._id;
      await student.save();

      // Add child to parent
      await Parent.findByIdAndUpdate(parent._id, { 
        $addToSet: { children: student._id } 
      });

      createdChildren.push({
        studentId: student.studentId,
        name: student.name,
        credentials: studentCredentials
      });
      
      console.log(`✅ Added child: ${name} (${studentId}) with credentials: ${studentCredentials.username}/${studentCredentials.password}`);
    }

    return {
      parent: {
        name: parent.name,
        email: parent.email,
        credentials: parent.generatedCredentials,
        childrenCount: parent.children.length
      },
      children: createdChildren
    };

  } catch (error) {
    console.error('Error adding multiple children:', error);
    throw error;
  }
};

// Example usage
const exampleUsage = async () => {
  const parentInfo = {
    parentName: "Sarah Wilson",
    parentEmail: "sarah.wilson@example.com",
    parentPhone: "+1234567890"
  };

  const childrenInfo = [
    {
      name: "Emma Wilson",
      email: "emma.wilson@school.local",
      class: "X",
      section: "A",
      birthDate: "2008-03-15"
    },
    {
      name: "Liam Wilson", 
      email: "liam.wilson@school.local",
      class: "VIII",
      section: "B",
      birthDate: "2010-07-22"
    },
    {
      name: "Sophia Wilson",
      email: "sophia.wilson@school.local", 
      class: "VI",
      section: "A",
      birthDate: "2012-11-08"
    }
  ];

  try {
    const result = await addMultipleChildrenForParent(parentInfo, childrenInfo);
    console.log('\n🎉 Successfully added multiple children:');
    console.log('Parent:', result.parent);
    console.log('Children:', result.children);
  } catch (error) {
    console.error('Failed to add children:', error);
  }
};

// Uncomment to run the example
// exampleUsage();
