/**
 * Utility functions for parsing natural language inputs related to calendar events
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

let model = null;
const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/**
 * Initialize the parsing utilities with dependencies
 * @param {Object} config - Configuration options
 */
function initialize(config = {}) {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    model = genAI.getGenerativeModel({ model: config.modelName || "gemini-2.0-flash" });
    console.log('Parsing utilities initialized successfully');
  } catch (error) {
    console.error('Error initializing parsing utilities:', error);
  }
}

/**
 * Parse date, time and event details from natural language input
 * @param {string} userInput - Natural language text to parse
 * @returns {Object} Parsed event details
 */
async function parseDateAndTime(userInput) {
  try {
    if (!userInput || typeof userInput !== 'string') {
      console.error('Invalid user input:', userInput);
      return {
        date: null,
        time: null,
        endTime: null,
        duration: 60,
        title: "New Event",
        description: null,
        attendees: [],
        location: null
      };
    }
    
    const formattedToday = new Date().toISOString().split('T')[0];
    
    const prompt = `
      Parse this scheduling request: "${userInput}"
      Extract date (YYYY-MM-DD), start time (HH:MM 24h), end time or duration, title, attendees, location.
      Today is ${formattedToday}.
      Return ONLY as JSON: {
        "date": "YYYY-MM-DD or null", "time": "HH:MM or null", "endTime": "HH:MM or null",
        "duration": minutes, "title": "event title", "description": "description or null",
        "attendees": ["email1", "email2"], "location": "location or null"
      }
    `;
    
    const result = await model.generateContent(prompt);
    const response = result.response.text().trim();
    const jsonMatch = response.match(/\{.*\}/s);
    
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        
        // Calculate duration if needed
        if (parsed.time && parsed.endTime && !parsed.duration) {
          const [startHours, startMinutes] = parsed.time.split(':').map(Number);
          const [endHours, endMinutes] = parsed.endTime.split(':').map(Number);
          let durationMinutes = (endHours * 60 + endMinutes) - (startHours * 60 + startMinutes);
          if (durationMinutes <= 0) durationMinutes += 24 * 60;
          parsed.duration = durationMinutes;
        }
        
        return parsed;
      } catch (parseError) {
        console.error('Error parsing JSON from AI response:', parseError);
      }
    }
  } catch (e) {
    console.error('Parsing error:', e);
  }
  
  // Fallback with regex
  console.log('Falling back to regex parsing for input:', userInput);
  return regexParseDateAndTime(userInput);
}

/**
 * Fallback function to parse date and time using regex
 * @param {string} userInput - Natural language text to parse
 * @returns {Object} Parsed event details
 */
function regexParseDateAndTime(userInput) {
  const dateRegex = /\b\d{4}-\d{2}-\d{2}\b|tomorrow|today|next (monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i;
  const timeRegex = /\b([01]?[0-9]|2[0-3]):[0-5][0-9]\b|\b(1[0-2]|0?[1-9])(:[0-5][0-9])?\s*(am|pm)\b/i;
  
  let date = null;
  const dateMatch = userInput.match(dateRegex);
  if (dateMatch) {
    const dateText = dateMatch[0].toLowerCase();
    const today = new Date();
    
    if (dateText === 'today') {
      date = today.toISOString().split('T')[0];
    } else if (dateText === 'tomorrow') {
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      date = tomorrow.toISOString().split('T')[0];
    } else if (dateText.startsWith('next')) {
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const targetDay = days.indexOf(dateText.split(' ')[1]);
      if (targetDay !== -1) {
        const currentDay = today.getDay();
        let daysToAdd = targetDay - currentDay;
        if (daysToAdd <= 0) daysToAdd += 7;
        
        const nextDay = new Date(today);
        nextDay.setDate(today.getDate() + daysToAdd);
        date = nextDay.toISOString().split('T')[0];
      }
    } else {
      // Direct date format
      date = dateText;
    }
  }
  
  // Extract time
  let time = null;
  const timeMatch = userInput.match(timeRegex);
  if (timeMatch) {
    const timeText = timeMatch[0].toLowerCase();
    if (timeText.includes(':')) {
      if (timeText.includes('am') || timeText.includes('pm')) {
        // Convert 12-hour to 24-hour
        const [hours, minutesPart] = timeText.split(':');
        if (minutesPart) {
          const minutes = minutesPart.split(/\s/)[0];
          const isPM = timeText.includes('pm');
          
          let hour = parseInt(hours, 10);
          if (isPM && hour < 12) hour += 12;
          if (!isPM && hour === 12) hour = 0;
          
          time = `${hour.toString().padStart(2, '0')}:${minutes}`;
        }
      } else {
        // Already 24-hour format
        time = timeText;
      }
    } else if (timeText.includes('am') || timeText.includes('pm')) {
      // Handle "X am/pm" format without minutes
      const hourMatch = timeText.match(/\d+/);
      if (hourMatch) {
        let hour = parseInt(hourMatch[0], 10);
        const isPM = timeText.includes('pm');
        
        if (isPM && hour < 12) hour += 12;
        if (!isPM && hour === 12) hour = 0;
        
        time = `${hour.toString().padStart(2, '0')}:00`;
      }
    }
  }
  
  // Extract title - use first part of input or default
  const titleParts = userInput.split(/\s+(?:on|at|from|tomorrow|today|with|for)/i);
  const title = titleParts[0].trim() || "New Event";
  
  // Extract attendees
  const attendees = userInput.match(emailRegex) || [];
  
  // Extract description - anything after "about" or "description"
  let description = null;
  const descriptionMatch = userInput.match(/(?:about|description)\s+["']?(.+?)["']?(?=\s+(?:with|on|at|tomorrow|today|for|$))/i);
  if (descriptionMatch) {
    description = descriptionMatch[1].trim();
  }
  
  // Extract location - anything after "at" or "location"
  let location = null;
  const locationMatch = userInput.match(/(?:at|location)\s+["']?([^,]+?)["']?(?=\s+(?:on|at|tomorrow|today|for|$))/i);
  if (locationMatch && !timeMatch) { // Avoid confusing "at 3pm" with a location
    location = locationMatch[1].trim();
  }
  
  return {
    date,
    time,
    endTime: null,
    duration: 60,
    title,
    description,
    attendees,
    location
  };
}

/**
 * Extract attendees from input text
 * @param {string} userInput - Natural language text to parse
 * @returns {Array} List of extracted attendees
 */
async function extractAttendees(userInput) {
  try {
    if (!userInput || typeof userInput !== 'string') {
      return [];
    }
    
    const prompt = `
      Extract email addresses or names of attendees from: "${userInput}"
      Return ONLY as JSON array: ["email1@example.com", "Person Name"]
    `;
    
    const result = await model.generateContent(prompt);
    const response = result.response.text().trim();
    const jsonMatch = response.match(/\[.*\]/s);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (parseError) {
        console.error('Error parsing attendees JSON:', parseError);
      }
    }
  } catch (e) {
    console.error('Attendee extraction error:', e);
  }
  
  // Fallback with regex
  return userInput.match(emailRegex) || [];
}

/**
 * Detect meeting purpose from input text
 * @param {string} userInput - Natural language text to parse
 * @returns {string} Purpose category
 */
async function detectMeetingPurpose(userInput) {
  try {
    const prompt = `
      Analyze this meeting request: "${userInput}"
      Categorize the purpose as one of: "work", "social", "personal", "family", "health", "education", "other"
      Return ONLY the category name.
    `;
    
    const result = await model.generateContent(prompt);
    const purpose = result.response.text().trim().toLowerCase();
    
    const validPurposes = ["work", "social", "personal", "family", "health", "education"];
    if (validPurposes.includes(purpose)) {
      return purpose;
    }
    return "other";
  } catch (error) {
    console.error('Error detecting meeting purpose:', error);
    return "other";
  }
}

/**
 * Extract time duration from input text
 * @param {string} userInput - Natural language text to parse
 * @returns {number} Duration in minutes
 */
async function extractDuration(userInput) {
  try {
    const prompt = `
      From this text: "${userInput}"
      Extract the meeting duration in minutes.
      If a specific duration is mentioned like "1 hour" or "30 minutes", return that number.
      If a duration is implied by start and end times, calculate it.
      If no duration is mentioned, return 60 as the default.
      Return ONLY the number.
    `;
    
    const result = await model.generateContent(prompt);
    const durationText = result.response.text().trim();
    const duration = parseInt(durationText, 10);
    
    if (!isNaN(duration) && duration > 0) {
      return duration;
    }
    return 60; // Default duration
  } catch (error) {
    console.error('Error extracting duration:', error);
    return 60; // Default duration
  }
}

module.exports = {
  initialize,
  parseDateAndTime,
  extractAttendees,
  detectMeetingPurpose,
  extractDuration
};