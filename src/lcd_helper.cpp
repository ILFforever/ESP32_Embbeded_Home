#include "lcd_helper.h"

// Update status message on LCD
void updateStatusMsg(const char *msg, bool temporary, const char *fallback)
{
  status_msg = String(msg);
  status_msg_is_temporary = temporary;

  // Set fallback message if provided, otherwise determine based on slave_status
  if (fallback != nullptr)
  {
    status_msg_fallback = String(fallback);
  }
  else if (temporary)
  {
    // Auto-determine fallback based on current state
    if (slave_status == -1)
    {
      status_msg_fallback = "Not connected";
    }
    else if (slave_status == 0)
    {
      status_msg_fallback = "On Stand By";
    }
    else if (slave_status == 1)
    {
      status_msg_fallback = "Doorbell Active";
    }
    else if (slave_status == 2)
    {
      status_msg_fallback = "Looking for faces";
    }
    else
    {
      status_msg_fallback = "On Stand By"; // Default fallback
    }
  }
  else
  {
    status_msg_fallback = ""; // Clear fallback for non-temporary messages
  }

  uiNeedsUpdate = true;
}
