/**
 * Format Date for display
 */
function formatDate(dateObj) {
  if (!(dateObj instanceof Date)) return '';
  return dateObj.toLocaleDateString('en-US');
}

/**
 * Format Time for display
 */
function formatTime(dateObj) {
  if (!(dateObj instanceof Date)) return '';
  return dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

/**
 * Format available time slots for display
 */
function formatSlots(slots) {
  if (!Array.isArray(slots)) {
    console.error('Invalid slots array:', slots);
    return [];
  }

  return slots.map((slot, index) => {
    const startTime = new Date(slot.start);
    const endTime   = new Date(slot.end);

    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
      console.error('Invalid date in slot:', slot);
      return null;
    }

    return {
      id: index + 1,
      displayText: `${startTime.toLocaleTimeString('en-US', { 
        hour: 'numeric', minute: '2-digit', hour12: true 
      })} - ${endTime.toLocaleTimeString('en-US', { 
        hour: 'numeric', minute: '2-digit', hour12: true 
      })}`,
      startTime: slot.start,
      endTime: slot.end
    };
  }).filter(Boolean); // Remove any null entries
}

module.exports = {
  formatDate,
  formatTime,
  formatSlots
};