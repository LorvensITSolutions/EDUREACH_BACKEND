// cron/feeReminderCron.js
import cron from "node-cron";
import Student from "../models/student.model.js";
import Parent from "../models/parent.model.js";
import FeeStructure from "../models/FeeStructure.model.js";
import CustomFee from "../models/customFee.model.js";
import FeePayment from "../models/feePayment.model.js";
import { sendEmail, sendBasicEmail } from "../utils/emailService.js";
import { sendWhatsApp } from "../utils/sendWhatsApp.js";
import { getAcademicYear } from "../config/appConfig.js";
import Setting from "../models/setting.model.js";

let feeReminderTask = null;

function buildCronFromHHmm(hhmm) {
  // Expect format HH:mm in 24-hour time
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm || "");
  if (!match) return "17 16 * * *"; // default 16:17
  const hour = Math.min(23, Math.max(0, parseInt(match[1], 10)));
  const minute = Math.min(59, Math.max(0, parseInt(match[2], 10)));
  return `${minute} ${hour} * * *`;
}

function buildCronFromTimeAndDays(hhmm, daysArray) {
  // daysArray is array of numbers 0-6 (0 Sunday) or empty/undefined for every day
  const base = buildCronFromHHmm(hhmm);
  const parts = base.split(" ");
  // parts: [min, hour, dom, mon, dow]
  let dow = "*";
  if (Array.isArray(daysArray) && daysArray.length > 0) {
    const valid = daysArray
      .map((d) => Number(d))
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      .sort((a, b) => a - b);
    if (valid.length > 0) {
      dow = valid.join(",");
    }
  }
  parts[4] = dow;
  return parts.join(" ");
}

function scheduleTaskWithCron(cronExpr) {
  if (feeReminderTask) {
    try { feeReminderTask.stop(); } catch {}
  }
  feeReminderTask = cron.schedule(cronExpr, async () => {
    try {
      console.log("📬 Running fee reminder job (daily 16:17)...");

      const academicYear = getAcademicYear();
      const today = new Date();

      const students = await Student.find().populate("parent").lean();

      for (const student of students) {
        // Determine fee structure (custom overrides default)
        const customFee = await CustomFee.findOne({ student: student._id, academicYear }).lean();
        const defaultStructure = await FeeStructure.findOne({
          class: student.class,
          section: student.section,
          academicYear,
        }).lean();

        const feeStructureToUse = customFee || defaultStructure;
        if (!feeStructureToUse) continue;

        const baseFee = feeStructureToUse.totalFee || 0;

        // Calculate totalPaid so far
        const paidPayments = await FeePayment.find({
          student: student._id,
          academicYear,
          status: "paid",
        }).lean();

        const totalPaid = paidPayments.reduce((sum, p) => sum + (p.amountPaid || 0) + (p.lateFee || 0), 0);

        // If fully paid, skip
        if (totalPaid >= baseFee) continue;

        // Compose reminder
        const dueDate = customFee?.dueDate || null;
        const lateFeePerDay = customFee?.lateFeePerDay || 0;
        let overdueDays = 0;
        let estimatedLateFee = 0;
        if (dueDate && new Date(dueDate) < today) {
          const diffTime = today - new Date(dueDate);
          overdueDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          estimatedLateFee = overdueDays * lateFeePerDay;
        }

        const remaining = Math.max(baseFee - totalPaid, 0);
        const estimatedTotalDue = remaining + estimatedLateFee;

        const text = `Dear ${student.parent.name},

This is an automated reminder that the fee for your child ${student.name} (Class ${student.class}${student.section}) for the academic year ${academicYear} is pending.
Base Fee: ₹${baseFee}
Total Paid: ₹${totalPaid}
${dueDate ? `Due Date: ${new Date(dueDate).toLocaleDateString()}` : ""}
${estimatedLateFee > 0 ? `Estimated Late Fee (${overdueDays} days): ₹${estimatedLateFee}` : ""}
Amount Remaining: ₹${estimatedTotalDue}

Please make the payment at your earliest convenience.

Regards,
EduReach`;

        // Send Email
        try {
          await sendBasicEmail({
            to: student.parent.email,
            subject: "EduReach - Fee Due Reminder",
            text,
          });
        } catch (e) {
          console.warn("Email send failed for", student.parent.email, e?.message);
        }

        // Send WhatsApp if phone is available
        if (student.parent?.phone) {
          try {
            await sendWhatsApp({ to: `+91${student.parent.phone}`, message: text });
          } catch (e) {
            console.warn("WhatsApp send failed for", student.parent.phone, e?.message);
          }
        }
      }

      console.log("✅ Fee reminder job finished.");
    } catch (err) {
      console.error("❌ Fee reminder job error:", err);
    }
  });
}

export const scheduleFeeReminderJob = async () => {
  // Load time and days from DB settings; default to 16:17 every day
  const [timeSetting, daysSetting] = await Promise.all([
    Setting.findOne({ key: "feeReminderTime" }).lean(),
    Setting.findOne({ key: "feeReminderDays" }).lean(),
  ]);
  const cronExpr = buildCronFromTimeAndDays(timeSetting?.value || "16:17", daysSetting?.value);
  scheduleTaskWithCron(cronExpr);
  console.log(`⏰ Fee reminder scheduled with cron: ${cronExpr}`);
};

export const rescheduleFeeReminderJob = async (hhmm, daysArray) => {
  const cronExpr = buildCronFromTimeAndDays(hhmm || "16:17", daysArray);
  scheduleTaskWithCron(cronExpr);
  console.log(`🔁 Fee reminder rescheduled with cron: ${cronExpr}`);
};

