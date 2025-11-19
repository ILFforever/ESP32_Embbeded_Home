#include "lcd_helper.h"
#include <TFT_eSPI.h>

extern TFT_eSPI tft;
extern SemaphoreHandle_t tftMutex;

// Fill video area with uploading message
void showUploadingScreen()
{
  if (xSemaphoreTake(tftMutex, pdMS_TO_TICKS(100)) == pdTRUE)
  {
    videoSprite.fillSprite(TFT_BLACK);

    int centerX = videoSprite.width() / 2;
    int centerY = videoSprite.height() / 2;  // Adjusted for better centering in video area

    // Draw upload icon (cloud with arrow)
    videoSprite.fillCircle(centerX - 15, centerY - 35, 12, TFT_DARKGREY);
    videoSprite.fillCircle(centerX + 15, centerY - 35, 12, TFT_DARKGREY);
    videoSprite.fillCircle(centerX, centerY - 40, 15, TFT_DARKGREY);
    videoSprite.fillRect(centerX - 25, centerY - 35, 50, 20, TFT_DARKGREY);

    // Draw upload arrow (pointing up)
    videoSprite.fillTriangle(
      centerX, centerY - 25,           // top point
      centerX - 10, centerY - 10,      // bottom left
      centerX + 10, centerY - 10,      // bottom right
      TFT_CYAN
    );
    videoSprite.fillRect(centerX - 4, centerY - 10, 8, 20, TFT_CYAN);

    // Draw text with appropriate size
    videoSprite.setTextColor(TFT_WHITE, TFT_BLACK);
    videoSprite.setTextDatum(MC_DATUM);
    videoSprite.setTextSize(1);
    videoSprite.drawString("Uploading to server...", centerX, centerY + 25);

    // Push sprite to screen at video position
    videoSprite.pushSprite(0, 65);  // VIDEO_Y_OFFSET = 40
    
    xSemaphoreGive(tftMutex);
  }
}

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
