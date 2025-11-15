/*********************************************************
This is a library for the MPR121 12-channel Capacitive touch sensor

Designed specifically to work with the MPR121 Breakout in the Adafruit shop
  ----> https://www.adafruit.com/products/

These sensors use I2C communicate, at least 2 pins are required
to interface

Adafruit invests time and resources providing this open source code,
please support Adafruit and open-source hardware by purchasing
products from Adafruit!

Written by Limor Fried/Ladyada for Adafruit Industries.
BSD license, all text above must be included in any redistribution
**********************************************************/

#include "CapSensor.h"
#include <Arduino.h>

#ifndef _BV
#define _BV(bit) (1 << (bit))
#endif

// Global instances
Adafruit_MPR121 cap = Adafruit_MPR121();
struct CapSensorState capState = {0, 0, false, 0};

bool capSensorSetup()
{
    Serial.println("Initializing MPR121 Capacitive Touch sensor...");

    // Default address is 0x5A, if tied to 3.3V its 0x5B
    // If tied to SDA its 0x5C and if SCL then 0x5D
    if (!cap.begin(0x5A, &Wire, 1, 0, true))
    {
        Serial.println("MPR121 not found, check wiring?");
        return false;
    }

    Serial.println("MPR121 found!");

    // Optional: Adjust touch/release thresholds
    // cap.setThresholds(40, 20);

    capState.currentTouched = 0;
    capState.lastTouched = 0;
    capState.padsChanged = false;
    capState.timestamp = millis();

    return true;
}

void capSensorUpdate()
{
    // Store previous state
    capState.lastTouched = capState.currentTouched;

    // Get the currently touched pads
    capState.currentTouched = cap.touched();

    // Check if state changed
    capState.padsChanged = (capState.currentTouched != capState.lastTouched);

    if (capState.padsChanged)
    {
        capState.timestamp = millis();

        // Print touched/released events
        for (uint8_t i = 0; i < 12; i++)
        {
            // Pad was just touched
            if ((capState.currentTouched & _BV(i)) && !(capState.lastTouched & _BV(i)))
            {
                Serial.print("Pad ");
                Serial.print(i);
                Serial.println(" touched");
            }
            // Pad was just released
            if (!(capState.currentTouched & _BV(i)) && (capState.lastTouched & _BV(i)))
            {
                Serial.print("Pad ");
                Serial.print(i);
                Serial.println(" released");
            }
        }
    }
}

bool isPadTouched(uint8_t pad)
{
    if (pad >= 12) return false;
    return (capState.currentTouched & _BV(pad)) != 0;
}

bool isPadPressed(uint8_t pad)
{
    if (pad >= 12) return false;
    return (capState.currentTouched & _BV(pad)) && !(capState.lastTouched & _BV(pad));
}

bool isPadReleased(uint8_t pad)
{
    if (pad >= 12) return false;
    return !(capState.currentTouched & _BV(pad)) && (capState.lastTouched & _BV(pad));
}
