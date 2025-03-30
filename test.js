const { createCalendarEvent } = require('./services/ScheduleService');

async function testCreateEvent() {
  const startTime = new Date();
  startTime.setHours(startTime.getHours() + 1); // 1 hour from now
  const endTime = new Date(startTime);
  endTime.setHours(endTime.getHours() + 1); // 1-hour duration

  const eventDetails = {
    title: "Test Event",
    description: "This is a test event.",
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    attendees: []
  };

  try {
    const event = await createCalendarEvent(eventDetails);
    console.log('Test Event Created:', event);
  } catch (error) {
    console.error('Test Event Creation Failed:', error);
  }
}

testCreateEvent();