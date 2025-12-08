#include "touch_handler.h"
#include "screen_definitions.h"
#include "touch_button.h"
#include "GUI/screen_manager.h"
#include <Arduino.h>
#include <WiFi.h>
#include "hub_network.h"

// File-scope static variable to track alert loading state
static bool alertsLoaded = false;
static int hoveredAlertIndex = -1; // Keep static as it's internal to this file
static bool showWifiInfoPopup = false; // Track WiFi info popup state

// Function to reset the alert loading flag
void resetAlertsLoadedFlag() {
  alertsLoaded = false;
}

// External declarations (defined here)
TouchButton alertButtons[5];
Alert alerts[5];
int selectedAlertIndex = -1;

TouchButton QuickButton1;
TouchButton QuickButton2;
TouchButton QuickButton3;
TouchButton moreEnvironment;
TouchButton backButton;
TouchButton wifiInfoButton; // Button for WiFi icon in top-right
TouchButton exampleButton1;
TouchButton exampleButton2;
TouchButton exampleButton3;


// screen 4
TouchButton PIN_1;
TouchButton PIN_2;
TouchButton PIN_3;
TouchButton PIN_4;
TouchButton PIN_5;
TouchButton PIN_6;
TouchButton PIN_7;
TouchButton PIN_8;
TouchButton PIN_9;
TouchButton PIN_0;
TouchButton PIN_del;
TouchButton PIN_en;

// screen 9
TouchButton CALL_end;
TouchButton CALL_mute;
TouchButton CALL_cmic;

// Touch handling for all screens
void handleTouchInput()
{
  // Fill with transparent color (green)
  touchArea.fillSprite(TFT_GREEN);
  touchAreaNeedsUpdate = true; // update touch objects every frame (100ms)
  
  if (cur_Screen == SCREEN_HOME)
  {
    // Home screen touch handling
    {
      // Initialize buttons on first entry
      static bool buttonsInitialized = false;

      if (!alertsLoaded) {
        alertsLoaded = fetchHomeAlerts(alerts, 5);
      }

      if (!buttonsInitialized)
      {
        QuickButton1.x = 530;
        QuickButton1.y = 360;
        QuickButton1.width = 75;
        QuickButton1.height = 75;

        QuickButton2.x = 530+87;
        QuickButton2.y = 360;
        QuickButton2.width = 75;
        QuickButton2.height = 75;

        QuickButton3.x = 530+174;
        QuickButton3.y = 360;
        QuickButton3.width = 75;
        QuickButton3.height = 75;


        moreEnvironment.x = 720;
        moreEnvironment.y = 60;
        moreEnvironment.width = 60;
        moreEnvironment.height = 30;

        for (int i = 0; i < 5; i++) {
          alertButtons[i].x = 20;
          alertButtons[i].y = 60 + i * 70;
          alertButtons[i].width = 480;
          alertButtons[i].height = 60;
        }

        // WiFi info button (top-right area, WiFi icon region)
        wifiInfoButton.x = 720;
        wifiInfoButton.y = 0;
        wifiInfoButton.width = 80;
        wifiInfoButton.height = 40;

        buttonsInitialized = true;
      }

      // Detect hover
      hoveredAlertIndex = -1;
      if (!currentTouch.isPressed) { // Only check hover if not actively pressing
        for (int i = 0; i < 5; i++) {
          if (alerts[i].valid && isTouchInBounds(currentTouch.x, currentTouch.y - 40, alertButtons[i].x, alertButtons[i].y, alertButtons[i].width, alertButtons[i].height)) {
            hoveredAlertIndex = i;
            break;
          }
        }
      }

      if (alertsLoaded)
      {
        // Draw each alert with layered frame styling
        int yPos = 60 + 40; // Shift down by 40 for top bar
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

            // Apply hover effect or pressed effect
            bool isPressed = alertButtons[i].isPressed && !alertButtons[i].isDragging;
            if (isPressed) {
              levelColor = lightenColor(levelColor, 80); // Brighten more when pressed
            } else if (i == hoveredAlertIndex) {
              levelColor = lightenColor(levelColor, 40); // Lighten color on hover
            }

            // Layered frame effect
            touchArea.fillSmoothRoundRect(20, yPos, 480, 60, 10, TFT_BLACK);     // outer frame
            touchArea.fillSmoothRoundRect(25, yPos + 5, 470, 50, 8, levelColor); // color layer
            touchArea.fillSmoothRoundRect(35, yPos + 5, 460, 50, 8, TFT_BLACK);  // inner frame
            touchArea.fillSmoothRoundRect(40, yPos + 5, 455, 50, 8, TFT_WHITE);  // content area

            // Draw alert text
            touchArea.setFont(&fonts::DejaVu12);
            touchArea.setTextColor(TFT_BLACK);
            touchArea.setTextSize(1);
            touchArea.drawString(alerts[i].message, 50, yPos + 12);

            // Draw timestamp (smaller, right-aligned)
            touchArea.setTextColor(TFT_DARKGREY);
            touchArea.drawRightString(alerts[i].timestamp, 480, yPos + 35);
          }
          else
          {
            // Empty slot - gray placeholder
            touchArea.fillSmoothRoundRect(20, yPos, 480, 60, 10, TFT_BLACK);
            touchArea.fillSmoothRoundRect(25, yPos + 5, 470, 50, 8, TFT_LIGHTGRAY);
            touchArea.fillSmoothRoundRect(35, yPos + 5, 460, 50, 8, TFT_BLACK);
            touchArea.fillSmoothRoundRect(40, yPos + 5, 455, 50, 8, TFT_DARKGREY);
          }
          yPos += 70;
        }
      }
      else
      {
        // Failed to load alerts - show placeholder slots
        int yPos = 60 + 40; // Shift down by 40 for top bar
        for (int i = 0; i < 5; i++)
        {
          touchArea.fillSmoothRoundRect(20, yPos, 480, 60, 10, TFT_BLACK);
          touchArea.fillSmoothRoundRect(25, yPos + 5, 470, 50, 8, TFT_LIGHTGRAY);
          touchArea.fillSmoothRoundRect(35, yPos + 5, 460, 50, 8, TFT_BLACK);
          touchArea.fillSmoothRoundRect(40, yPos + 5, 455, 50, 8, TFT_DARKGREY);
          yPos += 70;
        }

        // Show error message on first slot
        touchArea.setFont(&fonts::DejaVu12);
        touchArea.setTextColor(TFT_WHITE);
        touchArea.setTextSize(1);
        touchArea.drawString("Failed to load alerts", 50, 75);
      }

      // Handle alert clicks
      for (int i = 0; i < 5; i++) {
        if (alerts[i].valid) {
          bool alertClicked = updateTouchButton(&alertButtons[i], currentTouch.x, currentTouch.y - 40, currentTouch.isPressed);
          if (alertClicked) {
            Serial.printf("Alert clicked: %s\n", alerts[i].message);
            selectedAlertIndex = i;
            cur_Screen = SCREEN_ALERT_DETAIL;
            break; // Only one alert can be clicked at a time
          }
        }
      }

      // Update button states (no offset needed since touchArea is positioned at Y=40)
      // Debug: Print touch coordinates when touching
      // if (currentTouch.isPressed) {
      //   Serial.printf("Touch: (%d,%d) in touchArea coords: (%d,%d)\n",
      //     currentTouch.x, currentTouch.y, currentTouch.x, currentTouch.y);
      // }

      bool qt1Clicked = updateTouchButton(&QuickButton1, currentTouch.x, currentTouch.y, currentTouch.isPressed);
      bool qt2Clicked = updateTouchButton(&QuickButton2, currentTouch.x, currentTouch.y, currentTouch.isPressed);
      bool snapshotsClicked = updateTouchButton(&QuickButton3, currentTouch.x, currentTouch.y, currentTouch.isPressed);

      bool MoreEnvironmentClicked = updateTouchButton(&moreEnvironment, currentTouch.x, currentTouch.y, currentTouch.isPressed);
      
      // Draw Quick Button 1
      uint16_t qt1Color = TFT_DARKGREY;
      if (QuickButton1.isPressed && !QuickButton1.isDragging)
      {
        qt1Color = TFT_LIGHTGREY;
      }
      touchArea.fillSmoothRoundRect(QuickButton1.x, QuickButton1.y, QuickButton1.width, QuickButton1.height, 10, qt1Color);
      touchArea.setTextColor(TFT_WHITE);
      touchArea.setTextSize(1);
      touchArea.setFont(&fonts::DejaVu9);
      touchArea.drawCenterString("Lock", QuickButton1.x + QuickButton1.width / 2, QuickButton1.y + QuickButton1.height / 2 - 5);

      uint16_t qt2Color = TFT_DARKGREY;
      if (QuickButton2.isPressed && !QuickButton2.isDragging)
      {
        qt2Color = TFT_LIGHTGREY;
      }
      touchArea.fillSmoothRoundRect(QuickButton2.x, QuickButton2.y, QuickButton2.width, QuickButton2.height, 10, qt2Color);
      touchArea.setTextColor(TFT_WHITE);
      touchArea.setTextSize(1);
      touchArea.setFont(&fonts::DejaVu9);
      touchArea.drawCenterString("Unlock", QuickButton2.x + QuickButton2.width / 2, QuickButton2.y + QuickButton2.height / 2 - 5);

      uint16_t qt3Color = TFT_DARKGREY;
      if (QuickButton3.isPressed && !QuickButton3.isDragging)
      {
        qt3Color = TFT_LIGHTGREY;
      }
      touchArea.fillSmoothRoundRect(QuickButton3.x, QuickButton3.y, QuickButton3.width, QuickButton3.height, 10, qt3Color);
      touchArea.setTextColor(TFT_WHITE);
      touchArea.setTextSize(1);
      touchArea.drawCenterString("Snaps", QuickButton3.x + QuickButton3.width / 2, QuickButton3.y + QuickButton3.height / 2 - 8);

      uint16_t MAColor = TFT_GREEN;
      if (moreEnvironment.isPressed && !moreEnvironment.isDragging)
      {
        qt1Color = TFT_DARKGREEN;
      }
      touchArea.fillSmoothRoundRect(moreEnvironment.x, moreEnvironment.y, moreEnvironment.width, moreEnvironment.height, 10, MAColor);
      touchArea.setTextColor(TFT_WHITE);
      touchArea.setTextSize(1);
      touchArea.drawCenterString("more", moreEnvironment.x + moreEnvironment.width / 2, moreEnvironment.y + moreEnvironment.height / 2 - 8);


      // Display click feedback
      touchArea.setTextSize(1);
      touchArea.setFont(&fonts::DejaVu18);
      int feedbackY = 250;

      if (qt1Clicked)
      {
        // Lock the door
        Serial.println("[QuickAction] Lock button clicked!");
        bool success = sendLockCommand("dl_001"); // Replace with your actual door lock device ID

        touchArea.setTextColor(success ? TFT_GREEN : TFT_RED);
        touchArea.drawString(success ? "Door Locked!" : "Lock Failed!", 50, feedbackY);
      }

      if (qt2Clicked)
      {
        // Unlock the door (with 30 second auto-lock)
        Serial.println("[QuickAction] Unlock button clicked!");
        bool success = sendUnlockCommand("dl_001", 30); // Replace with your actual door lock device ID, 30s duration

        touchArea.setTextColor(success ? TFT_GREEN : TFT_RED);
        touchArea.drawString(success ? "Door Unlocked!" : "Unlock Failed!", 50, feedbackY+40);
      }

      if (snapshotsClicked)
      {
        cur_Screen = SCREEN_DOORBELL_SNAPSHOTS;
      }
      if (MoreEnvironmentClicked)
      {
        touchArea.setTextColor(TFT_GREEN);
        touchArea.drawString("more Alter", 50, feedbackY-40);
        Serial.println("more Alter clicked!");
      }

      // Handle WiFi info button (top-right)
      bool wifiInfoClicked = updateTouchButton(&wifiInfoButton, currentTouch.x, currentTouch.y, currentTouch.isPressed);
      if (wifiInfoClicked)
      {
        showWifiInfoPopup = !showWifiInfoPopup; // Toggle popup
        Serial.println(showWifiInfoPopup ? "WiFi Info Popup opened" : "WiFi Info Popup closed");
      }

      // Draw WiFi Info Popup if active
      if (showWifiInfoPopup)
      {
        // Stylish popup with gradient-like layered design
        int popupX = 520;
        int popupY = 50;
        int popupW = 270;
        int popupH = 320;

        // Outer shadow/border
        touchArea.fillSmoothRoundRect(popupX - 3, popupY - 3, popupW + 6, popupH + 6, 15, TFT_DARKGREY);

        // Main background with accent border
        touchArea.fillSmoothRoundRect(popupX, popupY, popupW, popupH, 12, 0x2965); // Dark blue border
        touchArea.fillSmoothRoundRect(popupX + 3, popupY + 3, popupW - 6, popupH - 6, 10, TFT_WHITE);

        // Header bar with gradient effect
        touchArea.fillSmoothRoundRect(popupX + 3, popupY + 3, popupW - 6, 40, 10, 0x4A69); // Medium blue
        touchArea.fillSmoothRoundRect(popupX + 3, popupY + 20, popupW - 6, 23, 0, 0x3186); // Lighter blue gradient

        // Header text
        touchArea.setFont(&fonts::DejaVu12);
        touchArea.setTextColor(TFT_WHITE);
        touchArea.setTextSize(1);
        touchArea.drawCenterString("System Information", popupX + popupW / 2, popupY + 15);

        // Content area
        int contentY = popupY + 55;
        touchArea.setFont(&fonts::DejaVu9);
        touchArea.setTextColor(TFT_BLACK);

        // WiFi Information Section
        touchArea.setTextColor(0x4A69); // Section header in blue
        touchArea.drawString("WiFi Connection", popupX + 15, contentY);
        contentY += 20;

        touchArea.setTextColor(TFT_DARKGREY);
        if (WiFi.status() == WL_CONNECTED)
        {
          char wifiInfo[50];

          // SSID
          touchArea.drawString("SSID:", popupX + 20, contentY);
          touchArea.setTextColor(TFT_BLACK);
          touchArea.drawString(WiFi.SSID().c_str(), popupX + 70, contentY);
          contentY += 18;

          // IP Address
          touchArea.setTextColor(TFT_DARKGREY);
          touchArea.drawString("IP:", popupX + 20, contentY);
          touchArea.setTextColor(TFT_BLACK);
          snprintf(wifiInfo, sizeof(wifiInfo), "%s", WiFi.localIP().toString().c_str());
          touchArea.drawString(wifiInfo, popupX + 70, contentY);
          contentY += 18;

          // Signal Strength
          touchArea.setTextColor(TFT_DARKGREY);
          touchArea.drawString("Signal:", popupX + 20, contentY);
          touchArea.setTextColor(TFT_BLACK);
          int32_t rssi = WiFi.RSSI();
          snprintf(wifiInfo, sizeof(wifiInfo), "%d dBm", rssi);
          touchArea.drawString(wifiInfo, popupX + 70, contentY);

          // Signal quality indicator
          uint16_t signalColor = TFT_RED;
          if (rssi >= -50) signalColor = TFT_GREEN;
          else if (rssi >= -60) signalColor = 0x7E0; // Light green
          else if (rssi >= -70) signalColor = TFT_ORANGE;
          touchArea.fillSmoothCircle(popupX + popupW - 25, contentY + 5, 6, signalColor);
          contentY += 22;

          // MAC Address
          touchArea.setTextColor(TFT_DARKGREY);
          touchArea.drawString("MAC:", popupX + 20, contentY);
          touchArea.setTextColor(TFT_BLACK);
          touchArea.setFont(&fonts::DejaVu12);
          touchArea.drawString(WiFi.macAddress().c_str(), popupX + 70, contentY + 2);
          touchArea.setFont(&fonts::DejaVu9);
          contentY += 25;
        }
        else
        {
          touchArea.setTextColor(TFT_RED);
          touchArea.drawString("Not Connected", popupX + 20, contentY);
          contentY += 25;
        }

        // Separator line
        touchArea.drawFastHLine(popupX + 15, contentY, popupW - 30, 0xCE79); // Light gray line
        contentY += 15;

        // Doorbell Information Section
        touchArea.setTextColor(0x4A69); // Section header in blue
        touchArea.drawString("Doorbell Status", popupX + 15, contentY);
        contentY += 20;

        touchArea.setTextColor(TFT_DARKGREY);
        if (doorbellOnline && doorbellStatus.data_valid)
        {
          touchArea.drawString("Status:", popupX + 20, contentY);
          touchArea.setTextColor(TFT_GREEN);
          touchArea.drawString("Online", popupX + 80, contentY);
          touchArea.fillSmoothCircle(popupX + popupW - 25, contentY + 5, 6, TFT_GREEN);
          contentY += 18;

          touchArea.setTextColor(TFT_DARKGREY);
          touchArea.drawString("Last Seen:", popupX + 20, contentY);
          touchArea.setTextColor(TFT_BLACK);
          touchArea.setFont(&fonts::DejaVu12);
          touchArea.drawString(doorbellStatus.last_seen.c_str(), popupX + 20, contentY + 12);
          touchArea.setFont(&fonts::DejaVu9);
          contentY += 28;

          touchArea.setTextColor(TFT_DARKGREY);
          touchArea.drawString("WiFi RSSI:", popupX + 20, contentY);
          touchArea.setTextColor(TFT_BLACK);
          char rssiStr[20];
          snprintf(rssiStr, sizeof(rssiStr), "%d dBm", doorbellStatus.wifi_rssi);
          touchArea.drawString(rssiStr, popupX + 95, contentY);

          // Signal indicator
          uint16_t rssiColor = TFT_RED;
          if (doorbellStatus.wifi_rssi >= -50) rssiColor = TFT_GREEN;
          else if (doorbellStatus.wifi_rssi >= -60) rssiColor = 0x7E0;
          else if (doorbellStatus.wifi_rssi >= -70) rssiColor = TFT_ORANGE;
          touchArea.fillSmoothCircle(popupX + popupW - 25, contentY + 5, 6, rssiColor);
          contentY += 18;

          touchArea.setTextColor(TFT_DARKGREY);
          touchArea.drawString("Free Heap:", popupX + 20, contentY);
          touchArea.setTextColor(TFT_BLACK);
          char heapStr[20];
          snprintf(heapStr, sizeof(heapStr), "%d KB", doorbellStatus.free_heap / 1024);
          touchArea.drawString(heapStr, popupX + 95, contentY);
          contentY += 22;
        }
        else
        {
          touchArea.drawString("Status:", popupX + 20, contentY);
          touchArea.setTextColor(TFT_RED);
          touchArea.drawString("Offline", popupX + 80, contentY);
          touchArea.fillSmoothCircle(popupX + popupW - 25, contentY + 5, 6, TFT_RED);
          contentY += 25;
        }

        // Close instruction at bottom
        touchArea.setFont(&fonts::DejaVu12);
        touchArea.setTextColor(TFT_DARKGREY);
        touchArea.drawCenterString("Tap icon again to close", popupX + popupW / 2, popupY + popupH - 18);
      }
    }
  }
  else if (cur_Screen == SCREEN_DOORBELL_SNAPSHOTS || cur_Screen == SCREEN_ALERT_DETAIL)
  {
    static bool buttonInitialized = false;
    if(!buttonInitialized)
    {
      backButton.x = 20;
      backButton.y = 420; // Adjusted for new layout
      backButton.width = 100;
      backButton.height = 40;
      buttonInitialized = true;
    }

    bool backClicked = updateTouchButton(&backButton, currentTouch.x, currentTouch.y, currentTouch.isPressed);

    if(backClicked)
    {
      cur_Screen = SCREEN_HOME;
    }
  }
  else if (cur_Screen == SCREEN_BUTTON_EXAMPLE)
  {
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

      // Update button states (no offset needed since touchArea is positioned at Y=40)
      // Debug: Print touch coordinates when touching
      if (currentTouch.isPressed) {
        Serial.printf("Touch: (%d,%d) in touchArea coords: (%d,%d)\n",
          currentTouch.x, currentTouch.y, currentTouch.x, currentTouch.y);
      }

      bool btn1Clicked = updateTouchButton(&exampleButton1, currentTouch.x, currentTouch.y, currentTouch.isPressed);
      bool btn2Clicked = updateTouchButton(&exampleButton2, currentTouch.x, currentTouch.y, currentTouch.isPressed);
      bool btn3Clicked = updateTouchButton(&exampleButton3, currentTouch.x, currentTouch.y, currentTouch.isPressed);

      // Draw Button 1
      uint16_t btn1Color = TFT_DARKGREY;
      if (exampleButton1.isPressed && !exampleButton1.isDragging)
      {
        btn1Color = TFT_LIGHTGREY;
      }
      touchArea.fillSmoothRoundRect(exampleButton1.x, exampleButton1.y, exampleButton1.width, exampleButton1.height, 10, btn1Color);
      touchArea.setTextColor(TFT_WHITE);
      touchArea.setTextSize(2);
      touchArea.drawCenterString("Button 1", exampleButton1.x + exampleButton1.width / 2, exampleButton1.y + exampleButton1.height / 2 - 8);

      // Draw Button 2
      uint16_t btn2Color = TFT_DARKGREY;
      if (exampleButton2.isPressed && !exampleButton2.isDragging)
      {
        btn2Color = TFT_LIGHTGREY;
      }
      touchArea.fillSmoothRoundRect(exampleButton2.x, exampleButton2.y, exampleButton2.width, exampleButton2.height, 10, btn2Color);
      touchArea.drawCenterString("Button 2", exampleButton2.x + exampleButton2.width / 2, exampleButton2.y + exampleButton2.height / 2 - 8);

      // Draw Button 3
      uint16_t btn3Color = TFT_DARKGREY;
      if (exampleButton3.isPressed && !exampleButton3.isDragging)
      {
        btn3Color = TFT_LIGHTGREY;
      }
      touchArea.fillSmoothRoundRect(exampleButton3.x, exampleButton3.y, exampleButton3.width, exampleButton3.height, 10, btn3Color);
      touchArea.drawCenterString("Button 3", exampleButton3.x + exampleButton3.width / 2, exampleButton3.y + exampleButton3.height / 2 - 8);

      // Display click feedback
      touchArea.setTextSize(1);
      touchArea.setFont(&fonts::DejaVu18);
      int feedbackY = 250;

      if (btn1Clicked)
      {
        touchArea.setTextColor(TFT_GREEN);
        touchArea.drawString("Button 1 Clicked!", 50, feedbackY);
        Serial.println("Button 1 clicked!");
      }
      if (btn2Clicked)
      {
        touchArea.setTextColor(TFT_CYAN);
        touchArea.drawString("Button 2 Clicked!", 50, feedbackY + 40);
        Serial.println("Button 2 clicked!");
      }
      if (btn3Clicked)
      {
        touchArea.setTextColor(TFT_YELLOW);
        touchArea.drawString("Button 3 Clicked!", 50, feedbackY + 80);
        Serial.println("Button 3 clicked!");
      }
    }
    
  }
  else if (cur_Screen == SCREEN_ENTER_PIN)
  {
    {
      // Initialize buttons on first entry
      static bool buttonsInitialized = false;
      if (!buttonsInitialized)
      {

        PIN_1.x = 205;
        PIN_1.y = 190+40;
        PIN_1.width = 90;
        PIN_1.height = 60;

        PIN_2.x = 305;
        PIN_2.y = 190+40;
        PIN_2.width = 90;
        PIN_2.height = 60;
        
        PIN_3.x = 405;
        PIN_3.y = 190+40;
        PIN_3.width = 90;
        PIN_3.height = 60;
        
        PIN_del.x = 505;
        PIN_del.y = 190+40;
        PIN_del.width = 90;
        PIN_del.height = 60;
        
        PIN_4.x = 205;
        PIN_4.y = 190+110;
        PIN_4.width = 90;
        PIN_4.height = 60;
        
        PIN_5.x = 305;
        PIN_5.y = 190+110;
        PIN_5.width = 90;
        PIN_5.height = 60;
        
        PIN_6.x = 405;
        PIN_6.y = 190+110;
        PIN_6.width = 90;
        PIN_6.height = 60;
        
        PIN_0.x = 505;
        PIN_0.y = 190+110;
        PIN_0.width = 90;
        PIN_0.height = 60;
        
        PIN_7.x = 205;
        PIN_7.y = 190+180;
        PIN_7.width = 90;
        PIN_7.height = 60;
        
        PIN_8.x = 305;
        PIN_8.y = 190+180;
        PIN_8.width = 90;
        PIN_8.height = 60;
        
        PIN_9.x = 405;
        PIN_9.y = 190+180;
        PIN_9.width = 90;
        PIN_9.height = 60;
        
        PIN_en.x = 505;
        PIN_en.y = 190+180;
        PIN_en.width = 90;
        PIN_en.height = 60;
        
        

        buttonsInitialized = true;
      }

      if (currentTouch.isPressed) {
        Serial.printf("Touch: (%d,%d) in touchArea coords: (%d,%d)\n",
          currentTouch.x, currentTouch.y, currentTouch.x, currentTouch.y);
      }

      bool PIN_1_cl = updateTouchButton(&PIN_1, currentTouch.x, currentTouch.y, currentTouch.isPressed);
      bool PIN_2_cl = updateTouchButton(&PIN_2, currentTouch.x, currentTouch.y, currentTouch.isPressed);
      bool PIN_3_cl = updateTouchButton(&PIN_3, currentTouch.x, currentTouch.y, currentTouch.isPressed);
      bool PIN_4_cl = updateTouchButton(&PIN_4, currentTouch.x, currentTouch.y, currentTouch.isPressed);
      bool PIN_5_cl = updateTouchButton(&PIN_5, currentTouch.x, currentTouch.y, currentTouch.isPressed);
      bool PIN_6_cl = updateTouchButton(&PIN_6, currentTouch.x, currentTouch.y, currentTouch.isPressed);
      bool PIN_7_cl = updateTouchButton(&PIN_7, currentTouch.x, currentTouch.y, currentTouch.isPressed);
      bool PIN_8_cl = updateTouchButton(&PIN_8, currentTouch.x, currentTouch.y, currentTouch.isPressed);
      bool PIN_9_cl = updateTouchButton(&PIN_9, currentTouch.x, currentTouch.y, currentTouch.isPressed);
      bool PIN_0_cl = updateTouchButton(&PIN_0, currentTouch.x, currentTouch.y, currentTouch.isPressed);
      bool PIN_del_cl = updateTouchButton(&PIN_del, currentTouch.x, currentTouch.y, currentTouch.isPressed);
      bool PIN_en_cl = updateTouchButton(&PIN_en, currentTouch.x, currentTouch.y, currentTouch.isPressed);

      uint16_t PIN_1_color = TFT_LIGHTGREY;
      uint16_t PIN_2_color = TFT_LIGHTGREY;
      uint16_t PIN_3_color = TFT_LIGHTGREY;
      uint16_t PIN_4_color = TFT_LIGHTGREY;
      uint16_t PIN_5_color = TFT_LIGHTGREY;
      uint16_t PIN_6_color = TFT_LIGHTGREY;
      uint16_t PIN_7_color = TFT_LIGHTGREY;
      uint16_t PIN_8_color = TFT_LIGHTGREY;
      uint16_t PIN_9_color = TFT_LIGHTGREY;
      uint16_t PIN_0_color = TFT_LIGHTGREY;
      uint16_t PIN_del_color = TFT_LIGHTGREY;
      uint16_t PIN_en_color = TFT_LIGHTGREY;


      if (PIN_1.isPressed && !PIN_1.isDragging)
      {
        PIN_1_color = TFT_DARKGRAY;
      }
      if (PIN_2.isPressed && !PIN_2.isDragging)
      {
        PIN_2_color = TFT_DARKGRAY;
      }
      if (PIN_3.isPressed && !PIN_3.isDragging)
      PIN_3_color = TFT_DARKGRAY;
      if (PIN_4.isPressed && !PIN_4.isDragging)
        PIN_4_color = TFT_DARKGRAY;
      if (PIN_5.isPressed && !PIN_5.isDragging)
        PIN_5_color = TFT_DARKGRAY;
      if (PIN_6.isPressed && !PIN_6.isDragging)
        PIN_6_color = TFT_DARKGRAY;
      if (PIN_7.isPressed && !PIN_7.isDragging)
        PIN_7_color = TFT_DARKGRAY;
      if (PIN_8.isPressed && !PIN_8.isDragging)
        PIN_8_color = TFT_DARKGRAY;
      if (PIN_9.isPressed && !PIN_9.isDragging)
        PIN_9_color = TFT_DARKGRAY;
      if (PIN_0.isPressed && !PIN_0.isDragging)
        PIN_0_color = TFT_DARKGRAY;

      if (PIN_del.isPressed && !PIN_del.isDragging)
        PIN_del_color = TFT_DARKGRAY;

      if (PIN_en.isPressed && !PIN_en.isDragging)
        PIN_en_color = TFT_DARKGRAY;



      // ใส่ font ก่อนวาด
      touchArea.setTextColor(TFT_WHITE);
      touchArea.setTextSize(2);

      // ---- Row 1 ----
      touchArea.fillSmoothRoundRect(PIN_1.x, PIN_1.y, PIN_1.width, PIN_1.height, 10, PIN_1_color);
      touchArea.drawCenterString("1", PIN_1.x + PIN_1.width/2, PIN_1.y + PIN_1.height/2 - 8);

      touchArea.fillSmoothRoundRect(PIN_2.x, PIN_2.y, PIN_2.width, PIN_2.height, 10, PIN_2_color);
      touchArea.drawCenterString("2", PIN_2.x + PIN_2.width/2, PIN_2.y + PIN_2.height/2 - 8);

      touchArea.fillSmoothRoundRect(PIN_3.x, PIN_3.y, PIN_3.width, PIN_3.height, 10, PIN_3_color);
      touchArea.drawCenterString("3", PIN_3.x + PIN_3.width/2, PIN_3.y + PIN_3.height/2 - 8);

      touchArea.fillSmoothRoundRect(PIN_del.x, PIN_del.y, PIN_del.width, PIN_del.height, 10, PIN_del_color);
      touchArea.drawCenterString("DEL", PIN_del.x + PIN_del.width/2, PIN_del.y + PIN_del.height/2 - 8);


      // ---- Row 2 ----
      touchArea.fillSmoothRoundRect(PIN_4.x, PIN_4.y, PIN_4.width, PIN_4.height, 10, PIN_4_color);
      touchArea.drawCenterString("4", PIN_4.x + PIN_4.width/2, PIN_4.y + PIN_4.height/2 - 8);

      touchArea.fillSmoothRoundRect(PIN_5.x, PIN_5.y, PIN_5.width, PIN_5.height, 10, PIN_5_color);
      touchArea.drawCenterString("5", PIN_5.x + PIN_5.width/2, PIN_5.y + PIN_5.height/2 - 8);

      touchArea.fillSmoothRoundRect(PIN_6.x, PIN_6.y, PIN_6.width, PIN_6.height, 10, PIN_6_color);
      touchArea.drawCenterString("6", PIN_6.x + PIN_6.width/2, PIN_6.y + PIN_6.height/2 - 8);

      touchArea.fillSmoothRoundRect(PIN_0.x, PIN_0.y, PIN_0.width, PIN_0.height, 10, PIN_0_color);
      touchArea.drawCenterString("0", PIN_0.x + PIN_0.width/2, PIN_0.y + PIN_0.height/2 - 8);


      // ---- Row 3 ----
      touchArea.fillSmoothRoundRect(PIN_7.x, PIN_7.y, PIN_7.width, PIN_7.height, 10, PIN_7_color);
      touchArea.drawCenterString("7", PIN_7.x + PIN_7.width/2, PIN_7.y + PIN_7.height/2 - 8);

      touchArea.fillSmoothRoundRect(PIN_8.x, PIN_8.y, PIN_8.width, PIN_8.height, 10, PIN_8_color);
      touchArea.drawCenterString("8", PIN_8.x + PIN_8.width/2, PIN_8.y + PIN_8.height/2 - 8);

      touchArea.fillSmoothRoundRect(PIN_9.x, PIN_9.y, PIN_9.width, PIN_9.height, 10, PIN_9_color);
      touchArea.drawCenterString("9", PIN_9.x + PIN_9.width/2, PIN_9.y + PIN_9.height/2 - 8);

      touchArea.fillSmoothRoundRect(PIN_en.x, PIN_en.y, PIN_en.width, PIN_en.height, 10, PIN_en_color);
      touchArea.drawCenterString("EN", PIN_en.x + PIN_en.width/2, PIN_en.y + PIN_en.height/2 - 8);


      touchArea.setTextSize(1);
      touchArea.setFont(&fonts::DejaVu18);
      int feedbackY = 250;
    }


      
      
    
  }
  else if (cur_Screen == SCREEN_TEMP_2)
  {
    {
      // Initialize buttons on first entry
      static bool buttonsInitialized = false;
      if (!buttonsInitialized)
      {

        CALL_cmic.x = 620;
        CALL_cmic.y = 150;
        CALL_cmic.width = 90;
        CALL_cmic.height = 80;

        CALL_end.x = 620;
        CALL_end.y = 240;
        CALL_end.width = 90;
        CALL_end.height = 80;
        
        CALL_mute.x = 620;
        CALL_mute.y = 330;
        CALL_mute.width = 90;
        CALL_mute.height = 80;

        buttonsInitialized = true;
      }

      if (currentTouch.isPressed) {
        Serial.printf("Touch: (%d,%d) in touchArea coords: (%d,%d)\n",
          currentTouch.x, currentTouch.y, currentTouch.x, currentTouch.y);
      }

      bool CALL_cmic_cl = updateTouchButton(&CALL_cmic, currentTouch.x, currentTouch.y, currentTouch.isPressed);
      bool CALL_end_cl = updateTouchButton(&CALL_end, currentTouch.x, currentTouch.y, currentTouch.isPressed);
      bool CALL_mute_cl = updateTouchButton(&CALL_mute, currentTouch.x, currentTouch.y, currentTouch.isPressed);



      
      uint16_t CALL_cmic_color = TFT_LIGHTGREY;
      uint16_t CALL_end_color = TFT_RED;
      uint16_t CALL_mute_color = TFT_LIGHTGREY;
      


      if (CALL_cmic.isPressed && !CALL_cmic.isDragging)
      {
        CALL_cmic_color = TFT_DARKGRAY;
      }
      if (CALL_end.isPressed && !CALL_end.isDragging)
      {
        CALL_end_color = TFT_DARKGRAY;
      }
      if (CALL_mute.isPressed && !CALL_mute.isDragging)
      {
        CALL_mute_color = TFT_DARKGRAY;
      }
      



      // ใส่ font ก่อนวาด
      touchArea.setTextColor(TFT_WHITE);
      touchArea.setTextSize(2);

      // ---- Row 1 ----
      touchArea.fillSmoothRoundRect(CALL_cmic.x, CALL_cmic.y, CALL_cmic.width, CALL_cmic.height, 10, CALL_cmic_color);
      touchArea.drawCenterString("mic", CALL_cmic.x + CALL_cmic.width/2, CALL_cmic.y + CALL_cmic.height/2 - 8);

      touchArea.fillSmoothRoundRect(CALL_end.x, CALL_end.y, CALL_end.width, CALL_end.height, 10, CALL_end_color);
      touchArea.drawCenterString("end", CALL_end.x + CALL_end.width/2, CALL_end.y + CALL_end.height/2 - 8);

      touchArea.fillSmoothRoundRect(CALL_mute.x, CALL_mute.y, CALL_mute.width, CALL_mute.height, 10, CALL_mute_color);
      touchArea.drawCenterString("vol", CALL_mute.x + CALL_mute.width/2, CALL_mute.y + CALL_mute.height/2 - 8);

      


      touchArea.setTextSize(1);
      touchArea.setFont(&fonts::DejaVu18);
      int feedbackY = 250;
    }
    

      
      
    
  }
  
}
