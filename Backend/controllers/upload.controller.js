// // import xlsx from "xlsx";

// import xlsx from "xlsx";
// import fs from "fs";
// import path from "path";
// import { fileURLToPath } from "url";
// import unzipper from "unzipper";
// import cloudinary from "../lib/cloudinary.js";
// import Student from "../models/student.model.js";
// import Parent from "../models/parent.model.js";
// import User from "../models/user.model.js";
// import { generateStudentId, generateStudentCredentials, generateParentCredentialsByEmail, generateParentCredentials } from "../utils/credentialGenerator.js";
// import { invalidateCache } from "../lib/redis.js";

// // Get __dirname equivalent for ES modules
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// // Helper: Upload local image to Cloudinary
// const uploadImageToCloudinary = async (filePath, studentId) => {
//   try {
//     const result = await cloudinary.uploader.upload(filePath, {
//       folder: "students",
//       public_id: studentId,
//     });
//     return { public_id: result.public_id, url: result.secure_url };
//   } catch (err) {
//     console.error(`Cloudinary upload failed for ${filePath}`, err.message);
//     return null;
//   }
// };

// // ===================== Bulk Upload Students =====================
// export const uploadStudents = async (req, res) => {
//   try {
//     if (!req.files || !req.files.excel || !req.files.excel[0]) {
//       return res.status(400).json({ message: "Excel file is required" });
//     }

//     const excelFilePath = req.files.excel[0].path;
//     const imagesZipPath =
//       req.files.imagesZip && req.files.imagesZip[0]
//         ? req.files.imagesZip[0].path
//         : null;

//     // Extract ZIP images if provided
//     let tempDir = null;
//     if (imagesZipPath) {
//       tempDir = path.join(__dirname, "../tmp", `images_${Date.now()}`);
//       fs.mkdirSync(tempDir, { recursive: true });
//       await fs
//         .createReadStream(imagesZipPath)
//         .pipe(unzipper.Extract({ path: tempDir }))
//         .promise();
//     }

//     // Read Excel
//     const workbook = xlsx.readFile(excelFilePath);
//     const sheet = workbook.Sheets[workbook.SheetNames[0]];
//     const rawData = xlsx.utils.sheet_to_json(sheet);

//     // Validate rows
//     const validationErrors = [];
//     rawData.forEach((row, index) => {
//       if (!row.studentId) validationErrors.push(`Row ${index + 2}: Student ID required`);
//       if (!row.name) validationErrors.push(`Row ${index + 2}: Student name required`);
//       if (!row.class) validationErrors.push(`Row ${index + 2}: Class required`);
//       if (!row.section) validationErrors.push(`Row ${index + 2}: Section required`);
//       if (!row.birthDate) validationErrors.push(`Row ${index + 2}: Birth date required`);
//       if (!row.parentName) validationErrors.push(`Row ${index + 2}: Parent name required`);
//       if (!row.parentPhone) validationErrors.push(`Row ${index + 2}: Parent phone required`);
//     });

//     if (validationErrors.length > 0) {
//       return res.status(400).json({ message: "Validation errors", errors: validationErrors });
//     }

//     // Check duplicates
//     const studentIds = rawData.map((r) => r.studentId);
//     const duplicateIds = studentIds.filter((id, i) => studentIds.indexOf(id) !== i);
//     if (duplicateIds.length > 0) {
//       return res.status(400).json({
//         message: "Duplicate student IDs in Excel",
//         duplicateIds: [...new Set(duplicateIds)],
//       });
//     }

//     // Check DB for existing IDs
//     const existingStudents = await Student.find({ studentId: { $in: studentIds } });
//     if (existingStudents.length > 0) {
//       const existingIds = existingStudents.map((s) => s.studentId);
//       return res.status(400).json({
//         message: "Some student IDs already exist in DB",
//         existingIds,
//       });
//     }

//     // Group rows by parent (name + phone)
//     const parentGroups = {};
//     rawData.forEach((row, index) => {
//       const parentKey = `${row.parentName}_${row.parentPhone}`;
//       if (!parentGroups[parentKey]) {
//         parentGroups[parentKey] = {
//           parentName: row.parentName,
//           parentPhone: row.parentPhone,
//           children: []
//         };
//       }
//       parentGroups[parentKey].children.push({ ...row, rowIndex: index + 2 });
//     });

//     // Process each parent group
//     const studentsWithIds = [];
//     for (const [parentKey, parentGroup] of Object.entries(parentGroups)) {
//       // 🔑 Find or create parent
//       let parent = await Parent.findOne({ 
//         name: parentGroup.parentName, 
//         phone: parentGroup.parentPhone 
//       });
      
//       if (!parent) {
//         // Create parent with credentials based on FIRST child
//         const firstChildId = parentGroup.children[0].studentId;
//         const parentCredentials = await generateParentCredentials(firstChildId);
//         const parentUser = await User.create({
//           name: parentGroup.parentName,
//           password: parentCredentials.password,
//           role: "parent",
//           mustChangePassword: true,
//         });

//         parent = await Parent.create({
//           userId: parentUser._id,
//           name: parentGroup.parentName,
//           phone: parentGroup.parentPhone,
//           generatedCredentials: parentCredentials,
//         });

//         parentUser.parentId = parent._id;
//         await parentUser.save();
//       }

//       // Process all children for this parent
//       for (const row of parentGroup.children) {
//         const studentId = row.studentId;

//         // 📸 Upload image if exists
//         let imageData = null;
//         if (tempDir) {
//           for (const ext of [".jpg", ".jpeg", ".png"]) {
//             const possiblePath = path.join(tempDir, `${studentId}${ext}`);
//             if (fs.existsSync(possiblePath)) {
//               imageData = await uploadImageToCloudinary(possiblePath, studentId);
//               break;
//             }
//           }
//         }

//         // 👨‍🎓 Student credentials
//         const studentCredentials = await generateStudentCredentials(studentId);

//         // 👨‍🎓 Create student
//         const student = await Student.create({
//           studentId,
//           name: row.name,
//           class: row.class,
//           section: row.section,
//           birthDate: new Date(row.birthDate),
//           parent: parent._id,
//           image: imageData,
//           generatedCredentials: studentCredentials,
//         });

//         // 👤 Student User
//         const studentUser = await User.create({
//           name: row.name,
//           password: studentCredentials.password,
//           role: "student",
//           mustChangePassword: true,
//           studentId: student._id,
//         });
//         student.userId = studentUser._id;
//         await student.save();

//         // 👨‍👧 Link child to parent
//         await Parent.findByIdAndUpdate(parent._id, {
//           $addToSet: { children: student._id },
//         });

//         studentsWithIds.push(student);
//       }
//     }

//     // Cleanup
//     fs.unlinkSync(excelFilePath);
//     if (imagesZipPath) fs.unlinkSync(imagesZipPath);
//     if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });

//     await invalidateCache.students();

//     res.status(201).json({
//       message: "Students uploaded successfully",
//       count: studentsWithIds.length,
//     });
//   } catch (error) {
//     console.error("Upload error:", error);
//     res.status(500).json({ message: "Upload failed", error: error.message });
//   }
// };

// // ===================== Single Student Creation =====================
// export const createSingleStudent = async (req, res) => {
//   try {
//     const { studentId, name, class: className, section, birthDate, parentName, parentPhone } =
//       req.body;

//     if (!studentId || !name || !className || !section || !birthDate || !parentName || !parentPhone) {
//       return res.status(400).json({ message: "All fields are required" });
//     }

//     // check student ID
//     const existingStudent = await Student.findOne({ studentId });
//     if (existingStudent) {
//       return res.status(400).json({ message: `Student ID ${studentId} already exists` });
//     }

//     // 🔑 Find or create parent by name AND phone (to ensure same parent)
//     let parent = await Parent.findOne({ 
//       name: parentName, 
//       phone: parentPhone 
//     });
//     if (!parent) {
//       const parentCredentials = await generateParentCredentials(studentId);
//       const parentUser = await User.create({
//         name: parentName,
//         password: parentCredentials.password,
//         role: "parent",
//         mustChangePassword: true,
//       });

//       parent = await Parent.create({
//         userId: parentUser._id,
//         name: parentName,
//         phone: parentPhone,
//         generatedCredentials: parentCredentials,
//       });

//       parentUser.parentId = parent._id;
//       await parentUser.save();
//     }

//     // 📸 Image if uploaded
//     let imageData = null;
//     if (req.file) {
//       imageData = await uploadImageToCloudinary(req.file.path, studentId);
//       fs.unlinkSync(req.file.path);
//     }

//     // 👨‍🎓 Student credentials
//     const studentCredentials = await generateStudentCredentials(studentId);

//     // 👨‍🎓 Create Student
//     const student = await Student.create({
//       studentId,
//       name,
//       class: className,
//       section,
//       birthDate: new Date(birthDate),
//       parent: parent._id,
//       image: imageData,
//       generatedCredentials: studentCredentials,
//     });

//     // 👤 Student User (no email - uses ID-based login)
//     const studentUser = await User.create({
//       name,
//       password: studentCredentials.password,
//       role: "student",
//       mustChangePassword: true,
//       studentId: student._id,
//     });
//     student.userId = studentUser._id;
//     await student.save();

//     // 👨‍👧 Link child to parent
//     await Parent.findByIdAndUpdate(parent._id, { $addToSet: { children: student._id } });

//     await invalidateCache.students();

//     res.status(201).json({ message: "Student created successfully", student });
//   } catch (error) {
//     console.error("Create single student error:", error);
//     res.status(500).json({ message: "Failed to create student", error: error.message });
//   }
// };


//new one__________________________________________________

// // ===================== Bulk Upload Students =====================
// export const uploadStudents = async (req, res) => {
//   try {
//     // Check if required files exist
//     if (!req.files || !req.files.excel || !req.files.excel[0]) {
//       return res.status(400).json({ message: "Excel file is required" });
//     }

//     const excelFilePath = req.files.excel[0].path;
//     const imagesZipPath = req.files.imagesZip && req.files.imagesZip[0] ? req.files.imagesZip[0].path : null;

//     // Extract ZIP images to temp folder (only if ZIP file provided)
//     let tempDir = null;
//     if (imagesZipPath) {
//       tempDir = path.join(__dirname, "../tmp", `images_${Date.now()}`);
//       fs.mkdirSync(tempDir, { recursive: true });
//       await fs.createReadStream(imagesZipPath).pipe(unzipper.Extract({ path: tempDir })).promise();
//     }

//     // Read Excel
//     const workbook = xlsx.readFile(excelFilePath);
//     const sheet = workbook.Sheets[workbook.SheetNames[0]];
//     const rawData = xlsx.utils.sheet_to_json(sheet);

//     // Validate all rows first
//     const validationErrors = [];
//     rawData.forEach((row, index) => {
//       if (!row.studentId) {
//         validationErrors.push(`Row ${index + 2}: Student ID is required`);
//       }
//       if (!row.name) {
//         validationErrors.push(`Row ${index + 2}: Student name is required`);
//       }
//       if (!row.class) {
//         validationErrors.push(`Row ${index + 2}: Class is required`);
//       }
//       if (!row.section) {
//         validationErrors.push(`Row ${index + 2}: Section is required`);
//       }
//       if (!row.birthDate) {
//         validationErrors.push(`Row ${index + 2}: Birth date is required`);
//       }
//       if (!row.parentName) {
//         validationErrors.push(`Row ${index + 2}: Parent name is required`);
//       }
//       if (!row.parentPhone) {
//         validationErrors.push(`Row ${index + 2}: Parent phone is required`);
//       }
//     });

//     if (validationErrors.length > 0) {
//       return res.status(400).json({ 
//         message: "Validation errors found", 
//         errors: validationErrors 
//       });
//     }

//     // Check for duplicate student IDs
//     const studentIds = rawData.map(row => row.studentId);
//     const duplicateIds = studentIds.filter((id, index) => studentIds.indexOf(id) !== index);
//     if (duplicateIds.length > 0) {
//       return res.status(400).json({ 
//         message: "Duplicate student IDs found in Excel file", 
//         duplicateIds: [...new Set(duplicateIds)] 
//       });
//     }

//     // Check if any student IDs already exist in database
//     const existingStudents = await Student.find({ studentId: { $in: studentIds } });
//     if (existingStudents.length > 0) {
//       const existingIds = existingStudents.map(s => s.studentId);
//       return res.status(400).json({ 
//         message: "Some student IDs already exist in database", 
//         existingIds 
//       });
//     }

//     const studentsWithIds = await Promise.all(
//       rawData.map(async (row) => {
//         // Student ID is now required and validated
//         const studentId = row.studentId;
        
//         // No email fields - using ID-based login

//         // 1️⃣ Parent creation with consistent credentials
//         let parent = await Parent.findOne({ name: row.parentName, phone: row.parentPhone });
//         if (!parent) {
//           // Generate parent credentials using student ID pattern (PS + StudentID)
//           const parentCredentials = await generateParentCredentials(studentId);
//           console.log('Generated parent credentials:', parentCredentials);
          
//           const parentUser = await User.create({
//             name: row.parentName,
//             password: parentCredentials.password,
//             role: "parent",
//             mustChangePassword: true,
//           });

//           parent = await Parent.create({
//             userId: parentUser._id,
//             name: row.parentName,
//             phone: row.parentPhone || "",
//             generatedCredentials: parentCredentials
//           });
          
//           console.log('Created parent with credentials:', {
//             id: parent._id,
//             name: parent.name,
//             credentials: parent.generatedCredentials
//           });

//           parentUser.parentId = parent._id;
//           await parentUser.save();
//         } else {
//           // Parent exists - use existing credentials
//           console.log(`Parent ${row.parentName} already exists, using existing credentials`);
//         }

//         // 2️⃣ Match image from ZIP (only if tempDir exists)
//         let imageData = null;
//         if (tempDir) {
//           const imageExtensions = [".jpg", ".jpeg", ".png"];
//           for (const ext of imageExtensions) {
//             const possiblePath = path.join(tempDir, `${studentId}${ext}`);
//             if (fs.existsSync(possiblePath)) {
//               imageData = await uploadImageToCloudinary(possiblePath, studentId);
//               break;
//             }
//           }
//         }

//         // 3️⃣ Generate student credentials
//         const studentCredentials = await generateStudentCredentials(studentId);
        
//         // 4️⃣ Create Student
//         const student = await Student.create({
//           studentId,
//           name: row.name,
//           class: row.class,
//           section: row.section,
//           birthDate: row.birthDate ? new Date(row.birthDate) : new Date(), // Use provided birth date or default to today
//           parent: parent._id,
//           image: imageData,
//           generatedCredentials: {
//             username: studentCredentials.username,
//             password: studentCredentials.password
//           }
//         });

//         // 5️⃣ Create Student User
//         const existingStudentUser = await User.findOne({ studentId: student._id });
//         if (!existingStudentUser) {
//           const studentUser = await User.create({
//             name: row.name,
//             password: studentCredentials.password,
//             role: "student",
//             mustChangePassword: true,
//             studentId: student._id,
//           });
//           student.userId = studentUser._id;
//           await student.save();
//         }

//         // 5️⃣ Link Student to Parent
//         await Parent.findByIdAndUpdate(parent._id, { $addToSet: { children: student._id } });

//         return student;
//       })
//     );

//     // Cleanup
//     fs.unlinkSync(excelFilePath);
//     if (imagesZipPath) {
//       fs.unlinkSync(imagesZipPath);
//     }
//     if (tempDir) {
//       fs.rmSync(tempDir, { recursive: true, force: true });
//     }

//     // Invalidate student caches
//     await invalidateCache.students();

//     res.status(201).json({
//       message: "Students uploaded successfully with images",
//       count: studentsWithIds.length,
//     });
//   } catch (error) {
//     console.error("Upload error:", error);
//     res.status(500).json({ message: "Upload failed", error: error.message });
//   }
// };

// // ===================== Single Student Creation =====================
// export const createSingleStudent = async (req, res) => {
//   try {
//     const {
//       studentId,
//       name,
//       class: className,
//       section,
//       birthDate,
//       parentName,
//       parentPhone,
//     } = req.body;

//     // Validate required fields
//     if (!studentId) {
//       return res.status(400).json({ message: "Student ID is required" });
//     }
//     if (!name) {
//       return res.status(400).json({ message: "Student name is required" });
//     }
//     if (!className) {
//       return res.status(400).json({ message: "Class is required" });
//     }
//     if (!section) {
//       return res.status(400).json({ message: "Section is required" });
//     }
//     if (!birthDate) {
//       return res.status(400).json({ message: "Birth date is required" });
//     }
//     if (!parentName) {
//       return res.status(400).json({ message: "Parent name is required" });
//     }
//     if (!parentPhone) {
//       return res.status(400).json({ message: "Parent phone is required" });
//     }

//     // Check if student ID already exists
//     const existingStudent = await Student.findOne({ studentId });
//     if (existingStudent) {
//       return res.status(400).json({ message: `Student ID ${studentId} already exists` });
//     }

//     const finalStudentId = studentId;
    
//     // No email fields - using ID-based login

//     // 1️⃣ Parent creation with consistent credentials
//     let parent = await Parent.findOne({ name: parentName, phone: parentPhone });
//     if (!parent) {
//       // Generate parent credentials using student ID pattern (PS + StudentID)
//       const parentCredentials = await generateParentCredentials(finalStudentId);
//       console.log('Generated parent credentials for single student:', parentCredentials);
      
//       const parentUser = await User.create({
//         name: parentName,
//         password: parentCredentials.password,
//         role: "parent",
//         mustChangePassword: true,
//       });

//       parent = await Parent.create({
//         userId: parentUser._id,
//         name: parentName,
//         phone: parentPhone || "",
//         generatedCredentials: parentCredentials
//       });
      
//       console.log('Created parent for single student:', {
//         id: parent._id,
//         name: parent.name,
//         credentials: parent.generatedCredentials
//       });

//       parentUser.parentId = parent._id;
//       await parentUser.save();
//     } else {
//       // Parent exists - use existing credentials
//       console.log(`Parent ${parentName} already exists, using existing credentials`);
//     }

//     // 2️⃣ Handle optional image upload
//     let imageData = null;
//     if (req.file) {
//       imageData = await uploadImageToCloudinary(req.file.path, studentId || name);
//       fs.unlinkSync(req.file.path); // remove temp file
//     }

//     // 3️⃣ Generate student credentials
//     const studentCredentials = await generateStudentCredentials(finalStudentId);
    
//     // 4️⃣ Create Student
//     const student = await Student.create({
//       studentId: finalStudentId,
//       name,
//       class: className,
//       section,
//       birthDate: birthDate ? new Date(birthDate) : new Date(), // Use provided birth date or default to today
//       parent: parent._id,
//       image: imageData,
//       generatedCredentials: {
//         username: studentCredentials.username,
//         password: studentCredentials.password
//       }
//     });

//     // 5️⃣ Create Student User
//     const existingUser = await User.findOne({ studentId: student._id });
//     if (!existingUser) {
//       const studentUser = await User.create({
//         name,
//         password: studentCredentials.password,
//         role: "student",
//         mustChangePassword: true,
//         studentId: student._id,
//       });

//       student.userId = studentUser._id;
//       await student.save();
//     }

//     // 5️⃣ Link Student to Parent
//     await Parent.findByIdAndUpdate(parent._id, { $addToSet: { children: student._id } });

//     // 6️⃣ Invalidate student caches
//     await invalidateCache.students();

//     res.status(201).json({
//       message: "Student created successfully",
//       student,
//     });
//   } catch (error) {
//     console.error("Create single student error:", error);
//     res.status(500).json({ message: "Failed to create student", error: error.message });
//   }
// };




//last_one

// import xlsx from "xlsx";

// import xlsx from "xlsx";
// import fs from "fs";
// import path from "path";
// import { fileURLToPath } from "url";
// import unzipper from "unzipper";
// import mongoose from "mongoose";
// import cloudinary from "../lib/cloudinary.js";
// import Student from "../models/student.model.js";
// import Parent from "../models/parent.model.js";
// import User from "../models/user.model.js";
// import { generateStudentId, generateStudentCredentials, generateParentCredentialsByEmail, generateParentCredentials } from "../utils/credentialGenerator.js";
// import { invalidateCache } from "../lib/redis.js";

// // Get __dirname equivalent for ES modules
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// // Helper: Upload local image to Cloudinary
// const uploadImageToCloudinary = async (filePath, studentId) => {
//   try {
//     const result = await cloudinary.uploader.upload(filePath, {
//       folder: "students",
//       public_id: studentId,
//     });
//     return { public_id: result.public_id, url: result.secure_url };
//   } catch (err) {
//     console.error(`Cloudinary upload failed for ${filePath}`, err.message);
//     return null;
//   }
// };

// // ===================== Bulk Upload Students =====================
// export const uploadStudents = async (req, res) => {
//   const session = await mongoose.startSession();
  
//   try {
//     if (!req.files || !req.files.excel || !req.files.excel[0]) {
//       return res.status(400).json({ message: "Excel file is required" });
//     }

//     const excelFilePath = req.files.excel[0].path;
//     const imagesZipPath =
//       req.files.imagesZip && req.files.imagesZip[0]
//         ? req.files.imagesZip[0].path
//         : null;

//     // Extract ZIP images if provided
//     let tempDir = null;
//     if (imagesZipPath) {
//       tempDir = path.join(__dirname, "../tmp", `images_${Date.now()}`);
//       fs.mkdirSync(tempDir, { recursive: true });
//       await fs
//         .createReadStream(imagesZipPath)
//         .pipe(unzipper.Extract({ path: tempDir }))
//         .promise();
//     }

//     // Read Excel
//     const workbook = xlsx.readFile(excelFilePath);
//     const sheet = workbook.Sheets[workbook.SheetNames[0]];
//     const rawData = xlsx.utils.sheet_to_json(sheet);

//     // Validate rows
//     const validationErrors = [];
//     rawData.forEach((row, index) => {
//       if (!row.studentId) validationErrors.push(`Row ${index + 2}: Student ID required`);
//       if (!row.name) validationErrors.push(`Row ${index + 2}: Student name required`);
//       if (!row.class) validationErrors.push(`Row ${index + 2}: Class required`);
//       if (!row.section) validationErrors.push(`Row ${index + 2}: Section required`);
//       if (!row.birthDate) validationErrors.push(`Row ${index + 2}: Birth date required`);
//       if (!row.parentName) validationErrors.push(`Row ${index + 2}: Parent name required`);
//       if (!row.parentPhone) validationErrors.push(`Row ${index + 2}: Parent phone required`);
//     });

//     if (validationErrors.length > 0) {
//       return res.status(400).json({ message: "Validation errors", errors: validationErrors });
//     }

//     // Check duplicates
//     const studentIds = rawData.map((r) => r.studentId);
//     const duplicateIds = studentIds.filter((id, i) => studentIds.indexOf(id) !== i);
//     if (duplicateIds.length > 0) {
//       return res.status(400).json({
//         message: "Duplicate student IDs in Excel",
//         duplicateIds: [...new Set(duplicateIds)],
//       });
//     }

//     // Check DB for existing IDs
//     const existingStudents = await Student.find({ studentId: { $in: studentIds } });
//     if (existingStudents.length > 0) {
//       const existingIds = existingStudents.map((s) => s.studentId);
//       return res.status(400).json({
//         message: "Some student IDs already exist in DB",
//         existingIds,
//       });
//     }

//     // Group rows by parent (name + phone)
//     const parentGroups = {};
//     rawData.forEach((row, index) => {
//       const parentKey = `${row.parentName}_${row.parentPhone}`;
//       if (!parentGroups[parentKey]) {
//         parentGroups[parentKey] = {
//           parentName: row.parentName,
//           parentPhone: row.parentPhone,
//           children: []
//         };
//       }
//       parentGroups[parentKey].children.push({ ...row, rowIndex: index + 2 });
//     });

//     // Start transaction
//     await session.startTransaction();

//     // Get all existing parents in one query
//     const parentKeys = Object.keys(parentGroups);
//     const existingParents = await Parent.find({
//       $or: parentKeys.map(key => {
//         const [name, phone] = key.split('_');
//         return { name, phone };
//       })
//     }).session(session);

//     // Create lookup map for existing parents
//     const existingParentMap = new Map();
//     existingParents.forEach(parent => {
//       const key = `${parent.name}_${parent.phone}`;
//       existingParentMap.set(key, parent);
//     });

//     // Prepare bulk operations
//     const usersToInsert = [];
//     const parentsToInsert = [];
//     const studentsToInsert = [];
//     const parentUpdates = new Map(); // parentId -> children array

//     // Process all parent groups
//     for (const [parentKey, parentGroup] of Object.entries(parentGroups)) {
//       let parent = existingParentMap.get(parentKey);
      
//       if (!parent) {
//         // Create parent with credentials based on FIRST child
//         const firstChildId = parentGroup.children[0].studentId;
//         const parentCredentials = await generateParentCredentials(firstChildId);
        
//         const parentUser = {
//           name: parentGroup.parentName,
//           password: parentCredentials.password,
//           role: "parent",
//           mustChangePassword: true,
//         };
//         usersToInsert.push(parentUser);

//         const parentDoc = {
//           name: parentGroup.parentName,
//           phone: parentGroup.parentPhone,
//           generatedCredentials: parentCredentials,
//         };
//         parentsToInsert.push(parentDoc);
        
//         // We'll link them after bulk insert
//         parent = { _id: null, children: [] }; // placeholder
//       } else {
//         parentUpdates.set(parent._id, parent.children || []);
//       }

//       // Process all children for this parent
//       for (const row of parentGroup.children) {
//         const studentId = row.studentId;

//         // 📸 Upload image if exists (only if tempDir exists)
//         let imageData = null;
//         if (tempDir) {
//           for (const ext of [".jpg", ".jpeg", ".png"]) {
//             const possiblePath = path.join(tempDir, `${studentId}${ext}`);
//             if (fs.existsSync(possiblePath)) {
//               imageData = await uploadImageToCloudinary(possiblePath, studentId);
//               break;
//             }
//           }
//         }

//         // 👨‍🎓 Student credentials
//         const studentCredentials = await generateStudentCredentials(studentId);

//         // Prepare student document
//         const studentDoc = {
//           studentId,
//           name: row.name,
//           class: row.class,
//           section: row.section,
//           birthDate: new Date(row.birthDate),
//           image: imageData,
//           generatedCredentials: studentCredentials,
//         };
//         studentsToInsert.push(studentDoc);

//         // Prepare student user
//         const studentUser = {
//           name: row.name,
//           password: studentCredentials.password,
//           role: "student",
//           mustChangePassword: true,
//         };
//         usersToInsert.push(studentUser);
//       }
//     }

//     // Bulk insert users
//     const insertedUsers = await User.insertMany(usersToInsert, { session });
    
//     // Bulk insert parents
//     const insertedParents = await Parent.insertMany(parentsToInsert, { session });
    
//     // Update parent-user relationships
//     let userIndex = 0;
//     let parentIndex = 0;
    
//     for (const [parentKey, parentGroup] of Object.entries(parentGroups)) {
//       const existingParent = existingParentMap.get(parentKey);
      
//       if (!existingParent) {
//         // Link new parent to user
//         const parentUser = insertedUsers[userIndex];
//         const parent = insertedParents[parentIndex];
        
//         await User.findByIdAndUpdate(parentUser._id, { parentId: parent._id }, { session });
//         await Parent.findByIdAndUpdate(parent._id, { userId: parentUser._id }, { session });
        
//         userIndex++;
//         parentIndex++;
//       }
//     }

//     // Bulk insert students
//     const insertedStudents = await Student.insertMany(studentsToInsert, { session });

//     // Update student-user relationships and parent-child relationships
//     const studentUpdates = [];
//     const parentChildUpdates = new Map();

//     userIndex = 0;
//     let studentIndex = 0;
    
//     for (const [parentKey, parentGroup] of Object.entries(parentGroups)) {
//       const existingParent = existingParentMap.get(parentKey);
//       const parent = existingParent || insertedParents[parentIndex - 1];
      
//       for (const row of parentGroup.children) {
//         const student = insertedStudents[studentIndex];
//         const studentUser = insertedUsers[userIndex];
        
//         // Update student with userId
//         studentUpdates.push({
//           updateOne: {
//             filter: { _id: student._id },
//             update: { userId: studentUser._id }
//           }
//         });
        
//         // Update student with parentId
//         studentUpdates.push({
//           updateOne: {
//             filter: { _id: student._id },
//             update: { parent: parent._id }
//           }
//         });
        
//         // Update student user with studentId
//         studentUpdates.push({
//           updateOne: {
//             filter: { _id: studentUser._id },
//             update: { studentId: student._id }
//           }
//         });
        
//         // Collect children for parent update
//         if (!parentChildUpdates.has(parent._id)) {
//           parentChildUpdates.set(parent._id, []);
//         }
//         parentChildUpdates.get(parent._id).push(student._id);
        
//         userIndex++;
//         studentIndex++;
//       }
//     }

//     // Bulk update students and users
//     if (studentUpdates.length > 0) {
//       await Student.bulkWrite(studentUpdates, { session });
//       await User.bulkWrite(studentUpdates, { session });
//     }

//     // Bulk update parents with children
//     const parentUpdatesArray = [];
//     for (const [parentId, children] of parentChildUpdates) {
//       parentUpdatesArray.push({
//         updateOne: {
//           filter: { _id: parentId },
//           update: { $addToSet: { children: { $each: children } } }
//         }
//       });
//     }
    
//     if (parentUpdatesArray.length > 0) {
//       await Parent.bulkWrite(parentUpdatesArray, { session });
//     }

//     // Commit transaction
//     await session.commitTransaction();

//     // Cleanup
//     fs.unlinkSync(excelFilePath);
//     if (imagesZipPath) fs.unlinkSync(imagesZipPath);
//     if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });

//     await invalidateCache.students();

//     res.status(201).json({
//       message: "Students uploaded successfully",
//       count: insertedStudents.length,
//     });
//   } catch (error) {
//     await session.abortTransaction();
//     console.error("Upload error:", error);
//     res.status(500).json({ message: "Upload failed", error: error.message });
//   } finally {
//     await session.endSession();
//   }
// };

// // ===================== Single Student Creation =====================
// export const createSingleStudent = async (req, res) => {
//   try {
//     const { studentId, name, class: className, section, birthDate, parentName, parentPhone } =
//       req.body;

//     if (!studentId || !name || !className || !section || !birthDate || !parentName || !parentPhone) {
//       return res.status(400).json({ message: "All fields are required" });
//     }

//     // check student ID
//     const existingStudent = await Student.findOne({ studentId });
//     if (existingStudent) {
//       return res.status(400).json({ message: `Student ID ${studentId} already exists` });
//     }

//     // 🔑 Find or create parent by name AND phone (to ensure same parent)
//     let parent = await Parent.findOne({ 
//       name: parentName, 
//       phone: parentPhone 
//     });
//     if (!parent) {
//       const parentCredentials = await generateParentCredentials(studentId);
//       const parentUser = await User.create({
//         name: parentName,
//         password: parentCredentials.password,
//         role: "parent",
//         mustChangePassword: true,
//       });

//       parent = await Parent.create({
//         userId: parentUser._id,
//         name: parentName,
//         phone: parentPhone,
//         generatedCredentials: parentCredentials,
//       });

//       parentUser.parentId = parent._id;
//       await parentUser.save();
//     }

//     // 📸 Image if uploaded
//     let imageData = null;
//     if (req.file) {
//       imageData = await uploadImageToCloudinary(req.file.path, studentId);
//       fs.unlinkSync(req.file.path);
//     }

//     // 👨‍🎓 Student credentials
//     const studentCredentials = await generateStudentCredentials(studentId);

//     // 👨‍🎓 Create Student
//     const student = await Student.create({
//       studentId,
//       name,
//       class: className,
//       section,
//       birthDate: new Date(birthDate),
//       parent: parent._id,
//       image: imageData,
//       generatedCredentials: studentCredentials,
//     });

//     // 👤 Student User (no email - uses ID-based login)
//     const studentUser = await User.create({
//       name,
//       password: studentCredentials.password,
//       role: "student",
//       mustChangePassword: true,
//       studentId: student._id,
//     });
//     student.userId = studentUser._id;
//     await student.save();

//     // 👨‍👧 Link child to parent
//     await Parent.findByIdAndUpdate(parent._id, { $addToSet: { children: student._id } });

//     await invalidateCache.students();

//     res.status(201).json({ message: "Student created successfully", student });
//   } catch (error) {
//     console.error("Create single student error:", error);
//     res.status(500).json({ message: "Failed to create student", error: error.message });
//   }
// };


// // // ===================== Bulk Upload Students =====================
// // export const uploadStudents = async (req, res) => {
// //   try {
// //     // Check if required files exist
// //     if (!req.files || !req.files.excel || !req.files.excel[0]) {
// //       return res.status(400).json({ message: "Excel file is required" });
// //     }

// //     const excelFilePath = req.files.excel[0].path;
// //     const imagesZipPath = req.files.imagesZip && req.files.imagesZip[0] ? req.files.imagesZip[0].path : null;

// //     // Extract ZIP images to temp folder (only if ZIP file provided)
// //     let tempDir = null;
// //     if (imagesZipPath) {
// //       tempDir = path.join(__dirname, "../tmp", `images_${Date.now()}`);
// //       fs.mkdirSync(tempDir, { recursive: true });
// //       await fs.createReadStream(imagesZipPath).pipe(unzipper.Extract({ path: tempDir })).promise();
// //     }

// //     // Read Excel
// //     const workbook = xlsx.readFile(excelFilePath);
// //     const sheet = workbook.Sheets[workbook.SheetNames[0]];
// //     const rawData = xlsx.utils.sheet_to_json(sheet);

// //     // Validate all rows first
// //     const validationErrors = [];
// //     rawData.forEach((row, index) => {
// //       if (!row.studentId) {
// //         validationErrors.push(`Row ${index + 2}: Student ID is required`);
// //       }
// //       if (!row.name) {
// //         validationErrors.push(`Row ${index + 2}: Student name is required`);
// //       }
// //       if (!row.class) {
// //         validationErrors.push(`Row ${index + 2}: Class is required`);
// //       }
// //       if (!row.section) {
// //         validationErrors.push(`Row ${index + 2}: Section is required`);
// //       }
// //       if (!row.birthDate) {
// //         validationErrors.push(`Row ${index + 2}: Birth date is required`);
// //       }
// //       if (!row.parentName) {
// //         validationErrors.push(`Row ${index + 2}: Parent name is required`);
// //       }
// //       if (!row.parentPhone) {
// //         validationErrors.push(`Row ${index + 2}: Parent phone is required`);
// //       }
// //     });

// //     if (validationErrors.length > 0) {
// //       return res.status(400).json({ 
// //         message: "Validation errors found", 
// //         errors: validationErrors 
// //       });
// //     }

// //     // Check for duplicate student IDs
// //     const studentIds = rawData.map(row => row.studentId);
// //     const duplicateIds = studentIds.filter((id, index) => studentIds.indexOf(id) !== index);
// //     if (duplicateIds.length > 0) {
// //       return res.status(400).json({ 
// //         message: "Duplicate student IDs found in Excel file", 
// //         duplicateIds: [...new Set(duplicateIds)] 
// //       });
// //     }

// //     // Check if any student IDs already exist in database
// //     const existingStudents = await Student.find({ studentId: { $in: studentIds } });
// //     if (existingStudents.length > 0) {
// //       const existingIds = existingStudents.map(s => s.studentId);
// //       return res.status(400).json({ 
// //         message: "Some student IDs already exist in database", 
// //         existingIds 
// //       });
// //     }

// //     const studentsWithIds = await Promise.all(
// //       rawData.map(async (row) => {
// //         // Student ID is now required and validated
// //         const studentId = row.studentId;
        
// //         // No email fields - using ID-based login

// //         // 1️⃣ Parent creation with consistent credentials
// //         let parent = await Parent.findOne({ name: row.parentName, phone: row.parentPhone });
// //         if (!parent) {
// //           // Generate parent credentials using student ID pattern (PS + StudentID)
// //           const parentCredentials = await generateParentCredentials(studentId);
// //           console.log('Generated parent credentials:', parentCredentials);
          
// //           const parentUser = await User.create({
// //             name: row.parentName,
// //             password: parentCredentials.password,
// //             role: "parent",
// //             mustChangePassword: true,
// //           });

// //           parent = await Parent.create({
// //             userId: parentUser._id,
// //             name: row.parentName,
// //             phone: row.parentPhone || "",
// //             generatedCredentials: parentCredentials
// //           });
          
// //           console.log('Created parent with credentials:', {
// //             id: parent._id,
// //             name: parent.name,
// //             credentials: parent.generatedCredentials
// //           });

// //           parentUser.parentId = parent._id;
// //           await parentUser.save();
// //         } else {
// //           // Parent exists - use existing credentials
// //           console.log(`Parent ${row.parentName} already exists, using existing credentials`);
// //         }

// //         // 2️⃣ Match image from ZIP (only if tempDir exists)
// //         let imageData = null;
// //         if (tempDir) {
// //           const imageExtensions = [".jpg", ".jpeg", ".png"];
// //           for (const ext of imageExtensions) {
// //             const possiblePath = path.join(tempDir, `${studentId}${ext}`);
// //             if (fs.existsSync(possiblePath)) {
// //               imageData = await uploadImageToCloudinary(possiblePath, studentId);
// //               break;
// //             }
// //           }
// //         }

// //         // 3️⃣ Generate student credentials
// //         const studentCredentials = await generateStudentCredentials(studentId);
        
// //         // 4️⃣ Create Student
// //         const student = await Student.create({
// //           studentId,
// //           name: row.name,
// //           class: row.class,
// //           section: row.section,
// //           birthDate: row.birthDate ? new Date(row.birthDate) : new Date(), // Use provided birth date or default to today
// //           parent: parent._id,
// //           image: imageData,
// //           generatedCredentials: {
// //             username: studentCredentials.username,
// //             password: studentCredentials.password
// //           }
// //         });

// //         // 5️⃣ Create Student User
// //         const existingStudentUser = await User.findOne({ studentId: student._id });
// //         if (!existingStudentUser) {
// //           const studentUser = await User.create({
// //             name: row.name,
// //             password: studentCredentials.password,
// //             role: "student",
// //             mustChangePassword: true,
// //             studentId: student._id,
// //           });
// //           student.userId = studentUser._id;
// //           await student.save();
// //         }

// //         // 5️⃣ Link Student to Parent
// //         await Parent.findByIdAndUpdate(parent._id, { $addToSet: { children: student._id } });

// //         return student;
// //       })
// //     );

// //     // Cleanup
// //     fs.unlinkSync(excelFilePath);
// //     if (imagesZipPath) {
// //       fs.unlinkSync(imagesZipPath);
// //     }
// //     if (tempDir) {
// //       fs.rmSync(tempDir, { recursive: true, force: true });
// //     }

// //     // Invalidate student caches
// //     await invalidateCache.students();

// //     res.status(201).json({
// //       message: "Students uploaded successfully with images",
// //       count: studentsWithIds.length,
// //     });
// //   } catch (error) {
// //     console.error("Upload error:", error);
// //     res.status(500).json({ message: "Upload failed", error: error.message });
// //   }
// // };

// // // ===================== Single Student Creation =====================
// // export const createSingleStudent = async (req, res) => {
// //   try {
// //     const {
// //       studentId,
// //       name,
// //       class: className,
// //       section,
// //       birthDate,
// //       parentName,
// //       parentPhone,
// //     } = req.body;

// //     // Validate required fields
// //     if (!studentId) {
// //       return res.status(400).json({ message: "Student ID is required" });
// //     }
// //     if (!name) {
// //       return res.status(400).json({ message: "Student name is required" });
// //     }
// //     if (!className) {
// //       return res.status(400).json({ message: "Class is required" });
// //     }
// //     if (!section) {
// //       return res.status(400).json({ message: "Section is required" });
// //     }
// //     if (!birthDate) {
// //       return res.status(400).json({ message: "Birth date is required" });
// //     }
// //     if (!parentName) {
// //       return res.status(400).json({ message: "Parent name is required" });
// //     }
// //     if (!parentPhone) {
// //       return res.status(400).json({ message: "Parent phone is required" });
// //     }

// //     // Check if student ID already exists
// //     const existingStudent = await Student.findOne({ studentId });
// //     if (existingStudent) {
// //       return res.status(400).json({ message: `Student ID ${studentId} already exists` });
// //     }

// //     const finalStudentId = studentId;
    
// //     // No email fields - using ID-based login

// //     // 1️⃣ Parent creation with consistent credentials
// //     let parent = await Parent.findOne({ name: parentName, phone: parentPhone });
// //     if (!parent) {
// //       // Generate parent credentials using student ID pattern (PS + StudentID)
// //       const parentCredentials = await generateParentCredentials(finalStudentId);
// //       console.log('Generated parent credentials for single student:', parentCredentials);
      
// //       const parentUser = await User.create({
// //         name: parentName,
// //         password: parentCredentials.password,
// //         role: "parent",
// //         mustChangePassword: true,
// //       });

// //       parent = await Parent.create({
// //         userId: parentUser._id,
// //         name: parentName,
// //         phone: parentPhone || "",
// //         generatedCredentials: parentCredentials
// //       });
      
// //       console.log('Created parent for single student:', {
// //         id: parent._id,
// //         name: parent.name,
// //         credentials: parent.generatedCredentials
// //       });

// //       parentUser.parentId = parent._id;
// //       await parentUser.save();
// //     } else {
// //       // Parent exists - use existing credentials
// //       console.log(`Parent ${parentName} already exists, using existing credentials`);
// //     }

// //     // 2️⃣ Handle optional image upload
// //     let imageData = null;
// //     if (req.file) {
// //       imageData = await uploadImageToCloudinary(req.file.path, studentId || name);
// //       fs.unlinkSync(req.file.path); // remove temp file
// //     }

// //     // 3️⃣ Generate student credentials
// //     const studentCredentials = await generateStudentCredentials(finalStudentId);
    
// //     // 4️⃣ Create Student
// //     const student = await Student.create({
// //       studentId: finalStudentId,
// //       name,
// //       class: className,
// //       section,
// //       birthDate: birthDate ? new Date(birthDate) : new Date(), // Use provided birth date or default to today
// //       parent: parent._id,
// //       image: imageData,
// //       generatedCredentials: {
// //         username: studentCredentials.username,
// //         password: studentCredentials.password
// //       }
// //     });

// //     // 5️⃣ Create Student User
// //     const existingUser = await User.findOne({ studentId: student._id });
// //     if (!existingUser) {
// //       const studentUser = await User.create({
// //         name,
// //         password: studentCredentials.password,
// //         role: "student",
// //         mustChangePassword: true,
// //         studentId: student._id,
// //       });

// //       student.userId = studentUser._id;
// //       await student.save();
// //     }

// //     // 5️⃣ Link Student to Parent
// //     await Parent.findByIdAndUpdate(parent._id, { $addToSet: { children: student._id } });

// //     // 6️⃣ Invalidate student caches
// //     await invalidateCache.students();

// //     res.status(201).json({
// //       message: "Student created successfully",
// //       student,
// //     });
// //   } catch (error) {
// //     console.error("Create single student error:", error);
// //     res.status(500).json({ message: "Failed to create student", error: error.message });
// //   }
// // };




// import xlsx from "xlsx";
// import fs from "fs";
// import path from "path";
// import { fileURLToPath } from "url";
// import unzipper from "unzipper";
// import cloudinary from "../lib/cloudinary.js";
// import Student from "../models/student.model.js";
// import Parent from "../models/parent.model.js";
// import User from "../models/user.model.js";
// import {
//   generateStudentCredentials,
//   generateParentCredentials,
// } from "../utils/credentialGenerator.js";
// import { invalidateCache } from "../lib/redis.js";

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// // ===================== Helper: Upload image to Cloudinary =====================
// const uploadImageToCloudinary = async (filePath, studentId) => {
//   try {
//     const result = await cloudinary.uploader.upload(filePath, {
//       folder: "students",
//       public_id: studentId,
//     });
//     return { public_id: result.public_id, url: result.secure_url };
//   } catch (err) {
//     console.error(`❌ Cloudinary upload failed for ${studentId}:`, err.message);
//     return null;
//   }
// };

// // ===================== Helper: Clean up temporary files =====================
// const cleanupFiles = (...paths) => {
//   for (const p of paths) {
//     if (p && fs.existsSync(p)) {
//       fs.rmSync(p, { recursive: true, force: true });
//     }
//   }
// };

// // ===================== Helper: Validate Excel Rows =====================
// const validateRows = (rows) => {
//   const errors = [];
//   rows.forEach((r, i) => {
//     const rowNum = i + 2;
//     if (!r.studentid) errors.push(`Row ${rowNum}: Missing studentId`);
//     if (!r.name) errors.push(`Row ${rowNum}: Missing name`);
//     if (!r.class) errors.push(`Row ${rowNum}: Missing class`);
//     if (!r.section) errors.push(`Row ${rowNum}: Missing section`);
//     if (!r.birthdate) errors.push(`Row ${rowNum}: Missing birthDate`);
//     if (!r.parentname) errors.push(`Row ${rowNum}: Missing parentName`);
//     if (!r.parentphone) errors.push(`Row ${rowNum}: Missing parentPhone`);
//   });
//   return errors;
// };

// // ===================== Bulk Upload Students =====================
// export const uploadStudents = async (req, res) => {
//   let tempDir = null;
//   try {
//     // --- Validate uploaded files ---
//     const excelFile = req.files?.excel?.[0];
//     if (!excelFile) return res.status(400).json({ message: "Excel file is required" });

//     const excelFilePath = excelFile.path;
//     const imagesZip = req.files?.imagesZip?.[0]?.path;

//     // --- Extract images if zip is provided ---
//     if (imagesZip) {
//       tempDir = path.join(__dirname, "../tmp", `images_${Date.now()}`);
//       fs.mkdirSync(tempDir, { recursive: true });
//       await fs.createReadStream(imagesZip).pipe(unzipper.Extract({ path: tempDir })).promise();
//     }

//     // --- Parse Excel ---
//     const workbook = xlsx.readFile(excelFilePath);
//     const sheet = workbook.Sheets[workbook.SheetNames[0]];
//     const rows = xlsx.utils.sheet_to_json(sheet).map((r) => {
//       const normalized = {};
//       for (const k in r) normalized[k.trim().toLowerCase()] = r[k];
//       return normalized;
//     });

//     // --- Validate data ---
//     const validationErrors = validateRows(rows);
//     if (validationErrors.length)
//       return res.status(400).json({ message: "Validation errors", errors: validationErrors });

//     // --- Check duplicate student IDs ---
//     const ids = rows.map((r) => r.studentid);
//     const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
//     if (duplicates.length)
//       return res.status(400).json({
//         message: "Duplicate student IDs in Excel",
//         duplicateIds: [...new Set(duplicates)],
//       });

//     // --- Check existing IDs in DB ---
//     const existing = await Student.find({ studentId: { $in: ids } }).select("studentId");
//     if (existing.length)
//       return res.status(400).json({
//         message: "Some student IDs already exist in DB",
//         existingIds: existing.map((s) => s.studentId),
//       });

//     // --- Group students by parent (for shared parent creation) ---
//     const parentGroups = rows.reduce((acc, r, i) => {
//       const key = `${r.parentname}_${r.parentphone}`;
//       acc[key] ??= {
//         parentName: r.parentname,
//         parentPhone: r.parentphone,
//         children: [],
//       };
//       acc[key].children.push({ ...r, rowIndex: i + 2 });
//       return acc;
//     }, {});

//     const studentsToCreate = [];

//     // --- Process parents in chunks for concurrency control ---
//     const parentKeys = Object.keys(parentGroups);
//     const concurrencyLimit = 10;

//     const processParentChunk = async (chunk) => {
//       await Promise.all(
//         chunk.map(async (key) => {
//           const { parentName, parentPhone, children } = parentGroups[key];

//           // Find or create parent
//           let parent = await Parent.findOne({ name: parentName, phone: parentPhone });
//           if (!parent) {
//             const creds = await generateParentCredentials(children[0].studentid);
//             const parentUser = await User.create({
//               name: parentName,
//               password: creds.password,
//               role: "parent",
//               mustChangePassword: true,
//             });
//             parent = await Parent.create({
//               userId: parentUser._id,
//               name: parentName,
//               phone: parentPhone,
//               generatedCredentials: creds,
//             });
//             parentUser.parentId = parent._id;
//             await parentUser.save();
//           }

//           // --- Process children (students) ---
//           await Promise.all(
//             children.map(async (r) => {
//               let imageData = null;
//               if (tempDir) {
//                 for (const ext of [".jpg", ".jpeg", ".png"]) {
//                   const imgPath = path.join(tempDir, `${r.studentid}${ext}`);
//                   if (fs.existsSync(imgPath)) {
//                     imageData = await uploadImageToCloudinary(imgPath, r.studentid);
//                     break;
//                   }
//                 }
//               }

//               const creds = await generateStudentCredentials(r.studentid);
//               const student = await Student.create({
//                 studentId: r.studentid,
//                 name: r.name,
//                 class: r.class,
//                 section: r.section,
//                 birthDate: new Date(r.birthdate),
//                 parent: parent._id,
//                 image: imageData,
//                 generatedCredentials: creds,
//               });

//               const user = await User.create({
//                 name: r.name,
//                 password: creds.password,
//                 role: "student",
//                 mustChangePassword: true,
//                 studentId: student._id,
//               });

//               student.userId = user._id;
//               await student.save();

//               await Parent.findByIdAndUpdate(parent._id, { $addToSet: { children: student._id } });
//               studentsToCreate.push(student);
//             })
//           );
//         })
//       );
//     };

//     // --- Run all parent chunks sequentially ---
//     for (let i = 0; i < parentKeys.length; i += concurrencyLimit) {
//       const chunk = parentKeys.slice(i, i + concurrencyLimit);
//       await processParentChunk(chunk);
//     }

//     await invalidateCache.students();

//     res.status(201).json({
//       message: "✅ Students uploaded successfully",
//       count: studentsToCreate.length,
//     });
//   } catch (err) {
//     console.error("❌ Bulk upload error:", err);
//     res.status(500).json({ message: "Upload failed", error: err.message });
//   } finally {
//     // Clean up all temp files
//     cleanupFiles(req.files?.excel?.[0]?.path, req.files?.imagesZip?.[0]?.path, tempDir);
//   }
// };

// // ===================== Single Student Creation =====================
// export const createSingleStudent = async (req, res) => {
//   try {
//     const { studentId, name, class: className, section, birthDate, parentName, parentPhone } =
//       req.body;

//     if (!studentId || !name || !className || !section || !birthDate || !parentName || !parentPhone)
//       return res.status(400).json({ message: "All fields are required" });

//     if (await Student.findOne({ studentId }))
//       return res.status(400).json({ message: `Student ID ${studentId} already exists` });

//     // --- Parent handling ---
//     let parent = await Parent.findOne({ name: parentName, phone: parentPhone });
//     if (!parent) {
//       const creds = await generateParentCredentials(studentId);
//       const user = await User.create({
//         name: parentName,
//         password: creds.password,
//         role: "parent",
//         mustChangePassword: true,
//       });
//       parent = await Parent.create({
//         userId: user._id,
//         name: parentName,
//         phone: parentPhone,
//         generatedCredentials: creds,
//       });
//       user.parentId = parent._id;
//       await user.save();
//     }

//     // --- Upload image if exists ---
//     let imageData = null;
//     if (req.file) {
//       imageData = await uploadImageToCloudinary(req.file.path, studentId);
//       cleanupFiles(req.file.path);
//     }

//     const creds = await generateStudentCredentials(studentId);
//     const student = await Student.create({
//       studentId,
//       name,
//       class: className,
//       section,
//       birthDate: new Date(birthDate),
//       parent: parent._id,
//       image: imageData,
//       generatedCredentials: creds,
//     });

//     const user = await User.create({
//       name,
//       password: creds.password,
//       role: "student",
//       mustChangePassword: true,
//       studentId: student._id,
//     });

//     student.userId = user._id;
//     await student.save();
//     await Parent.findByIdAndUpdate(parent._id, { $addToSet: { children: student._id } });

//     await invalidateCache.students();

//     res.status(201).json({ message: "✅ Student created successfully", student });
//   } catch (err) {
//     console.error("❌ Single student creation error:", err);
//     res.status(500).json({ message: "Failed to create student", error: err.message });
//   }
// };
import xlsx from "xlsx";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import unzipper from "unzipper";
import cloudinary from "../lib/cloudinary.js";
import Student from "../models/student.model.js";
import Parent from "../models/parent.model.js";
import User from "../models/user.model.js";
import {
  generateStudentCredentials,
  generateParentCredentials,
} from "../utils/credentialGenerator.js";
import { invalidateCache } from "../lib/redis.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===================== Helper: Upload image to Cloudinary =====================
const uploadImageToCloudinary = async (filePath, studentId) => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: "students",
      public_id: studentId,
    });
    return { public_id: result.public_id, url: result.secure_url };
  } catch (err) {
    console.error(`❌ Cloudinary upload failed for ${studentId}:`, err.message);
    return null;
  }
};

// ===================== Helper: Clean up temporary files =====================
const cleanupFiles = (...paths) => {
  for (const p of paths) {
    if (p && fs.existsSync(p)) {
      fs.rmSync(p, { recursive: true, force: true });
    }
  }
};

// ===================== Helper: Normalize Class Name =====================
const normalizeClassName = (className) => {
  if (!className) return className;
  
  // Convert to string and trim whitespace
  const classStr = String(className).trim();
  
  // Extract only the numeric part from the beginning
  // This handles cases like "10th", "10tg", "10st", "10nd", "10rd", etc.
  const match = classStr.match(/^(\d+)/);
  
  if (match) {
    return match[1]; // Return only the numeric part
  }
  
  // If no numeric part found, return original string
  return classStr;
};

// ===================== Helper: Validate Excel Rows =====================
const validateRows = (rows) => {
  const errors = [];
  rows.forEach((r, i) => {
    const rowNum = i + 2;
    if (!r.studentid) errors.push(`Row ${rowNum}: Missing studentId`);
    if (!r.name) errors.push(`Row ${rowNum}: Missing name`);
    if (!r.class) errors.push(`Row ${rowNum}: Missing class`);
    if (!r.section) errors.push(`Row ${rowNum}: Missing section`);
    if (!r.birthdate) errors.push(`Row ${rowNum}: Missing birthDate`);
    if (!r.parentname) errors.push(`Row ${rowNum}: Missing parentName`);
    if (!r.parentphone) errors.push(`Row ${rowNum}: Missing parentPhone`);
  });
  return errors;
};

// ===================== Bulk Upload Students =====================
export const uploadStudents = async (req, res) => {
  let tempDir = null;
  try {
    // --- Validate uploaded files ---
    const excelFile = req.files?.excel?.[0];
    if (!excelFile) return res.status(400).json({ message: "Excel file is required" });

    const excelFilePath = excelFile.path;
    const imagesZip = req.files?.imagesZip?.[0]?.path;

    // --- Extract images if zip is provided ---
    if (imagesZip) {
      tempDir = path.join(__dirname, "../tmp", `images_${Date.now()}`);
      fs.mkdirSync(tempDir, { recursive: true });
      await fs.createReadStream(imagesZip).pipe(unzipper.Extract({ path: tempDir })).promise();
    }

    // --- Parse Excel ---
    const workbook = xlsx.readFile(excelFilePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet).map((r) => {
      const normalized = {};
      for (const k in r) normalized[k.trim().toLowerCase()] = r[k];
      return normalized;
    });

    // --- Validate data ---
    const validationErrors = validateRows(rows);
    if (validationErrors.length)
      return res.status(400).json({ message: "Validation errors", errors: validationErrors });

    // --- Check duplicate student IDs ---
    const ids = rows.map((r) => r.studentid);
    const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (duplicates.length)
      return res.status(400).json({
        message: "Duplicate student IDs in Excel",
        duplicateIds: [...new Set(duplicates)],
      });

    // --- Check existing IDs in DB ---
    const existing = await Student.find({ studentId: { $in: ids } }).select("studentId");
    if (existing.length)
      return res.status(400).json({
        message: "Some student IDs already exist in DB",
        existingIds: existing.map((s) => s.studentId),
      });

    // --- Group students by parent (for shared parent creation) ---
    const parentGroups = rows.reduce((acc, r, i) => {
      const key = `${r.parentname}_${r.parentphone}`;
      acc[key] ??= {
        parentName: r.parentname,
        parentPhone: r.parentphone,
        children: [],
      };
      acc[key].children.push({ ...r, rowIndex: i + 2 });
      return acc;
    }, {});

    const studentsToCreate = [];

    // --- Process parents in chunks for concurrency control ---
    const parentKeys = Object.keys(parentGroups);
    const concurrencyLimit = 10;

    const processParentChunk = async (chunk) => {
      await Promise.all(
        chunk.map(async (key) => {
          const { parentName, parentPhone, children } = parentGroups[key];

          // Find or create parent
          let parent = await Parent.findOne({ name: parentName, phone: parentPhone });
          if (!parent) {
            const creds = await generateParentCredentials(children[0].studentid);
            const parentUser = await User.create({
              name: parentName,
              password: creds.password,
              role: "parent",
              mustChangePassword: true,
            });
            parent = await Parent.create({
              userId: parentUser._id,
              name: parentName,
              phone: parentPhone,
              generatedCredentials: creds,
            });
            parentUser.parentId = parent._id;
            await parentUser.save();
          }

          // --- Process children (students) ---
          await Promise.all(
            children.map(async (r) => {
              let imageData = null;
              if (tempDir) {
                for (const ext of [".jpg", ".jpeg", ".png"]) {
                  const imgPath = path.join(tempDir, `${r.studentid}${ext}`);
                  if (fs.existsSync(imgPath)) {
                    imageData = await uploadImageToCloudinary(imgPath, r.studentid);
                    break;
                  }
                }
              }

              const creds = await generateStudentCredentials(r.studentid);
              const student = await Student.create({
                studentId: r.studentid,
                name: r.name,
                class: normalizeClassName(r.class),
                section: r.section,
                birthDate: new Date(r.birthdate),
                parent: parent._id,
                image: imageData,
                generatedCredentials: creds,
              });

              const user = await User.create({
                name: r.name,
                password: creds.password,
                role: "student",
                mustChangePassword: true,
                studentId: student._id,
              });

              student.userId = user._id;
              await student.save();

              await Parent.findByIdAndUpdate(parent._id, { $addToSet: { children: student._id } });
              studentsToCreate.push(student);
            })
          );
        })
      );
    };

    // --- Run all parent chunks sequentially ---
    for (let i = 0; i < parentKeys.length; i += concurrencyLimit) {
      const chunk = parentKeys.slice(i, i + concurrencyLimit);
      await processParentChunk(chunk);
    }

    await invalidateCache.students();

    res.status(201).json({
      message: "✅ Students uploaded successfully",
      count: studentsToCreate.length,
    });
  } catch (err) {
    console.error("❌ Bulk upload error:", err);
    res.status(500).json({ message: "Upload failed", error: err.message });
  } finally {
    // Clean up all temp files
    cleanupFiles(req.files?.excel?.[0]?.path, req.files?.imagesZip?.[0]?.path, tempDir);
  }
};

// ===================== Single Student Creation =====================
export const createSingleStudent = async (req, res) => {
  try {
    const { studentId, name, class: className, section, birthDate, parentName, parentPhone } =
      req.body;

    if (!studentId || !name || !className || !section || !birthDate || !parentName || !parentPhone)
      return res.status(400).json({ message: "All fields are required" });

    if (await Student.findOne({ studentId }))
      return res.status(400).json({ message: `Student ID ${studentId} already exists` });

    // --- Parent handling ---
    let parent = await Parent.findOne({ name: parentName, phone: parentPhone });
    if (!parent) {
      const creds = await generateParentCredentials(studentId);
      const user = await User.create({
        name: parentName,
        password: creds.password,
        role: "parent",
        mustChangePassword: true,
      });
      parent = await Parent.create({
        userId: user._id,
        name: parentName,
        phone: parentPhone,
        generatedCredentials: creds,
      });
      user.parentId = parent._id;
      await user.save();
    }

    // --- Upload image if exists ---
    let imageData = null;
    if (req.file) {
      imageData = await uploadImageToCloudinary(req.file.path, studentId);
      cleanupFiles(req.file.path);
    }

    const creds = await generateStudentCredentials(studentId);
    const student = await Student.create({
      studentId,
      name,
      class: normalizeClassName(className),
      section,
      birthDate: new Date(birthDate),
      parent: parent._id,
      image: imageData,
      generatedCredentials: creds,
    });

    const user = await User.create({
      name,
      password: creds.password,
      role: "student",
      mustChangePassword: true,
      studentId: student._id,
    });

    student.userId = user._id;
    await student.save();
    await Parent.findByIdAndUpdate(parent._id, { $addToSet: { children: student._id } });

    await invalidateCache.students();

    res.status(201).json({ message: "✅ Student created successfully", student });
  } catch (err) {
    console.error("❌ Single student creation error:", err);
    res.status(500).json({ message: "Failed to create student", error: err.message });
  }
};