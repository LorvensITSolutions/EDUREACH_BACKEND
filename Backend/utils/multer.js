import multer from "multer";
import path from "path";
import fs from "fs";

// ---------- Ensure directories exist ----------
const ensureDir = (dir) => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); };

ensureDir("uploads");
ensureDir("uploads/assignments");
ensureDir("uploads/book_covers");
ensureDir("uploads/tmp"); // for temporary ZIP extraction

// ---------- Default Storage (for Excel or temp files) ----------
const defaultStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
export const upload = multer({ storage: defaultStorage });

// ---------- Assignment files: PDF + images ----------
const assignmentStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/assignments"),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "-")}`),
});
const pdfFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext !== ".pdf") return cb(new Error("Only PDF files allowed"), false);
  cb(null, true);
};
export const assignmentUpload = multer({ storage: assignmentStorage, fileFilter: pdfFilter });

// PDF + images (jpg, jpeg, png, gif, webp) for assignment upload/edit
const pdfOrImageFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowed = [".pdf", ".jpg", ".jpeg", ".png", ".gif", ".webp"];
  if (!allowed.includes(ext)) return cb(new Error("Only PDF and image files (jpg, png, gif, webp) allowed"), false);
  cb(null, true);
};
export const assignmentFileUpload = multer({ storage: assignmentStorage, fileFilter: pdfOrImageFilter });

// ---------- Image Uploads (Book covers, single student image) ----------
const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/book_covers"),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "-")}`),
});
const imageFilter = (req, file, cb) => {
  const allowed = [".jpg", ".jpeg", ".png"];
  const ext = path.extname(file.originalname).toLowerCase();
  if (!allowed.includes(ext)) return cb(new Error("Only image files allowed"), false);
  cb(null, true);
};
export const imageUpload = multer({ storage: imageStorage, fileFilter: imageFilter });

// ---------- Bulk Student Upload: Excel + ZIP ----------
const bulkStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/tmp"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
export const bulkStudentUpload = multer({ storage: bulkStorage });
