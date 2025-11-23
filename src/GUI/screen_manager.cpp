#include "screen_manager.h"
#include "Touch/touch_handler.h"
#include <WiFi.h>
#include <Touch.h>

#define RING_NOTIFICATION_DURATION 3000 // Show notification for 3 seconds
void drawTemperatureIcon(int cx, int cy);
void drawHumidityIcon(int cx, int cy);
void drawLightIcon(int cx, int cy);
void drawGasIcon(int cx, int cy);
void drawRoomIcon(int cx, int cy);
void drawGearIcon(int cx, int cy);
void drawNotifyCard(int x, int y, int w, int h, uint32_t iconColor,const char *title, const char *detail, const char *timeStr);

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
  if ((Last_Screen != cur_Screen) || contentNeedsUpdate || forcePageUpdate)
  {
    updateBotBar();
    Last_Screen = cur_Screen;
    contentNeedsUpdate = true;
    forcePageUpdate = false;

    if (cur_Screen == 0) // Home Page
    {

      contentArea.fillScreen(TFT_BLACK);
      contentArea.setTextColor(TFT_BLACK);
      contentArea.setTextSize(3);
      contentArea.fillSmoothRoundRect(10, 10, 500, 400, 10, TFT_WHITE);
      contentArea.fillSmoothRoundRect(520, 10, 270, 250, 10, TFT_WHITE);
      contentArea.fillSmoothRoundRect(520, 270, 270, 140, 10, TFT_WHITE);

      // home name
      contentArea.setFont(&fonts::Orbitron_Light_24);
      contentArea.setTextSize(2);
      contentArea.drawCenterString("Hammy home", 260, 40);

      // status
      contentArea.setFont(&fonts::Orbitron_Light_24);
      contentArea.setTextSize(2);
      contentArea.drawCenterString("status", 260, 110);

      contentArea.setFont(&fonts::Orbitron_Light_24);
      contentArea.setTextSize(3);
      contentArea.drawCenterString("3", 260, 220);
      contentArea.setFont(&fonts::Orbitron_Light_24);
      contentArea.setTextSize(2);
      contentArea.drawCenterString("rooms", 260, 310);

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
      contentArea.fillSmoothRoundRect(530, 320, 75, 75, 5, TFT_BLACK);
      contentArea.fillSmoothRoundRect(530 + 87, 320, 75, 75, 5, TFT_BLACK);
      contentArea.fillSmoothRoundRect(530 + 174, 320, 75, 75, 5, TFT_BLACK);
    }
    else if (cur_Screen == 1) // Font Page
    {
      contentArea.fillScreen(TFT_BLACK);
      contentArea.setTextColor(TFT_WHITE);
      contentArea.setTextSize(1);

      // Font test screen - antialiased fonts with better spacing
      int y = 10;
      int x = 10;

      // Column 1 - FreeMono family (antialiased)
      contentArea.setFont(&fonts::FreeMono9pt7b);
      contentArea.drawString("FreeMono9pt", x, y);
      y += 25;

      contentArea.setFont(&fonts::FreeMonoBold9pt7b);
      contentArea.drawString("FreeMonoBold9pt", x, y);
      y += 25;

      contentArea.setFont(&fonts::FreeMonoOblique9pt7b);
      contentArea.drawString("FreeMonoObliq9pt", x, y);
      y += 25;

      contentArea.setFont(&fonts::FreeMonoBoldOblique9pt7b);
      contentArea.drawString("FreeMonoBoldObl9pt", x, y);
      y += 35;

      // DejaVu fonts (antialiased)
      contentArea.setFont(&fonts::DejaVu9);
      contentArea.drawString("DejaVu9", x, y);
      y += 22;

      contentArea.setFont(&fonts::DejaVu12);
      contentArea.drawString("DejaVu12", x, y);
      y += 25;

      contentArea.setFont(&fonts::DejaVu18);
      contentArea.drawString("DejaVu18", x, y);
      y += 32;

      contentArea.setFont(&fonts::DejaVu24);
      contentArea.drawString("DejaVu24", x, y);

      // Column 2 - FreeSans family (antialiased)
      y = 10;
      x = 280;

      contentArea.setFont(&fonts::FreeSans9pt7b);
      contentArea.drawString("FreeSans9pt", x, y);
      y += 25;

      contentArea.setFont(&fonts::FreeSansBold9pt7b);
      contentArea.drawString("FreeSansBold9pt", x, y);
      y += 25;

      contentArea.setFont(&fonts::FreeSansOblique9pt7b);
      contentArea.drawString("FreeSansObliq9pt", x, y);
      y += 25;

      contentArea.setFont(&fonts::FreeSansBoldOblique9pt7b);
      contentArea.drawString("FreeSansBoldObl9pt", x, y);
      y += 35;

      // FreeSerif family (antialiased)
      contentArea.setFont(&fonts::FreeSerif9pt7b);
      contentArea.drawString("FreeSerif9pt", x, y);
      y += 25;

      contentArea.setFont(&fonts::FreeSerifBold9pt7b);
      contentArea.drawString("FreeSerifBold9pt", x, y);
      y += 25;

      contentArea.setFont(&fonts::FreeSerifItalic9pt7b);
      contentArea.drawString("FreeSerifItalic9pt", x, y);
      y += 25;

      contentArea.setFont(&fonts::FreeSerifBoldItalic9pt7b);
      contentArea.drawString("FreeSerifBoldIt9pt", x, y);

      // Column 3 - Specialty fonts (all antialiased)
      y = 10;
      x = 560;

      contentArea.setFont(&fonts::efontCN_10);
      contentArea.drawString("efontCN_10", x, y);
      y += 22;

      contentArea.setFont(&fonts::efontCN_12);
      contentArea.drawString("efontCN_12", x, y);
      y += 25;

      contentArea.setFont(&fonts::efontCN_14);
      contentArea.drawString("efontCN_14", x, y);
      y += 30;

      contentArea.setFont(&fonts::TomThumb);
      contentArea.drawString("TomThumb", x, y);
      y += 20;

      contentArea.setFont(&fonts::Orbitron_Light_24);
      contentArea.drawString("Orbitron24", x, y);
      y += 38;

      contentArea.setFont(&fonts::Roboto_Thin_24);
      contentArea.drawString("RobotoThin24", x, y);
      y += 38;

      contentArea.setFont(&fonts::Satisfy_24);
      contentArea.drawString("Satisfy24", x, y);
      y += 38;

      contentArea.setFont(&fonts::Yellowtail_32);
      contentArea.drawString("Yellowtail32", x, y);

      // Reset to default
      contentArea.setFont(&fonts::Font0);
    }

    else if (cur_Screen == 2) // Button example
    {
      contentArea.setTextSize(1);
      contentArea.fillScreen(TFT_BLACK);
      contentArea.setTextColor(TFT_WHITE);
      contentArea.setFont(&fonts::Orbitron_Light_24);
      contentArea.drawString("Touch Button Example", 200, 20);
      contentArea.setFont(&fonts::Font0);

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
    else if (cur_Screen == 3) // Room Detail Page
    {

      contentArea.fillScreen(TFT_BLACK);
      contentArea.setTextColor(TFT_BLACK);
      contentArea.setTextSize(3);
      contentArea.fillSmoothRoundRect(10, 10, 500, 400, 10, TFT_WHITE);
      contentArea.fillSmoothRoundRect(520, 10, 270, 130, 10, TFT_WHITE);
      contentArea.fillSmoothRoundRect(520, 150, 270, 130, 10, TFT_WHITE);
      contentArea.fillSmoothRoundRect(520, 290, 270, 120, 10, TFT_WHITE);

      contentArea.setFont(&fonts::Orbitron_Light_24);
      contentArea.setTextSize(1);
      contentArea.drawString("Temp", 530, 10);
      contentArea.drawString("Light", 530, 150);
      contentArea.drawString("P.M. 2.5", 530, 290);
      contentArea.fillSmoothRoundRect(530, 50, 250, 80, 5, TFT_LIGHTGRAY);
      contentArea.fillSmoothRoundRect(530, 50 + 140, 250, 80, 5, TFT_LIGHTGRAY);
      contentArea.fillSmoothRoundRect(530, 50 + 270, 250, 80, 5, TFT_LIGHTGRAY);
      contentArea.setTextSize(2);

      contentArea.drawString("My room", 60, 30);

      contentArea.fillSmoothRoundRect(50, 130, 250, 110, 0, TFT_PINK);
      contentArea.fillSmoothRoundRect(50, 240, 250, 120, 0, TFT_GREEN);
      contentArea.fillSmoothRoundRect(300, 240, 150, 120, 0, TFT_LIGHTGRAY);

      contentArea.drawWideLine(50, 130, 300, 130, 3, TFT_BLACK);
      contentArea.drawWideLine(50, 130, 50, 360, 3, TFT_BLACK);
      contentArea.drawWideLine(450, 360, 50, 360, 3, TFT_BLACK);
      contentArea.drawWideLine(300, 240, 300, 130, 3, TFT_BLACK);
      contentArea.drawWideLine(300, 240, 100, 240, 3, TFT_BLACK);
      contentArea.drawWideLine(50, 240, 70, 240, 3, TFT_BLACK);
      contentArea.drawWideLine(70, 240, 95, 215, 3, TFT_BLACK);
      contentArea.drawWideLine(300, 240, 300, 270, 3, TFT_BLACK);
      contentArea.drawWideLine(300, 360, 300, 300, 3, TFT_BLACK);
      contentArea.drawWideLine(300, 300, 260, 320, 3, TFT_BLACK);
      contentArea.drawWideLine(450, 240, 340, 240, 3, TFT_BLACK);
      contentArea.drawWideLine(450, 360, 450, 240, 3, TFT_BLACK);
      contentArea.drawWideLine(450, 240, 320, 240, 3, TFT_BLACK);
      contentArea.drawWideLine(345, 265, 320, 240, 3, TFT_BLACK);
    }
    else if (cur_Screen == 4) // Enter Pin
    {
      contentArea.fillScreen(TFT_BLACK);
      contentArea.setTextColor(TFT_WHITE);
      contentArea.setFont(&fonts::Orbitron_Light_24);
      contentArea.setTextSize(2);
      contentArea.drawCenterString("PlEASE ENTER PIN", 400, 20);
      contentArea.setTextSize(2);
      contentArea.drawWideLine(250, 180,310,180,3,TFT_WHITE);
      contentArea.drawWideLine(330, 180,390,180,3,TFT_WHITE);
      contentArea.drawWideLine(410, 180,470,180,3,TFT_WHITE);
      contentArea.drawWideLine(490, 180,550,180,3,TFT_WHITE);
      // Row 1
      // contentArea.fillSmoothRoundRect(190, 190, 90, 60, 5, TFT_LIGHTGRAY);
      // contentArea.fillSmoothRoundRect(300, 190, 90, 60, 5, TFT_LIGHTGRAY);
      // contentArea.fillSmoothRoundRect(410, 190, 90, 60, 5, TFT_LIGHTGRAY);
      // contentArea.fillSmoothRoundRect(520, 190, 90, 60, 5, TFT_LIGHTGRAY);
      // // Row 2
      // contentArea.fillSmoothRoundRect(190, 190+70, 90, 60, 5, TFT_LIGHTGRAY);
      // contentArea.fillSmoothRoundRect(300, 190+70, 90, 60, 5, TFT_LIGHTGRAY);
      // contentArea.fillSmoothRoundRect(410, 190+70, 90, 60, 5, TFT_LIGHTGRAY);
      // contentArea.fillSmoothRoundRect(520, 190+70, 90, 60, 5, TFT_LIGHTGRAY);
      // // Row 3 
      // contentArea.fillSmoothRoundRect(190, 190+140, 90, 60, 5, TFT_LIGHTGRAY);
      // contentArea.fillSmoothRoundRect(300, 190+140, 90, 60, 5, TFT_LIGHTGRAY);
      // contentArea.fillSmoothRoundRect(410, 190+140, 90, 60, 5, TFT_LIGHTGRAY);
      // contentArea.fillSmoothRoundRect(520, 190+140, 90, 60, 5, TFT_LIGHTGRAY);

    }
    else if (cur_Screen == 5) // Information Page
    {
      contentArea.fillScreen(TFT_BLACK);
      contentArea.setTextColor(TFT_WHITE);
      contentArea.setFont(&fonts::Orbitron_Light_24);
      contentArea.setTextSize(3);
      contentArea.drawString("Imformation", 10, 10);
      contentArea.fillSmoothRoundRect(10, 100, 500, 320, 10, TFT_WHITE);
      contentArea.fillSmoothRoundRect(520, 20, 270, 130, 10, TFT_WHITE);
      contentArea.fillSmoothRoundRect(520, 160, 270, 130, 10, TFT_WHITE);
      contentArea.fillSmoothRoundRect(520, 300, 270, 120, 10, TFT_WHITE);
      contentArea.setTextColor(TFT_BLACK);
      contentArea.setTextSize(2);
      contentArea.drawString("Check Rooms", 20, 105);
      contentArea.setTextSize(3);
      contentArea.drawCenterString("3", 120, 220);
      contentArea.setTextSize(2);
      contentArea.drawCenterString("rooms", 120, 310);
      contentArea.fillSmoothRoundRect(295, 255, 190, 80, 10, TFT_BLACK);
      contentArea.fillSmoothRoundRect(300, 260, 180, 70, 10, TFT_CYAN);
      contentArea.setTextSize(2);
      contentArea.drawString("Check", 305, 265);
      contentArea.setTextSize(1);
      contentArea.drawString("Check Temp", 530, 30);
      contentArea.drawString("Check Light", 530, 170);
      contentArea.drawString("Check Gas", 530, 310);
      contentArea.fillSmoothRoundRect(645, 75, 130, 50, 10, TFT_BLACK);
      contentArea.fillSmoothRoundRect(650, 80, 120, 40, 10, TFT_GREENYELLOW);
      contentArea.drawString("Check", 670, 85);
      contentArea.fillSmoothRoundRect(645, 215, 130, 50, 10, TFT_BLACK);
      contentArea.fillSmoothRoundRect(650, 220, 120, 40, 10, TFT_GOLD);
      contentArea.drawString("Check", 670, 225);
      contentArea.fillSmoothRoundRect(645, 355, 130, 50, 10, TFT_BLACK);
      contentArea.fillSmoothRoundRect(650, 360, 120, 40, 10, TFT_PINK);
      contentArea.drawString("Check", 670, 365);
    }
    else if (cur_Screen == 6) //Room List Page
    {
      contentArea.fillScreen(TFT_BLACK);
      contentArea.setTextColor(TFT_WHITE);
      contentArea.setFont(&fonts::Orbitron_Light_24);
      contentArea.setTextSize(3);
      contentArea.drawString("Room List", 10, 10);
      contentArea.fillSmoothRoundRect(780, 100, 10, 180, 3, TFT_WHITE);

      contentArea.fillSmoothRoundRect(10, 100, 740, 120, 15, TFT_WHITE);
      contentArea.setFont(&fonts::DejaVu12);
      contentArea.setTextColor(TFT_BLACK);
      contentArea.setTextSize(2);
      contentArea.drawString("LIVING ROOM", 20, 110);
      
      contentArea.drawString("Temp:", 20, 140);
      contentArea.drawString("Light:", 180, 140);
      contentArea.drawString("Humidity:", 350, 140);
      contentArea.drawString("Gas:", 570, 140);
      contentArea.setTextSize(3);
      contentArea.drawString("27", 110, 140);
      contentArea.drawString("40", 270, 140);
      contentArea.drawString("47", 490, 140);
      contentArea.drawString("200", 640, 140);

      contentArea.setTextSize(2);
      
      contentArea.fillSmoothRoundRect(10, 230, 740, 120, 15, TFT_WHITE);
      contentArea.drawString("BEDROOM", 20, 240);
      contentArea.drawString("Temp:", 20, 270);
      contentArea.drawString("Light:", 180, 270);
      contentArea.drawString("Humidity:", 350, 270);
      contentArea.drawString("Gas:", 570, 270);
      contentArea.setTextSize(3);
      contentArea.drawString("30", 110, 270);
      contentArea.drawString("51", 270, 270);
      contentArea.drawString("76", 490, 270);
      contentArea.drawString("809", 640, 270);

      contentArea.setTextSize(2);
      contentArea.fillSmoothRoundRect(10, 360, 740, 120, 15, TFT_WHITE);
      contentArea.drawString("KITCHEN", 20, 370);
      contentArea.drawString("Temp:", 20, 400);
      contentArea.drawString("Light:", 180, 400);
      contentArea.drawString("Humidity:", 350, 400);
      contentArea.drawString("Gas:", 570, 400);
      contentArea.setTextSize(3);
      contentArea.drawString("19", 110, 400);
      contentArea.drawString("88", 270, 400);
      contentArea.drawString("26", 490, 400);
      contentArea.drawString("67", 640, 400);
    }
    else if (cur_Screen == 7) //Room Detail Gas Page
    {
      contentArea.fillScreen(TFT_BLACK);
      contentArea.setTextColor(TFT_WHITE);
      contentArea.setFont(&fonts::Orbitron_Light_24);
      contentArea.setTextSize(3);
      contentArea.drawString("Bed Room", 10, 10);
      contentArea.fillSmoothRoundRect(790, 100, 10, 180, 3, TFT_WHITE);
      contentArea.fillSmoothRoundRect(530-520, 100, 250, 310, 10, TFT_WHITE);
      contentArea.fillSmoothRoundRect(530-260, 100, 250, 310, 10, TFT_WHITE);
      contentArea.fillSmoothRoundRect(530, 100, 250, 310, 10, TFT_WHITE);
      contentArea.setTextColor(TFT_BLACK);
      contentArea.setTextSize(2);
      contentArea.drawCenterString("Gas", 135, 100);
      contentArea.drawCenterString("Humidity", 135+260, 100);
      contentArea.drawCenterString("LIGHT", 135+520, 100);

      contentArea.setTextSize(4);
      contentArea.drawCenterString("4", 135, 190);
      contentArea.drawCenterString("57", 135+250, 190);
      contentArea.drawCenterString("38", 135+500, 190);
      contentArea.setTextSize(1);
      contentArea.drawCenterString("more information", 135, 360);
      contentArea.drawCenterString("more information", 135+260, 360);
      contentArea.drawCenterString("more information", 135+520, 360);
    }
    else if (cur_Screen == 8) //temp
    {
      contentArea.fillScreen(TFT_BLACK);
      contentArea.setTextColor(TFT_WHITE);
      contentArea.setFont(&fonts::Orbitron_Light_24);
      contentArea.setTextSize(3);
      contentArea.drawString("temperature", 10, 10);
      contentArea.fillSmoothRoundRect(10, 100,740, 300, 10, TFT_WHITE);
      contentArea.setTextColor(TFT_BLACK);
      contentArea.drawCenterString("Graph", 380, 250);
      
    }
    else if (cur_Screen == 9) //temp
    {
      contentArea.fillScreen(TFT_BLACK);
      contentArea.setTextColor(TFT_WHITE);
      contentArea.setFont(&fonts::Orbitron_Light_24);
      contentArea.setTextSize(3);
      contentArea.drawString("CALLING", 10, 10);
      contentArea.fillSmoothRoundRect(10, 100,590, 300, 10, TFT_WHITE);
      
    }
    else if (cur_Screen == 10) // MASTER MENU PAGE
    {
      contentArea.fillScreen(TFT_BLACK);

      contentArea.setFont(&fonts::Orbitron_Light_24);
      contentArea.setTextColor(TFT_WHITE);
      contentArea.setTextSize(3);
      contentArea.fillSmoothRoundRect(780, 100, 10, 180, 3, TFT_WHITE);
      contentArea.drawString("Smart Home Menu", 20, 20);

      int boxW = 220;
      int boxH = 160;

      int x1 = 20;
      int x2 = 260;
      int x3 = 500;

      int y1 = 110;
      int y2 = 300;

      // ==== TEMPERATURE ====
      contentArea.setTextSize(1);
      contentArea.fillSmoothRoundRect(x1, y1, boxW, boxH, 15, TFT_WHITE);
      drawTemperatureIcon(x1 + boxW/2, y1 + 55);
      contentArea.setTextColor(TFT_BLACK);
      contentArea.drawCenterString("Temperature", x1 + boxW/2, y1 + 120);

      // ==== HUMIDITY ====
      contentArea.fillSmoothRoundRect(x2, y1, boxW, boxH, 15, TFT_WHITE);
      drawHumidityIcon(x2 + boxW/2, y1 + 55);
      contentArea.drawCenterString("Humidity", x2 + boxW/2, y1 + 120);

      // ==== LIGHT ====
      contentArea.fillSmoothRoundRect(x3, y1, boxW, boxH, 15, TFT_WHITE);
      drawLightIcon(x3 + boxW/2, y1 + 55);
      contentArea.drawCenterString("Light", x3 + boxW/2, y1 + 120);

      // ==== GAS ====
      contentArea.fillSmoothRoundRect(x1, y2, boxW, boxH, 15, TFT_WHITE);
      drawGasIcon(x1 + boxW/2, y2 + 55);
      contentArea.drawCenterString("Gas / Air", x1 + boxW/2, y2 + 120);

      // ==== ROOMS ====
      contentArea.fillSmoothRoundRect(x2, y2, boxW, boxH, 15, TFT_WHITE);
      drawRoomIcon(x2 + boxW/2, y2 + 55);
      contentArea.drawCenterString("Rooms", x2 + boxW/2, y2 + 120);

      // ==== SETTINGS ====
      contentArea.fillSmoothRoundRect(x3, y2, boxW, boxH, 15, TFT_WHITE);
      drawGearIcon(x3 + boxW/2, y2 + 55);
      contentArea.drawCenterString("Settings", x3 + boxW/2, y2 + 120);
    }
    else if (cur_Screen == 11) // Notification Log
    {

      contentArea.fillScreen(TFT_BLACK);
      contentArea.fillSmoothRoundRect(790, 100, 10, 180, 3, TFT_WHITE);
      // Title
      contentArea.setFont(&fonts::Orbitron_Light_24);
      contentArea.setTextColor(TFT_WHITE);
      contentArea.setTextSize(3);
      contentArea.drawString("Notifications", 20, 20);

      int x = 20;
      int y = 100;
      int w = 760;
      int h = 90;

      drawNotifyCard(x, y, w, h, TFT_YELLOW, "Doorbell", "Someone pressed the bell", "14:22");
      drawNotifyCard(x, y + 110, w, h, TFT_BLUE, "Call Received", "Front Gate Camera calling", "13:58");
      drawNotifyCard(x, y + 220, w, h, TFT_RED, "Gas Alert", "Kitchen gas spike detected", "12:49");
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
      contentArea.setFont(&fonts::Font0);
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
    forcePageUpdate = true;
    botBarNeedsUpdate = true;
  }

  // Finally draw touch inputs on top for that screen
  handleTouchInput();

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
  if (touchAreaNeedsUpdate)
  {
    touchArea.pushSprite(0, 0, 0); // x, y, transparentColor (palette index 0)
    touchAreaNeedsUpdate = false;
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

// update touch lowlevel
void updateTouchllv()
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
void drawTemperatureIcon(int cx, int cy)
{
    contentArea.fillSmoothCircle(cx, cy + 20, 20, TFT_RED);
    contentArea.fillRect(cx - 8, cy - 30, 16, 50, TFT_RED);
    contentArea.drawCircle(cx, cy + 20, 20, TFT_BLACK);
    contentArea.drawRect(cx - 8, cy - 30, 16, 50, TFT_BLACK);
}
void drawHumidityIcon(int cx, int cy)
{
    // drop
    contentArea.fillSmoothCircle(cx, cy, 20, TFT_CYAN);
    contentArea.fillTriangle(cx, cy - 28, cx - 18, cy, cx + 18, cy, TFT_CYAN);

    // outline
    contentArea.drawTriangle(cx, cy - 28, cx - 18, cy, cx + 18, cy, TFT_BLACK);
    contentArea.drawCircle(cx, cy, 20, TFT_BLACK);

    // humidity lines
    contentArea.drawWideLine(cx - 12, cy + 22, cx + 12, cy + 22, 3, TFT_BLUE);
    contentArea.drawWideLine(cx - 8, cy + 32, cx + 8, cy + 32, 3, TFT_BLUE);
}
void drawLightIcon(int cx, int cy)
{
    contentArea.fillSmoothCircle(cx, cy - 10, 22, TFT_YELLOW);
    contentArea.fillRect(cx - 12, cy + 10, 24, 20, TFT_YELLOW);

    contentArea.drawCircle(cx, cy - 10, 22, TFT_BLACK);
    contentArea.drawRect(cx - 12, cy + 10, 24, 20, TFT_BLACK);
}
void drawGasIcon(int cx, int cy)
{
    contentArea.fillSmoothCircle(cx, cy, 20, TFT_CYAN);
    contentArea.drawCircle(cx, cy, 20, TFT_BLACK);

    contentArea.fillSmoothCircle(cx - 15, cy + 22, 12, TFT_CYAN);
    contentArea.fillSmoothCircle(cx + 15, cy + 22, 12, TFT_CYAN);

    contentArea.drawCircle(cx - 15, cy + 22, 12, TFT_BLACK);
    contentArea.drawCircle(cx + 15, cy + 22, 12, TFT_BLACK);
}
void drawRoomIcon(int cx, int cy)
{
    contentArea.drawTriangle(cx - 30, cy, cx, cy - 30, cx + 30, cy, TFT_BLACK);
    contentArea.drawRect(cx - 22, cy, 44, 40, TFT_BLACK);
}
void drawGearIcon(int cx, int cy)
{
    contentArea.fillSmoothCircle(cx, cy, 14, TFT_DARKGREY);

    for (int i = 0; i < 8; i++)
    {
        float a = i * 45 * 0.01745;
        int x = cx + cos(a) * 22;
        int y = cy + sin(a) * 22;
        contentArea.fillRect(x - 4, y - 4, 8, 8, TFT_DARKGREY);
    }
}

void drawNotifyCard(int x, int y, int w, int h, uint32_t iconColor,
                    const char *title, const char *detail, const char *timeStr)
{
    // Card background
    contentArea.fillSmoothRoundRect(x, y, w, h, 20, TFT_WHITE);

    // Icon Circle
    contentArea.fillSmoothCircle(x + 45, y + h/2 - 5, 25, iconColor);
    contentArea.drawCircle(x + 45, y + h/2 - 5, 25, TFT_BLACK);

    // Title
    contentArea.setTextColor(TFT_BLACK);
    contentArea.setFont(&fonts::DejaVu12);
    contentArea.setTextSize(2);
    contentArea.drawString(title, x + 90, y + 18);

    // Detail small text
    contentArea.setTextColor(TFT_DARKGREY);
    contentArea.setTextSize(1);
    contentArea.drawString(detail, x + 90, y + 55);

    // Time (right side)
    contentArea.setTextColor(TFT_DARKGREY);
    contentArea.setTextSize(1);
    contentArea.drawRightString(timeStr, x + w - 20, y + 55);
}
