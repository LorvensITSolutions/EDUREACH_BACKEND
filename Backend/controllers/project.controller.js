import Project from "../models/project.model.js";
import cloudinary from "../lib/cloudinary.js";
import { redis } from "../lib/redis.js";

export const createProject = async (req, res) => {
  try {
    const { title, description, images = [], technologies, liveLink, githubLink } = req.body;

    let uploadedImages = [];
    if (images.length) {
      const uploadPromises = images.map((img) =>
        cloudinary.uploader.upload(img, { folder: "projects" })
      );
      const results = await Promise.all(uploadPromises);
      uploadedImages = results.map((r) => r.secure_url);
    }

    const project = await Project.create({
      title,
      description,
      images: uploadedImages,
      technologies,
      liveLink,
      githubLink,
    });

    await updateProjectsCache();
    res.status(201).json(project);
    console.log("Request body:", req.body);

  } catch (error) {
    console.error("Error in createProject:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const deleteProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ message: "Project not found" });

    // Delete associated images from Cloudinary
    const deletePromises = project.images.map((url) => {
      const publicId = url.split("/").pop().split(".")[0];
      return cloudinary.uploader.destroy(`projects/${publicId}`);
    });
    await Promise.allSettled(deletePromises);

    await Project.findByIdAndDelete(req.params.id);
    await updateProjectsCache();
    res.json({ message: "Project deleted successfully" });
  } catch (error) {
    console.error("Error in deleteProject:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const updateProject = async (req, res) => {
  try {
    const { title, description, images = [], technologies, liveLink, githubLink } = req.body;
    const project = await Project.findById(req.params.id);

    if (!project) return res.status(404).json({ message: "Project not found" });

    // If new images are provided, replace and delete old ones
    let uploadedImages = project.images;
    if (images.length) {
      const oldImageDeletes = project.images.map((url) => {
        const publicId = url.split("/").pop().split(".")[0];
        return cloudinary.uploader.destroy(`projects/${publicId}`);
      });
      await Promise.allSettled(oldImageDeletes);

      const uploadPromises = images.map((img) =>
        cloudinary.uploader.upload(img, { folder: "projects" })
      );
      const results = await Promise.all(uploadPromises);
      uploadedImages = results.map((r) => r.secure_url);
    }

    project.title = title || project.title;
    project.description = description || project.description;
    project.images = uploadedImages;
    project.technologies = technologies || project.technologies;
    project.liveLink = liveLink || project.liveLink;
    project.githubLink = githubLink || project.githubLink;

    const updated = await project.save();
    await updateProjectsCache();
    res.json(updated);
  } catch (error) {
    console.error("Error in updateProject:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const getAllProjects = async (req, res) => {
  try {
    let cached = await redis.get("all_projects");
    if (cached) return res.json(JSON.parse(cached));

    const projects = await Project.find({}).lean();
    await redis.set("all_projects", JSON.stringify(projects));
    res.json(projects);
  } catch (error) {
    console.error("Error in getAllProjects:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

async function updateProjectsCache() {
  try {
    const projects = await Project.find({}).lean();
    await redis.set("all_projects", JSON.stringify(projects));
  } catch (error) {
    console.log("Error updating project cache", error.message);
  }
}
