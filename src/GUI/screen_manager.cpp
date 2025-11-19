#include "screen_manager.h"
#include <WiFi.h>
#include <Touch.h>

#define RING_NOTIFICATION_DURATION 3000 // Show notification for 3 seconds

// Define touch button instances
TouchButton exampleButton1 = {0};
TouchButton exampleButton2 = {0};
TouchButton exampleButton3 = {0};

void updateTopBar()
{
  static uint32_t secondCounter = 0;

  // Clear top bar
  topBar.fillScreen(TFT_WHITE);
  topBar.setTextColor(TFT_BLACK, TFT_WHITE);
  topBar.setTextSize(2);

  // Display time and date on top left
  struct tm timeinfo;
  if (getLocalTime(&timeinfo))
  {
    char timeStr[20];
    char dateStr[20];
    strftime(timeStr, sizeof(timeStr), "%H:%M:%S", &timeinfo);
    strftime(dateStr, sizeof(dateStr), "%d/%m/%Y", &timeinfo);

    topBar.setTextSize(2);
    topBar.drawString(timeStr, 10, 5);
    topBar.setTextSize(1);
    topBar.drawString(dateStr, 10, 25);
    topBar.setTextSize(2); // Reset to default size
  }

  // Display doorbell status - show brief status in top bar
  if (doorbellStatus.data_valid)
  {
    if (doorbellOnline)
    {
      topBar.fillCircle(770, 20, 10, TFT_LIGHTGRAY);
    }
    else
    {
      topBar.fillCircle(770, 20, 10, TFT_YELLOW);
    }
  }
  else
  {
    topBar.fillCircle(770, 20, 10, TFT_DARKGREY);
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
  drawWifiSymbol(740, 25, wifiStrength);

  // Mark that top bar needs update
  topBarNeedsUpdate = true;
}

// Remember to -40 from height to account for top bar
void updateContent()
{
  if (Last_Screen != cur_Screen)
  {
    updateBotBar();
    Last_Screen = cur_Screen;
    contentNeedsUpdate = true;

    if (cur_Screen == 0)
    {
      contentArea.fillScreen(TFT_BLACK);
      contentArea.setTextColor(TFT_BLACK);
      contentArea.setTextSize(3);
      contentArea.fillSmoothRoundRect(10, 10, 500, 400, 10, TFT_WHITE);
      contentArea.fillSmoothRoundRect(520, 10, 270, 250, 10, TFT_WHITE);
      contentArea.fillSmoothRoundRect(520, 270, 270, 140, 10, TFT_WHITE);

      // Alerts section (Top right)
      contentArea.setFont(&fonts::Orbitron_Light_24);
      contentArea.setTextSize(1);
      contentArea.drawString("Alerts", 530, 20);
      contentArea.fillSmoothRoundRect(530, 60, 250, 60, 5, TFT_GREEN);
      contentArea.fillSmoothRoundRect(530, 125, 250, 60, 5, TFT_YELLOW);
      contentArea.fillSmoothRoundRect(530, 190, 250, 60, 5, TFT_RED);

      contentArea.setFont(&fonts::Font0);

      // Quick Actions section (Bottom right)
      contentArea.setFont(&fonts::Orbitron_Light_24);
      contentArea.setTextSize(1);
      contentArea.drawString("Quick Actions", 530, 280);
      contentArea.fillSmoothRoundRect(530, 322, 75, 75, 5, TFT_BLACK);
      contentArea.fillSmoothRoundRect(530 + 87, 320, 75, 75, 5, TFT_BLACK);
      contentArea.fillSmoothRoundRect(530 + 174, 320, 75, 75, 5, TFT_BLACK);
    }
    else if (cur_Screen == 1)
    {
      // Initialize buttons on first entry
      static bool buttonsInitialized = false;
      if (!buttonsInitialized)
      {
        exampleButton1.x = 50;
        exampleButton1.y = 100;
        exampleButton1.width = 200;
        exampleButton1.height = 80;

        exampleButton2.x = 300;
        exampleButton2.y = 100;
        exampleButton2.width = 200;
        exampleButton2.height = 80;

        exampleButton3.x = 550;
        exampleButton3.y = 100;
        exampleButton3.width = 200;
        exampleButton3.height = 80;

        buttonsInitialized = true;
      }
      contentArea.setTextSize(1);

      contentArea.fillScreen(TFT_BLACK);
      contentArea.setTextColor(TFT_WHITE);
      contentArea.setFont(&fonts::Orbitron_Light_24);
      contentArea.drawString("Touch Button Example", 200, 20);
      contentArea.setFont(&fonts::Font0);

      // Update button states
      bool btn1Clicked = updateTouchButton(&exampleButton1, currentTouch.x, currentTouch.y - 40, currentTouch.isPressed);
      bool btn2Clicked = updateTouchButton(&exampleButton2, currentTouch.x, currentTouch.y - 40, currentTouch.isPressed);
      bool btn3Clicked = updateTouchButton(&exampleButton3, currentTouch.x, currentTouch.y - 40, currentTouch.isPressed);

      // Draw Button 1
      uint16_t btn1Color = TFT_DARKGREY;
      if (exampleButton1.isPressed && !exampleButton1.isDragging)
      {
        btn1Color = TFT_LIGHTGREY;
      }
      contentArea.fillSmoothRoundRect(exampleButton1.x, exampleButton1.y, exampleButton1.width, exampleButton1.height, 10, btn1Color);
      contentArea.setTextColor(TFT_WHITE);
      contentArea.setTextSize(2);
      contentArea.drawCenterString("Button 1", exampleButton1.x + exampleButton1.width / 2, exampleButton1.y + exampleButton1.height / 2 - 8);

      // Draw Button 2
      uint16_t btn2Color = TFT_DARKGREY;
      if (exampleButton2.isPressed && !exampleButton2.isDragging)
      {
        btn2Color = TFT_LIGHTGREY;
      }
      contentArea.fillSmoothRoundRect(exampleButton2.x, exampleButton2.y, exampleButton2.width, exampleButton2.height, 10, btn2Color);
      contentArea.drawCenterString("Button 2", exampleButton2.x + exampleButton2.width / 2, exampleButton2.y + exampleButton2.height / 2 - 8);

      // Draw Button 3
      uint16_t btn3Color = TFT_DARKGREY;
      if (exampleButton3.isPressed && !exampleButton3.isDragging)
      {
        btn3Color = TFT_LIGHTGREY;
      }
      contentArea.fillSmoothRoundRect(exampleButton3.x, exampleButton3.y, exampleButton3.width, exampleButton3.height, 10, btn3Color);
      contentArea.drawCenterString("Button 3", exampleButton3.x + exampleButton3.width / 2, exampleButton3.y + exampleButton3.height / 2 - 8);

      // Display click feedback
      contentArea.setTextSize(1);
      contentArea.setFont(&fonts::DejaVu18);
      int feedbackY = 250;

      if (btn1Clicked)
      {
        contentArea.setTextColor(TFT_GREEN);
        contentArea.drawString("Button 1 Clicked!", 50, feedbackY);
        Serial.println("Button 1 clicked!");
      }
      if (btn2Clicked)
      {
        contentArea.setTextColor(TFT_CYAN);
        contentArea.drawString("Button 2 Clicked!", 50, feedbackY + 40);
        Serial.println("Button 2 clicked!");
      }
      if (btn3Clicked)
      {
        contentArea.setTextColor(TFT_YELLOW);
        contentArea.drawString("Button 3 Clicked!", 50, feedbackY + 80);
        Serial.println("Button 3 clicked!");
      }

      // Display instructions
      contentArea.setTextColor(TFT_DARKGREY);
      contentArea.setFont(&fonts::Font0);
      contentArea.setTextSize(1);
      contentArea.drawString("Press buttons to test touch detection", 50, 380);
      contentArea.drawString("Buttons turn light when pressed", 50, 400);
      contentArea.drawString("Dragging outside cancels the press", 50, 420);

      // Reset to default
      contentArea.setFont(&fonts::Font0);
      contentArea.setTextSize(1);
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
      contentArea.clear();
      doorbellJustRang = false; // Reset flag
    }
    prevDoorbellRinging = currentDoorbellRinging;
    contentNeedsUpdate = true;
    botBarNeedsUpdate = true;
  }

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

  // Push top bar if updated (small: 800x40 = 64KB, ~8ms transfer)
  if (botBarNeedsUpdate)
  {
    botBar.pushSprite(0, 460);
    botBarNeedsUpdate = false;
  }
}
void updateBotBar()
{
  if (cur_Screen == 0)
  {
    // Clear bottom bar
    botBar.setTextColor(TFT_WHITE);
    botBar.setTextSize(2);

    // Draw menu options
    botBar.drawCenterString("Home", 120, 5);
    botBar.drawCenterString("Devices", 310, 5);
    botBar.drawCenterString("Information", 500, 5);
    botBar.drawCenterString("Menu", 690, 5);
  }
  else
  {
    botBar.clear();
  }
  botBarNeedsUpdate = true;
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
    uint16_t x1 = ts_event.x1 & 0x0FFF;
    uint16_t y1 = ts_event.y1 & 0x0FFF;
    lcd.fillCircle(x1, y1, 5, TFT_RED);
    // Print only first finger coordinates
    Serial.printf("[Touch] X: %d, Y: %d\n", x1, y1);
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

// Draw a progress bar (0-100%)
// Parameters:
//   sprite: pointer to sprite to draw on (e.g., &contentArea or &topBar)
//   x, y: top-left position
//   width, height: size of the bar
//   value: current value (0-100)
//   fillColor: color of the filled portion
//   bgColor: color of the empty portion
//   borderColor: color of the border
//   borderThickness: thickness of the border in pixels (default: 2)
void drawProgressBar(LGFX_Sprite *sprite, int x, int y, int width, int height, int value, uint16_t fillColor, uint16_t bgColor, uint16_t borderColor, int borderThickness)
{
  // Clamp value to 0-100
  if (value < 0)
    value = 0;
  if (value > 100)
    value = 100;

  // Clamp border thickness to reasonable values
  if (borderThickness < 0)
    borderThickness = 0;
  int maxThickness = min(width, height) / 2;
  if (borderThickness > maxThickness)
    borderThickness = maxThickness;

  // Draw border (multiple rectangles for thickness)
  for (int i = 0; i < borderThickness; i++)
  {
    sprite->drawRect(x + i, y + i, width - (i * 2), height - (i * 2), borderColor);
  }

  // Calculate inner dimensions (subtract border thickness on both sides)
  int innerX = x + borderThickness;
  int innerY = y + borderThickness;
  int innerWidth = width - (borderThickness * 2);
  int innerHeight = height - (borderThickness * 2);

  // Calculate fill width
  int fillWidth = (innerWidth * value) / 100;

  // Draw background (empty portion)
  sprite->fillRect(innerX, innerY, innerWidth, innerHeight, bgColor);

  // Draw filled portion
  if (fillWidth > 0)
  {
    sprite->fillRect(innerX, innerY, fillWidth, innerHeight, fillColor);
  }
}

// Get color based on progress (0-100): Red -> Orange -> Yellow -> Green
uint16_t getProgressColor(int progress)
{
  // Hardcoded color steps
  if (progress == 0)
    return TFT_RED; // Red
  if (progress == 10)
    return TFT_RED; // Red
  if (progress == 25)
    return TFT_ORANGE; // Orange
  if (progress == 40)
    return TFT_ORANGE; // Orange
  if (progress == 50)
    return TFT_YELLOW; // Yellow
  if (progress == 60)
    return TFT_YELLOW; // Yellow
  if (progress == 70)
    return TFT_GREENYELLOW; // Yellow-Green
  if (progress == 80)
    return TFT_GREENYELLOW; // Yellow-Green
  if (progress == 90)
    return TFT_GREEN; // Green
  if (progress == 100)
    return TFT_GREEN; // Green

  // Default to green for any other value
  return TFT_GREEN;
}

// Draw text with transparent background
void drawTransparentText(LGFX_Sprite *sprite, const char *text, int x, int y, uint16_t textColor)
{
  // Set text datum (alignment) if needed
  sprite->setTextColor(textColor); // Only set foreground color, no background
  sprite->drawString(text, x, y);
}
