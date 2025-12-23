import Parent from "../models/parent.model.js";
import Student from "../models/student.model.js";
import User from "../models/user.model.js";
import { generateStudentId, generateStudentCredentials, generateParentCredentialsByEmail } from "../utils/credentialGenerator.js";
import { redis } from "../lib/redis.js";
import cloudinary from "../lib/cloudinary.js";
import fs from "fs";

// Cache invalidation helper
const invalidateParentCache = async () => {
  try {
    const keys = await redis.keys("parents:*");
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (error) {
    console.log("Cache invalidation error:", error.message);
  }
};

// Helper: Upload local image to Cloudinary
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

// Helper: Clean up temporary files
const cleanupFiles = (...paths) => {
  for (const p of paths) {
    if (p && fs.existsSync(p)) {
      fs.rmSync(p, { recursive: true, force: true });
    }
  }
};

export const getAllParents = async (req, res) => {
  try {
    const { 
      search, 
      childClass, 
      childSection, 
      childName, 
      page = 1, 
      limit = 10 
    } = req.query;

    // Convert page and limit to numbers
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Create cache key based on query parameters
    const cacheKey = `parents:${JSON.stringify({ search, childClass, childSection, childName, pageNum, limitNum })}`;

    // Try to get from cache first
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return res.status(200).json(JSON.parse(cached));
      }
    } catch (redisError) {
      console.log("Redis cache miss or error:", redisError.message);
    }

    // 1. Build parent filter
    const parentFilter = {};
    if (search) {
      parentFilter.$or = [
        { name: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } }
      ];
    }

    // 2. Build child filter for aggregation
    const childFilter = {};
    if (childClass) childFilter.class = childClass;
    if (childSection) childFilter.section = childSection;
    if (childName) childFilter.name = { $regex: childName, $options: "i" };

    // 3. Use aggregation pipeline for better performance
    const pipeline = [
      { $match: parentFilter },
      {
        $lookup: {
          from: "students",
          localField: "children",
          foreignField: "_id",
          as: "children",
          pipeline: [
            { $match: childFilter },
            { $project: { name: 1, class: 1, section: 1, studentId: 1, generatedCredentials: 1 } }
          ]
        }
      },
      // Only include parents that have children matching the filter (if child filters are applied)
      ...(Object.keys(childFilter).length > 0 ? [{ $match: { "children.0": { $exists: true } } }] : []),
      { $sort: { name: 1 } }
    ];

    // 4. Get total count
    const totalParents = await Parent.aggregate([
      ...pipeline,
      { $count: "total" }
    ]);

    const total = totalParents.length > 0 ? totalParents[0].total : 0;

    // 5. Get paginated results
    const parents = await Parent.aggregate([
      ...pipeline,
      { $skip: skip },
      { $limit: limitNum }
    ]);

    const result = {
      message: "Parents fetched successfully",
      parents,
      total,
      currentPage: pageNum,
      totalPages: Math.ceil(total / limitNum),
      hasNextPage: pageNum < Math.ceil(total / limitNum),
      hasPrevPage: pageNum > 1
    };

    // Cache the result for 5 minutes
    try {
      await redis.setex(cacheKey, 300, JSON.stringify(result));
    } catch (redisError) {
      console.log("Redis cache set error:", redisError.message);
    }

    res.status(200).json(result);
  } catch (error) {
    console.error("Get all parents error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const countParents = async (req, res) => {
  try {
    const count = await Parent.countDocuments();

    res.status(200).json({
      message: "Parent count fetched successfully",
      count,
    });
  } catch (error) {
    console.error("Count parents error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// NEW: Add child to existing parent
export const addChildToParent = async (req, res) => {
  try {
    const { parentId } = req.params;
    const { 
      name, 
      studentId,
      class: className, 
      section, 
      birthDate
    } = req.body;

    // Validate required fields
    if (!name || !studentId || !className || !section) {
      return res.status(400).json({ 
        message: "Missing required fields: name, studentId, class, section" 
      });
    }

    // Find parent
    const parent = await Parent.findById(parentId);
    if (!parent) {
      return res.status(404).json({ message: "Parent not found" });
    }

    // Generate student credentials (using provided studentId)
    const studentCredentials = await generateStudentCredentials(studentId);

    // Check if student already exists with same studentId
    const existingStudentById = await Student.findOne({ 
      studentId: studentId
    });

    if (existingStudentById) {
      return res.status(400).json({ 
        message: "Student with this ID already exists" 
      });
    }

    // Check if student already exists with same name, class, and section
    const existingStudent = await Student.findOne({ 
      name: name,
      class: className,
      section: section,
      parent: parent._id
    });

    if (existingStudent) {
      return res.status(400).json({ 
        message: "Student with this name, class, and section already exists for this parent" 
      });
    }

    // --- Upload image if exists ---
    let imageData = null;
    if (req.file) {
      imageData = await uploadImageToCloudinary(req.file.path, studentId);
      cleanupFiles(req.file.path);
    }

    // Create student
    const student = await Student.create({
      studentId,
      name,
      class: className,
      section,
      birthDate: birthDate ? new Date(birthDate) : new Date(),
      parent: parent._id,
      image: imageData,
      generatedCredentials: studentCredentials
    });

    // Create user account for student
    const studentUser = await User.create({
      name: student.name,
      email: studentCredentials.username,
      password: studentCredentials.password,
      role: "student",
      studentId: student._id
    });

    // Link user to student
    student.userId = studentUser._id;
    await student.save();

    // Add child to parent
    await Parent.findByIdAndUpdate(parent._id, { 
      $addToSet: { children: student._id } 
    });

    // Invalidate parent cache
    await invalidateParentCache();

    // Fetch updated parent with all children
    const updatedParent = await Parent.findById(parentId)
      .populate("children", "name class section studentId");

    res.status(201).json({
      message: "Child added successfully to parent",
      parent: {
        name: updatedParent.name,
        childrenCount: updatedParent.children.length
      },
      newChild: {
        name: student.name,
        class: student.class,
        section: student.section,
        studentId: student.studentId,
        credentials: student.generatedCredentials
      }
    });

  } catch (error) {
    console.error("Add child to parent error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// NEW: Get parent with all children
export const getParentWithChildren = async (req, res) => {
  try {
    const { parentId } = req.params;

    const parent = await Parent.findById(parentId)
      .populate("children", "name class section studentId")
      .populate("userId", "name role");

    if (!parent) {
      return res.status(404).json({ message: "Parent not found" });
    }

    res.status(200).json({
      message: "Parent with children fetched successfully",
      parent: {
        _id: parent._id,
        name: parent.name,
        phone: parent.phone,
        user: parent.userId,
        children: parent.children,
        childrenCount: parent.children.length
      }
    });

  } catch (error) {
    console.error("Get parent with children error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// NEW: Create parent with multiple children
export const createParentWithChildren = async (req, res) => {
  try {
    const { 
      parentName, 
      parentPhone,
      children 
    } = req.body;

    if (!parentName || !children || !Array.isArray(children)) {
      return res.status(400).json({ 
        message: "Missing required fields: parentName, children (array)" 
      });
    }

    // Check if parent already exists with same name and phone
    let parent = await Parent.findOne({ 
      name: parentName,
      phone: parentPhone 
    });
    
    if (parent) {
      return res.status(400).json({ 
        message: "Parent with this name and phone already exists. Use addChildToParent instead." 
      });
    }

    // Generate parent credentials
    const parentCredentials = await generateParentCredentialsByEmail(parentName);

    // Create parent
    parent = await Parent.create({
      name: parentName,
      phone: parentPhone || "",
      generatedCredentials: parentCredentials
    });

    // Create user account for parent
    const parentUser = await User.create({
      name: parent.name,
      email: parentCredentials.username,
      password: parentCredentials.password,
      role: "parent",
      parentId: parent._id
    });

    // Link user to parent
    parent.userId = parentUser._id;
    await parent.save();

    // Create all children
    const createdChildren = [];
    
    for (const childData of children) {
      const { name, studentId, class: className, section, birthDate } = childData;

      // Generate student credentials (using provided studentId)
      const studentCredentials = await generateStudentCredentials(studentId);

      // Check if student already exists with same studentId
      const existingStudentById = await Student.findOne({ 
        studentId: studentId
      });

      if (existingStudentById) {
        return res.status(400).json({ 
          message: `Student with ID ${studentId} already exists` 
        });
      }

      const student = await Student.create({
        studentId,
        name,
        class: className,
        section,
        birthDate: birthDate ? new Date(birthDate) : new Date(),
        parent: parent._id,
        generatedCredentials: studentCredentials
      });

      // Create user account for student
      const studentUser = await User.create({
        name: student.name,
        email: studentCredentials.username,
        password: studentCredentials.password,
        role: "student",
        studentId: student._id
      });

      // Link user to student
      student.userId = studentUser._id;
      await student.save();

      await Parent.findByIdAndUpdate(parent._id, { 
        $addToSet: { children: student._id } 
      });

      createdChildren.push({
        name: student.name,
        class: student.class,
        section: student.section,
        studentId: student.studentId,
        credentials: student.generatedCredentials
      });
    }

    // Invalidate parent cache
    await invalidateParentCache();

    // Fetch final parent with all children
    const finalParent = await Parent.findById(parent._id)
      .populate("children", "name class section studentId");

    res.status(201).json({
      message: "Parent with children created successfully",
      parent: {
        name: finalParent.name,
        childrenCount: finalParent.children.length,
        credentials: finalParent.generatedCredentials
      },
      children: createdChildren
    });

  } catch (error) {
    console.error("Create parent with children error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};