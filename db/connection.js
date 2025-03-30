const mongoose = require('mongoose');
require('dotenv').config();

// Get MongoDB connection string from environment variables
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://riteshraushan:ritesh123@cluster0.egqtkgb.mongodb.net';

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

module.exports = connectDB;