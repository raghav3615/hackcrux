const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getCalendarEvents } = require('./calendarClient');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

/**
 * Parse date, time and event details from natural language input
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
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const attendees = userInput.match(emailRegex) || [];

  return {
    date,
    time,
    endTime: null,
    duration: 60,
    title,
    description: null,
    attendees,
    location: null
  };
}

/**
 * Extract attendees from input text
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
    const response = result.response.text();
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
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  return userInput.match(emailRegex) || [];
}

/**
 * Analyze event patterns in a window of two days before and after the target date
 * and suggest optimal time slots based on the purpose.
 */
async function analyzeEventPatterns(targetDate, duration, purpose) {
  try {
    const startWindow = new Date(targetDate);
    startWindow.setDate(startWindow.getDate() - 2);
    const endWindow = new Date(targetDate);
    endWindow.setDate(endWindow.getDate() + 2);

    const events = await getCalendarEvents(startWindow, endWindow);

    const prompt = `
      Given the following events over a 5-day window:
      ${JSON.stringify(events)}
      
      And the purpose of the new event is: "${purpose}"
      Please suggest up to 3 optimal time slots on ${targetDate.toISOString().split('T')[0]} 
      that would best suit the purpose. Each suggestion should include a "start" (ISO format), 
      "end" (ISO format) and "displayText" for human readability.
      Return only as JSON array:
      [
        {"start": "ISO string", "end": "ISO string", "displayText": "e.g., 10:00 AM - 11:00 AM"},
        ...
      ]
    `;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();
    const jsonMatch = responseText.match(/\[.*\]/s);

    if (jsonMatch) {
      try {
        const suggestions = JSON.parse(jsonMatch[0]);
        return suggestions;
      } catch (err) {
        console.error('Error parsing suggestions from AI response:', err);
      }
    }
    // Fallback empty suggestions
    return [];
  } catch (error) {
    console.error('Error analyzing event patterns:', error);
    return [];
  }
}

/**
 * Find available time slots on a specific date (fallback).
 */
async function findAvailableTimeSlots(targetDate, duration) {
  try {
    if (!targetDate || isNaN(new Date(targetDate).getTime())) {
      console.error('Invalid target date for finding time slots:', targetDate);
      return [];
    }

    const startDate = new Date(targetDate);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(targetDate);
    endDate.setHours(23, 59, 59, 999);

    // Get all events for the target date
    const events = await getCalendarEvents(startDate, endDate);
    const workingHours = { start: 9, end: 17 }; // Default 9am-5pm

    const dayStart = new Date(targetDate);
    dayStart.setHours(workingHours.start, 0, 0, 0);

    const dayEnd = new Date(targetDate);
    dayEnd.setHours(workingHours.end, 0, 0, 0);

    // Skip past times if date is today
    if (new Date(targetDate).toDateString() === new Date().toDateString()) {
      const now = new Date();
      if (now > dayStart) {
        // Round up to next 30 minutes
        const roundedMinutes = Math.ceil(now.getMinutes() / 30) * 30;
        now.setMinutes(roundedMinutes, 0, 0);
        dayStart.setTime(now.getTime());
      }
    }

    // Sort events by start time
    const sortedEvents = events.sort((a, b) => {
      const aStart = a.start.dateTime ? new Date(a.start.dateTime) : new Date(a.start.date);
      const bStart = b.start.dateTime ? new Date(b.start.dateTime) : new Date(b.start.date);
      return aStart - bStart;
    });

    const availableSlots = [];
    let currentStart = new Date(dayStart);
    const durationMs = duration * 60 * 1000;

    // Check gaps between events
    for (const event of sortedEvents) {
      if (!event.start.dateTime) continue; // Skip all-day events

      const eventStart = new Date(event.start.dateTime);
      const eventEnd = new Date(event.end.dateTime);

      if (eventStart > currentStart) {
        const gap = eventStart - currentStart;

        if (gap >= durationMs) {
          // Add slots at 30-min intervals that fit in the gap
          let slotStart = new Date(currentStart);
          while (slotStart.getTime() + durationMs <= eventStart.getTime()) {
            availableSlots.push({
              start: slotStart.toISOString(),
              end: new Date(slotStart.getTime() + durationMs).toISOString()
            });

            // Move to next 30-min interval
            slotStart = new Date(slotStart.getTime() + 30 * 60 * 1000);
          }
        }
      }

      // Move cursor past this event
      if (eventEnd > currentStart) {
        currentStart = new Date(eventEnd);
      }
    }

    // Check time after last event
    if (currentStart < dayEnd) {
      // Add slots at 30-min intervals until end of day
      let slotStart = new Date(currentStart);
      while (slotStart.getTime() + durationMs <= dayEnd.getTime()) {
        availableSlots.push({
          start: slotStart.toISOString(),
          end: new Date(slotStart.getTime() + durationMs).toISOString()
        });

        // Move to next 30-min interval
        slotStart = new Date(slotStart.getTime() + 30 * 60 * 1000);
      }
    }

    return availableSlots.slice(0, 5); // Return top 5 slots
  } catch (error) {
    console.error('Error finding available time slots:', error);
    return [];
  }
}

module.exports = {
  parseDateAndTime,
  extractAttendees,
  analyzeEventPatterns,
  findAvailableTimeSlots
};