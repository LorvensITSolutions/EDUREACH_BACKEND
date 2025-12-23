import { getSchoolSettings, updateSchoolConfig } from "../utils/credentialGenerator.js";

// Get school settings
export const getSchoolConfiguration = async (req, res) => {
  try {
    const school = await getSchoolSettings();
    res.status(200).json({
      success: true,
      data: school
    });
  } catch (error) {
    console.error("Get school configuration error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch school configuration",
      error: error.message
    });
  }
};

// Update school settings
export const updateSchoolConfiguration = async (req, res) => {
  try {
    const {
      name,
      shortName,
      studentIdPrefix,
      studentIdYear,
      parentIdPrefix,
      address,
      phone,
      email,
      website
    } = req.body;

    const updatedSchool = await updateSchoolConfig({
      name,
      shortName,
      studentIdPrefix,
      studentIdYear,
      parentIdPrefix,
      address,
      phone,
      email,
      website
    });

    res.status(200).json({
      success: true,
      message: "School configuration updated successfully",
      data: updatedSchool
    });
  } catch (error) {
    console.error("Update school configuration error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update school configuration",
      error: error.message
    });
  }
};

// Reset student counter (useful for new academic year)
export const resetStudentCounter = async (req, res) => {
  try {
    const { newYear } = req.body;
    
    const updatedSchool = await updateSchoolConfig({
      studentIdYear: newYear || new Date().getFullYear().toString().slice(-2),
      currentStudentNumber: 0,
      currentParentNumber: 0
    });

    res.status(200).json({
      success: true,
      message: "Student counter reset successfully",
      data: updatedSchool
    });
  } catch (error) {
    console.error("Reset student counter error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to reset student counter",
      error: error.message
    });
  }
};
