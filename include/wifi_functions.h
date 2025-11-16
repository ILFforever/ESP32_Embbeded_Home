#ifndef WIFI_FUNCTIONS_H
#define WIFI_FUNCTIONS_H

#include <Arduino.h>

// External variable declarations
extern String formattedDate;
extern String dayStamp;
extern String timeStamp;

// Function declarations
void wifi_init();
void checkWiFiConnection();

#endif // WIFI_FUNCTIONS_H
