#ifndef APP_CONFIG_H
#define APP_CONFIG_H

#if __has_include("local_config.h")
#include "local_config.h"
#endif

#ifndef WIFI_SSID
#define WIFI_SSID "your-wifi-ssid"
#endif

#ifndef WIFI_PASSWORD
#define WIFI_PASSWORD "your-wifi-password"
#endif

#ifndef BACKEND_URL
#define BACKEND_URL "http://embedded-smarthome.fly.dev"
#endif

#ifndef DOORBELL_DEVICE_ID
#define DOORBELL_DEVICE_ID "db_001"
#endif

#ifndef DOORBELL_DEVICE_TYPE
#define DOORBELL_DEVICE_TYPE "doorbell"
#endif

#ifndef DEVICE_AUTH_TOKEN
#define DEVICE_AUTH_TOKEN "device-token-from-registration"
#endif

// Remote commands are real-time actions. If the doorbell was offline or unable
// to parse its queue, do not replay old camera/audio actions after recovery.
#ifndef COMMAND_STALE_AFTER_SECONDS
#define COMMAND_STALE_AFTER_SECONDS 300UL
#endif

#ifndef WEATHER_API_KEY
#define WEATHER_API_KEY "YOUR_API_KEY_HERE"
#endif

#ifndef WEATHER_CITY
#define WEATHER_CITY "Bangkok"
#endif

#ifndef WEATHER_COUNTRY
#define WEATHER_COUNTRY "TH"
#endif

#ifndef WEATHER_UNITS
#define WEATHER_UNITS "metric"
#endif

#endif // APP_CONFIG_H
