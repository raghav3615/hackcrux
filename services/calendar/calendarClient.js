const { getCalendarClient } = require('../auth/googleAuth');

// State management
const eventCache = new Map();

/**
 * Get calendar events between two dates with caching
 */
async function getCalendarEvents(startTime, endTime) {
  try {
    const startDate = new Date(startTime);
    const endDate = new Date(endTime);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      console.error('Invalid date input:', { startTime, endTime });
      return [];
    }

    const calendar = await getCalendarClient();
    if (!calendar) {
      console.error('No calendar client available');
      return [];
    }

    const timeMin = startDate.toISOString();
    const timeMax = endDate.toISOString();
    const cacheKey = `events_${timeMin}_${timeMax}`;

    if (eventCache.has(cacheKey)) {
      const cachedData = eventCache.get(cacheKey);
      if (Date.now() - cachedData.timestamp < 60 * 1000) {
        console.log('Using cached calendar events');
        return cachedData.events;
      }
    }

    console.log(`Fetching calendar events from ${timeMin} to ${timeMax}`);
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 100
    });

    const events = response.data.items || [];
    eventCache.set(cacheKey, { events, timestamp: Date.now() });

    return events;
  } catch (error) {
    console.error('Error fetching calendar events:', error.message);
    return [];
  }
}

module.exports = {
  getCalendarEvents,
  // Export the getCalendarClient from googleAuth directly
  getCalendarClient
};