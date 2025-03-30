const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['user', 'assistant', 'system'],
    required: true
  },
  content: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Create index for faster querying
MessageSchema.index({ sessionId: 1, timestamp: -1 });

// Fixed model registration syntax
module.exports = mongoose.models.Message || mongoose.model('Message', MessageSchema);