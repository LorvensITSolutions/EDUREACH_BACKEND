import express from "express";
import { createLibrarian, deleteLibrarian, getAllLibrarians } from "../controllers/create_librarian.js";
import { protectRoute } from "../middleware/auth.middleware.js"
import { adminRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

// Admin creates librarian
router.post("/create-librarian", protectRoute,adminRoute,createLibrarian);
router.get("/all", protectRoute, adminRoute, getAllLibrarians);
router.delete("/:id", protectRoute, adminRoute, deleteLibrarian);

export default router;
