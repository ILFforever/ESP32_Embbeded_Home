#include "touch_handler.h"
#include "touch_button.h"
#include "GUI/screen_manager.h"
#include <Arduino.h>

// Example touch buttons for screen 1
TouchButton exampleButton1;
TouchButton exampleButton2;
TouchButton exampleButton3;

TouchButton QuickButton1;
TouchButton QuickButton2;
TouchButton QuickButton3;
TouchButton moreAlter;

// Touch handling for all screens
void handleTouchInput()
{
  // Fill with transparent color (palette index 0)
  touchArea.fillSprite(0);
  touchAreaNeedsUpdate = true; // update touch objects every frame (100ms)
  
  if (cur_Screen == 0)
  {
    // Home screen touch handling
    {
      // Initialize buttons on first entry
      static bool buttonsInitialized = false;
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


        moreAlter.x = 720;
        moreAlter.y = 60;
        moreAlter.width = 60;
        moreAlter.height = 30;


        buttonsInitialized = true;
      }

      // Update button states (no offset needed since touchArea is positioned at Y=40)
      // Debug: Print touch coordinates when touching
      if (currentTouch.isPressed) {
        Serial.printf("Touch: (%d,%d) in touchArea coords: (%d,%d)\n",
          currentTouch.x, currentTouch.y, currentTouch.x, currentTouch.y);
      }

      bool qt1Clicked = updateTouchButton(&QuickButton1, currentTouch.x, currentTouch.y, currentTouch.isPressed);
      bool qt2Clicked = updateTouchButton(&QuickButton2, currentTouch.x, currentTouch.y, currentTouch.isPressed);
      bool qt3Clicked = updateTouchButton(&QuickButton3, currentTouch.x, currentTouch.y, currentTouch.isPressed);

      bool MAClicked = updateTouchButton(&moreAlter, currentTouch.x, currentTouch.y, currentTouch.isPressed);
      

      // Draw Quick Button 1
      uint16_t qt1Color = TFT_DARKGREY;
      if (QuickButton1.isPressed && !QuickButton1.isDragging)
      {
        qt1Color = TFT_LIGHTGREY;
      }
      touchArea.fillSmoothRoundRect(QuickButton1.x, QuickButton1.y, QuickButton1.width, QuickButton1.height, 10, qt1Color);
      touchArea.setTextColor(TFT_WHITE);
      touchArea.setTextSize(1);
      touchArea.drawCenterString("QB1", QuickButton1.x + QuickButton1.width / 2, QuickButton1.y + QuickButton1.height / 2 - 8);

      uint16_t qt2Color = TFT_DARKGREY;
      if (QuickButton2.isPressed && !QuickButton2.isDragging)
      {
        qt2Color = TFT_LIGHTGREY;
      }
      touchArea.fillSmoothRoundRect(QuickButton2.x, QuickButton2.y, QuickButton2.width, QuickButton2.height, 10, qt2Color);
      touchArea.setTextColor(TFT_WHITE);
      touchArea.setTextSize(1);
      touchArea.drawCenterString("QB2", QuickButton2.x + QuickButton2.width / 2, QuickButton2.y + QuickButton2.height / 2 - 8);

      uint16_t qt3Color = TFT_DARKGREY;
      if (QuickButton3.isPressed && !QuickButton3.isDragging)
      {
        qt3Color = TFT_LIGHTGREY;
      }
      touchArea.fillSmoothRoundRect(QuickButton3.x, QuickButton3.y, QuickButton3.width, QuickButton3.height, 10, qt3Color);
      touchArea.setTextColor(TFT_WHITE);
      touchArea.setTextSize(1);
      touchArea.drawCenterString("QB3", QuickButton3.x + QuickButton3.width / 2, QuickButton3.y + QuickButton3.height / 2 - 8);

      uint16_t MAColor = TFT_GREEN;
      if (moreAlter.isPressed && !moreAlter.isDragging)
      {
        qt1Color = TFT_DARKGREEN;
      }
      touchArea.fillSmoothRoundRect(moreAlter.x, moreAlter.y, moreAlter.width, moreAlter.height, 10, MAColor);
      touchArea.setTextColor(TFT_WHITE);
      touchArea.setTextSize(1);
      touchArea.drawCenterString("more", moreAlter.x + moreAlter.width / 2, moreAlter.y + moreAlter.height / 2 - 8);


      // Display click feedback
      touchArea.setTextSize(1);
      touchArea.setFont(&fonts::DejaVu18);
      int feedbackY = 250;

      if (qt1Clicked)
      {
        touchArea.setTextColor(TFT_GREEN);
        touchArea.drawString("Quick Button 1 Clicked!", 50, feedbackY);
        Serial.println("Quick Button 1 clicked!");
      }

      if (qt2Clicked)
      {
        touchArea.setTextColor(TFT_GREEN);
        touchArea.drawString("Quick Button 2 Clicked!", 50, feedbackY+40);
        Serial.println("Quick Button 2 clicked!");
      }

      if (qt3Clicked)
      {
        touchArea.setTextColor(TFT_GREEN);
        touchArea.drawString("Quick Button 3 Clicked!", 50, feedbackY+80);
        Serial.println("Quick Button 3 clicked!");
      }
      if (MAClicked)
      {
        touchArea.setTextColor(TFT_GREEN);
        touchArea.drawString("more Alter", 50, feedbackY-40);
        Serial.println("more Alter clicked!");
      }
    }


  }
  else if (cur_Screen == 2)
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
}
