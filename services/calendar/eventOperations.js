const { getCalendarClient } = require('../auth/googleAuth');

/**
 * Create a new calendar event
 * @param {Object} eventDetails - Details for the event
 * @returns {Promise<Object>} Result object with success flag
 */
async function createCalendarEvent(eventDetails) {
  try {
    const {
      title,
      description,
      startTime,
      endTime,
      attendees = [],
      location,
      videoConference = false
    } = eventDetails;
    
    // Validate required fields
    if (!title || !startTime || !endTime) {
      return {
        success: false,
        error: 'Missing required event details (title, startTime, or endTime)'
      };
    }
    
    // Get calendar client
    const calendar = await getCalendarClient();
    if (!calendar) {
      return {
        success: false,
        error: 'Could not authenticate with Google Calendar'
      };
    }
    
    // Format attendees if provided
    const formattedAttendees = attendees.map(email => ({
      email,
      responseStatus: 'needsAction'
    }));
    
    // Create event resource
    const event = {
      summary: title,
      description: description || '',
      start: {
        dateTime: new Date(startTime).toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      end: {
        dateTime: new Date(endTime).toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      attendees: formattedAttendees.length > 0 ? formattedAttendees : undefined,
      location: location || undefined,
      conferenceData: videoConference ? {
        createRequest: {
          requestId: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' }
        }
      } : undefined
    };
    
    // Create the event
    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
      conferenceDataVersion: videoConference ? 1 : 0,
      sendUpdates: attendees.length > 0 ? 'all' : 'none'
    });
    
    return {
      success: true,
      eventId: response.data.id,
      eventLink: response.data.htmlLink,
      meetLink: response.data.conferenceData?.entryPoints?.[0]?.uri || null
    };
  } catch (error) {
    console.error('Error creating calendar event:', error);
    return {
      success: false,
      error: error.message || 'Unknown error creating event'
    };
  }
}

/**
 * Confirm a pending calendar event
 * @param {Object} pendingEvent - The pending event to confirm
 * @returns {Promise<Object>} Result with success status
 */
async function confirmCalendarEvent(pendingEvent) {
  try {
    // Implementation depends on your app's flow
    // This would typically create the actual event
    return await createCalendarEvent(pendingEvent);
  } catch (error) {
    console.error('Error confirming calendar event:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Check for scheduling conflicts
 * @param {Date} startTime - Event start time
 * @param {Date} endTime - Event end time
 * @returns {Promise<Array>} Conflicting events
 */
async function checkForConflicts(startTime, endTime) {
  try {
    const calendar = await getCalendarClient();
    if (!calendar) {
      console.error('Could not get calendar client');
      return [];
    }
    
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date(startTime).toISOString(),
      timeMax: new Date(endTime).toISOString(),
      singleEvents: true
    });
    
    return response.data.items || [];
  } catch (error) {
    console.error('Error checking for conflicts:', error);
    return [];
  }
}

module.exports = {
  createCalendarEvent,
  confirmCalendarEvent,
  checkForConflicts
};