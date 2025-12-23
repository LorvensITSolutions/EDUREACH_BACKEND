import Book from "../models/book.model.js";
import BookIssue from "../models/bookIssue.model.js";
import BookRequest from "../models/bookRequest.model.js";
import Student from "../models/student.model.js";
import Teacher from "../models/teacher.model.js";

export const requestBook = async (req, res) => {
  try {
    const { bookId } = req.body;

    // Validate logged-in user
    if (!req.user || !req.user._id || !req.user.role) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const requesterId = req.user._id;
    const role = req.user.role.toLowerCase();

    // Only allow student or teacher
    if (!["student", "teacher"].includes(role)) {
      return res.status(403).json({ message: "Only students or teachers can request books" });
    }

    const requesterModel = role.charAt(0).toUpperCase() + role.slice(1); // "Student" or "Teacher"

    // Find the correct model document for requesterId
    let modelDoc;
    if (role === "student") {
      modelDoc = await Student.findOne({ userId: req.user._id });
    } else if (role === "teacher") {
      modelDoc = await Teacher.findOne({ userId: req.user._id });
    }
    if (!modelDoc) {
      return res.status(404).json({ message: `No ${requesterModel} profile found for this user.` });
    }

    // Use the _id from the Student/Teacher model
    const correctRequesterId = modelDoc._id;

    const book = await Book.findById(bookId);
    if (!book) return res.status(404).json({ message: "Book not found" });

    // Direct access for digital books
    if (book.isDigital) {
      return res.status(200).json({
        message: "This is a digital book. You can download it directly.",
        ebookUrl: book.ebookUrl
      });
    }

    // Prevent duplicate request
    const existing = await BookRequest.findOne({
      requesterId: correctRequesterId,
      requesterModel,
      book: bookId,
      status: "pending",
    });

    if (existing) {
      return res.status(400).json({ message: "Book already requested and pending" });
    }

    const request = await BookRequest.create({
      requesterId: correctRequesterId,
      requesterModel,
      book: bookId,
    });

    return res.status(201).json({ message: "Book request submitted", request });

  } catch (err) {
    console.error("Error in requestBook:", err.message);
    return res.status(500).json({ message: "Request failed", error: err.message });
  }
};


export const borrowBook = async (req, res) => {
  try {
    const { borrowerId, borrowerModel, bookId } = req.body;
    const book = await Book.findById(bookId);
    if (!book) return res.status(404).json({ message: "Book not found" });

    if (book.availableCopies <= 0) return res.status(400).json({ message: "No copies available" });

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 14);

    const issue = await BookIssue.create({
      borrowerId,
      borrowerModel,
      book: bookId,
      dueDate,
    });

    book.availableCopies -= 1;
    await book.save();

    res.status(201).json({ message: "Book issued", issue });
  } catch (err) {
    res.status(500).json({ message: "Issue failed", error: err.message });
  }
};

export const returnBook = async (req, res) => {
  try {
    const { issueId } = req.body;

    const issue = await BookIssue.findById(issueId);
    if (!issue || issue.status === "returned") {
      return res.status(400).json({ message: "Already returned or not found" });
    }

    issue.status = "returned";
    issue.returnDate = new Date();
    await issue.save();

    const book = await Book.findById(issue.book);
    book.availableCopies += 1;
    await book.save();

    res.status(200).json({ message: "Book returned", issue });
  } catch (err) {
    res.status(500).json({ message: "Return failed", error: err.message });
  }
};

export const approveBookRequest = async (req, res) => {
  try {
    const { requestId } = req.body;

    const request = await BookRequest.findById(requestId);
    if (!request) {
      return res.status(400).json({ message: "Request not found" });
    }
    if (request.status !== "pending") {
      return res.status(400).json({ message: `Request already handled (status: ${request.status})` });
    }

    const book = await Book.findById(request.book);
    if (!book || book.availableCopies <= 0) {
      return res.status(400).json({ message: "Book unavailable" });
    }

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 14);

    const issue = await BookIssue.create({
      borrowerId: request.requesterId,
      borrowerModel: request.requesterModel,
      book: request.book,
      dueDate
    });

    book.availableCopies -= 1;
    await book.save();

    request.status = "approved";
    await request.save();

    res.status(200).json({ message: "Request approved and book issued", issue });
  } catch (error) {
    console.error("Error approving book request:", error.message);
    res.status(500).json({ message: "Approval failed", error: error.message });
  }
};

export const getPendingRequests = async (req, res) => {
  try {
    let requests = await BookRequest.find({ status: "pending" })
      .populate("book", "title author category")
      .populate("requesterId", "name email")
      .sort({ createdAt: -1 });

    // Fallback for failed population (e.g., casing issue or broken ref)
    for (let i = 0; i < requests.length; i++) {
      const req = requests[i];
      if (!req.requesterId?.name) {
        if (req.requesterModel === "Teacher") {
          const teacher = await Teacher.findById(req.requesterId).select("name email");
          if (teacher) requests[i].requesterId = teacher;
        } else if (req.requesterModel === "Student") {
          const student = await Student.findById(req.requesterId).select("name email");
          if (student) requests[i].requesterId = student;
        }
      }
    }

    res.status(200).json({ requests });
  } catch (error) {
    console.error("Error fetching requests:", error.message);
    res.status(500).json({
      message: "Failed to fetch pending requests",
      error: error.message,
    });
  }
};


export const getMyIssuedBooks = async (req, res) => {
  try {
    const borrowerModel = req.user.role.charAt(0).toUpperCase() + req.user.role.slice(1);

    // Find the correct model document for borrowerId
    let modelDoc;
    if (req.user.role.toLowerCase() === "student") {
      modelDoc = await Student.findOne({ userId: req.user._id });
    } else if (req.user.role.toLowerCase() === "teacher") {
      modelDoc = await Teacher.findOne({ userId: req.user._id });
    }
    if (!modelDoc) {
      return res.status(404).json({ message: `No ${borrowerModel} profile found for this user.` });
    }
    const correctBorrowerId = modelDoc._id;

    const issues = await BookIssue.find({
      borrowerId: correctBorrowerId,
      borrowerModel,
    })
      .populate("book", "title author isDigital ebookUrl")
      .sort({ issueDate: -1 });

    res.status(200).json({ issues });
  } catch (error) {
    console.error("Error fetching issued books:", error.message);
    res.status(500).json({ message: "Failed to fetch issued books", error: error.message });
  }
};

export const getMyRequests = async (req, res) => {
  try {
    const role = req.user.role.toLowerCase();
    const requesterModel = role.charAt(0).toUpperCase() + role.slice(1);

    let profileDoc;
    if (role === "student") {
      profileDoc = await Student.findOne({ userId: req.user._id });
    } else {
      profileDoc = await Teacher.findOne({ userId: req.user._id });
    }

    if (!profileDoc) {
      return res.status(404).json({ message: "User profile not found" });
    }

    const requests = await BookRequest.find({
      requesterId: profileDoc._id,
      requesterModel,
    })
      .populate("book", "title author category")
      .sort({ createdAt: -1 });

    res.status(200).json({ requests });
  } catch (err) {
    console.error("Error in getMyRequests:", err.message);
    res.status(500).json({ message: "Failed to fetch your requests", error: err.message });
  }
};
