#include "screen_manager.h"
#include <WiFi.h>
#include <Touch.h>

#define RING_NOTIFICATION_DURATION 3000 // Show notification for 3 seconds

void updateTopBar()
{
  static uint32_t secondCounter = 0;

  // Clear top bar
  topBar.fillScreen(TFT_WHITE);
  topBar.setTextColor(TFT_BLACK, TFT_WHITE);
  topBar.setTextSize(2);

  // Display hub info
  topBar.drawString("ESP32 Hub - Control Center", 50, 10);

  // Display doorbell status - show brief status in top bar
  if (doorbellStatus.data_valid)
  {
    if (doorbellOnline)
    {
      topBar.setTextColor(TFT_GREEN, TFT_WHITE);
      topBar.drawString("DB: ON", 600, 10);
      topBar.setTextColor(TFT_BLACK, TFT_WHITE);
    }
    else
    {
      topBar.setTextColor(TFT_RED, TFT_WHITE);
      topBar.drawString("DB: OFF", 600, 10);
      topBar.setTextColor(TFT_BLACK, TFT_WHITE);
    }
  }
  else
  {
    topBar.setTextColor(TFT_YELLOW, TFT_WHITE);
    topBar.drawString("DB: ...", 600, 10);
    topBar.setTextColor(TFT_BLACK, TFT_WHITE);
  }

  // WiFi indicator: Calculate strength based on RSSI
  int wifiStrength = 0;
  if (WiFi.status() == WL_CONNECTED)
  {
    int32_t rssi = WiFi.RSSI();
    // RSSI to bars conversion:
    // > -50 dBm = Excellent (3 bars)
    // -50 to -60 dBm = Good (3 bars)
    // -60 to -70 dBm = Fair (2 bars)
    // -70 to -80 dBm = Weak (1 bar)
    // < -80 dBm = Very weak (0 bars)
    if (rssi > -60)
    {
      wifiStrength = 3;
    }
    else if (rssi > -70)
    {
      wifiStrength = 2;
    }
    else if (rssi > -80)
    {
      wifiStrength = 1;
    }
    else
    {
      wifiStrength = 0;
    }
  }
  drawWifiSymbol(780, 20, wifiStrength);

  // Mark that top bar needs update
  topBarNeedsUpdate = true;
}

void updateContent()
{
  if (Last_Screen != cur_Screen)
  {
    Last_Screen = cur_Screen;
    contentNeedsUpdate = true;

    if (cur_Screen == 0)
    {
      contentArea.fillScreen(TFT_BLACK);
      contentArea.setTextColor(TFT_WHITE, TFT_BLACK);
      contentArea.setTextSize(3);
      contentArea.drawRoundRect(10, 40, 400, 300, 10, TFT_WHITE);

      contentArea.drawString("Home Screen", 50, 20);
      contentArea.setTextSize(2);
      contentArea.drawString("Press capacitive button to switch screens", 50, 80);
    }
    else if (cur_Screen == 1)
    {
      contentArea.fillScreen(TFT_DARKGREEN);
      contentArea.setTextColor(TFT_WHITE, TFT_DARKGREEN);
      contentArea.setTextSize(3);
      contentArea.drawString("Settings Screen", 50, 20);
      contentArea.setTextSize(2);
      contentArea.drawString("Press capacitive button to go back", 50, 80);
    }
  }

  static bool prevDoorbellRinging = false;
  bool currentDoorbellRinging = doorbellJustRang && (millis() - doorbellRingTime < RING_NOTIFICATION_DURATION);

  // Handle doorbell ring notification (time-sensitive, update immediately)
  if (currentDoorbellRinging != prevDoorbellRinging)
  {
    if (currentDoorbellRinging)
    {
      // Draw large notification
      contentArea.fillRect(100, 200, 600, 100, TFT_RED);
      contentArea.setTextColor(TFT_WHITE, TFT_RED);
      contentArea.setTextSize(5);
      contentArea.drawString("DOORBELL RINGING!", 150, 220);

      contentArea.setTextSize(3);
      contentArea.setTextColor(TFT_YELLOW, TFT_RED);
      contentArea.drawString("Someone is at the door", 200, 270);
    }
    else
    {
      // Clear notification area
      contentArea.fillRect(100, 200, 600, 100, TFT_BLUE);
      doorbellJustRang = false; // Reset flag
    }
    prevDoorbellRinging = currentDoorbellRinging;
    contentNeedsUpdate = true;
  }

  // Push sprites to display
  pushSpritesToDisplay();
}

void updateTouch()
{
  // Only read if interrupt fired
  if (!touchDataReady)
    return;
  touchDataReady = false;

  GSLX680_read_data();

  // Update currentTouch struct
  if (ts_event.fingers > 0)
  {
    currentTouch.x = ts_event.x1 & 0x0FFF;
    currentTouch.y = ts_event.y1 & 0x0FFF;
    currentTouch.isPressed = true;
    currentTouch.timestamp = millis();
  }
  else
  {
    currentTouch.isPressed = false;
  }

  // Draw touch points DIRECTLY to LCD for immediate, responsive feedback
  if (ts_event.fingers >= 1)
  {
    lcd.fillCircle(ts_event.x1 & 0x0FFF, ts_event.y1 & 0x0FFF, 5, TFT_RED);
  }
  if (ts_event.fingers >= 2)
  {
    lcd.fillCircle(ts_event.x2 & 0x0FFF, ts_event.y2 & 0x0FFF, 5, TFT_GREEN);
  }
  if (ts_event.fingers >= 3)
  {
    lcd.fillCircle(ts_event.x3 & 0x0FFF, ts_event.y3 & 0x0FFF, 5, TFT_BLUE);
  }
  if (ts_event.fingers >= 4)
  {
    lcd.fillCircle(ts_event.x4 & 0x0FFF, ts_event.y4 & 0x0FFF, 5, TFT_CYAN);
  }
  if (ts_event.fingers >= 5)
  {
    lcd.fillCircle(ts_event.x5 & 0x0FFF, ts_event.y5 & 0x0FFF, 5, TFT_MAGENTA);
  }
}

void pushSpritesToDisplay()
{
  // Push top bar if updated (small: 800x40 = 64KB, ~8ms transfer)
  if (topBarNeedsUpdate)
  {
    topBar.pushSprite(0, 0);
    topBarNeedsUpdate = false;
  }

  // Push content if updated (larger: 800x440 = 704KB, ~88ms transfer)
  if (contentNeedsUpdate)
  {
    contentArea.pushSprite(0, 40); // Position below top bar
    contentNeedsUpdate = false;
  }
}

// Draw WiFi symbol with signal strength indicator
void drawWifiSymbol(int x, int y, int strength)
{
  // strength: 0=very weak/off, 1=weak, 2=medium, 3=strong
  uint16_t color = (strength > 0) ? TFT_GREEN : TFT_RED;

  // Draw dot at center
  topBar.fillCircle(x, y, 2, color);

  // Draw arcs based on strength using drawArc(x, y, r0, r1, angle0, angle1, color)
  if (strength >= 1)
  {
    topBar.drawArc(x, y, 5, 6, 225, 315, color); // Smallest arc
  }
  if (strength >= 2)
  {
    topBar.drawArc(x, y, 9, 10, 225, 315, color); // Middle arc
  }
  if (strength >= 3)
  {
    topBar.drawArc(x, y, 13, 14, 225, 315, color); // Largest arc
  }
}
