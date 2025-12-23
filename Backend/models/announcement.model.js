import mongoose from 'mongoose';

const announcementSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  category: {
    type: String,
    enum: ['General', 'Academic', 'Sports', 'Events', 'Policy', 'Facility', 'Emergency'],
    required: true
  },
  priority: {
    type: String,
    enum: ['high', 'medium', 'low'],
    default: 'medium'
  },
  pinned: { type: Boolean, default: false },
  date: { type: Date, default: Date.now },
  whatsappStats: {
    sent: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
  }
}, {
  timestamps: true
});

export default mongoose.model('Announcement', announcementSchema);
