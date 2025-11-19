#include "cap_sensor_manager.h"
#include <CapSensor.h>
#include "uart_slaves.h"

void updateCapSensor()
{
  capSensorUpdate();

  // Example: Check specific pads
  if (isPadPressed(0))
  {
    sendAmpCommand("play", "click");
    Serial.println("Button 0 pressed!");
    if (cur_Screen < 2)
    {
      cur_Screen++;
      Serial.printf("Switched to screen %d\n", cur_Screen);
    }
    else
    {
      cur_Screen = 0;
    }
  }
}
