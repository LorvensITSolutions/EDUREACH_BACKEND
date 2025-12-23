// routes/library.routes.js
import express from "express";
import { upload } from "../utils/multer.js";
import { uploadBooksBulk } from "../controllers/library.controller.js";

const router = express.Router();

router.post("/bulk-upload", upload.single("file"), uploadBooksBulk);

export default router;
