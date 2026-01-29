import mongoose from 'mongoose';

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  image: { type: String, required: true },
  date: { type: Date, required: true },
  time: { type: String, required: true }, // HH:MM format or just string
  endDate: { type: Date, required: false }, // optional, for calendar events (multi-day)
  endTime: { type: String, required: false }, // optional, HH:MM
  location: { type: String, required: true },
  category: {
    type: String,
    enum: ['Academic', 'Sports', 'Cultural', 'Meeting', 'Workshop'],
    required: true
  },
  rsvpUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, {
  timestamps: true
});

export default mongoose.model('Event', eventSchema);