import Attendance from '../models/attendance.model.js';
import Student from '../models/student.model.js';
import Teacher from '../models/teacher.model.js';
import Parent from "../models/parent.model.js";
import xlsx from 'xlsx'; 
import { sendAbsenceAlertEmail } from '../utils/emailService.js'; // Nodemailer utility
import PDFDocument from 'pdfkit';

export const markAttendance = async (req, res) => {
  try {
    const { attendanceData } = req.body;
    const records = [];
    const skippedStudents = [];

    const groupedByDate = {}; // Prevent querying DB repeatedly for same student/date combo

    for (let record of attendanceData) {
      const { studentId, status, reason, date } = record;
      
      // Fix date handling to avoid timezone issues - use UTC consistently
      let year, month, day;
      
      if (typeof date === 'string' && date.match(/^\d{4}-\d{2}-\d{2}/)) {
        // If date is in YYYY-MM-DD format, parse it directly to avoid timezone conversion
        const parts = date.split('-');
        year = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10) - 1; // Month is 0-indexed in Date constructor
        day = parseInt(parts[2], 10);
      } else {
        // Otherwise, extract from date object using UTC methods
        const rawDate = date ? new Date(date) : new Date();
        year = rawDate.getUTCFullYear();
        month = rawDate.getUTCMonth();
        day = rawDate.getUTCDate();
      }
      
      // Create dates at midnight UTC to ensure consistency across all timezones
      const dayStart = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
      const dayEnd = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
      const key = `${studentId}-${dayStart.toISOString()}`;

      if (groupedByDate[key]) {
        skippedStudents.push(studentId); // already processed in this request
        continue;
      }

      const existing = await Attendance.findOne({
        student: studentId,
        date: { $gte: dayStart, $lte: dayEnd },
      });

      if (existing) {
        // Update existing attendance record
        existing.status = status;
        existing.reason = reason || "";
        existing.updatedAt = new Date();
        await existing.save();
        records.push(existing);
        continue;
      }

      const student = await Student.findById(studentId).populate('parent');
      if (!student) {
        console.warn(`Skipping student ${studentId} — student not found`);
        continue;
      }
      
      // Log parent status for debugging
      if (!student.parent) {
        console.warn(`Student ${student.name} (${student.studentId}) has no parent record, but attendance will still be saved`);
      }

      const newAttendance = await Attendance.create({
        student: student._id,
        status,
        reason: status === 'absent' ? reason : '',
        date: dayStart,
      });

      records.push(newAttendance);
      groupedByDate[key] = true;

      if (status === 'absent') {
        try {
          // Email functionality removed - just log the absence
          if (student.parent) {
            console.log(`Student ${student.name} (${student.studentId}) marked absent. Parent: ${student.parent.name}`);
          } else {
            console.log(`Student ${student.name} (${student.studentId}) marked absent. No parent record found.`);
          }
          // await sendAbsenceAlertEmail({
          //   parentEmail: student.parent.email,
          //   parentName: student.parent.name,
          //   studentName: student.name,
          //   reason,
          //   date: dayStart,
          // });
        } catch (err) {
          console.error(`Email send failed: ${err.message}`);
        }
      }
    }

    res.status(200).json({
      message: records.length > 0 ? "Attendance updated successfully" : "No changes made",
      count: records.length,
      skippedStudents,
    });
  } catch (error) {
    console.error("Error marking attendance:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};


export const getMonthlyAttendanceSummary = async (req, res) => {
  try {
    const { month, year, filter } = req.query;

    const startDate = new Date(`${year}-${month}-01`);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);

    // Step 1: Generate full date range
    const dateRange = [];
    for (let d = new Date(startDate); d < endDate; d.setDate(d.getDate() + 1)) {
      dateRange.push(new Date(d).toISOString().slice(0, 10)); // yyyy-mm-dd
    }

    // Step 2: Fetch Students
    let students = [];
    if (req.user.role === "admin") {
      students = await Student.find();
    } else if (req.user.role === "teacher") {
      const teacher = await Teacher.findById(req.user.teacherId);
      const queries = teacher.sectionAssignments.map(({ className, section }) => ({
        class: className,
        section,
      }));
      students = await Student.find({ $or: queries });
    } else {
      return res.status(403).json({ message: "Access denied" });
    }

    const studentIds = students.map((s) => s._id);

    // Step 3: Fetch Attendance
    const attendanceRecords = await Attendance.find({
      student: { $in: studentIds },
      date: { $gte: startDate, $lt: endDate },
    }).populate("student");

    // Step 4: Group attendance by student
    const grouped = {}; // { class-section: [{...student row}] }

    for (let student of students) {
      const key = `${student.class}-${student.section}`;
      if (!grouped[key]) grouped[key] = [];

      const baseRow = {
        Name: student.name,
        Class: student.class,
        Section: student.section,
        Presents: 0,
        Absents: 0,
      };

      // Initialize attendance for each date
      dateRange.forEach((d) => {
        baseRow[d] = "";
      });

      // Filter attendance for this student
      const records = attendanceRecords.filter(
        (r) => r.student._id.toString() === student._id.toString()
      );

      for (let rec of records) {
        const dateKey = rec.date.toISOString().slice(0, 10);
        baseRow[dateKey] = rec.status === "present" ? "Present" : "Absent";
        if (rec.status === "present") baseRow.Presents++;
        else baseRow.Absents++;
      }

      const totalDays = baseRow.Presents + baseRow.Absents;
      baseRow["% Attendance"] = totalDays > 0
        ? ((baseRow.Presents / totalDays) * 100).toFixed(1) + "%"
        : "0%";

      grouped[key].push(baseRow);
    }

    // Step 5: Create Workbook with Sheets per Class-Section
    const workbook = xlsx.utils.book_new();

    for (let sectionKey in grouped) {
      const data = grouped[sectionKey];

      const sheet = xlsx.utils.json_to_sheet(data, {
        header: [
          "Name", "Class", "Section", ...dateRange, "Presents", "Absents", "% Attendance"
        ]
      });

      // Apply simple cell styles (we’ll highlight absents as RED using special handling)
      const range = xlsx.utils.decode_range(sheet["!ref"]);
      for (let R = 1; R <= range.e.r; ++R) {
        for (let C = 3; C <= 3 + dateRange.length - 1; ++C) {
          const cellRef = xlsx.utils.encode_cell({ r: R, c: C });
          const cell = sheet[cellRef];
          if (cell && cell.v === "Absent") {
            cell.s = {
              font: { color: { rgb: "FF0000" }, bold: true },
              fill: { fgColor: { rgb: "FFECEC" } },
            };
          }
        }
      }

      xlsx.utils.book_append_sheet(workbook, sheet, sectionKey);
    }

    // Step 6: Return as download
    const buffer = xlsx.write(workbook, {
      bookType: "xlsx",
      type: "buffer",
      cellStyles: true,
    });

    res.setHeader("Content-Disposition", `attachment; filename="Attendance-${month}-${year}.xlsx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  } catch (error) {
    console.error("Excel export error:", error);
    res.status(500).json({ message: "Failed to export summary", error: error.message });
  }
};

export const getStudentAttendance = async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Access denied" });
    }

    const { month, year } = req.query;
    console.log("month", month);
    if (!month || !year) {
      return res.status(400).json({ message: "Month and Year are required" });
    }

    const startDate = new Date(`${year}-${month}-01`);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);

    // Get student's attendance
    const attendance = await Attendance.find({
      student: req.user.studentId,
      date: { $gte: startDate, $lt: endDate },
    });

    // Format result
    let presents = 0;
    let absents = 0;
    const dailyStatus = {};

    attendance.forEach((rec) => {
      const dateKey = rec.date.toISOString().slice(0, 10);
      dailyStatus[dateKey] = rec.status;
      if (rec.status === "present") presents++;
      else absents++;
    });

    const totalDays = presents + absents;
    const attendancePercentage =
      totalDays > 0 ? ((presents / totalDays) * 100).toFixed(1) + "%" : "0%";

    res.status(200).json({
      month,
      year,
      totalDays,
      presents,
      absents,
      attendancePercentage,
      dailyStatus, // optional: { "2025-07-01": "present", ... }
    });
  } catch (error) {
    console.error("Error fetching student attendance:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const getAttendanceForParent = async (req, res) => {
  try {
    const { month, year } = req.query;
    if (!month || !year) {
      return res.status(400).json({ message: "Month and Year are required" });
    }

    const startDate = new Date(`${year}-${month}-01`);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);

    // Find parent and populate children
    const parent = await Parent.findOne({ userId: req.user._id }).populate("children");

    if (!parent || parent.children.length === 0) {
      return res.status(404).json({ message: "No student found for this parent" });
    }

    const attendanceData = [];

    for (const student of parent.children) {
      const records = await Attendance.find({
        student: student._id,
        date: { $gte: startDate, $lt: endDate },
      });

      let presents = 0;
      let absents = 0;
      const dailyStatus = {};

      records.forEach((rec) => {
        const dateKey = rec.date.toISOString().slice(0, 10);
        dailyStatus[dateKey] = rec.status;
        if (rec.status === "present") presents++;
        else absents++;
      });

      const totalDays = presents + absents;
      const attendancePercentage = totalDays > 0
        ? ((presents / totalDays) * 100).toFixed(1) + "%"
        : "0%";

      attendanceData.push({
        studentId: student._id,
        studentName: student.name,
        class: student.class,
        section: student.section,
        month,
        year,
        totalDays,
        presents,
        absents,
        attendancePercentage,
        dailyStatus,
      });
    }

    res.status(200).json(attendanceData);
  } catch (error) {
    console.error("Parent attendance fetch error:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const getDailyAttendanceSummary = async (req, res) => {
  try {
    const { date, class: className, section: sectionName } = req.query;
    if (!date) {
      return res.status(400).json({ message: "Date is required" });
    }

    const targetDate = new Date(date);
    const dayStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0, 0);
    const dayEnd = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59, 999);

    let students = [];
    
    // Get students based on user role
    if (req.user.role === "admin") {
      // Admin can see all students
      students = await Student.find();
    } else if (req.user.role === "teacher") {
      // Teacher can only see their assigned students
      const teacher = await Teacher.findById(req.user.teacherId);
      if (!teacher) {
        return res.status(404).json({ message: "Teacher not found" });
      }

      const sectionQueries = teacher.sectionAssignments.map(({ className, section }) => ({
        class: className,
        section,
      }));

      students = await Student.find({ $or: sectionQueries });
    } else {
      return res.status(403).json({ message: "Access denied" });
    }

    // Apply class and section filters if provided
    if (className && className !== 'all' && className !== null) {
      const [classNum, section] = className.split('-');
      students = students.filter(s => s.class === classNum && s.section === section);
    }
    
    // Additional section filtering if section is specified separately
    if (sectionName && sectionName !== 'all' && className && className !== 'all' && className !== null) {
      const [classNum] = className.split('-');
      students = students.filter(s => s.class === classNum && s.section === sectionName);
    }

    console.log('Daily Summary Request:', { date, className, sectionName });
    console.log('Total Students Found:', students.length);
    console.log('Filter Applied:', className && className !== 'all' ? `Class ${className}` : 'All assigned classes');

    const studentIds = students.map(s => s._id);

    // Get attendance records for the specific date
    const attendanceRecords = await Attendance.find({
      student: { $in: studentIds },
      date: { $gte: dayStart, $lte: dayEnd }
    });

    // Calculate summary statistics
    const totalStudents = students.length;
    const presents = attendanceRecords.filter(record => record.status === 'present').length;
    const absents = attendanceRecords.filter(record => record.status === 'absent').length;
    
    // Calculate attendance percentage
    const attendancePercentage = totalStudents > 0 
      ? Math.round((presents / totalStudents) * 100)
      : 0;

    const responseData = {
      totalStudents,
      presents,
      absents,
      attendancePercentage,
      date: dayStart.toISOString().slice(0, 10)
    };
    
    console.log('Daily Summary Response:', responseData);
    
    res.status(200).json(responseData);

  } catch (error) {
    console.error("Error fetching daily attendance summary:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
export const downloadStudentAttendancePDF = async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Access denied" });
    }

    const { month, year } = req.query;
    if (!month || !year) {
      return res.status(400).json({ message: "Month and Year are required" });
    }

    const monthNum = parseInt(month, 10);
    const yearNum = parseInt(year, 10);
    
    if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ message: "Month must be between 1 and 12" });
    }
    
    if (isNaN(yearNum)) {
      return res.status(400).json({ message: "Invalid year value" });
    }

    // Get student info
    const student = await Student.findById(req.user.studentId);
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    // Create date range for the month
    const startDate = new Date(Date.UTC(yearNum, monthNum - 1, 1, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(yearNum, monthNum, 1, 0, 0, 0, 0));

    // Get student's attendance
    const attendance = await Attendance.find({
      student: req.user.studentId,
      date: { $gte: startDate, $lt: endDate },
    }).sort({ date: 1 });

    // Calculate summary
    let presents = 0;
    let absents = 0;
    const dailyStatus = {};

    attendance.forEach((rec) => {
      const dateKey = rec.date.toISOString().slice(0, 10);
      dailyStatus[dateKey] = rec.status;
      if (rec.status === "present") presents++;
      else absents++;
    });

    const totalDays = presents + absents;
    const attendancePercentage = totalDays > 0 ? ((presents / totalDays) * 100).toFixed(1) : "0";

    // Month names
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    const monthName = monthNames[monthNum - 1];

    // Generate PDF
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks = [];
    
    doc.on('data', chunk => chunks.push(chunk));
    
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks);
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="Student-Attendance-${monthNum}-${yearNum}.pdf"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      
      res.send(pdfBuffer);
    });

    // PDF Content
    // Header
    doc.fontSize(20).fillColor('#0d9488').text('Student Attendance Report', { align: 'center' });
    doc.moveDown(0.5);
    
    // Student Info
    doc.fontSize(12).fillColor('#374151');
    doc.text(`Student: ${student.name}`, { align: 'left' });
    doc.text(`Class: ${student.class}-${student.section}`, { align: 'left' });
    if (student.studentId) {
      doc.text(`Student ID: ${student.studentId}`, { align: 'left' });
    }
    doc.text(`Month: ${monthName} ${yearNum}`, { align: 'left' });
    doc.text(`Generated: ${new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`, { align: 'left' });
    doc.moveDown(1);

    // Summary Box - Fixed spacing and positioning
    const summaryBoxY = doc.y;
    const summaryBoxHeight = 90;
    const summaryBoxX = 50;
    const summaryBoxWidth = 495;
    
    // Draw summary box background and border
    doc.rect(summaryBoxX, summaryBoxY, summaryBoxWidth, summaryBoxHeight)
       .fillAndStroke('#f0fdfa', '#0d9488');
    
    // Summary title
    doc.fontSize(14).fillColor('#0d9488').font('Helvetica-Bold');
    doc.text('Summary', summaryBoxX + 15, summaryBoxY + 12);
    
    // Summary items with proper spacing (all inside the box)
    doc.fontSize(11).fillColor('#1f2937').font('Helvetica');
    const lineHeight = 13;
    const startY = summaryBoxY + 30;
    
    doc.text(`Total Days: ${totalDays}`, summaryBoxX + 15, startY);
    doc.text(`Present: ${presents}`, summaryBoxX + 15, startY + lineHeight);
    doc.text(`Absent: ${absents}`, summaryBoxX + 15, startY + (lineHeight * 2));
    doc.text(`Attendance Percentage: ${attendancePercentage}%`, summaryBoxX + 15, startY + (lineHeight * 3));
    
    // Move cursor below the summary box
    doc.y = summaryBoxY + summaryBoxHeight + 15;

    // Table Header - Improved styling with proper alignment
    const tableStartY = doc.y;
    const headerHeight = 30;
    const rowHeight = 20; // Reduced to remove gaps
    const dateColWidth = 350;
    const statusColWidth = 145;
    const tableWidth = dateColWidth + statusColWidth;
    const tableX = 50;
    
    // Draw header background rectangle
    doc.rect(tableX, tableStartY, tableWidth, headerHeight).fill('#0d9488');
    
    // Header text with proper positioning and padding
    doc.fontSize(12).fillColor('#ffffff').font('Helvetica-Bold');
    doc.text('Date', tableX + 10, tableStartY + 9, { width: dateColWidth - 20 });
    doc.text('Status', tableX + dateColWidth, tableStartY + 9, { 
      width: statusColWidth - 20,
      align: 'center'
    });
    
    // Draw header border
    doc.rect(tableX, tableStartY, tableWidth, headerHeight).stroke('#0d9488');
    
    // Reset font weight for body
    doc.font('Helvetica');
    
    doc.y = tableStartY + headerHeight;

    // Table Rows - No gaps between rows
    doc.fontSize(10);
    const sortedDates = Object.keys(dailyStatus).sort();
    
    sortedDates.forEach((dateKey, index) => {
      const rowY = doc.y;
      const date = new Date(dateKey + 'T00:00:00Z');
      const formattedDate = date.toLocaleDateString('en-US', { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric',
        weekday: 'short'
      });
      const status = dailyStatus[dateKey];
      const statusText = status === 'present' ? 'Present' : 'Absent';
      const statusColor = status === 'present' ? '#10b981' : '#ef4444';
      
      // Alternate row background for better readability
      if (index % 2 === 0) {
        doc.rect(tableX, rowY, tableWidth, rowHeight).fill('#f9fafb');
      }
      
      // Draw row border (top border only, except for first row which uses header border)
      if (index > 0) {
        doc.moveTo(tableX, rowY).lineTo(tableX + tableWidth, rowY).stroke('#e5e7eb');
      }
      
      // Date column - left aligned with padding
      doc.fillColor('#1f2937').text(formattedDate, tableX + 10, rowY + 5, { 
        width: dateColWidth - 20 
      });
      
      // Status column - centered and bold
      doc.fillColor(statusColor).font('Helvetica-Bold').text(statusText, tableX + dateColWidth, rowY + 5, { 
        width: statusColWidth - 20,
        align: 'center'
      });
      
      // Reset font weight for next row
      doc.font('Helvetica');
      
      // Move to next row position (no gap)
      doc.y = rowY + rowHeight;
      
      // Draw bottom border for the row
      doc.moveTo(tableX, doc.y).lineTo(tableX + tableWidth, doc.y).stroke('#e5e7eb');
      
      // Add new page if needed and redraw header
      if (doc.y > 700) {
        doc.addPage();
        doc.y = 50;
        
        // Redraw header on new page
        const newHeaderY = doc.y;
        doc.rect(tableX, newHeaderY, tableWidth, headerHeight).fill('#0d9488');
        doc.fontSize(12).fillColor('#ffffff').font('Helvetica-Bold');
        doc.text('Date', tableX + 10, newHeaderY + 9, { width: dateColWidth - 20 });
        doc.text('Status', tableX + dateColWidth, newHeaderY + 9, { 
          width: statusColWidth - 20,
          align: 'center'
        });
        doc.rect(tableX, newHeaderY, tableWidth, headerHeight).stroke('#0d9488');
        doc.font('Helvetica'); // Reset font weight
        doc.y = newHeaderY + headerHeight;
      }
    });

    // Footer - Add to all pages including first page
    // The footer should always appear at the bottom of each page
    // We'll add it to all pages after content is complete
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).fillColor('#9ca3af');
      // Position footer at bottom of page (30px from bottom)
      doc.text(
        'Student Attendance Management System - EduReach',
        50,
        doc.page.height - 30,
        { align: 'center', width: 495 }
      );
    }

    doc.end();
  } catch (error) {
    console.error("Error generating PDF:", error);
    res.status(500).json({ message: "Failed to generate PDF", error: error.message });
  }
};

export const downloadParentAttendancePDF = async (req, res) => {
  try {
    if (req.user.role !== "parent") {
      return res.status(403).json({ message: "Access denied" });
    }

    const { month, year, studentId } = req.query;
    if (!month || !year || !studentId) {
      return res.status(400).json({ message: "Month, Year, and Student ID are required" });
    }

    const monthNum = parseInt(month, 10);
    const yearNum = parseInt(year, 10);
    
    if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ message: "Month must be between 1 and 12" });
    }
    
    if (isNaN(yearNum)) {
      return res.status(400).json({ message: "Invalid year value" });
    }

    // Find parent and verify student belongs to parent
    const parent = await Parent.findOne({ userId: req.user._id }).populate("children");
    if (!parent || parent.children.length === 0) {
      return res.status(404).json({ message: "No student found for this parent" });
    }

    // Find the specific student
    const student = parent.children.find(child => child._id.toString() === studentId);
    if (!student) {
      return res.status(403).json({ message: "Access denied: Student does not belong to this parent" });
    }

    // Create date range for the month
    const startDate = new Date(Date.UTC(yearNum, monthNum - 1, 1, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(yearNum, monthNum, 1, 0, 0, 0, 0));

    // Get student's attendance
    const attendance = await Attendance.find({
      student: studentId,
      date: { $gte: startDate, $lt: endDate },
    }).sort({ date: 1 });

    // Calculate summary
    let presents = 0;
    let absents = 0;
    const dailyStatus = {};

    attendance.forEach((rec) => {
      const dateKey = rec.date.toISOString().slice(0, 10);
      dailyStatus[dateKey] = rec.status;
      if (rec.status === "present") presents++;
      else absents++;
    });

    const totalDays = presents + absents;
    const attendancePercentage = totalDays > 0 ? ((presents / totalDays) * 100).toFixed(1) : "0";

    // Month names
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    const monthName = monthNames[monthNum - 1];

    // Generate PDF
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks = [];
    
    doc.on('data', chunk => chunks.push(chunk));
    
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks);
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="Parent-Attendance-${student.name}-${monthNum}-${yearNum}.pdf"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      
      res.send(pdfBuffer);
    });

    // PDF Content
    // Header
    doc.fontSize(20).fillColor('#0d9488').text('Parent Attendance Report', { align: 'center' });
    doc.moveDown(0.5);
    
    // Student Info
    doc.fontSize(12).fillColor('#374151');
    doc.text(`Student: ${student.name}`, { align: 'left' });
    doc.text(`Class: ${student.class}-${student.section}`, { align: 'left' });
    if (student.studentId) {
      doc.text(`Student ID: ${student.studentId}`, { align: 'left' });
    }
    doc.text(`Month: ${monthName} ${yearNum}`, { align: 'left' });
    doc.text(`Generated: ${new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`, { align: 'left' });
    doc.moveDown(1);

    // Summary Box
    const summaryBoxY = doc.y;
    const summaryBoxHeight = 90;
    const summaryBoxX = 50;
    const summaryBoxWidth = 495;
    
    // Draw summary box background and border
    doc.rect(summaryBoxX, summaryBoxY, summaryBoxWidth, summaryBoxHeight)
       .fillAndStroke('#f0fdfa', '#0d9488');
    
    // Summary title
    doc.fontSize(14).fillColor('#0d9488').font('Helvetica-Bold');
    doc.text('Summary', summaryBoxX + 15, summaryBoxY + 12);
    
    // Summary items with proper spacing (all inside the box)
    doc.fontSize(11).fillColor('#1f2937').font('Helvetica');
    const lineHeight = 13;
    const startY = summaryBoxY + 30;
    
    doc.text(`Total Days: ${totalDays}`, summaryBoxX + 15, startY);
    doc.text(`Present: ${presents}`, summaryBoxX + 15, startY + lineHeight);
    doc.text(`Absent: ${absents}`, summaryBoxX + 15, startY + (lineHeight * 2));
    doc.text(`Attendance Percentage: ${attendancePercentage}%`, summaryBoxX + 15, startY + (lineHeight * 3));
    
    // Move cursor below the summary box
    doc.y = summaryBoxY + summaryBoxHeight + 15;

    // Table Header
    const tableStartY = doc.y;
    const headerHeight = 30;
    const rowHeight = 20;
    const dateColWidth = 350;
    const statusColWidth = 145;
    const tableWidth = dateColWidth + statusColWidth;
    const tableX = 50;
    
    // Draw header background rectangle
    doc.rect(tableX, tableStartY, tableWidth, headerHeight).fill('#0d9488');
    
    // Header text with proper positioning and padding
    doc.fontSize(12).fillColor('#ffffff').font('Helvetica-Bold');
    doc.text('Date', tableX + 10, tableStartY + 9, { width: dateColWidth - 20 });
    doc.text('Status', tableX + dateColWidth, tableStartY + 9, { 
      width: statusColWidth - 20,
      align: 'center'
    });
    
    // Draw header border
    doc.rect(tableX, tableStartY, tableWidth, headerHeight).stroke('#0d9488');
    
    // Reset font weight for body
    doc.font('Helvetica');
    
    doc.y = tableStartY + headerHeight;

    // Table Rows
    doc.fontSize(10);
    const sortedDates = Object.keys(dailyStatus).sort();
    
    sortedDates.forEach((dateKey, index) => {
      const rowY = doc.y;
      const date = new Date(dateKey + 'T00:00:00Z');
      const formattedDate = date.toLocaleDateString('en-US', { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric',
        weekday: 'short'
      });
      const status = dailyStatus[dateKey];
      const statusText = status === 'present' ? 'Present' : 'Absent';
      const statusColor = status === 'present' ? '#10b981' : '#ef4444';
      
      // Alternate row background for better readability
      if (index % 2 === 0) {
        doc.rect(tableX, rowY, tableWidth, rowHeight).fill('#f9fafb');
      }
      
      // Draw row border (top border only, except for first row which uses header border)
      if (index > 0) {
        doc.moveTo(tableX, rowY).lineTo(tableX + tableWidth, rowY).stroke('#e5e7eb');
      }
      
      // Date column - left aligned with padding
      doc.fillColor('#1f2937').text(formattedDate, tableX + 10, rowY + 5, { 
        width: dateColWidth - 20 
      });
      
      // Status column - centered and bold
      doc.fillColor(statusColor).font('Helvetica-Bold').text(statusText, tableX + dateColWidth, rowY + 5, { 
        width: statusColWidth - 20,
        align: 'center'
      });
      
      // Reset font weight for next row
      doc.font('Helvetica');
      
      // Move to next row position (no gap)
      doc.y = rowY + rowHeight;
      
      // Draw bottom border for the row
      doc.moveTo(tableX, doc.y).lineTo(tableX + tableWidth, doc.y).stroke('#e5e7eb');
      
      // Add new page if needed and redraw header
      if (doc.y > 750 && sortedDates.length > 15) {
        doc.addPage();
        doc.y = 50;
        
        // Redraw header on new page
        const newHeaderY = doc.y;
        doc.rect(tableX, newHeaderY, tableWidth, headerHeight).fill('#0d9488');
        doc.fontSize(12).fillColor('#ffffff').font('Helvetica-Bold');
        doc.text('Date', tableX + 10, newHeaderY + 9, { width: dateColWidth - 20 });
        doc.text('Status', tableX + dateColWidth, newHeaderY + 9, { 
          width: statusColWidth - 20,
          align: 'center'
        });
        doc.rect(tableX, newHeaderY, tableWidth, headerHeight).stroke('#0d9488');
        doc.font('Helvetica');
        doc.y = newHeaderY + headerHeight;
      }
    });

    // Footer - Add to all pages
    const pageCount = doc.bufferedPageRange().count;
    if (pageCount > 0) {
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        doc.fontSize(8).fillColor('#9ca3af');
        doc.text(
          'Parent Attendance Management System - EduReach',
          50,
          doc.page.height - 30,
          { align: 'center', width: 495 }
        );
      }
    }

    doc.end();
  } catch (error) {
    console.error("Error generating parent attendance PDF:", error);
    res.status(500).json({ message: "Failed to generate PDF", error: error.message });
  }
};



