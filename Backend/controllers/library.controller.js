// controllers/library.controller.js
import xlsx from "xlsx";
import Book from "../models/book.model.js";

export const uploadBooksBulk = async (req, res) => {
  try {
    const filePath = req.file.path;

    const workbook = xlsx.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const books = xlsx.utils.sheet_to_json(sheet); // converts to array of objects

    const bulkData = books.map(book => ({
      title: book.title,
      author: book.author,
      category: book.category,
      description: book.description,
      totalCopies: book.totalCopies,
      availableCopies: book.totalCopies,
      isDigital: book.isDigital || false,
      ebookUrl: book.isDigital ? book.ebookUrl || "" : "",
    }));

    await Book.insertMany(bulkData);

    res.status(201).json({ message: "Books uploaded successfully", count: bulkData.length });
  } catch (error) {
    console.error("Error uploading books in bulk:", error.message);
    res.status(500).json({ message: "Failed to upload books", error: error.message });
  }
};

export const updateBook = async (req, res) => {
  try {
    const { id } = req.params;

    const updatedData = req.body;

    const book = await Book.findByIdAndUpdate(id, updatedData, {
      new: true,
      runValidators: true,
    });

    if (!book) {
      return res.status(404).json({ message: "Book not found" });
    }

    res.status(200).json({ message: "Book updated successfully", book });
  } catch (error) {
    console.error("Error updating book:", error.message);
    res.status(500).json({ message: "Failed to update book", error: error.message });
  }
};

export const deleteBook = async (req, res) => {
  try {
    const { id } = req.params;

    const book = await Book.findByIdAndDelete(id);

    if (!book) {
      return res.status(404).json({ message: "Book not found" });
    }

    res.status(200).json({ message: "Book deleted successfully" });
  } catch (error) {
    console.error("Error deleting book:", error.message);
    res.status(500).json({ message: "Failed to delete book", error: error.message });
  }
};

export const getAllBooks = async (req, res) => {
  try {
    const { search, category, isDigital, page = 1, limit = 20 } = req.query;

    const query = {};

    // Search by title or author (case-insensitive)
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { author: { $regex: search, $options: "i" } },
      ];
    }

    // Filter by category
    if (category) {
      query.category = category;
    }

    // Filter by digital/physical
    if (isDigital === "true" || isDigital === "false") {
      query.isDigital = isDigital === "true";
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const books = await Book.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Book.countDocuments(query);

    res.status(200).json({
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      books,
    });
  } catch (error) {
    console.error("Error fetching books:", error.message);
    res.status(500).json({ message: "Failed to fetch books", error: error.message });
  }
};
