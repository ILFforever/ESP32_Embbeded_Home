#ifndef HTTP_CONTROL_H
#define HTTP_CONTROL_H

#include <Arduino.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>

extern unsigned long Ready_led_on_time;

// Initialize Async HTTP server
void initHTTPServer();

// WiFi watchdog - call periodically to check WiFi connection
void checkWiFiConnection();

#endif
