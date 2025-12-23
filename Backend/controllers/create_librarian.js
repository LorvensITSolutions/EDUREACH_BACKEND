import User from "../models/user.model.js";

const createLibrarian = async (req, res) => {
  try {
    const { name, email } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User with this email already exists" });
    }

    const defaultPassword = "Librarian@123";

    const newUser = await User.create({
      name,
      email,
      password: defaultPassword,
      role: "librarian",
      mustChangePassword: true,
    });

    res.status(201).json({
      message: "Librarian created successfully",
      userId: newUser._id,
    });
  } catch (error) {
    console.error("Error creating librarian:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};


export const getAllLibrarians = async (req, res) => {
  try {
    const librarians = await User.find({ role: "librarian" }).select("-password");

    res.status(200).json({
      message: "Librarians fetched successfully",
      librarians,
    });
  } catch (error) {
    console.error("Error fetching librarians:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const deleteLibrarian = async (req, res) => {
  try {
    const { id } = req.params;

    const librarian = await User.findOne({ _id: id, role: "librarian" });

    if (!librarian) {
      return res.status(404).json({ message: "Librarian not found" });
    }

    await User.deleteOne({ _id: id });

    res.status(200).json({ message: "Librarian deleted successfully" });
  } catch (error) {
    console.error("Error deleting librarian:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};



export { createLibrarian };
