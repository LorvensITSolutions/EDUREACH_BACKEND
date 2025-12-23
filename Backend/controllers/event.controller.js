// controllers/event.controller.js
import Event from "../models/event.model.js";
import cloudinary from "../lib/cloudinary.js";
import { redis } from "../lib/redis.js";

export const createEvent = async (req, res) => {
  try {
    const { title, description, category, date, time, location, image } = req.body;

    let uploadedImage = "";
    if (image) {
      const result = await cloudinary.uploader.upload(image, { folder: "events" });
      uploadedImage = result.secure_url;
    }

    const event = await Event.create({
      title,
      description,
      category,
      date,
      time,
      location,
      image: uploadedImage,
    });

    await updateEventsCache();
    res.status(201).json(event);
  } catch (error) {
    console.error("Error in createEvent:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const getEvents = async (req, res) => {
  try {
    const { search = "", category = "all", sort = "date" } = req.query;

    let cached = await redis.get("all_events");
    if (cached) return res.json(JSON.parse(cached));

    const filter = {
      ...(category !== "all" && { category }),
      ...(search && {
        $or: [
          { title: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ]
      }),
    };

    const sortOptions = sort === "title" ? { title: 1 } : { date: 1 };
    const events = await Event.find(filter).sort(sortOptions).lean();

    await redis.set("all_events", JSON.stringify(events));
    res.json(events);
  } catch (error) {
    console.error("Error in getEvents:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const toggleRSVP = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const event = await Event.findById(id);
    if (!event) return res.status(404).json({ message: "Event not found" });

    const alreadyRSVP = event.rsvpUsers.includes(userId);
    if (alreadyRSVP) {
      event.rsvpUsers.pull(userId);
    } else {
      event.rsvpUsers.push(userId);
    }

    await event.save();
    res.json(event);
  } catch (error) {
    console.error("Error in toggleRSVP:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const deleteEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: "Event not found" });

    if (event.image) {
      const publicId = event.image.split("/").pop().split(".")[0];
      await cloudinary.uploader.destroy(`events/${publicId}`);
    }

    await Event.findByIdAndDelete(req.params.id);
    await updateEventsCache();

    res.json({ message: "Event deleted successfully" });
  } catch (error) {
    console.error("Error in deleteEvent:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

async function updateEventsCache() {
  try {
    const events = await Event.find().lean();
    await redis.set("all_events", JSON.stringify(events));
  } catch (error) {
    console.log("Error updating event cache:", error.message);
  }
}
