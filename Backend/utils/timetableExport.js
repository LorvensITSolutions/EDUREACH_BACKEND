// utils/timetableExport.js
// Export timetable to PDF and Excel

import PDFDocument from "pdfkit";
import XLSX from "xlsx";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Export timetable to PDF
 * @param {Object} timetable - Timetable data
 * @param {string} outputPath - Output file path
 * @returns {Promise<string>} Path to generated PDF
 */
export async function exportToPDF(timetable, outputPath = null) {
  return new Promise((resolve, reject) => {
    try {
      const fileName = outputPath || path.join(__dirname, "../../tmp", `timetable-${Date.now()}.pdf`);
      const doc = new PDFDocument({ margin: 50, size: "A4", layout: "landscape" });

      // Ensure directory exists
      const dir = path.dirname(fileName);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const stream = fs.createWriteStream(fileName);
      doc.pipe(stream);

      // Header
      doc.fontSize(20).text("School Timetable", { align: "center" });
      if (timetable.academicYear) {
        doc.fontSize(12).text(`Academic Year: ${timetable.academicYear}`, { align: "center" });
      }
      doc.moveDown();

      // Generate table for each class
      for (const classObj of timetable.classes || []) {
        doc.addPage();
        doc.fontSize(16).text(`Class: ${classObj.name}`, { align: "center" });
        doc.moveDown(0.5);

        const days = timetable.days || [];
        const periodsPerDay = timetable.periodsPerDay || 8;

        // Table dimensions
        const startX = 50;
        const startY = doc.y;
        const cellWidth = (doc.page.width - 100 - 100) / periodsPerDay; // 100 for day column, 100 for margins
        const cellHeight = 30;
        const dayColumnWidth = 100;

        // Draw header row
        doc.rect(startX, startY, dayColumnWidth, cellHeight).stroke();
        doc.fontSize(10).text("Day/Period", startX + 5, startY + 10, {
          width: dayColumnWidth - 10,
          align: "center"
        });

        for (let p = 0; p < periodsPerDay; p++) {
          const x = startX + dayColumnWidth + (p * cellWidth);
          doc.rect(x, startY, cellWidth, cellHeight).stroke();
          doc.fontSize(10).text(`P${p + 1}`, x + 5, startY + 10, {
            width: cellWidth - 10,
            align: "center"
          });
        }

        // Draw data rows
        days.forEach((day, dayIdx) => {
          const y = startY + cellHeight + (dayIdx * cellHeight);
          
          // Day column
          doc.rect(startX, y, dayColumnWidth, cellHeight).stroke();
          doc.fontSize(9).text(day, startX + 5, y + 10, {
            width: dayColumnWidth - 10,
            align: "center"
          });

          // Period columns
          const dayTimetable = classObj.timetable?.[day] || [];
          for (let p = 0; p < periodsPerDay; p++) {
            const x = startX + dayColumnWidth + (p * cellWidth);
            doc.rect(x, y, cellWidth, cellHeight).stroke();
            
            const slot = Array.isArray(dayTimetable) ? dayTimetable[p] : null;
            if (slot && slot.subject) {
              doc.fontSize(8).text(slot.subject, x + 2, y + 5, {
                width: cellWidth - 4,
                align: "center"
              });
              if (slot.teacher) {
                doc.fontSize(7).fillColor("gray").text(slot.teacher, x + 2, y + 18, {
                  width: cellWidth - 4,
                  align: "center"
                });
                doc.fillColor("black");
              }
            }
          }
        });
      }

      doc.end();

      stream.on("finish", () => resolve(fileName));
      stream.on("error", reject);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Export timetable to Excel
 * @param {Object} timetable - Timetable data
 * @param {string} outputPath - Output file path
 * @returns {Promise<string>} Path to generated Excel file
 */
export async function exportToExcel(timetable, outputPath = null) {
  try {
    const fileName = outputPath || path.join(__dirname, "../../tmp", `timetable-${Date.now()}.xlsx`);
    
    // Ensure directory exists
    const dir = path.dirname(fileName);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const workbook = XLSX.utils.book_new();

    // Create a sheet for each class
    for (const classObj of timetable.classes || []) {
      const days = timetable.days || [];
      const periodsPerDay = timetable.periodsPerDay || 8;

      // Create data array
      const data = [];
      
      // Header row
      const header = ["Day/Period"];
      for (let p = 1; p <= periodsPerDay; p++) {
        header.push(`Period ${p}`);
      }
      data.push(header);

      // Data rows
      days.forEach(day => {
        const row = [day];
        const dayTimetable = classObj.timetable?.[day] || [];
        
        for (let p = 0; p < periodsPerDay; p++) {
          const slot = Array.isArray(dayTimetable) ? dayTimetable[p] : null;
          if (slot && slot.subject) {
            row.push(`${slot.subject}\n${slot.teacher || ""}`);
          } else {
            row.push("");
          }
        }
        data.push(row);
      });

      // Create worksheet
      const worksheet = XLSX.utils.aoa_to_sheet(data);
      
      // Set column widths
      worksheet["!cols"] = [
        { wch: 15 }, // Day column
        ...Array(periodsPerDay).fill({ wch: 20 }) // Period columns
      ];

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, classObj.name);
    }

    // Write file
    XLSX.writeFile(workbook, fileName);
    
    return fileName;
  } catch (error) {
    throw new Error(`Excel export failed: ${error.message}`);
  }
}

/**
 * Export timetable to JSON
 * @param {Object} timetable - Timetable data
 * @param {string} outputPath - Output file path
 * @returns {Promise<string>} Path to generated JSON file
 */
export async function exportToJSON(timetable, outputPath = null) {
  try {
    const fileName = outputPath || path.join(__dirname, "../../tmp", `timetable-${Date.now()}.json`);
    
    // Ensure directory exists
    const dir = path.dirname(fileName);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(fileName, JSON.stringify(timetable, null, 2));
    return fileName;
  } catch (error) {
    throw new Error(`JSON export failed: ${error.message}`);
  }
}

