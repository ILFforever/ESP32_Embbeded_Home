#include "screen_manager.h"
#include "screen_definitions.h"
#include "Touch/touch_handler.h"
#include "hub_network.h"
#include <WiFi.h>
#include <Touch.h>

#define RING_NOTIFICATION_DURATION 3000 // Show notification for 3 seconds
void drawTemperatureIcon(int cx, int cy);
void drawHumidityIcon(int cx, int cy);
void drawLightIcon(int cx, int cy);
void drawGasIcon(int cx, int cy);
void drawRoomIcon(int cx, int cy);
void drawGearIcon(int cx, int cy);
void drawNotifyCard(int x, int y, int w, int h, uint32_t iconColor, const char *title, const char *detail, const char *timeStr);

// Helper function to format timestamp for display
void formatTimestamp(const char *isoTimestamp, char *output, size_t maxLen)
{
  // Parse ISO timestamp (e.g., "2025-11-25T06:24:35.386Z")
  // For simplicity, just extract time HH:MM:SS
  if (strlen(isoTimestamp) >= 19)
  {
    // Extract time portion (position 11-18 for HH:MM:SS)
    snprintf(output, maxLen, "%.8s", isoTimestamp + 11);
  }
  else
  {
    strncpy(output, "N/A", maxLen - 1);
    output[maxLen - 1] = '\0';
  }
}

// Helper function to draw loading indicator
void drawLoadingIndicator(LGFX_Sprite *sprite, int cx, int cy)
{
  // Draw animated dots
  static int dotCount = 0;
  static unsigned long lastDotUpdate = 0;

  if (millis() - lastDotUpdate > 500)
  {
    dotCount = (dotCount + 1) % 4;
    lastDotUpdate = millis();
  }

  sprite->setFont(&fonts::Font0);
  sprite->setTextColor(TFT_DARKGRAY);

  char loadingText[20] = "Loading";
  for (int i = 0; i < dotCount; i++)
  {
    strcat(loadingText, ".");
  }

  sprite->drawCenterString(loadingText, cx, cy);
}

int Device_list_screen_num = 1;

// Loading state for sensor data
struct SensorLoadingState
{
  bool isLoading;
  unsigned long loadingStartTime;
};
static SensorLoadingState livingRoomLoading = {false, 0};
static SensorLoadingState kitchenLoading = {false, 0};
static SensorLoadingState bedroomLoading = {false, 0};

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
      topBar.fillCircle(770, 20, 10, TFT_GREEN); // Green = Online (was LIGHTGRAY)
    }
    else
    {
      topBar.fillCircle(770, 20, 10, TFT_YELLOW); // Yellow = Offline
    }
  }
  else
  {
    topBar.fillCircle(770, 20, 10, TFT_DARKGREY); // Dark Gray = No data/Unknown
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
  topBar.drawCenterString(getScreenName(cur_Screen), 400, 10);

  // Mark that top bar needs update
  topBarNeedsUpdate = true;
}

// Remember to -40 from height to account for top bar
void updateContent()
{
  if ((Last_Screen != cur_Screen) || contentNeedsUpdate || forcePageUpdate)
  {
    updateBotBar();

    // Play page transition animation on screen change (not on content updates)
    if (Last_Screen != cur_Screen && !skipPageTransition)
    {
      playPageTransition(getScreenName(cur_Screen));
    }

    Last_Screen = cur_Screen;
    contentNeedsUpdate = true;
    forcePageUpdate = false;
    skipPageTransition = false; // Reset flag after use

    if (cur_Screen == SCREEN_HOME) // Home Page
    {
      contentArea.fillScreen(TFT_BLACK);
      contentArea.setTextColor(TFT_BLACK);
      contentArea.setTextSize(3);

      // Left side - Alerts section
      contentArea.fillSmoothRoundRect(10, 10, 500, 400, 10, TFT_WHITE);
      contentArea.setFont(&fonts::Orbitron_Light_24);
      contentArea.setTextSize(1);
      contentArea.setTextColor(TFT_BLACK);
      contentArea.drawString("Recent Alerts", 30, 25);

      // Fetch alerts from backend API (limit to 5 to avoid heap issues)
      Alert alerts[5];
      bool alertsLoaded = fetchHomeAlerts(alerts, 5);

      if (alertsLoaded)
      {
        // Draw each alert with layered frame styling
        int yPos = 60;
        for (int i = 0; i < 5; i++)
        {
          if (alerts[i].valid)
          {
            // Color based on alert level (case-insensitive check)
            uint16_t levelColor = TFT_LIGHTGRAY;
            if (strcasecmp(alerts[i].level, "error") == 0 || strcasecmp(alerts[i].level, "ERROR") == 0)
            {
              levelColor = TFT_RED;
            }
            else if (strcasecmp(alerts[i].level, "warning") == 0 || strcasecmp(alerts[i].level, "WARN") == 0)
            {
              levelColor = TFT_ORANGE;
            }
            else if (strcasecmp(alerts[i].level, "info") == 0 || strcasecmp(alerts[i].level, "INFO") == 0)
            {
              levelColor = TFT_GREEN;
            }

            // Layered frame effect
            contentArea.fillSmoothRoundRect(20, yPos, 480, 60, 10, TFT_BLACK);     // outer frame
            contentArea.fillSmoothRoundRect(25, yPos + 5, 470, 50, 8, levelColor); // color layer
            contentArea.fillSmoothRoundRect(35, yPos + 5, 460, 50, 8, TFT_BLACK);  // inner frame
            contentArea.fillSmoothRoundRect(40, yPos + 5, 455, 50, 8, TFT_WHITE);  // content area

            // Draw alert text
            contentArea.setFont(&fonts::DejaVu12);
            contentArea.setTextColor(TFT_BLACK);
            contentArea.setTextSize(1);
            contentArea.drawString(alerts[i].message, 50, yPos + 12);

            // Draw timestamp (smaller, right-aligned)
            contentArea.setTextColor(TFT_DARKGREY);
            contentArea.drawRightString(alerts[i].timestamp, 480, yPos + 35);
          }
          else
          {
            // Empty slot - gray placeholder
            contentArea.fillSmoothRoundRect(20, yPos, 480, 60, 10, TFT_BLACK);
            contentArea.fillSmoothRoundRect(25, yPos + 5, 470, 50, 8, TFT_LIGHTGRAY);
            contentArea.fillSmoothRoundRect(35, yPos + 5, 460, 50, 8, TFT_BLACK);
            contentArea.fillSmoothRoundRect(40, yPos + 5, 455, 50, 8, TFT_DARKGREY);
          }
          yPos += 70;
        }
      }
      else
      {
        // Failed to load alerts - show placeholder slots
        int yPos = 60;
        for (int i = 0; i < 5; i++)
        {
          contentArea.fillSmoothRoundRect(20, yPos, 480, 60, 10, TFT_BLACK);
          contentArea.fillSmoothRoundRect(25, yPos + 5, 470, 50, 8, TFT_LIGHTGRAY);
          contentArea.fillSmoothRoundRect(35, yPos + 5, 460, 50, 8, TFT_BLACK);
          contentArea.fillSmoothRoundRect(40, yPos + 5, 455, 50, 8, TFT_DARKGREY);
          yPos += 70;
        }

        // Show error message on first slot
        contentArea.setFont(&fonts::DejaVu12);
        contentArea.setTextColor(TFT_WHITE);
        contentArea.setTextSize(1);
        contentArea.drawString("Failed to load alerts", 50, 75);
      }

      contentArea.fillSmoothRoundRect(520, 10, 270, 250, 10, TFT_WHITE);
      contentArea.fillSmoothRoundRect(520, 270, 270, 140, 10, TFT_WHITE);

      // Environmental Sensors section (Top right)
      contentArea.setFont(&fonts::Orbitron_Light_24);
      contentArea.setTextSize(1);
      contentArea.drawString("Environment", 530, 20);

      // Fetch sensor data from Living Room (ss_001) for home display
      static SensorData homeSensorData;
      static unsigned long lastFetchHome = 0;
      if (millis() - lastFetchHome > 30000 || !homeSensorData.valid) {
        fetchSensorData("ss_001", &homeSensorData);
        lastFetchHome = millis();
      }

      // Temperature Block
      contentArea.fillSmoothRoundRect(530, 60, 250, 60, 8, TFT_ORANGE);
      contentArea.setFont(&fonts::DejaVu18);
      contentArea.setTextColor(TFT_BLACK);
      contentArea.drawString("Temperature", 545, 65);
      contentArea.setFont(&fonts::DejaVu24);
      if (homeSensorData.valid) {
        char tempStr[20];
        snprintf(tempStr, sizeof(tempStr), "%.1f C", homeSensorData.temperature);
        contentArea.drawCenterString(tempStr, 655, 90);
      } else {
        contentArea.drawCenterString("--", 655, 90);
      }

      // Humidity Block
      contentArea.fillSmoothRoundRect(530, 125, 250, 60, 8, TFT_CYAN);
      contentArea.setFont(&fonts::DejaVu18);
      contentArea.setTextColor(TFT_BLACK);
      contentArea.drawString("Humidity", 545, 130);
      contentArea.setFont(&fonts::DejaVu24);
      if (homeSensorData.valid) {
        char humStr[20];
        snprintf(humStr, sizeof(humStr), "%.1f %%", homeSensorData.humidity);
        contentArea.drawCenterString(humStr, 655, 155);
      } else {
        contentArea.drawCenterString("--", 655, 155);
      }

      // PM2.5 
      contentArea.fillSmoothRoundRect(530, 190, 250, 60, 8, TFT_GREENYELLOW);
      contentArea.setFont(&fonts::DejaVu18);
      contentArea.setTextColor(TFT_BLACK);
      contentArea.drawString("PM 2.5", 545, 195);
      contentArea.setFont(&fonts::DejaVu24);
      if (homeSensorData.valid) {
        char gasStr[20];
        snprintf(gasStr, sizeof(gasStr), "%.0f", homeSensorData.gas_level);
        contentArea.drawCenterString(gasStr, 655, 220);
      } else {
        contentArea.drawCenterString("--", 655, 220);
      }
      contentArea.setTextColor(TFT_BLACK);
      // Quick Actions section (Bottom right)
      contentArea.setFont(&fonts::Orbitron_Light_24);
      contentArea.setTextSize(1);
      contentArea.drawString("Quick Actions", 530, 280);
      contentArea.fillSmoothRoundRect(530, 320, 75, 75, 5, TFT_BLACK);
      contentArea.fillSmoothRoundRect(530 + 87, 320, 75, 75, 5, TFT_BLACK);
      contentArea.fillSmoothRoundRect(530 + 174, 320, 75, 75, 5, TFT_BLACK);
    }
    else if (cur_Screen == SCREEN_FONT) // Font Page
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
    else if (cur_Screen == SCREEN_DEVICE_LIST) // SCREEN_DEVICE_LIST (room list)
    {
      contentArea.fillScreen(TFT_BLACK);
      contentArea.fillSmoothRoundRect(0, 10, 800, 400, 10, TFT_LIGHTGRAY);
      contentArea.setFont(&fonts::FreeSansBold9pt7b);
      contentArea.setTextSize(1);
      contentArea.setTextColor(TFT_DARKGRAY);

      if (Device_list_screen_num == 1)
      {
        // Fetch sensor data for Living Room (ss_001)
        static SensorData livingRoomData;
        static unsigned long lastFetchLivingRoom = 0;

        // Check if we need to fetch data
        bool needsFetch = (millis() - lastFetchLivingRoom > 30000 || !livingRoomData.valid);

        // Mark as loading if starting a fetch
        if (needsFetch && !livingRoomLoading.isLoading)
        {
          livingRoomLoading.isLoading = true;
          livingRoomLoading.loadingStartTime = millis();
        }

        // Perform fetch in non-blocking manner (will complete quickly)
        if (needsFetch)
        {
          bool success = fetchSensorData("ss_001", &livingRoomData);
          lastFetchLivingRoom = millis();
          livingRoomLoading.isLoading = false;
        }

        contentArea.drawString("Living Room", 25, 28);
        contentArea.fillSmoothRoundRect(15, 25 + 25, 460, 150, 15, TFT_WHITE);  // BG
        contentArea.fillSmoothRoundRect(485, 25 + 25, 300, 150, 15, TFT_WHITE); // BG

        contentArea.fillSmoothRoundRect(25, 50 + 10, 140, 130, 15, TFT_CYAN);  // Temp Block
        contentArea.fillSmoothRoundRect(175, 50 + 10, 140, 130, 15, TFT_CYAN); // Gas Block
        contentArea.fillSmoothRoundRect(325, 50 + 10, 140, 130, 15, TFT_CYAN); // Light Block
        contentArea.fillSmoothRoundRect(495, 60, 280, 130, 15, TFT_CYAN);      // Device info block

        contentArea.setFont(&fonts::FreeMonoBold9pt7b);
        contentArea.drawCenterString("Temperature", 95, 165);
        contentArea.drawCenterString("Gas", 245, 165);
        contentArea.drawCenterString("Light", 395, 165);

        contentArea.drawWideLine(25, 150, 165, 150, 4, TFT_WHITE);  // Temp separator
        contentArea.drawWideLine(175, 150, 315, 150, 4, TFT_WHITE); // Gas separator
        contentArea.drawWideLine(320, 150, 465, 150, 4, TFT_WHITE); // Light separator

        // Display real sensor data or loading indicator
        contentArea.setFont(&fonts::DejaVu24);
        contentArea.setTextSize(1);
        if (livingRoomLoading.isLoading)
        {
          // Show loading animation
          drawLoadingIndicator(&contentArea, 95, 90);
          drawLoadingIndicator(&contentArea, 245, 90);
          drawLoadingIndicator(&contentArea, 395, 90);
        }
        else if (livingRoomData.valid)
        {
          char tempStr[20], gasStr[20], lightStr[20];
          snprintf(tempStr, sizeof(tempStr), "%.1f C", livingRoomData.temperature);
          snprintf(gasStr, sizeof(gasStr), "%.0f", livingRoomData.gas_level);
          snprintf(lightStr, sizeof(lightStr), "%.1f lux", livingRoomData.light_lux);

          contentArea.drawCenterString(tempStr, 95, 90);
          contentArea.drawCenterString(gasStr, 245, 90);
          contentArea.drawCenterString(lightStr, 395, 90);
        }
        else
        {
          contentArea.drawCenterString("--", 95, 90);
          contentArea.drawCenterString("--", 245, 90);
          contentArea.drawCenterString("--", 395, 90);
        }

        // Device Information panel
        contentArea.setFont(&fonts::FreeMonoBold9pt7b);
        contentArea.setTextColor(TFT_BLACK);
        contentArea.drawCenterString("Device Information", 630, 70);
        contentArea.setTextColor(TFT_DARKGRAY);

        contentArea.drawString("Device name :", 505, 110);
        if (livingRoomData.valid)
        {
          contentArea.drawString(livingRoomData.device_id, 670, 110);

          // Format and display timestamp
          char timeStr[20];
          formatTimestamp(livingRoomData.last_updated, timeStr, sizeof(timeStr));
          contentArea.drawString("Last Update :", 505, 130);
          contentArea.drawString(timeStr, 670, 130);

          // Display battery
          char batteryStr[10];
          snprintf(batteryStr, sizeof(batteryStr), "%d%%", livingRoomData.battery_percent);
          contentArea.drawString("Battery :", 505, 150);
          contentArea.drawString(batteryStr, 670, 150);
        }
        else
        {
          contentArea.drawString("ss_001", 670, 110);
          contentArea.drawString("Last Update :", 505, 130);
          contentArea.drawString("N/A", 670, 130);
          contentArea.drawString("Battery :", 505, 150);
          contentArea.drawString("N/A", 670, 150);
        }

        // Kitchen section (ss_002)
        static SensorData kitchenData;
        static unsigned long lastFetchKitchen = 0;

        bool needsFetchKitchen = (millis() - lastFetchKitchen > 30000 || !kitchenData.valid);

        if (needsFetchKitchen && !kitchenLoading.isLoading)
        {
          kitchenLoading.isLoading = true;
          kitchenLoading.loadingStartTime = millis();
        }

        if (needsFetchKitchen)
        {
          bool success = fetchSensorData("ss_002", &kitchenData);
          lastFetchKitchen = millis();
          kitchenLoading.isLoading = false;
        }

        contentArea.setFont(&fonts::FreeSansBold9pt7b);
        contentArea.setTextColor(TFT_DARKGRAY);

        contentArea.drawString("Kitchen", 25, 220);
        contentArea.fillSmoothRoundRect(15, 185 + 25 + 30, 460, 150, 15, TFT_WHITE);  // BG
        contentArea.fillSmoothRoundRect(485, 185 + 25 + 30, 300, 150, 15, TFT_WHITE); // BG
        int shift = 30;
        contentArea.fillSmoothRoundRect(25, 210 + 10 + shift, 140, 130, 15, TFT_PINK);  // Temp Block
        contentArea.fillSmoothRoundRect(175, 210 + 10 + shift, 140, 130, 15, TFT_PINK); // Gas Block
        contentArea.fillSmoothRoundRect(325, 210 + 10 + shift, 140, 130, 15, TFT_PINK); // Light Block
        contentArea.fillSmoothRoundRect(495, 220 + shift, 280, 130, 15, TFT_PINK);      // Device info block

        contentArea.setFont(&fonts::FreeMonoBold9pt7b);
        contentArea.drawCenterString("Temperature", 95, 325 + shift);
        contentArea.drawCenterString("Gas", 245, 325 + shift);
        contentArea.drawCenterString("Light", 395, 325 + shift);

        contentArea.drawWideLine(25, 310 + shift, 165, 310 + shift, 4, TFT_WHITE);  // Temp separator
        contentArea.drawWideLine(175, 310 + shift, 315, 310 + shift, 4, TFT_WHITE); // Gas separator
        contentArea.drawWideLine(320, 310 + shift, 465, 310 + shift, 4, TFT_WHITE); // Light separator

        // Display real sensor data for Kitchen or loading indicator
        contentArea.setFont(&fonts::DejaVu24);
        contentArea.setTextSize(1);
        if (kitchenLoading.isLoading)
        {
          drawLoadingIndicator(&contentArea, 95, 250 + shift);
          drawLoadingIndicator(&contentArea, 245, 250 + shift);
          drawLoadingIndicator(&contentArea, 395, 250 + shift);
        }
        else if (kitchenData.valid)
        {
          char tempStr[20], gasStr[20], lightStr[20];
          snprintf(tempStr, sizeof(tempStr), "%.1f C", kitchenData.temperature);
          snprintf(gasStr, sizeof(gasStr), "%.0f", kitchenData.gas_level);
          snprintf(lightStr, sizeof(lightStr), "%.1f lux", kitchenData.light_lux);

          contentArea.drawCenterString(tempStr, 95, 250 + shift);
          contentArea.drawCenterString(gasStr, 245, 250 + shift);
          contentArea.drawCenterString(lightStr, 395, 250 + shift);
        }
        else
        {
          contentArea.drawCenterString("--", 95, 250 + shift);
          contentArea.drawCenterString("--", 245, 250 + shift);
          contentArea.drawCenterString("--", 395, 250 + shift);
        }

        // Device Information for Kitchen
        contentArea.setFont(&fonts::FreeMonoBold9pt7b);
        contentArea.setTextColor(TFT_BLACK);
        contentArea.drawCenterString("Device Information", 630, 230 + shift);
        contentArea.setTextColor(TFT_DARKGRAY);

        contentArea.drawString("Device name :", 505, 270 + shift);
        if (kitchenData.valid)
        {
          contentArea.drawString(kitchenData.device_id, 670, 270 + shift);

          char timeStr[20];
          formatTimestamp(kitchenData.last_updated, timeStr, sizeof(timeStr));
          contentArea.drawString("Last Update :", 505, 290 + shift);
          contentArea.drawString(timeStr, 670, 290 + shift);

          char batteryStr[10];
          snprintf(batteryStr, sizeof(batteryStr), "%d%%", kitchenData.battery_percent);
          contentArea.drawString("Battery :", 505, 310 + shift);
          contentArea.drawString(batteryStr, 670, 310 + shift);
        }
        else
        {
          contentArea.drawString("ss_002", 670, 270 + shift);
          contentArea.drawString("Last Update :", 505, 290 + shift);
          contentArea.drawString("N/A", 670, 290 + shift);
          contentArea.drawString("Battery :", 505, 310 + shift);
          contentArea.drawString("N/A", 670, 310 + shift);
        }
      }
      else if (Device_list_screen_num == 2)
      {
        // Fetch sensor data for Bedroom (ss_003)
        static SensorData bedroomData;
        static unsigned long lastFetchBedroom = 0;

        bool needsFetchBedroom = (millis() - lastFetchBedroom > 30000 || !bedroomData.valid);

        if (needsFetchBedroom && !bedroomLoading.isLoading)
        {
          bedroomLoading.isLoading = true;
          bedroomLoading.loadingStartTime = millis();
        }

        if (needsFetchBedroom)
        {
          bool success = fetchSensorData("ss_003", &bedroomData);
          lastFetchBedroom = millis();
          bedroomLoading.isLoading = false;
        }

        contentArea.drawString("Bedroom", 25, 28);
        contentArea.fillSmoothRoundRect(15, 25 + 25, 460, 150, 15, TFT_WHITE);  // BG
        contentArea.fillSmoothRoundRect(485, 25 + 25, 300, 150, 15, TFT_WHITE); // BG

        contentArea.fillSmoothRoundRect(25, 50 + 10, 140, 130, 15, TFT_GREENYELLOW);  // Temp Block
        contentArea.fillSmoothRoundRect(175, 50 + 10, 140, 130, 15, TFT_GREENYELLOW); // Gas Block
        contentArea.fillSmoothRoundRect(325, 50 + 10, 140, 130, 15, TFT_GREENYELLOW); // Light Block
        contentArea.fillSmoothRoundRect(495, 60, 280, 130, 15, TFT_GREENYELLOW);      // Device info block

        contentArea.setFont(&fonts::FreeMonoBold9pt7b);
        contentArea.drawCenterString("Temperature", 95, 165);
        contentArea.drawCenterString("Gas", 245, 165);
        contentArea.drawCenterString("Light", 395, 165);

        contentArea.drawWideLine(25, 150, 165, 150, 4, TFT_WHITE);  // Temp separator
        contentArea.drawWideLine(175, 150, 315, 150, 4, TFT_WHITE); // Gas separator
        contentArea.drawWideLine(320, 150, 465, 150, 4, TFT_WHITE); // Light separator

        // Display real sensor data for Bedroom or loading indicator
        contentArea.setFont(&fonts::DejaVu24);
        contentArea.setTextSize(1);
        if (bedroomLoading.isLoading)
        {
          drawLoadingIndicator(&contentArea, 95, 90);
          drawLoadingIndicator(&contentArea, 245, 90);
          drawLoadingIndicator(&contentArea, 395, 90);
        }
        else if (bedroomData.valid)
        {
          char tempStr[20], gasStr[20], lightStr[20];
          snprintf(tempStr, sizeof(tempStr), "%.1f C", bedroomData.temperature);
          snprintf(gasStr, sizeof(gasStr), "%.0f", bedroomData.gas_level);
          snprintf(lightStr, sizeof(lightStr), "%.1f lux", bedroomData.light_lux);

          contentArea.drawCenterString(tempStr, 95, 90);
          contentArea.drawCenterString(gasStr, 245, 90);
          contentArea.drawCenterString(lightStr, 395, 90);
        }
        else
        {
          contentArea.drawCenterString("--", 95, 90);
          contentArea.drawCenterString("--", 245, 90);
          contentArea.drawCenterString("--", 395, 90);
        }

        // Device Information panel for Bedroom
        contentArea.setFont(&fonts::FreeMonoBold9pt7b);
        contentArea.setTextColor(TFT_BLACK);
        contentArea.drawCenterString("Device Information", 630, 70);
        contentArea.setTextColor(TFT_DARKGRAY);

        contentArea.drawString("Device name :", 505, 110);
        if (bedroomData.valid)
        {
          contentArea.drawString(bedroomData.device_id, 670, 110);

          char timeStr[20];
          formatTimestamp(bedroomData.last_updated, timeStr, sizeof(timeStr));
          contentArea.drawString("Last Update :", 505, 130);
          contentArea.drawString(timeStr, 670, 130);

          char batteryStr[10];
          snprintf(batteryStr, sizeof(batteryStr), "%d%%", bedroomData.battery_percent);
          contentArea.drawString("Battery :", 505, 150);
          contentArea.drawString(batteryStr, 670, 150);
        }
        else
        {
          contentArea.drawString("ss_003", 670, 110);
          contentArea.drawString("Last Update :", 505, 130);
          contentArea.drawString("N/A", 670, 130);
          contentArea.drawString("Battery :", 505, 150);
          contentArea.drawString("N/A", 670, 150);
        }
      }
    }

    else if (cur_Screen == SCREEN_BUTTON_EXAMPLE) // Button example
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
    else if (cur_Screen == SCREEN_ROOM_DETAIL) // Room Detail Page
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
    else if (cur_Screen == SCREEN_ENTER_PIN) // Enter Pin
    {
      contentArea.fillScreen(TFT_BLACK);
      contentArea.setTextColor(TFT_WHITE);
      contentArea.setFont(&fonts::Orbitron_Light_24);
      contentArea.setTextSize(2);
      contentArea.drawCenterString("PlEASE ENTER PIN", 400, 20);
      contentArea.setTextSize(2);
      contentArea.drawWideLine(250, 180, 310, 180, 3, TFT_WHITE);
      contentArea.drawWideLine(330, 180, 390, 180, 3, TFT_WHITE);
      contentArea.drawWideLine(410, 180, 470, 180, 3, TFT_WHITE);
      contentArea.drawWideLine(490, 180, 550, 180, 3, TFT_WHITE);
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
    else if (cur_Screen == SCREEN_INFORMATION) // Information Page
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

    else if (cur_Screen == SCREEN_ROOM_DETAIL_GAS) // Room Detail Gas Page
    {
      contentArea.fillScreen(TFT_BLACK);
      contentArea.setTextColor(TFT_WHITE);
      contentArea.setFont(&fonts::Orbitron_Light_24);
      contentArea.setTextSize(3);
      contentArea.drawString("Bed Room", 10, 10);
      contentArea.fillSmoothRoundRect(790, 100, 10, 180, 3, TFT_WHITE);
      contentArea.fillSmoothRoundRect(530 - 520, 100, 250, 310, 10, TFT_WHITE);
      contentArea.fillSmoothRoundRect(530 - 260, 100, 250, 310, 10, TFT_WHITE);
      contentArea.fillSmoothRoundRect(530, 100, 250, 310, 10, TFT_WHITE);
      contentArea.setTextColor(TFT_BLACK);
      contentArea.setTextSize(2);
      contentArea.drawCenterString("Gas", 135, 100);
      contentArea.drawCenterString("Humidity", 135 + 260, 100);
      contentArea.drawCenterString("LIGHT", 135 + 520, 100);

      contentArea.setTextSize(4);
      contentArea.drawCenterString("4", 135, 190);
      contentArea.drawCenterString("57", 135 + 250, 190);
      contentArea.drawCenterString("38", 135 + 500, 190);
      contentArea.setTextSize(1);
      contentArea.drawCenterString("more information", 135, 360);
      contentArea.drawCenterString("more information", 135 + 260, 360);
      contentArea.drawCenterString("more information", 135 + 520, 360);
    }
    else if (cur_Screen == SCREEN_TEMP_1) // temp
    {
      contentArea.fillScreen(TFT_BLACK);
      contentArea.setTextColor(TFT_WHITE);
      contentArea.setFont(&fonts::Orbitron_Light_24);
      contentArea.setTextSize(3);
      contentArea.drawString("temperature", 10, 10);
      contentArea.fillSmoothRoundRect(10, 100, 740, 300, 10, TFT_WHITE);
      contentArea.setTextColor(TFT_BLACK);
      contentArea.drawCenterString("Graph", 380, 250);
    }
    else if (cur_Screen == SCREEN_TEMP_2) // temp
    {
      contentArea.fillScreen(TFT_BLACK);
      contentArea.setTextColor(TFT_WHITE);
      contentArea.setFont(&fonts::Orbitron_Light_24);
      contentArea.setTextSize(3);
      contentArea.drawString("CALLING", 10, 10);
      contentArea.fillSmoothRoundRect(10, 100, 590, 300, 10, TFT_WHITE);
    }
    else if (cur_Screen == SCREEN_MASTER_MENU) // MASTER MENU PAGE
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
      drawTemperatureIcon(x1 + boxW / 2, y1 + 55);
      contentArea.setTextColor(TFT_BLACK);
      contentArea.drawCenterString("Temperature", x1 + boxW / 2, y1 + 120);

      // ==== HUMIDITY ====
      contentArea.fillSmoothRoundRect(x2, y1, boxW, boxH, 15, TFT_WHITE);
      drawHumidityIcon(x2 + boxW / 2, y1 + 55);
      contentArea.drawCenterString("Humidity", x2 + boxW / 2, y1 + 120);

      // ==== LIGHT ====
      contentArea.fillSmoothRoundRect(x3, y1, boxW, boxH, 15, TFT_WHITE);
      drawLightIcon(x3 + boxW / 2, y1 + 55);
      contentArea.drawCenterString("Light", x3 + boxW / 2, y1 + 120);

      // ==== GAS ====
      contentArea.fillSmoothRoundRect(x1, y2, boxW, boxH, 15, TFT_WHITE);
      drawGasIcon(x1 + boxW / 2, y2 + 55);
      contentArea.drawCenterString("Gas / Air", x1 + boxW / 2, y2 + 120);

      // ==== ROOMS ====
      contentArea.fillSmoothRoundRect(x2, y2, boxW, boxH, 15, TFT_WHITE);
      drawRoomIcon(x2 + boxW / 2, y2 + 55);
      contentArea.drawCenterString("Rooms", x2 + boxW / 2, y2 + 120);

      // ==== SETTINGS ====
      contentArea.fillSmoothRoundRect(x3, y2, boxW, boxH, 15, TFT_WHITE);
      drawGearIcon(x3 + boxW / 2, y2 + 55);
      contentArea.drawCenterString("Settings", x3 + boxW / 2, y2 + 120);
    }
    else if (cur_Screen == SCREEN_NOTIFICATION_LOG) // Notification Log
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
  botBar.clear();

  if (cur_Screen == SCREEN_HOME)
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
  else if (cur_Screen == SCREEN_DEVICE_LIST)
  {
    botBar.setTextColor(TFT_WHITE);
    botBar.setTextSize(2);

    // Draw menu options
    botBar.drawCenterString("Home", 120, 5);
    botBar.drawCenterString("v", 310, 5);
    botBar.drawCenterString("Refresh", 500, 5);
    botBar.drawCenterString("Menu", 690, 5);
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
  contentArea.fillSmoothCircle(x + 45, y + h / 2 - 5, 25, iconColor);
  contentArea.drawCircle(x + 45, y + h / 2 - 5, 25, TFT_BLACK);

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

// ============================================================================
// Page Transition Animation
// Shows page name in center of screen with fade effect
// ============================================================================
void playPageTransition(const char *pageName)
{
  // Clear content area
  contentArea.fillScreen(TFT_BLACK);

  // Set up text properties
  contentArea.setTextSize(1);
  contentArea.setFont(&fonts::FreeSansBold18pt7b);

  // Calculate center position
  int centerX = contentArea.width() / 2;
  int centerY = contentArea.height() / 2 - 20;

  // Draw border around text area (larger box)
  int borderWidth = 400;
  int borderHeight = 100;
  int borderX = centerX - borderWidth / 2;
  int borderY = centerY - borderHeight / 2;

  contentArea.drawRect(borderX, borderY, borderWidth, borderHeight, TFT_WHITE);
  contentArea.drawRect(borderX + 1, borderY + 1, borderWidth - 2, borderHeight - 2, TFT_WHITE);
  contentArea.drawRect(borderX + 2, borderY + 2, borderWidth - 4, borderHeight - 4, TFT_WHITE);

  // Draw page name in center
  contentArea.setTextColor(TFT_WHITE);
  contentArea.drawCenterString(pageName, centerX, centerY - 10);

  contentArea.pushSprite(0, 40);
  delay(400);

  // Final clear
  contentArea.fillScreen(TFT_BLACK);
  contentArea.pushSprite(0, 40);
}

void switchDeviceContext()
{
  skipPageTransition = true; // Don't animate when paginating
  contentNeedsUpdate = true;
  if (Device_list_screen_num == 1)
    Device_list_screen_num = 2;
  else
    Device_list_screen_num = 1;
}