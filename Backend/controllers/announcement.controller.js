import Announcement from "../models/announcement.model.js";
import Parent from "../models/parent.model.js";
import { sendWhatsApp } from "../utils/sendWhatsApp.js";
import axios from "axios";

// Better Telugu translation using MyMemory API
const translateText = async (text, source = "en", target = "te") => {
  try {
    console.log(`🔄 Translating from ${source} to ${target}...`);
    console.log(`📝 Original text: ${text.substring(0, 100)}...`);
    
    // Try MyMemory API (free, reliable)
    try {
      console.log("🔄 Trying MyMemory API...");
      const response = await axios.get(
        `https://api.mymemory.translated.net/get`,
        {
          params: {
            q: text,
            langpair: `${source}|${target}`,
            de: 'your-email@domain.com' // optional but recommended
          },
          timeout: 15000
        }
      );
      
      if (response.data && response.data.responseData && response.data.responseData.translatedText) {
        const translatedText = response.data.responseData.translatedText;
        console.log(`✅ MyMemory translation successful: ${translatedText.substring(0, 100)}...`);
        return translatedText;
      }
    } catch (memoryError) {
      console.log("❌ MyMemory failed, trying LibreTranslate...");
    }
    
    // Fallback: Try LibreTranslate
    try {
      console.log("🔄 Trying LibreTranslate...");
      const libreResponse = await axios.post(
        'https://libretranslate.de/translate',
        {
          q: text,
          source: source,
          target: target,
          format: 'text'
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );
      
      if (libreResponse.data && libreResponse.data.translatedText) {
        const libreTranslatedText = libreResponse.data.translatedText;
        console.log(`✅ LibreTranslate successful: ${libreTranslatedText.substring(0, 100)}...`);
        return libreTranslatedText;
      }
    } catch (libreError) {
      console.log("❌ LibreTranslate failed, trying manual mapping...");
    }
    
    // Final fallback: Manual mapping for common phrases
    const teluguMapping = {
      "New Announcement": "కొత్త ప్రకటన",
      "Regards": "ఆదరణలతో",
      "EduReach": "స్కూల్‌హబ్",
      "Exams": "పరీక్షలు",
      "will be held": "నిర్వహించబడతాయి",
      "from": "నుండి",
      "to": "వరకు",
      "Schedule": "షెడ్యూల్",
      "Mid-Term": "మధ్య-కాల",
      "Term": "కాల",
      "Important": "ముఖ్యమైన",
      "Notice": "నోటీసు",
      "Meeting": "సమావేశం",
      "Event": "కార్యక్రమం",
      "Holiday": "సెలవు",
      "Classes": "తరగతులు",
      "Students": "విద్యార్థులు",
      "Parents": "తల్లిదండ్రులు",
      "Teachers": "ఉపాధ్యాయులు",
      "August": "ఆగస్టు",
      "September": "సెప్టెంబర్",
      "October": "అక్టోబర్",
      "November": "నవంబర్",
      "December": "డిసెంబర్",
      "January": "జనవరి",
      "February": "ఫిబ్రవరి",
      "March": "మార్చి",
      "April": "ఏప్రిల్",
      "May": "మే",
      "June": "జూన్",
      "July": "జూలై"
    };
    
    let translatedText = text;
    Object.keys(teluguMapping).forEach(english => {
      const telugu = teluguMapping[english];
      translatedText = translatedText.replace(new RegExp(english, 'gi'), telugu);
    });
    
    if (translatedText !== text) {
      console.log(`✅ Manual mapping successful: ${translatedText.substring(0, 100)}...`);
      return translatedText;
    } else {
      console.log(`⚠️ No mapping found, using original text`);
      return text;
    }
    
  } catch (error) {
    console.error("❌ Translation error:", error.message);
    console.log(`📝 Using original English text as fallback`);
    return text;
  }
};

// Create announcement and send WhatsApp
export const createAnnouncement = async (req, res) => {
  try {
    // Ensure required fields and set defaults
    const announcementData = {
      ...req.body,
      pinned: req.body.pinned || false, // Ensure pinned field exists
      date: req.body.date || new Date(), // Ensure date field exists
      priority: req.body.priority || 'medium', // Ensure priority field exists
      category: req.body.category || 'General' // Ensure category field exists
    };
    
    const announcement = await Announcement.create(announcementData);

    const messageEn = `📢 New Announcement: ${announcement.title}\n\n${announcement.content}\n\nRegards,\nEduReach`;

    console.log("🔤 Original English message:", messageEn);
    
    const messageTe = await translateText(messageEn, "en", "te");

    const finalMessage = messageTe && messageTe !== messageEn ? messageTe : messageEn;
    
    console.log("🔤 Final message to send:", finalMessage);
    console.log("🔤 Message language check:", finalMessage === messageEn ? "English" : "Telugu");

    const parents = await Parent.find({}, "phone -_id");
    const phoneNumbers = parents
      .map(p => p.phone)
      .filter(Boolean)
      .map(num => {
        if (num.startsWith("+")) return num;
        if (num.startsWith("91")) return `+${num}`;
        return `+91${num}`;
      });

    console.log(`📱 Found ${phoneNumbers.length} phone numbers to send messages to`);

    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < phoneNumbers.length; i += 50) {
      const batch = phoneNumbers.slice(i, i + 50);
      console.log(`📤 Sending batch ${Math.floor(i / 50) + 1} to ${batch.length} numbers...`);

      const results = await Promise.allSettled(
        batch.map(async num => {
          try {
            await sendWhatsApp({ to: num, message: finalMessage });
            console.log(`✅ Sent to ${num}`);
            return { success: true, number: num };
          } catch (err) {
            console.error(`❌ Failed for ${num}:`, err.message);
            return { success: false, number: num, error: err.message };
          }
        })
      );

      results.forEach(result => {
        if (result.status === "fulfilled" && result.value.success) successCount++;
        else failureCount++;
      });

      if (i + 50 < phoneNumbers.length) {
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    console.log(`📊 WhatsApp Results: ${successCount} sent, ${failureCount} failed`);

    // Update announcement with WhatsApp stats
    const updatedAnnouncement = await Announcement.findByIdAndUpdate(
      announcement._id,
      {
        whatsappStats: { 
          sent: successCount, 
          failed: failureCount, 
          total: phoneNumbers.length 
        }
      },
      { new: true }
    );

    res.status(201).json({
      success: true,
      message: `Announcement created! WhatsApp: ${successCount} sent, ${failureCount} failed`,
      data: updatedAnnouncement,
      whatsappStats: { sent: successCount, failed: failureCount, total: phoneNumbers.length },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Failed to create announcement",
      error: err.message,
    });
  }
}

// Get all announcements (with filter, search, sort)
export const getAnnouncements = async (req, res) => {
  try {
    const { search = '', category = 'all', priority = 'all' } = req.query;

    const filter = {
      ...(category !== 'all' && { category }),
      ...(priority !== 'all' && { priority }),
      ...(search && {
        $or: [
          { title: { $regex: search, $options: 'i' } },
          { content: { $regex: search, $options: 'i' } }
        ]
      })
    };

    const announcements = await Announcement.find(filter).sort({
      pinned: -1,
      priority: 1,
      date: -1
    });

    // Ensure all announcements have required fields with defaults
    const normalizedAnnouncements = announcements.map(announcement => ({
      ...announcement.toObject(),
      pinned: announcement.pinned || false,
      priority: announcement.priority || 'medium',
      category: announcement.category || 'General',
      date: announcement.date || new Date()
    }));

    res.json(normalizedAnnouncements);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching announcements', error: err.message });
  }
};

// Toggle pin
export const togglePin = async (req, res) => {
  try {
    const { id } = req.params;
    const announcement = await Announcement.findById(id);
    if (!announcement) return res.status(404).json({ message: 'Not found' });

    announcement.pinned = !announcement.pinned;
    await announcement.save();
    res.json(announcement);
  } catch (err) {
    res.status(500).json({ message: 'Error toggling pin', error: err.message });
  }
};


export const deleteAnnouncement = async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id);
    if (!announcement) {
      return res.status(404).json({ message: "Announcement not found" });
    }

    await announcement.deleteOne();
    res.status(200).json({ message: "Announcement deleted successfully" });
  } catch (error) {
    console.error("Error deleting announcement:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
