import Setting from "../models/setting.model.js";
import { rescheduleFeeReminderJob } from "../cron/feeReminderCron.js";

export const updateLateFee = async (req, res) => {
  try {
    const { perDayLateFee } = req.body;

    if (!perDayLateFee || isNaN(perDayLateFee)) {
      return res.status(400).json({ success: false, message: "Invalid late fee" });
    }

    const setting = await Setting.findOneAndUpdate(
      { key: "perDayLateFee" },
      { value: Number(perDayLateFee) },
      { upsert: true, new: true }
    );

    res.status(200).json({ success: true, message: "Late fee updated", setting });
  } catch (error) {
    console.error("updateLateFee error:", error); // ✅ log the actual error
    res.status(500).json({
      success: false,
      message: "Could not update late fee",
      error: error.message, // Include this for Postman debugging
    });
  }
};


// GET /api/admin/settings
export const getAllSettings = async (req, res) => {
  try {
    const settings = await Setting.find();
    res.status(200).json({ success: true, settings });
  } catch (error) {
    console.error("getAllSettings error:", error);
    res.status(500).json({ success: false, message: "Could not fetch settings" });
  }
};

// POST /api/admin/settings/reminder-time
export const updateFeeReminderTime = async (req, res) => {
  try {
    const { time } = req.body; // expected HH:mm
    if (!/^\d{2}:\d{2}$/.test(time)) {
      return res.status(400).json({ success: false, message: "Invalid time format. Use HH:mm (24h)." });
    }

    const setting = await Setting.findOneAndUpdate(
      { key: "feeReminderTime" },
      { value: time },
      { upsert: true, new: true }
    );

    // Get days to preserve current selection when only time changes
    const daysSetting = await Setting.findOne({ key: "feeReminderDays" });
    await rescheduleFeeReminderJob(time, daysSetting?.value);

    res.status(200).json({ success: true, message: "Reminder time updated", setting });
  } catch (error) {
    console.error("updateFeeReminderTime error:", error);
    res.status(500).json({ success: false, message: "Could not update reminder time" });
  }
};

// POST /api/admin/settings/reminder-days
export const updateFeeReminderDays = async (req, res) => {
  try {
    const { days } = req.body; // array of numbers 0-6
    if (!Array.isArray(days)) {
      return res.status(400).json({ success: false, message: "days must be an array of numbers 0-6" });
    }

    const normalized = days
      .map((d) => Number(d))
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      .sort((a, b) => a - b);

    const setting = await Setting.findOneAndUpdate(
      { key: "feeReminderDays" },
      { value: normalized },
      { upsert: true, new: true }
    );

    // Get time to preserve current time when only days change
    const timeSetting = await Setting.findOne({ key: "feeReminderTime" });
    const time = timeSetting?.value || "16:17";
    await rescheduleFeeReminderJob(time, normalized);

    res.status(200).json({ success: true, message: "Reminder days updated", setting });
  } catch (error) {
    console.error("updateFeeReminderDays error:", error);
    res.status(500).json({ success: false, message: "Could not update reminder days" });
  }
};