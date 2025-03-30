const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const fs = require('fs').promises;
require('dotenv').config();

// Import modular components
const calendarClient = require('./calendar/calendarClient');
const eventOperations = require('./calendar/eventOperations');
const eventAnalyzer = require('./calendar/eventAnalyzer');
const schedulingFlow = require('./calendar/schedulingFlow');
const dateUtils = require('./utils/dateUtils');
const parsingUtils = require('./utils/parsingUtils');
const cacheManager = require('./utils/cacheManager');
// Import universal Google auth
const { getCalendarClient } = require('./auth/googleAuth');

// Initialize the Gemini AI model
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

// Initialize modules that have an initialize function
if (parsingUtils.initialize) {
  parsingUtils.initialize({ modelName: "gemini-2.0-flash" });
}

if (cacheManager.initialize) {
  cacheManager.initialize();
}

// Verify Google Calendar credentials exist
async function checkCredentials() {
  try {
    // Check if credentials file exists
    try {
      await fs.access(path.join(process.cwd(), 'credentials.json'));
      console.log('Google credentials file found');
    } catch (err) {
      console.error('ERROR: Google credentials file not found at:', path.join(process.cwd(), 'credentials.json'));
      console.error('Please download OAuth credentials from Google Cloud Console and save them as credentials.json');
      return false;
    }
    
    // Try to get a calendar client as a test
    const client = await getCalendarClient();
    if (!client) {
      console.error('ERROR: Failed to create Google Calendar client');
      return false;
    }
    
    console.log('Google Calendar authentication successful');
    return true;
  } catch (error) {
    console.error('ERROR checking calendar credentials:', error);
    return false;
  }
}

// Run credential check on startup
checkCredentials().then(success => {
  if (success) {
    console.log('Calendar service ready');
  } else {
    console.error('Calendar service initialization failed - events will not be fetched');
  }
});

/**
 * Enhanced scheduling handler that follows the complete flow:
 * 1. Fetch all events
 * 2. Analyze meeting patterns
 * 3. Ask for purpose
 * 4. Suggest optimal times
 * 5. Create event in Google Calendar
 * 
 * @param {string} userInput - The user's input text
 * @returns {Promise<string>} - Response to show to the user
 */
async function enhancedScheduleHandler(userInput) {
  try {
    console.log('Starting enhanced scheduling flow with input:', userInput);
    
    // First, fetch events from 2 days before to 2 days after
    const events = await fetchEventsAroundToday();
    console.log(`Fetched ${events.length} events for pattern analysis`);
    
    // Extract basic details from user input
    const parsedInput = await parsingUtils?.parseDateAndTime?.(userInput) || 
                        await eventAnalyzer.parseDateAndTime(userInput);
    
    // If no purpose/title was extracted, we need to ask for it
    if (!parsedInput.title || parsedInput.title === "New Event" || parsedInput.title === "Meeting") {
      // Ask for purpose in actual implementation
      // For now, we'll use a default purpose if none provided
      parsedInput.title = parsedInput.title || "Planning Meeting";
    }
    
    console.log('Parsed event details:', parsedInput);
    
    // Get target date or default to today
    const targetDate = parsedInput.date ? new Date(parsedInput.date) : new Date();
    console.log('Target date for event:', targetDate.toISOString().split('T')[0]);
    
    // Analyze patterns and suggest optimal times
    const suggestions = await eventAnalyzer.analyzeEventPatterns(
      targetDate, 
      parsedInput.duration || 60,
      parsedInput.title
    );
    
    console.log(`Generated ${suggestions.length} time suggestions based on pattern analysis`);
    
    // Format the suggestions for display
    let suggestionText = "";
    if (suggestions && suggestions.length > 0) {
      suggestionText = suggestions.map((slot, i) => 
        `${i+1}. ${slot.displayText}`
      ).join('\n');
      
      const response = {
        message: `Based on analysis of your calendar patterns and the purpose "${parsedInput.title}", here are optimal time slots:\n${suggestionText}\n\nReply with the number of your preferred time or say "Schedule #1" to book the first option.`,
        suggestions,
        parsedInput,
        requiresChoice: true
      };
      
      return response;
    } else {
      // If no suggestions could be generated, use the scheduling flow
      return await schedulingFlow.handleScheduleIntent(userInput);
    }
  } catch (error) {
    console.error('Error in enhanced schedule handler:', error);
    // Fallback to the regular scheduling flow
    return await schedulingFlow.handleScheduleIntent(userInput);
  }
}

/**
 * Handle user selection from the suggested time slots
 * @param {string} userInput - User selection input
 * @param {Object} context - Context from previous interaction
 * @returns {Promise<string>} Response to the user
 */
async function handleTimeSelection(userInput, context) {
  try {
    const { suggestions, parsedInput } = context;
    
    let selectedIndex = -1;
    
    // Parse user input for selection
    const selectionMatch = userInput.match(/^(\d+)$/) || 
                           userInput.match(/schedule\s+#?(\d+)/i);
    
    if (selectionMatch) {
      selectedIndex = parseInt(selectionMatch[1], 10) - 1;
    }
    
    // Check if selection is valid
    if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
      const selected = suggestions[selectedIndex];
      
      // Create event details
      const eventDetails = {
        title: parsedInput.title,
        description: parsedInput.description || `Scheduled via TwinAI assistant`,
        startTime: selected.start,
        endTime: selected.end,
        attendees: parsedInput.attendees || [],
        location: parsedInput.location,
        videoConference: userInput.toLowerCase().includes('meet') || userInput.toLowerCase().includes('video')
      };
      
      // Create the event
      const result = await eventOperations.createCalendarEvent(eventDetails);
      
      if (result.success) {
        return `Great! I've scheduled "${parsedInput.title}" for ${selected.displayText}. It's now on your calendar.`;
      } else {
        return `Sorry, I couldn't create the event. ${result.error || 'Please try again.'}`;
      }
    } else {
      return `Please select a valid option between 1 and ${suggestions.length}.`;
    }
  } catch (error) {
    console.error('Error handling time selection:', error);
    return "Sorry, I encountered an error while scheduling. Please try again.";
  }
}

/**
 * Log events around today (utility function to test the integration)
 * @returns {Promise<Array>} List of events
 */
async function fetchEventsAroundToday() {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - 2);
  start.setHours(0, 0, 0, 0);
  
  const end = new Date(today);
  end.setDate(today.getDate() + 2);
  end.setHours(23, 59, 59, 999);
  
  try {
    console.log('Fetching events from calendar...');
    console.log(`Date range: ${start.toISOString()} to ${end.toISOString()}`);
    
    // Make sure we can get a client first
    const client = await getCalendarClient();
    if (!client) {
      console.error('ERROR: Could not obtain calendar client');
      return [];
    }
    
    // Fetch events using unified auth client
    const response = await client.events.list({
      calendarId: 'primary',
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 100
    });
    
    const events = response.data.items || [];
    
    console.log(`Found ${events.length} events in the 5-day window.`);
    // Log full details for debugging
    console.log('==============================================');
    console.log('CALENDAR EVENTS (2 DAYS BEFORE AND AFTER TODAY)');
    console.log('==============================================');
    
    events.forEach((event, index) => {
      const eventStart = event.start.dateTime ? new Date(event.start.dateTime) : new Date(event.start.date);
      const eventEnd = event.end.dateTime ? new Date(event.end.dateTime) : new Date(event.end.date);
      const isAllDay = !event.start.dateTime;
      
      console.log(`EVENT #${index + 1}:`);
      console.log(`Title: ${event.summary || 'Untitled Event'}`);
      console.log(`When: ${eventStart.toLocaleString()} to ${eventEnd.toLocaleString()}${isAllDay ? ' (All day)' : ''}`);
      
      if (event.description) {
        console.log(`Description: ${event.description.substring(0, 100)}${event.description.length > 100 ? '...' : ''}`);
      }
      
      if (event.location) {
        console.log(`Location: ${event.location}`);
      }
      
      console.log('---------------------------------------------');
    });
    
    return events;
  } catch (error) {
    console.error('ERROR fetching calendar events:', error);
    return [];
  }
}

// Export the composed service
module.exports = {
  // Calendar client operations
  getCalendarClient,
  
  // Event operations
  createCalendarEvent: eventOperations.createCalendarEvent,
  confirmCalendarEvent: eventOperations.confirmCalendarEvent,
  checkForConflicts: eventOperations.checkForConflicts,
  
  // Event analysis and suggestions
  analyzeEventPatterns: eventAnalyzer.analyzeEventPatterns,
  findAvailableTimeSlots: eventAnalyzer.findAvailableTimeSlots,
  
  // Scheduling flow
  handleScheduleIntent: enhancedScheduleHandler, // Use the enhanced handler
  handleTimeSelection, // Add the new handler for time selection
  suggestAvailableTimes: schedulingFlow.suggestAvailableTimes,
  
  // Parsing utilities
  parseDateAndTime: eventAnalyzer.parseDateAndTime,
  extractAttendees: eventAnalyzer.extractAttendees,
  
  // Utility functions
  fetchEventsAroundToday,
  logEventsAroundToday: fetchEventsAroundToday, // Alias for backward compatibility
  checkCredentials
};
