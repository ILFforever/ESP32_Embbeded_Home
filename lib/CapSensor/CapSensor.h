#ifndef CAPSENSOR_H
#define CAPSENSOR_H

#include <stdint.h>
#include <Wire.h>
#include "Adafruit_MPR121.h"

// Capacitive sensor state struct
struct CapSensorState
{
    uint16_t currentTouched;
    uint16_t lastTouched;
    bool padsChanged;
    uint32_t timestamp;
};

// Global capacitive sensor state
extern struct CapSensorState capState;
extern Adafruit_MPR121 cap;

// Initialize the MPR121 sensor
bool capSensorSetup();

// Update sensor readings (call this periodically)
void capSensorUpdate();

// Check if a specific pad is currently touched
bool isPadTouched(uint8_t pad);

// Check if a specific pad was just pressed
bool isPadPressed(uint8_t pad);

// Check if a specific pad was just released
bool isPadReleased(uint8_t pad);

#endif // CAPSENSOR_H
