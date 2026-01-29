import { google } from "googleapis";
import dotenv from "dotenv";
import fs from "fs";
import Event from "../models/event.model.js";

dotenv.config();

const KEYFILEPATH = process.env.SERVICE_ACCOUNT_PATH;
const SERVICE_ACCOUNT_JSON = process.env.SERVICE_ACCOUNT_JSON; // For deployed backends (Render, etc.)
const SCOPES = ["https://www.googleapis.com/auth/calendar"];
const CALENDAR_ID = process.env.CALENDAR_ID;
const TIMEZONE = process.env.TIMEZONE || "Asia/Kolkata";

// Common paths for secret files in Render and other platforms
const COMMON_SECRET_PATHS = [
  '/etc/secrets/service-account-key.json', // Render secret file path (default)
  '/etc/secrets/school-calender.json', // User's secret file name
  '/etc/secrets/school-calendar.json', // Alternative spelling
  '/run/secrets/service-account-key.json', // Docker secrets
  './secrets/service-account-key.json', // Local secrets folder
  './config/service-account-key.json', // Config folder
  process.env.GOOGLE_APPLICATION_CREDENTIALS, // Google default env var
].filter(Boolean); // Remove undefined values

// Helper function to check if file exists
const fileExists = (filePath) => {
  if (!filePath) return false;
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
};

// Initialize calendar only if credentials are available
let auth = null;
let calendar = null;
let isCalendarConfigured = false;
let tempKeyFile = null; // Track temp file for cleanup

// Function to safely initialize calendar
const initializeCalendar = () => {
  try {
    if (!CALENDAR_ID) {
      console.warn("Google Calendar not configured: Missing CALENDAR_ID environment variable");
      console.warn("Please set CALENDAR_ID in your environment variables (e.g., 'your-calendar-id@group.calendar.google.com')");
      return false;
    }

    let credentials = null;
    let keyFilePath = null;

    // Option 1: Use JSON string from environment variable (for deployed backends like Render)
    if (SERVICE_ACCOUNT_JSON) {
      try {
        // Handle both string and already-parsed JSON
        if (typeof SERVICE_ACCOUNT_JSON === 'string') {
          credentials = JSON.parse(SERVICE_ACCOUNT_JSON);
        } else {
          credentials = SERVICE_ACCOUNT_JSON;
        }
        console.log("✓ Using service account credentials from SERVICE_ACCOUNT_JSON environment variable");
      } catch (parseErr) {
        console.error("✗ Failed to parse SERVICE_ACCOUNT_JSON:", parseErr.message);
        console.error("Please ensure SERVICE_ACCOUNT_JSON is valid JSON (single line, properly escaped)");
        // Don't return false yet, try other options
      }
    }
    
    // Option 2: Try to find secret file in common paths (for Render secret files)
    if (!credentials) {
      // Check explicit path first
      if (KEYFILEPATH && fileExists(KEYFILEPATH)) {
        keyFilePath = KEYFILEPATH;
        console.log("✓ Found service account file at explicit path:", KEYFILEPATH);
      } else {
        // Try common secret file paths
        for (const path of COMMON_SECRET_PATHS) {
          if (fileExists(path)) {
            keyFilePath = path;
            console.log("✓ Found service account file at:", path);
            break;
          }
        }
      }
      
      if (keyFilePath) {
        try {
          // Read and parse the JSON file
          const fileContent = fs.readFileSync(keyFilePath, 'utf8');
          credentials = JSON.parse(fileContent);
          console.log("✓ Successfully loaded service account credentials from file");
        } catch (fileErr) {
          console.error("✗ Failed to read/parse service account file:", fileErr.message);
          keyFilePath = null;
        }
      }
    }
    
    // If still no credentials, show helpful error
    if (!credentials && !keyFilePath) {
      console.warn("✗ Google Calendar not configured: No credentials found");
      console.warn("Tried the following:");
      if (SERVICE_ACCOUNT_JSON) {
        console.warn("  - SERVICE_ACCOUNT_JSON (failed to parse)");
      }
      console.warn("  - SERVICE_ACCOUNT_PATH:", KEYFILEPATH || "not set");
      console.warn("  - Common secret file paths:");
      COMMON_SECRET_PATHS.forEach(path => {
        console.warn(`    - ${path} ${fileExists(path) ? '✓ exists' : '✗ not found'}`);
      });
      console.warn("\nSolutions:");
      console.warn("  1. For Render: Set SERVICE_ACCOUNT_JSON environment variable with JSON content");
      console.warn("  2. For Render Secret Files: Mount secret file and set SERVICE_ACCOUNT_PATH to the mount path");
      console.warn("  3. For local: Set SERVICE_ACCOUNT_PATH=/path/to/key.json");
      return false;
    }

    // Initialize auth with credentials
    if (credentials) {
      // Use credentials directly (from JSON string or parsed file)
      auth = new google.auth.GoogleAuth({
        credentials: credentials,
        scopes: SCOPES,
      });
    } else if (keyFilePath) {
      // Use file path (fallback)
      auth = new google.auth.GoogleAuth({
        keyFile: keyFilePath,
        scopes: SCOPES,
      });
    }

    calendar = google.calendar({ version: "v3", auth });
    isCalendarConfigured = true;

    return true;
  } catch (err) {

    isCalendarConfigured = false;
    auth = null;
    calendar = null;
    return false;
  }
};

// Initialize on module load
initializeCalendar();

// Function to re-initialize calendar (useful if credentials are added after startup)
export const reinitializeCalendar = () => {
  return initializeCalendar();
};

export const createEvent = async (req, res) => {
  try {
    // Try to re-initialize if not configured (in case credentials were added)
    if (!isCalendarConfigured || !calendar) {
      const reinitSuccess = reinitializeCalendar();
      if (!reinitSuccess) {
        // Fallback: save event to school DB so admins can still create events
        const { summary, description, location, startTime, endTime, category } = req.body;
        if (!summary || !startTime || !endTime) {
          return res.status(400).json({ success: false, error: "Missing required fields" });
        }
        const startDate = new Date(startTime);
        const endDateObj = new Date(endTime);
        const dateOnly = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
        const timeStr = `${String(startDate.getUTCHours()).padStart(2, "0")}:${String(startDate.getUTCMinutes()).padStart(2, "0")}`;
        const endDateOnly = new Date(Date.UTC(endDateObj.getUTCFullYear(), endDateObj.getUTCMonth(), endDateObj.getUTCDate()));
        const endTimeStr = `${String(endDateObj.getUTCHours()).padStart(2, "0")}:${String(endDateObj.getUTCMinutes()).padStart(2, "0")}`;
        const categoryVal = category || "Academic";
        const allowedCategories = ["Academic", "Sports", "Cultural", "Meeting", "Workshop"];
        const safeCategory = allowedCategories.includes(categoryVal) ? categoryVal : "Academic";
        try {
          const dbEvent = await Event.create({
            title: summary,
            description: description || "",
            category: safeCategory,
            date: dateOnly,
            time: timeStr,
            endDate: endDateOnly,
            endTime: endTimeStr,
            location: location || "",
            image: "https://placehold.co/400x200?text=Event",
          });
          try {
            const { redis } = await import("../lib/redis.js");
            await redis.del("all_events");
          } catch (e) {
            // ignore if redis not configured
          }
          // Use the exact start/end times from the request so calendar displays correct dates (avoids timezone shift)
          const startIso = new Date(startTime).toISOString();
          const endIso = new Date(endTime).toISOString();
          return res.status(200).json({
            success: true,
            event: {
              id: `db-event-${dbEvent._id}`,
              summary: dbEvent.title,
              description: dbEvent.description,
              location: dbEvent.location,
              start: { dateTime: startIso },
              end: { dateTime: endIso },
              extendedProperties: { private: { category: dbEvent.category } },
            },
          });
        } catch (dbErr) {
          console.error("DB event create fallback error:", dbErr);
          return res.status(500).json({
            success: false,
            error: dbErr.message || "Failed to save event to school calendar.",
          });
        }
      }
    }

    const { summary, description, location, startTime, endTime, category } = req.body;
    if (!summary || !startTime || !endTime) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    // ✅ Ensure RFC3339 format
    const formattedStart = new Date(startTime).toISOString();
    const formattedEnd = new Date(endTime).toISOString();

    const event = {
      summary,
      description,
      location,
      start: { dateTime: formattedStart, timeZone: TIMEZONE },
      end: { dateTime: formattedEnd, timeZone: TIMEZONE },
    };

    // Add category as extended property if provided
    if (category) {
      event.extendedProperties = {
        private: {
          category: category
        }
      };
    }

    const response = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      resource: event,
    });

    res.status(200).json({ success: true, event: response.data });
  } catch (err) {
    console.error("Google Calendar createEvent error:", err);
    
    // Provide more specific error messages
    let errorMessage = "Failed to create event";
    
    if (err.code === 401 || err.code === 403) {
      errorMessage = "Permission denied. Please ensure the service account has 'Make changes to events' permission on the calendar.";
    } else if (err.code === 404) {
      errorMessage = "Calendar not found. Please check that CALENDAR_ID is correct and the service account has access.";
    } else if (err.message?.includes('invalid_grant') || err.message?.includes('unauthorized')) {
      errorMessage = "Invalid credentials. Please check SERVICE_ACCOUNT_JSON is correct and the service account is valid.";
    } else if (err.message) {
      errorMessage = `Failed to create event: ${err.message}`;
    }
    
    res.status(500).json({ success: false, error: errorMessage });
  }
};

export const listEvents = async (req, res) => {
  try {
    // Try to re-initialize if not configured (in case credentials were added)
    if (!isCalendarConfigured || !calendar) {
      console.log("Calendar not configured, attempting re-initialization...");
      const reinitSuccess = reinitializeCalendar();
      if (!reinitSuccess) {
        console.log("Calendar not configured, returning empty events list");
        return res.status(200).json({ 
          success: true, 
          events: [],
          message: "Calendar service is not configured. Events will not be available."
        });
      }
    }

    // Optionally: allow fetching all events, not just future
    const timeMin = req.query.all === "true" ? undefined : new Date().toISOString();
    // Increase maxResults to fetch more events, or set to 2500 (Google Calendar API max)
    const maxResults = req.query.all === "true" ? 2500 : 20;
    const response = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin,
      maxResults,
      singleEvents: true,
      orderBy: "startTime",
    });

    res.status(200).json({ success: true, events: response.data.items || [] });
  } catch (err) {
    console.error("Google Calendar listEvents error:", err);
    
    // Check if error is related to missing configuration or invalid credentials
    const isConfigurationError = 
      err.code === 'ENOENT' || 
      err.code === 'ENOTFOUND' ||
      err.message?.includes('SERVICE_ACCOUNT_PATH') ||
      err.message?.includes('service account') ||
      err.message?.includes('file not found') ||
      err.message?.includes('Cannot find module') ||
      err.code === 401 || 
      err.code === 403 ||
      err.message?.includes('invalid_grant') ||
      err.message?.includes('unauthorized');
    
    // If it's a configuration/authentication error, return empty events instead of error
    if (isConfigurationError) {
      console.log("Calendar configuration error detected, returning empty events list:", err.message);
      return res.status(200).json({ 
        success: true, 
        events: [],
        message: "Calendar service is not configured. Events will not be available."
      });
    }
    
    // For other errors (network issues, etc.), return error but don't break the app
    console.error("Unexpected calendar error:", err);
    return res.status(200).json({ 
      success: true, 
      events: [],
      message: "Unable to fetch calendar events at this time."
    });
  }
};


// ✅ Update Event
export const updateEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { summary, description, location, startTime, endTime, category } = req.body;

    if (!eventId) {
      return res.status(400).json({ success: false, error: "Event ID required" });
    }

    // When calendar not configured: update DB event if this is a db-event id
    if (!isCalendarConfigured || !calendar) {
      if (eventId.startsWith("db-event-")) {
        const mongoId = eventId.replace(/^db-event-/, "");
        if (!summary || !startTime || !endTime) {
          return res.status(400).json({ success: false, error: "Missing required fields" });
        }
        const startDate = new Date(startTime);
        const endDateObj = new Date(endTime);
        const dateOnly = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
        const timeStr = `${String(startDate.getUTCHours()).padStart(2, "0")}:${String(startDate.getUTCMinutes()).padStart(2, "0")}`;
        const endDateOnly = new Date(Date.UTC(endDateObj.getUTCFullYear(), endDateObj.getUTCMonth(), endDateObj.getUTCDate()));
        const endTimeStr = `${String(endDateObj.getUTCHours()).padStart(2, "0")}:${String(endDateObj.getUTCMinutes()).padStart(2, "0")}`;
        const categoryVal = category || "Academic";
        const allowedCategories = ["Academic", "Sports", "Cultural", "Meeting", "Workshop"];
        const safeCategory = allowedCategories.includes(categoryVal) ? categoryVal : "Academic";
        try {
          const dbEvent = await Event.findByIdAndUpdate(
            mongoId,
            {
              title: summary,
              description: description || "",
              category: safeCategory,
              date: dateOnly,
              time: timeStr,
              endDate: endDateOnly,
              endTime: endTimeStr,
              location: location || "",
            },
            { new: true }
          );
          if (!dbEvent) {
            return res.status(404).json({ success: false, error: "Event not found" });
          }
          try {
            const { redis } = await import("../lib/redis.js");
            await redis.del("all_events");
          } catch (e) {
            // ignore if redis not configured
          }
          const startIso = new Date(startTime).toISOString();
          const endIso = new Date(endTime).toISOString();
          return res.status(200).json({
            success: true,
            event: {
              id: `db-event-${dbEvent._id}`,
              summary: dbEvent.title,
              description: dbEvent.description,
              location: dbEvent.location,
              start: { dateTime: startIso },
              end: { dateTime: endIso },
              extendedProperties: { private: { category: dbEvent.category } },
            },
          });
        } catch (dbErr) {
          console.error("DB event update fallback error:", dbErr);
          return res.status(500).json({
            success: false,
            error: dbErr.message || "Failed to update event.",
          });
        }
      }
      const missingVars = [];
      if (!CALENDAR_ID) missingVars.push("CALENDAR_ID");
      if (!SERVICE_ACCOUNT_JSON && !KEYFILEPATH) {
        missingVars.push("SERVICE_ACCOUNT_JSON (for deployed) or SERVICE_ACCOUNT_PATH (for local)");
      }
      return res.status(503).json({
        success: false,
        error: "Calendar service is not configured. Missing environment variables: " + missingVars.join(", ") + ". Please check the setup guide.",
      });
    }

    const formattedStart = new Date(startTime).toISOString();
    const formattedEnd = new Date(endTime).toISOString();

    const updatedEvent = {
      summary,
      description,
      location,
      start: { dateTime: formattedStart, timeZone: TIMEZONE },
      end: { dateTime: formattedEnd, timeZone: TIMEZONE },
    };

    if (category) {
      updatedEvent.extendedProperties = {
        private: { category },
      };
    }

    const response = await calendar.events.update({
      calendarId: CALENDAR_ID,
      eventId,
      resource: updatedEvent,
    });

    res.status(200).json({ success: true, event: response.data });
  } catch (err) {
    console.error("Google Calendar updateEvent error:", err);
    res.status(500).json({ success: false, error: "Failed to update event" });
  }
};

// ✅ Delete Event
export const deleteEvent = async (req, res) => {
  try {
    const { eventId } = req.params;

    if (!eventId) {
      return res.status(400).json({ success: false, error: "Event ID required" });
    }

    // When calendar not configured: delete from DB if this is a db-event id
    if (!isCalendarConfigured || !calendar) {
      if (eventId.startsWith("db-event-")) {
        const mongoId = eventId.replace(/^db-event-/, "");
        try {
          const deleted = await Event.findByIdAndDelete(mongoId);
          if (!deleted) {
            return res.status(404).json({ success: false, error: "Event not found" });
          }
          try {
            const { redis } = await import("../lib/redis.js");
            await redis.del("all_events");
          } catch (e) {
            // ignore if redis not configured
          }
          return res.status(200).json({ success: true, message: "Event deleted successfully" });
        } catch (dbErr) {
          console.error("DB event delete fallback error:", dbErr);
          return res.status(500).json({
            success: false,
            error: dbErr.message || "Failed to delete event.",
          });
        }
      }
      const missingVars = [];
      if (!CALENDAR_ID) missingVars.push("CALENDAR_ID");
      if (!SERVICE_ACCOUNT_JSON && !KEYFILEPATH) {
        missingVars.push("SERVICE_ACCOUNT_JSON (for deployed) or SERVICE_ACCOUNT_PATH (for local)");
      }
      return res.status(503).json({
        success: false,
        error: "Calendar service is not configured. Missing environment variables: " + missingVars.join(", ") + ". Please check the setup guide.",
      });
    }

    await calendar.events.delete({
      calendarId: CALENDAR_ID,
      eventId,
    });

    res.status(200).json({ success: true, message: "Event deleted successfully" });
  } catch (err) {
    console.error("Google Calendar deleteEvent error:", err);
    res.status(500).json({ success: false, error: "Failed to delete event" });
  }
};
