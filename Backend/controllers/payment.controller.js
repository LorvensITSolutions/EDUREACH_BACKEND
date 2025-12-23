import { razorpayInstance } from "../utils/razorpay.js";
import FeePayment from "../models/feePayment.model.js";
import FeeStructure from "../models/FeeStructure.model.js";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import Parent from "../models/parent.model.js";
import cloudinary from "../lib/cloudinary.js";
// Email service removed - using WhatsApp instead
import { sendWhatsApp } from "../utils/sendWhatsApp.js";
import CustomFee from "../models/customFee.model.js";
import Setting from "../models/setting.model.js"; 
import Student from "../models/student.model.js";
import crypto from "node:crypto";
import { appConfig, getAcademicYear } from "../config/appConfig.js";

export const createPaymentOrder = async (req, res) => {
  try {
    const { studentId, amount, paymentMethod = "online" } = req.body; // ✅ Add payment method
    // Basic validation
    if (!studentId || typeof studentId !== "string") {
      return res.status(400).json({ success: false, message: "Invalid studentId" });
    }
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 1) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }
    if (!["online", "offline"].includes(paymentMethod)) {
      return res.status(400).json({ success: false, message: "Invalid payment method" });
    }
    const parentId = req.user.parentId;
    const academicYear = getAcademicYear();

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    // 1. Check custom fee first
    let feeStructure;
    let frequency = "annually";
    let dueDate = null;

    const customFee = await CustomFee.findOne({ student: studentId, academicYear });

    if (customFee) {
      feeStructure = customFee;
      frequency = customFee.frequency || "annually";
      dueDate = customFee.dueDate;
    } else {
      feeStructure = await FeeStructure.findOne({
        class: student.class,
        section: student.section,
        academicYear,
      });

      if (!feeStructure) {
        return res.status(404).json({ success: false, message: "Fee structure not found" });
      }

      frequency = feeStructure.frequency || "annually";
      dueDate = feeStructure.dueDate;
    }

    // 2. Calculate total fee and total paid so far
    const totalFee = feeStructure.totalFee || 0;

    const previousPayments = await FeePayment.find({
      student: studentId,
      academicYear,
      status: "paid"
    });

    const totalPaidSoFar = previousPayments.reduce(
      (sum, p) => sum + (p.amountPaid || 0) + (p.lateFee || 0),
      0
    );

    const remainingAmount = totalFee - totalPaidSoFar;

    if (remainingAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Full fee already paid for this student",
      });
    }

    if (amount > remainingAmount) {
      return res.status(400).json({
        success: false,
        message: `You can only pay up to ₹${remainingAmount}`,
      });
    }

    // 3. Check if payment is late and get per-day late fee from DB
    const today = new Date();
    let lateFee = 0;

    const lateFeeSetting = await Setting.findOne({ key: "perDayLateFee" });
    const perDayLateFee = lateFeeSetting?.value || appConfig.perDayLateFeeDefault;

    if (dueDate && today > dueDate) {
      const daysLate = Math.ceil((today - dueDate) / (1000 * 60 * 60 * 24));
      lateFee = daysLate * perDayLateFee;
    }

    // ✅ OFFLINE PAYMENT HANDLING
    if (paymentMethod === "offline") {
      // Create offline payment record
      const feePayment = await FeePayment.create({
        parent: parentId,
        student: studentId,
        academicYear,
        amountPaid: amount,
        lateFee,
        frequency,
        dueDate,
        feeStructure: feeStructure._id,
        status: "pending_verification", // ✅ New status for offline payments
        paymentMethod: "cash", // ✅ Track payment method
        notes: "Offline cash payment - pending admin verification",
      });

      return res.status(200).json({
        success: true,
        message: "Offline payment request created successfully. Please pay the amount at school office.",
        feePaymentId: feePayment._id,
        paymentMethod: "offline",
        amount: amount + lateFee,
        lateFee,
        dueDate,
      });
    }

    // ✅ ONLINE PAYMENT (EXISTING LOGIC)
    // 4. Razorpay order with notes
    const receiptId = `rcpt_${studentId.toString().slice(-6)}_${Date.now()}`.slice(0, 40);

    const feePayment = await FeePayment.create({
      parent: parentId,
      student: studentId,
      academicYear,
      amountPaid: amount,
      lateFee,
      frequency,
      dueDate,
      feeStructure: feeStructure._id,
      status: "pending",
      paymentMethod: "online", // ✅ Track payment method
    });

    const options = {
      amount: (amount + lateFee) * 100, // in paise
      currency: "INR",
      receipt: receiptId,
      notes: {
        studentId: student._id.toString(),
        parentId: parentId.toString(),
        academicYear,
        feePaymentId: feePayment._id.toString(),
      },
    };

    const order = await razorpayInstance.orders.create(options);

    // Save Razorpay order ID
    feePayment.razorpay.orderId = order.id;
    await feePayment.save();

    res.status(200).json({
      success: true,
      order,
      feePaymentId: feePayment._id,
      razorpayKey: process.env.RAZORPAY_KEY_ID,
      paymentMethod: "online",
    });
  } catch (error) {
    console.error("createPaymentOrder error:", error);
    res.status(500).json({ success: false, message: "Payment creation failed" });
  }
};


export const verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      feePaymentId,
    } = req.body;

    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) {
      return res.status(500).json({ success: false, message: "Missing payment configuration" });
    }

    // 1. Validate signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid signature" });
    }

    // 2. Idempotency: prevent double updates
    const existing = await FeePayment.findById(feePaymentId);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Payment not found" });
    }
    if (existing.status === "paid") {
      return res.status(200).json({ success: true, message: "Payment already verified", feePayment: existing });
    }
    const feePayment = await FeePayment.findByIdAndUpdate(
      feePaymentId,
      {
        status: "paid",
        razorpay: {
          orderId: razorpay_order_id,
          paymentId: razorpay_payment_id,
          signature: razorpay_signature,
        },
        paidAt: new Date(),
      },
      { new: true }
    ).populate("student");

    if (!feePayment) {
      return res.status(404).json({ success: false, message: "Payment not found" });
    }

    // 3. Get parent email from logged-in user
    const parent = await Parent.findById(req.user.parentId);
    if (!parent) {
      return res.status(404).json({ success: false, message: "Parent not found" });
    }

    // 4. Generate PDF and serve directly
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", async () => {
      const pdfBuffer = Buffer.concat(chunks);
      
      console.log(`PDF Buffer size: ${pdfBuffer.length} bytes`);
      console.log(`PDF starts with: ${pdfBuffer.slice(0, 10).toString('hex')}`);

      // Save receipt URL for reference (using a local endpoint)
      feePayment.receiptUrl = `/api/payment/receipt/${feePayment._id}`;
      await feePayment.save();

      // Send WhatsApp notification
      if (parent.phone) {
        try {
          const { sendWhatsApp } = await import("../utils/sendWhatsApp.js");
          await sendWhatsApp({
            to: parent.phone,
            message: `✅ *Payment Successful!*\n\nDear ${parent.name},\n\nThank you for your fee payment of *₹${feePayment.amountPaid}* (Late Fee: ₹${feePayment.lateFee || 0}).\n\n*Payment Details:*\n• Student: ${feePayment.student.name}\n• Class: ${feePayment.student.class} ${feePayment.student.section}\n• Amount: ₹${feePayment.amountPaid}\n• Date: ${new Date().toLocaleDateString()}\n• Frequency: ${feePayment.frequency || "N/A"}\n• Due Date: ${feePayment.dueDate ? new Date(feePayment.dueDate).toLocaleDateString() : "N/A"}\n\nReceipt: ${feePayment.receiptUrl}\n\nRegards,\nEduReach Team`
          });
        } catch (whatsappError) {
          console.error("WhatsApp notification failed:", whatsappError);
          // Don't fail the payment if WhatsApp fails
        }
      }

      // Send JSON response for frontend success handling
      res.status(200).json({ 
        success: true, 
        message: "Payment verified successfully", 
        feePayment,
        receiptUrl: feePayment.receiptUrl
      });
    });

    // Generate PDF content - Enhanced Attractive Layout
    const logoPath = path.resolve(process.cwd(), "Public", "school-logo.png");
    
    // Background gradient effect
    doc.rect(0, 0, 595, 842).fill('#f8fafc');
    
    // Header with gradient background
    doc.rect(0, 0, 595, 120).fill('#1e40af');
    
    // Top Logo with enhanced styling
    doc.image(logoPath, 250, 20, { width: 100 });
    
    // School Name & Tagline with enhanced colors
    doc
      .fontSize(28)
      .fillColor("#ffffff")
      .font("Helvetica-Bold")
      .text("EduReach INTERNATIONAL", { align: "center" });

    doc
      .fontSize(14)
      .fillColor("#e0e7ff")
      .font("Helvetica-Oblique")
      .text('"Empowering Minds for Life"', { align: "center" })
      .moveDown(1);

    // Receipt Title with attractive styling
    doc
      .fontSize(24)
      .fillColor("#1e40af")
      .font("Helvetica-Bold")
      .text("FEE PAYMENT RECEIPT", { align: "center" })
      .moveDown(0.5);
    
    // Decorative line
    doc.rect(150, doc.y, 295, 3).fill('#3b82f6');
    doc.moveDown(1);

    // Metadata with colored background
    doc.rect(50, doc.y, 495, 60).fill('#f1f5f9').stroke('#e2e8f0');
    doc
      .fontSize(12)
      .font("Helvetica-Bold")
      .fillColor("#1e40af")
      .text(`Receipt ID: ${feePayment._id}`, 60, doc.y - 50)
      .text(`Date: ${new Date().toLocaleString()}`, 60, doc.y - 30)
      .text(`Academic Year: ${feePayment.academicYear}`, 60, doc.y - 10)
      .moveDown(1);

    // Student Info Section with attractive styling
    doc.rect(50, doc.y, 495, 80).fill('#ecfdf5').stroke('#10b981');
    doc
      .fontSize(16)
      .fillColor("#065f46")
      .font("Helvetica-Bold")
      .text("👤 Student Information", 60, doc.y - 70)
      .moveDown(0.3);

    doc
      .fontSize(12)
      .fillColor("#374151")
      .font("Helvetica")
      .text(`Name: ${feePayment.student.name}`, 60, doc.y - 50)
      .text(`Class: ${feePayment.student.class} ${feePayment.student.section}`, 60, doc.y - 35)
      .text(`Roll Number: ${feePayment.student.rollNumber || "N/A"}`, 60, doc.y - 20)
      .text(`Admission No: ${feePayment.student.admissionNumber || "N/A"}`, 60, doc.y - 5)
      .moveDown(1);

    // Payment Info Section with enhanced styling
    doc.rect(50, doc.y, 495, 120).fill('#fef3c7').stroke('#f59e0b');
    doc
      .fontSize(16)
      .fillColor("#92400e")
      .font("Helvetica-Bold")
      .text("💰 Payment Details", 60, doc.y - 110)
      .moveDown(0.3);

    doc
      .fontSize(12)
      .fillColor("#374151")
      .font("Helvetica")
      .text(`Amount Paid: ₹${feePayment.amountPaid}`, 60, doc.y - 90)
      .text(`Late Fee: ₹${feePayment.lateFee || 0}`, 60, doc.y - 75)
      .text(`Total Paid: ₹${feePayment.amountPaid + (feePayment.lateFee || 0)}`, 60, doc.y - 60)
      .text(`Frequency: ${feePayment.frequency || "N/A"}`, 60, doc.y - 45)
      .text(`Due Date: ${feePayment.dueDate ? new Date(feePayment.dueDate).toLocaleDateString() : "N/A"}`, 60, doc.y - 30)
      .fillColor("#059669")
      .font("Helvetica-Bold")
      .text("✅ [PAID]", 60, doc.y - 15);

    doc
      .fillColor("#374151")
      .font("Helvetica")
      .text(`Payment Date: ${new Date(feePayment.paidAt).toLocaleString()}`, 60, doc.y - 0)
      .text(`Mode: Razorpay`, 60, doc.y + 15)
      .text(`Order ID: ${razorpay_order_id}`, 60, doc.y + 30)
      .text(`Payment ID: ${razorpay_payment_id}`, 60, doc.y + 45)
      .moveDown(1);

    // Enhanced watermark background
    doc
      .opacity(0.08)
      .image(path.resolve(process.cwd(), "Public", "school-logo.png"), 100, 300, {
        width: 400,
        align: "center",
      })
      .opacity(1);

    // Signature section with enhanced styling
    doc.rect(50, doc.y, 495, 80).fill('#f3f4f6').stroke('#9ca3af');
    doc
      .fontSize(10)
      .fillColor("#6b7280")
      .text("This is a system-generated receipt. Please retain it.", {
        align: "center",
      })
      .moveDown(1);

    // Digital Signature with enhanced styling
    doc
      .image(path.resolve(process.cwd(), "Public", "school-logo.png"), 400, doc.y, {
        width: 80,
      })
      .fontSize(12)
      .fillColor("#374151")
      .text("Digital Signature: ______________________", 50, doc.y + 30)
      .moveDown(2);

    // Enhanced Footer with gradient
    doc.rect(0, doc.y, 595, 40).fill('#1f2937');
    doc
      .fontSize(12)
      .fillColor("#ffffff")
      .text("EduReach International School | info@EduReach.com | +91-1234567890", {
        align: "center",
      });

    // End the document - this triggers the 'end' event
    doc.end();
  } catch (error) {
    console.error("Payment verification failed:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};  

// GET /api/payment/my-payments
export const getMyPayments = async (req, res) => {
  try {
    const parentId = req.user.parentId;

    const payments = await FeePayment.find({ parent: parentId })
      .populate("student", "name class section")
      .populate("verifiedBy", "name") // ✅ Add admin who verified offline payments
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      payments,
    });
  } catch (error) {
    console.error("Error fetching payments:", error);
    res.status(500).json({ success: false, message: "Failed to fetch payment history" });
  }
};

export const getFeeStructureForAllChildren = async (req, res) => {
  try {
    const parentId = req.user.parentId;
    const academicYear = "2025-2026"; // Later: make dynamic

    const children = await Student.find({ parent: parentId })
      .populate("parent", "email name")
      .lean();

    const result = await Promise.all(
      children.map(async (student) => {
        const feeStructure = await FeeStructure.findOne({
          class: student.class,
          section: student.section,
          academicYear,
        }).lean();

        const payments = await FeePayment.find({
          student: student._id,
          academicYear,
          status: "paid"
        })
          .sort({ paidAt: -1 })
          .lean();

        const totalPaid = payments.reduce(
          (sum, p) => sum + (p.amountPaid || 0) + (p.lateFee || 0),
          0
        );

        const totalFee = feeStructure?.totalFee || 0;
        const remaining = totalFee - totalPaid;

        return {
          student,
          academicYear,
          feeStructure,
          totalPaid,
          remaining,
          latestPayment: payments[0]
            ? {
                ...payments[0],
                amount: (payments[0].amountPaid || 0) + (payments[0].lateFee || 0),
              }
            : null,
          paymentHistory: payments.map((p) => ({
            amountPaid: p.amountPaid,
            lateFee: p.lateFee,
            total: (p.amountPaid || 0) + (p.lateFee || 0),
            paidAt: p.paidAt,
            receiptUrl: p.receiptUrl,
            receiptNumber: p.receiptNumber,
            status: p.status,
          })),
        };
      })
    );

    res.status(200).json({ success: true, children: result });
  } catch (err) {
    console.error("getFeeStructureForAllChildren error:", err);
    res.status(500).json({ success: false, message: "Could not fetch fee structure" });
  }
};


// GET /api/admin/fee-defaulters
// ✅ getAllStudentsFeeStatus with Filters, Search, Pagination, and Total Due
export const getAllStudentsFeeStatus = async (req, res) => {
  try {
    const academicYear = "2025-2026"; // TODO: make dynamic
    const today = new Date();

 const { status, search, customFeeFilter, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const students = await Student.find()
      .populate("parent", "name email")
      .lean();

    const result = await Promise.all(
      students.map(async (student) => {
        const defaultStructure = await FeeStructure.findOne({
          class: student.class,
          section: student.section,
          academicYear,
        }).lean();

        const customFee = await CustomFee.findOne({
          student: student._id,
          academicYear,
        }).lean();

        const feeStructureToUse = customFee || defaultStructure;
        if (!feeStructureToUse) return null;

        const baseFee = feeStructureToUse.totalFee || 0;
        const lateFeePerDay = customFee?.lateFeePerDay || 0;
        const dueDate = customFee?.dueDate;

        const payments = await FeePayment.find({
          student: student._id,
          academicYear,
          status: "paid",
        })
          .sort({ paidAt: -1 })
          .select("amountPaid lateFee paidAt receiptUrl receiptNumber status")
          .lean();

        const totalPaid = payments.reduce((sum, p) => {
          return sum + (p.amountPaid || 0) + (p.lateFee || 0);
        }, 0);

        let overdueDays = 0;
        if (dueDate && new Date(dueDate) < today && totalPaid < baseFee) {
          const diffTime = today - new Date(dueDate);
          overdueDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        }

        const totalLateFee = overdueDays * lateFeePerDay;
        const totalDue = baseFee + totalLateFee;
        const remaining = totalDue - totalPaid;

        let paymentStatus = "Unpaid";
        if (totalPaid === 0) {
          paymentStatus = "Unpaid";
        } else if (totalPaid < totalDue) {
          paymentStatus = "Partially Paid";
        } else {
          paymentStatus = "Paid";
        }

        let discount = 0;
        let discountPercentage = null;
        if (customFee && defaultStructure) {
          discount = defaultStructure.totalFee - customFee.totalFee;
          discountPercentage = (
            (discount / defaultStructure.totalFee) * 100
          ).toFixed(2);
        }

        return {
          student,
          parent: student.parent,
          academicYear,
          feeStructure: feeStructureToUse,
          customFee,
          defaultFee: defaultStructure,
          discount,
          discountPercentage: discountPercentage ? `${discountPercentage}%` : null,
          dueDate,
          overdueDays,
          lateFeePerDay,
          totalLateFee,
          baseFee,
          totalDue,
          totalPaid,
          remaining,
          paymentStatus,
          paymentHistory: payments.map((p) => ({
            amountPaid: p.amountPaid,
            lateFee: p.lateFee,
            total: (p.amountPaid || 0) + (p.lateFee || 0),
            paidAt: p.paidAt,
            receiptUrl: p.receiptUrl,
            receiptNumber: p.receiptNumber,
            status: p.status,
          })),
        };
      })
    );

    let filtered = result.filter((entry) => entry !== null);

// 🔍 Filter by payment status
if (status) {
  const normalized = status.toLowerCase();
  filtered = filtered.filter(
    (s) => s.paymentStatus.toLowerCase() === normalized
  );
}

// 🔍 Filter by search (name, class, section, roll number)
if (search) {
  const query = search.toLowerCase();
  filtered = filtered.filter((s) => {
    return (
      s.student.name.toLowerCase().includes(query) ||
      s.student.class.toLowerCase().includes(query) ||
      s.student.section.toLowerCase().includes(query) ||
      (s.student.rollNumber &&
        s.student.rollNumber.toLowerCase().includes(query))
    );
  });
}

// 🔍 Filter by customFee presence
if (customFeeFilter === "yes") {
  filtered = filtered.filter((s) => !!s.customFee);
} else if (customFeeFilter === "no") {
  filtered = filtered.filter((s) => !s.customFee);
}


    const totalDueSum = filtered.reduce((sum, item) => sum + item.remaining, 0);
    const totalPages = Math.ceil(filtered.length / limit);
    const paginated = filtered.slice(skip, skip + Number(limit));

    res.status(200).json({
      success: true,
      students: paginated,
      total: filtered.length,
      totalDueSum,
      page: Number(page),
      totalPages,
    });
  } catch (err) {
    console.error("Error fetching fee statuses:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


// POST /api/admin/send-fee-reminder/:studentId
export const sendFeeReminder = async (req, res) => {
  try {
    const studentId = req.params.studentId;
    const academicYear = "2025-2026"; // ✅ You can later make this dynamic

    // 1. Fetch student with parent
    const student = await Student.findById(studentId).populate("parent");
    if (!student || !student.parent) {
      return res.status(404).json({ success: false, message: "Student or parent not found" });
    }

    // 2. Check for Custom Fee first
    const customFee = await CustomFee.findOne({ student: studentId, academicYear });
    const standardFee = await FeeStructure.findOne({
      class: student.class,
      section: student.section,
      academicYear,
    });

    if (!customFee && !standardFee) {
      return res.status(404).json({ success: false, message: "No fee structure found" });
    }

    const totalDue = customFee?.totalFee || standardFee.totalFee;
    const dueDate = customFee?.dueDate || null;
    const perDayLateFee = customFee?.lateFeePerDay || 0;

    // 3. Calculate late fee if overdue
    let overdueDays = 0;
    let lateFee = 0;

    if (dueDate && new Date() > new Date(dueDate)) {
      overdueDays = Math.floor((new Date() - new Date(dueDate)) / (1000 * 60 * 60 * 24));
      lateFee = overdueDays * perDayLateFee;
    }

    const grandTotal = totalDue + lateFee;

    // 4. Check if already paid
const paidPayments = await FeePayment.find({
  student: student._id,
  academicYear,
  status: "paid",
});

const totalPaid = paidPayments.reduce((sum, p) => sum + (p.amountPaid || 0) + (p.lateFee || 0), 0);

if (totalPaid >= totalDue + lateFee) {
  return res.status(400).json({ success: false, message: "Fee already fully paid" });
}


    // 5. Prepare reminder message
    const text = `Dear ${student.parent.name},

This is a gentle reminder that the fee for your child ${student.name} (Class ${student.class}${student.section}) for the academic year ${academicYear} is still pending.
Total Fee: ₹${totalDue}
${lateFee > 0 ? `Late Fee (${overdueDays} days): ₹${lateFee}\n` : ""}
Total Paid: ₹${totalPaid}
Total Amount Remaining: ₹${grandTotal - totalPaid}

Please make the payment at your earliest convenience.

Regards,  
EduReach`;

    // 6. Send WhatsApp notification
    if (student.parent.phone) {
      try {
        await sendWhatsApp({
          to: `+91${student.parent.phone}`,
          message: text,
        });
        console.log("✅ WhatsApp reminder sent to", student.parent.phone);
      } catch (err) {
        console.warn("⚠️ WhatsApp send error:", err.message);
      }
    } else {
      console.warn("⚠️ No phone number found for WhatsApp reminder.");
    }

    res.status(200).json({ success: true, message: "Reminder sent via email and WhatsApp" });
  } catch (error) {
    console.error("sendFeeReminder error:", error);
    res.status(500).json({ success: false, message: "Could not send reminders", error: error.message });
  }
};

// ✅ ADMIN: Verify Offline Payment
export const verifyOfflinePayment = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const adminId = req.user._id;
    const { notes } = req.body;

    // 1. Find the offline payment
    const feePayment = await FeePayment.findById(paymentId)
      .populate("student")
      .populate("parent");

    if (!feePayment) {
      return res.status(404).json({ success: false, message: "Payment not found" });
    }

    if (feePayment.status !== "pending_verification") {
      return res.status(400).json({ 
        success: false, 
        message: "Payment is not pending verification" 
      });
    }

    if (feePayment.paymentMethod !== "cash") {
      return res.status(400).json({ 
        success: false, 
        message: "This is not an offline payment" 
      });
    }

    // 2. Update payment status
    feePayment.status = "paid";
    feePayment.verifiedBy = adminId;
    feePayment.verifiedAt = new Date();
    feePayment.paidAt = new Date();
    if (notes) {
      feePayment.notes = notes;
    }

    await feePayment.save();

    // 3. Generate PDF receipt
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", async () => {
      const pdfBuffer = Buffer.concat(chunks);

      // Save receipt URL for reference (using a local endpoint)
      feePayment.receiptUrl = `/api/payment/receipt/${feePayment._id}`;
      await feePayment.save();

      // Send WhatsApp notification
      if (feePayment.parent.phone) {
        try {
          const { sendWhatsApp } = await import("../utils/sendWhatsApp.js");
          await sendWhatsApp({
            to: feePayment.parent.phone,
            message: `✅ *Offline Payment Verified!*\n\nDear ${feePayment.parent.name},\n\nYour offline payment of *₹${feePayment.amountPaid}* (Late Fee: ₹${feePayment.lateFee || 0}) has been verified by the school administration.\n\n*Payment Details:*\n• Student: ${feePayment.student.name}\n• Class: ${feePayment.student.class} ${feePayment.student.section}\n• Amount: ₹${feePayment.amountPaid}\n• Method: Cash\n• Verified Date: ${new Date().toLocaleDateString()}\n\nReceipt: ${feePayment.receiptUrl}\n\nRegards,\nEduReach Team`
          });
        } catch (whatsappError) {
          console.error("WhatsApp notification failed:", whatsappError);
          // Don't fail the payment if WhatsApp fails
        }
      }

      // Send JSON response for frontend success handling
      res.status(200).json({ 
        success: true, 
        message: "Offline payment verified successfully", 
        feePayment,
        receiptUrl: feePayment.receiptUrl
      });
    });

    // Generate PDF content - Enhanced Attractive Layout for Offline Payment
    const offlineLogoPath = path.resolve(process.cwd(), "Public", "school-logo.png");
    
    // Background gradient effect
    doc.rect(0, 0, 595, 842).fill('#f8fafc');
    
    // Header with gradient background
    doc.rect(0, 0, 595, 120).fill('#dc2626');
    
    // Top Logo with enhanced styling
    doc.image(offlineLogoPath, 250, 20, { width: 100 });
    
    // School Name & Tagline with enhanced colors
    doc
      .fontSize(28)
      .fillColor("#ffffff")
      .font("Helvetica-Bold")
      .text("EduReach INTERNATIONAL", { align: "center" });

    doc
      .fontSize(14)
      .fillColor("#fecaca")
      .font("Helvetica-Oblique")
      .text('"Empowering Minds for Life"', { align: "center" })
      .moveDown(1);

    // Receipt Title with attractive styling
    doc
      .fontSize(24)
      .fillColor("#dc2626")
      .font("Helvetica-Bold")
      .text("OFFLINE FEE PAYMENT RECEIPT", { align: "center" })
      .moveDown(0.5);
    
    // Decorative line
    doc.rect(150, doc.y, 295, 3).fill('#ef4444');
    doc.moveDown(1);

    // Metadata with colored background
    doc.rect(50, doc.y, 495, 60).fill('#f1f5f9').stroke('#e2e8f0');
    doc
      .fontSize(12)
      .font("Helvetica-Bold")
      .fillColor("#dc2626")
      .text(`Receipt ID: ${feePayment._id}`, 60, doc.y - 50)
      .text(`Date: ${new Date().toLocaleString()}`, 60, doc.y - 30)
      .text(`Academic Year: ${feePayment.academicYear}`, 60, doc.y - 10)
      .moveDown(1);

    // Student Info Section with attractive styling
    doc.rect(50, doc.y, 495, 80).fill('#ecfdf5').stroke('#10b981');
    doc
      .fontSize(16)
      .fillColor("#065f46")
      .font("Helvetica-Bold")
      .text("👤 Student Information", 60, doc.y - 70)
      .moveDown(0.3);

    doc
      .fontSize(12)
      .fillColor("#374151")
      .font("Helvetica")
      .text(`Name: ${feePayment.student.name}`, 60, doc.y - 50)
      .text(`Class: ${feePayment.student.class} ${feePayment.student.section}`, 60, doc.y - 35)
      .text(`Roll Number: ${feePayment.student.rollNumber || "N/A"}`, 60, doc.y - 20)
      .text(`Admission No: ${feePayment.student.admissionNumber || "N/A"}`, 60, doc.y - 5)
      .moveDown(1);

    // Payment Info Section with enhanced styling
    doc.rect(50, doc.y, 495, 120).fill('#fef3c7').stroke('#f59e0b');
    doc
      .fontSize(16)
      .fillColor("#92400e")
      .font("Helvetica-Bold")
      .text("💰 Payment Details", 60, doc.y - 110)
      .moveDown(0.3);

    doc
      .fontSize(12)
      .fillColor("#374151")
      .font("Helvetica")
      .text(`Amount Paid: ₹${feePayment.amountPaid}`, 60, doc.y - 90)
      .text(`Late Fee: ₹${feePayment.lateFee || 0}`, 60, doc.y - 75)
      .text(`Total Paid: ₹${feePayment.amountPaid + (feePayment.lateFee || 0)}`, 60, doc.y - 60)
      .text(`Payment Method: Cash`, 60, doc.y - 45)
      .text(`Verified Date: ${new Date().toLocaleDateString()}`, 60, doc.y - 30)
      .fillColor("#059669")
      .font("Helvetica-Bold")
      .text("✅ [VERIFIED]", 60, doc.y - 15);

    doc
      .fillColor("#374151")
      .font("Helvetica")
      .text(`Payment Date: ${new Date(feePayment.paidAt).toLocaleString()}`, 60, doc.y - 0)
      .text(`Mode: Offline Cash`, 60, doc.y + 15)
      .moveDown(1);

    // Enhanced watermark background
    doc
      .opacity(0.08)
      .image(path.resolve(process.cwd(), "Public", "school-logo.png"), 100, 300, {
        width: 400,
        align: "center",
      })
      .opacity(1);

    // Signature section with enhanced styling
    doc.rect(50, doc.y, 495, 80).fill('#f3f4f6').stroke('#9ca3af');
    doc
      .fontSize(10)
      .fillColor("#6b7280")
      .text("This is a system-generated receipt. Please retain it.", {
        align: "center",
      })
      .moveDown(1);

    // Digital Signature with enhanced styling
    doc
      .image(path.resolve(process.cwd(), "Public", "school-logo.png"), 400, doc.y, {
        width: 80,
      })
      .fontSize(12)
      .fillColor("#374151")
      .text("Digital Signature: ______________________", 50, doc.y + 30)
      .moveDown(2);

    // Enhanced Footer with gradient
    doc.rect(0, doc.y, 595, 40).fill('#1f2937');
    doc
      .fontSize(12)
      .fillColor("#ffffff")
      .text("EduReach International School | info@EduReach.com | +91-1234567890", {
        align: "center",
      });

    doc.end();
  } catch (error) {
    console.error("verifyOfflinePayment error:", error);
    res.status(500).json({ success: false, message: "Verification failed" });
  }
};

// ✅ ADMIN: Get Pending Offline Payments
export const getPendingOfflinePayments = async (req, res) => {
  try {
    const { page = 1, limit = 10, search } = req.query;
    const skip = (page - 1) * limit;

    let query = {
      status: "pending_verification",
      paymentMethod: "cash"
    };

    // Add search functionality
    if (search) {
      const payments = await FeePayment.find(query)
        .populate({
          path: "student",
          match: {
            $or: [
              { name: { $regex: search, $options: "i" } },
              { class: { $regex: search, $options: "i" } },
              { section: { $regex: search, $options: "i" } }
            ]
          }
        })
        .populate("parent", "name email phone")
        .sort({ createdAt: -1 })
        .lean();

      const filteredPayments = payments.filter(payment => payment.student);
      
      const totalPages = Math.ceil(filteredPayments.length / limit);
      const paginated = filteredPayments.slice(skip, skip + Number(limit));

      return res.status(200).json({
        success: true,
        payments: paginated,
        total: filteredPayments.length,
        page: Number(page),
        totalPages,
      });
    }

    const payments = await FeePayment.find(query)
      .populate("student", "name class section rollNumber admissionNumber")
      .populate("parent", "name email phone")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    const total = await FeePayment.countDocuments(query);
    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      payments,
      total,
      page: Number(page),
      totalPages,
    });
  } catch (error) {
    console.error("getPendingOfflinePayments error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch pending payments" });
  }
};

// ✅ Generate Payment Receipt (for both online and offline payments)
export const generatePaymentReceipt = async (req, res) => {
  try {
    const { paymentId } = req.params;
    
    // Find the payment
    const feePayment = await FeePayment.findById(paymentId)
      .populate('student', 'name class section rollNumber admissionNumber')
      .populate('parent', 'name phone');
    
    if (!feePayment) {
      return res.status(404).json({ success: false, message: "Payment not found" });
    }

    // Check if user has access to this payment
    if (req.user.role === 'parent' && feePayment.parent._id.toString() !== req.user.parentId.toString()) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    // If receipt already exists, return it
    if (feePayment.receiptUrl) {
      return res.json({ 
        success: true, 
        message: "Receipt already exists",
        receiptUrl: feePayment.receiptUrl 
      });
    }

    // Generate PDF receipt
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 50 });
    
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    
    doc.on('end', async () => {
      try {
        const pdfBuffer = Buffer.concat(chunks);

        // Upload to Cloudinary
        try {
          const result = await cloudinary.uploader.upload(
            `data:application/pdf;base64,${pdfBuffer.toString('base64')}`,
            {
              resource_type: "raw",
              folder: "receipts",
              public_id: `receipt_${feePayment._id}.pdf`,
              format: "pdf",
              type: "upload",
            }
          );
          
          // Update payment with receipt URL
          feePayment.receiptUrl = result.secure_url;
          await feePayment.save();
          
          res.json({ 
            success: true, 
            message: "Receipt generated successfully",
            receiptUrl: result.secure_url 
          });
        } catch (uploadError) {
          console.error("Cloudinary upload error:", uploadError);
          return res.status(500).json({ success: false, message: "Failed to upload receipt" });
        }
      } catch (error) {
        console.error("Receipt generation error:", error);
        res.status(500).json({ success: false, message: "Failed to generate receipt" });
      }
    });

    // Generate PDF content
    const logoPath = path.resolve(process.cwd(), "Public", "school-logo.png");
    doc.image(logoPath, 260, 30, { width: 80 });

    // Header
    doc.fontSize(20).text('PAYMENT RECEIPT', 50, 120, { align: 'center' });
    doc.fontSize(12).text(`Receipt No: ${feePayment._id}`, 50, 150);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 50, 170);

    // School Info
    doc.fontSize(14).text('EduReach International School', 50, 200);
    doc.fontSize(10).text('123 Education Street, Learning City', 50, 220);
    doc.text('Phone: +91 9876543210 | Email: info@edureach.edu', 50, 240);

    // Payment Details
    doc.rect(50, 280, 500, 200).stroke();
    doc.fontSize(12).text('PAYMENT DETAILS', 60, 300);
    
    doc.fontSize(10);
    doc.text('Student Name:', 60, 330);
    doc.text(feePayment.student.name, 200, 330);
    
    doc.text('Class & Section:', 60, 350);
    doc.text(`${feePayment.student.class} ${feePayment.student.section}`, 200, 350);
    
    doc.text('Parent Name:', 60, 370);
    doc.text(feePayment.parent.name, 200, 370);
    
    doc.text('Payment Method:', 60, 390);
    doc.text(feePayment.paymentMethod || 'Online', 200, 390);
    
    doc.text('Amount Paid:', 60, 410);
    doc.text(`₹${feePayment.amountPaid}`, 200, 410);
    
    if (feePayment.lateFee && feePayment.lateFee > 0) {
      doc.text('Late Fee:', 60, 430);
      doc.text(`₹${feePayment.lateFee}`, 200, 430);
    }
    
    doc.text('Payment Date:', 60, 450);
    doc.text(feePayment.paidAt ? new Date(feePayment.paidAt).toLocaleDateString() : new Date().toLocaleDateString(), 200, 450);

    // Payment Status
    doc.text('Status:', 60, 470);
    doc.text(feePayment.status.toUpperCase(), 200, 470);

    // Footer
    doc.fontSize(8).text('This is a computer generated receipt. No signature required.', 50, 520, { align: 'center' });
    doc.text('Thank you for your payment!', 50, 540, { align: 'center' });

    doc.end();

  } catch (error) {
    console.error("Generate receipt error:", error);
    res.status(500).json({ success: false, message: "Failed to generate receipt" });
  }
};

// ✅ Download Receipt Endpoint
export const downloadReceipt = async (req, res) => {
  try {
    const { paymentId } = req.params;
    
    // Find the payment
    const feePayment = await FeePayment.findById(paymentId)
      .populate('student', 'name class section rollNumber admissionNumber')
      .populate('parent', 'name phone');
    
    if (!feePayment) {
      return res.status(404).json({ success: false, message: "Payment not found" });
    }

    // Check if user has access to this payment
    if (req.user.role === 'parent' && feePayment.parent._id.toString() !== req.user.parentId.toString()) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    // Generate PDF receipt
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks = [];
    
    doc.on('data', chunk => chunks.push(chunk));
    
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks);
      
      // Set response headers for PDF download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="receipt_${feePayment._id}.pdf"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      
      // Send PDF directly to client
      res.send(pdfBuffer);
    });

    // Generate PDF content
    const logoPath = path.resolve(process.cwd(), "Public", "school-logo.png");
    doc.image(logoPath, 260, 30, { width: 80 });

    // Header
    doc.fontSize(20).text('PAYMENT RECEIPT', 50, 120, { align: 'center' });
    doc.fontSize(12).text(`Receipt No: ${feePayment._id}`, 50, 150);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 50, 170);

    // School Info
    doc.fontSize(14).text('EduReach International School', 50, 200);
    doc.fontSize(10).text('123 Education Street, Learning City', 50, 220);
    doc.text('Phone: +91 9876543210 | Email: info@edureach.edu', 50, 240);

    // Payment Details
    doc.rect(50, 280, 500, 200).stroke();
    doc.fontSize(12).text('PAYMENT DETAILS', 60, 300);
    
    doc.fontSize(10);
    doc.text('Student Name:', 60, 330);
    doc.text(feePayment.student.name, 200, 330);
    
    doc.text('Class & Section:', 60, 350);
    doc.text(`${feePayment.student.class} ${feePayment.student.section}`, 200, 350);
    
    doc.text('Parent Name:', 60, 370);
    doc.text(feePayment.parent.name, 200, 370);
    
    doc.text('Payment Method:', 60, 390);
    doc.text(feePayment.paymentMethod || 'Online', 200, 390);
    
    doc.text('Amount Paid:', 60, 410);
    doc.text(`₹${feePayment.amountPaid}`, 200, 410);
    
    if (feePayment.lateFee && feePayment.lateFee > 0) {
      doc.text('Late Fee:', 60, 430);
      doc.text(`₹${feePayment.lateFee}`, 200, 430);
    }
    
    doc.text('Payment Date:', 60, 450);
    doc.text(feePayment.paidAt ? new Date(feePayment.paidAt).toLocaleDateString() : new Date().toLocaleDateString(), 200, 450);

    // Payment Status
    doc.text('Status:', 60, 470);
    doc.text(feePayment.status.toUpperCase(), 200, 470);

    // Footer
    doc.fontSize(8).text('This is a computer generated receipt. No signature required.', 50, 520, { align: 'center' });
    doc.text('Thank you for your payment!', 50, 540, { align: 'center' });

    doc.end();

  } catch (error) {
    console.error("Download receipt error:", error);
    res.status(500).json({ success: false, message: "Failed to download receipt" });
  }
};

