#include "cap_sensor_manager.h"
#include <CapSensor.h>
#include "uart_slaves.h"
#include "screen_definitions.h"
#include "GUI/screen_manager.h"

void updateCapSensor()
{
  capSensorUpdate();
  if (cur_Screen == SCREEN_HOME)
  {
    // sendAmpCommand("play", "click");
    if (isPadPressed(3))
    {
      cur_Screen = SCREEN_HOME;
    }
    else if (isPadPressed(2)) // Devices screen
    {
      cur_Screen = SCREEN_DEVICE_LIST;
    }
    else if (isPadPressed(1)) // Information screen (show graphs and shit)
    {
      cur_Screen = SCREEN_ROOM_DETAIL_GAS;
    }
    else if (isPadPressed(0))
    {
      cur_Screen = SCREEN_MASTER_MENU;
    }
  }
  else if (cur_Screen == SCREEN_DEVICE_LIST)
  {
    // sendAmpCommand("play", "click");
    if (isPadPressed(3))
    {
      cur_Screen = SCREEN_HOME;
    }
    else if (isPadPressed(2)) // Devices screen
    {
      switchDeviceContext(); // switch between screens no animation
    }
    else if (isPadPressed(1)) // Information screen (show graphs and shit)
    {
      cur_Screen = SCREEN_ROOM_DETAIL_GAS;
    }
    else if (isPadPressed(0))
    {
      cur_Screen = SCREEN_FONT;
    }
  }
  else if (isPadPressed(0))
  {
    sendAmpCommand("play", "click");
    Serial.println("Button 0 pressed!");

    if (cur_Screen < SCREEN_NOTIFICATION_LOG)
    {
      cur_Screen++;
      Serial.printf("Switched to screen: %s (%d)\n", getScreenName(cur_Screen), cur_Screen);
    }
    else
    {
      cur_Screen = SCREEN_HOME;
    }
  }
}
