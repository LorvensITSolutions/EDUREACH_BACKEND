import express from "express";
import { SubjectModel } from "../models/subjectModel.js";

const router = express.Router();

// Add a new subject
router.post("/", async (req, res) => {
  try {
    const { name, code, description } = req.body;
    const subject = await SubjectModel.create({ name, code, description });
    res.json({ success: true, subject });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Get all subjects
router.get("/", async (req, res) => {
  try {
    const subjects = await SubjectModel.find();
    res.json({ success: true, subjects });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update a subject
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, description } = req.body;
    const subject = await SubjectModel.findByIdAndUpdate(
      id,
      { name, code, description },
      { new: true }
    );
    res.json({ success: true, subject });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Delete a subject
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await SubjectModel.findByIdAndDelete(id);
    res.json({ success: true, message: "Subject deleted" });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

export default router;