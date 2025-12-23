// routes/library.routes.js
import express from "express";
import { upload } from "../utils/multer.js";
import { uploadBooksBulk,updateBook} from "../controllers/library.controller.js";
import { adminRoute, LibrarianRoute, protectRoute, studentOrTeacherRoute} from "../middleware/auth.middleware.js";
import { deleteBook,getAllBooks } from "../controllers/library.controller.js";
import { returnBook,requestBook, approveBookRequest, getPendingRequests, getMyIssuedBooks, getMyRequests} from "../controllers/bookIsuueController.js";

const router = express.Router();

router.post("/bulk-upload", upload.single("file"), protectRoute, LibrarianRoute, uploadBooksBulk);
router.put("/book/:id", protectRoute, LibrarianRoute, updateBook);
router.delete("/book/:id", protectRoute, LibrarianRoute, deleteBook);
router.get("/books", protectRoute,getAllBooks);

router.post("/return", protectRoute, returnBook);
router.post("/request-book", protectRoute, requestBook);
router.post("/approve-request", protectRoute, LibrarianRoute, approveBookRequest);
router.get("/pending-requests", protectRoute, LibrarianRoute, getPendingRequests);
router.get("/my-issued-books", protectRoute, getMyIssuedBooks);
router.get("/my-requests", protectRoute, studentOrTeacherRoute, getMyRequests);



export default router;
