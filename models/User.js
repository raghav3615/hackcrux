const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  googleId: {
    type: String,
    required: true,
    unique: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  firstName: String,
  lastName: String,
  profilePhoto: String,
  tokenData: {
    type: Object,
    select: false // Won't be included in query results unless explicitly requested
  },
  lastLogin: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Fixed model registration syntax
module.exports = mongoose.models.User || mongoose.model('User', UserSchema);