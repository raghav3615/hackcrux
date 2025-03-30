const { 
  parseDateAndTime, 
  analyzeEventPatterns,
  findAvailableTimeSlots 
} = require('./eventAnalyzer');
const { checkForConflicts, createCalendarEvent } = require('./eventOperations');
const { formatDate } = require('../utils/dateUtils');

// Schedule flow state
let scheduleState = {
  active: false,
  stage: 'init',
  data: {
    title: '',
    description: '',
    date: '',
    time: '',
    duration: 60,
    attendees: [],
    suggestedTimes: [],
    dateObj: null,
    startTime: null,
    endTime: null,
    startTimestamp: Date.now()
  }
};

/**
 * Suggest available time slots and return options text.
 * This function fetches events two days before and after the target date,
 * analyzes event patterns along with the event purpose (title) to suggest optimal time slots.
 */
async function suggestAvailableTimes() {
  const duration = scheduleState.data.duration;
  const targetDate = scheduleState.data.date ? new Date(scheduleState.data.date) : new Date();
  const purpose = scheduleState.data.title || "General meeting";

  // First try to analyze patterns and get optimal suggestions.
  let suggestions = await analyzeEventPatterns(targetDate, duration, purpose);

  // If no suggestions returned, fallback to basic available time slots.
  if (!suggestions || suggestions.length === 0) {
    const slots = await findAvailableTimeSlots(targetDate, duration);
    suggestions = slots.map(slot => ({
      start: slot.start,
      end: slot.end,
      displayText: new Date(slot.start).toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit', hour12: true}) +
                   " - " +
                   new Date(slot.end).toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit', hour12: true})
    }));
  }

  // Save suggestions in the schedule state for later confirmation.
  scheduleState.data.suggestedTimes = suggestions;
  if (suggestions.length) {
    const options = suggestions.map((slot, index) => `${index + 1}. ${slot.displayText}`).join('\n');
    return `Based on your event purpose and existing calendar patterns, here are some optimal time slot suggestions:\n${options}\nSelect a slot by entering its number (1-${suggestions.length}).`;
  } else {
    return "No available time slots found for the selected day.";
  }
}

/**
 * Main scheduling flow handler
 */
async function handleScheduleIntent(userInput) {
  try {
    if (!userInput || typeof userInput !== 'string') {
      return "Please provide details for what you'd like to schedule.";
    }

    if (!scheduleState.active) {
      scheduleState = {
        active: true,
        stage: 'parsing_request',
        data: {
          title: '',
          description: '',
          date: '',
          time: '',
          duration: 60,
          attendees: [],
          suggestedTimes: [],
          dateObj: null,
          startTime: null,
          endTime: null,
          startTimestamp: Date.now()
        }
      };

      const parsed = await parseDateAndTime(userInput);
      scheduleState.data = { ...scheduleState.data, ...parsed };

      if (parsed.date) {
        scheduleState.data.dateObj = new Date(parsed.date);
        if (parsed.time) {
          const [hours, minutes] = parsed.time.split(':').map(Number);
          const startTime = new Date(scheduleState.data.dateObj);
          startTime.setHours(hours, minutes, 0, 0);
          const endTime = new Date(startTime);
          endTime.setMinutes(endTime.getMinutes() + scheduleState.data.duration);

          scheduleState.data.startTime = startTime.toISOString();
          scheduleState.data.endTime = endTime.toISOString();

          if (startTime < new Date() || (await checkForConflicts(startTime, endTime)).length > 0) {
            scheduleState.stage = 'suggesting_time';
            return await suggestAvailableTimes();
          } else {
            scheduleState.stage = 'confirming';
            return `I'll schedule "${scheduleState.data.title}" on ${formatDate(scheduleState.data.dateObj)} at ${parsed.time} for ${scheduleState.data.duration} minutes. Does this look correct? (yes/no)`;
          }
        } else {
          scheduleState.stage = 'suggesting_time';
          return await suggestAvailableTimes();
        }
      } else {
        scheduleState.stage = 'collecting_date';
        return `What date would you like to schedule "${scheduleState.data.title}" for?`;
      }
    }

    if (Date.now() - scheduleState.data.startTimestamp > 10 * 60 * 1000) {
      scheduleState.active = false;
      return "The scheduling session timed out. Let's start over.";
    }

    switch (scheduleState.stage) {
      case 'collecting_date':
        const dateResponse = await parseDateAndTime(userInput);
        if (dateResponse.date) {
          scheduleState.data.date = dateResponse.date;
          scheduleState.data.dateObj = new Date(dateResponse.date);
          // Proceed to suggesting time after collecting the date
          scheduleState.stage = 'suggesting_time';
          return await suggestAvailableTimes();
        } else {
          return "I couldn't understand the date. Please provide a valid date.";
        }

      case 'suggesting_time':
        if (/^[1-5]$/.test(userInput.trim())) {
          const selectedIndex = parseInt(userInput.trim()) - 1;
          const selected = scheduleState.data.suggestedTimes[selectedIndex];
          if (selected) {
            scheduleState.data.startTime = selected.start;
            scheduleState.data.endTime = selected.end;
            scheduleState.stage = 'confirming';
            return `I'll schedule "${scheduleState.data.title}" for ${selected.displayText}. Does this look correct? (yes/no)`;
          } else {
            return "Please select a valid option.";
          }
        } else {
          return "Please select a valid option or provide a specific time.";
        }

      case 'confirming':
        if (userInput.toLowerCase() === 'yes') {
          const eventDetails = {
            title: scheduleState.data.title,
            description: scheduleState.data.description,
            startTime: scheduleState.data.startTime,
            endTime: scheduleState.data.endTime,
            attendees: scheduleState.data.attendees
          };
          await createCalendarEvent(eventDetails);
          scheduleState.active = false;
          return `Your event "${scheduleState.data.title}" has been scheduled successfully!`;
        } else if (userInput.toLowerCase() === 'no') {
          scheduleState.active = false;
          return "Okay, let's start over.";
        } else {
          return "Please respond with 'yes' or 'no'.";
        }

      default:
        return "I'm not sure how to proceed. Can you clarify?";
    }
  } catch (error) {
    console.error('Error in scheduling flow:', error);
    return "I encountered an error while trying to schedule. Please try again.";
  }
}

module.exports = {
  suggestAvailableTimes,
  handleScheduleIntent
};