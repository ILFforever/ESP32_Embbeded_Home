#include "lcd_helper.h"

// Get status message for current slave state
String getStatusMessageForSlaveState(int state)
{
  if (state == -1)
  {
    return "Connection Error";
  }
  else if (state == 0)
  {
    return "On Stand By";
  }
  else if (state == 1)
  {
    return "Doorbell Active";
  }
  else if (state == 2)
  {
    return "Looking for faces";
  }
  else
  {
    return "Unknown"; // Default
  }
}

// Update status message on LCD
void updateStatusMsg(const char *msg, bool temporary, const char *fallback)
{
  status_msg = String(msg);
  status_msg_is_temporary = temporary;
  status_msg_last_update = millis();

  // Set fallback message if provided, otherwise determine based on slave_status
  if (fallback != nullptr)
  {
    status_msg_fallback = String(fallback);
  }
  else if (temporary)
  {
    // Auto-determine fallback based on current state
    status_msg_fallback = getStatusMessageForSlaveState(slave_status);
  }
  else
  {
    status_msg_fallback = ""; // Clear fallback for non-temporary messages
  }

  uiNeedsUpdate = true;
}

// Check if status message has expired (2 seconds) and update from slave state
void checkStatusMessageExpiration()
{
  unsigned long now = millis();

  // If message hasn't changed in 3 seconds, update from slave state
  if (now - status_msg_last_update >= 3000)
  {
    String stateMsg = getStatusMessageForSlaveState(slave_status);

    // Only update if different from current message
    if (status_msg != stateMsg)
    {
      status_msg = stateMsg;
      status_msg_is_temporary = false;
      status_msg_fallback = "";
      status_msg_last_update = now;
      uiNeedsUpdate = true;
    }
    else
    {
      // Message is already correct, just update timestamp to avoid checking too often
      status_msg_last_update = now;
    }
  }
}
