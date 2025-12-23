import express from "express";
import { createEvent, listEvents ,updateEvent,deleteEvent} from "../controllers/calendar.controller.js";

const router = express.Router();

router.post("/create", createEvent); 
router.get("/list", listEvents); 
router.put("/events/:eventId", updateEvent); // Update event
router.delete("/events/:eventId", deleteEvent); // Delete event


export default router;
