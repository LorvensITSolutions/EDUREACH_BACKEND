import mongoose from "mongoose";

const projectSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Project title is required"],
    },
    description: {
      type: String,
      required: [true, "Description is required"],
    },
    images: {
      type: [String], // Array of image URLs
      required: [true, "At least one image is required"],
    },
    technologies: {
      type: [String], // Store names like "React", "MongoDB", etc.
      required: true,
    },
    liveLink: {
      type: String,
      required: false,
    },
    githubLink: {
      type: String,
      required: false,
    },
  },
  { timestamps: true }
);

const Project = mongoose.model("Project", projectSchema);

export default Project;
