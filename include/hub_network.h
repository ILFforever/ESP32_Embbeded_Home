#ifndef HUB_NETWORK_H
#define HUB_NETWORK_H

#include <Arduino.h>

// Configuration
extern const char* WIFI_SSID;
extern const char* WIFI_PASSWORD;
extern const char* BACKEND_SERVER_URL;
extern const char* HUB_DEVICE_ID;
extern const char* HUB_DEVICE_TYPE;
extern const char* HUB_API_TOKEN;

// Doorbell device to monitor
extern const char* DOORBELL_DEVICE_ID;

// Device status structure
struct DeviceStatus {
  bool online;
  String last_seen;
  unsigned long last_heartbeat_ms;
  int wifi_rssi;
  int free_heap;
  bool data_valid;
};

// Initialize network and heartbeat
void initNetwork(const char* ssid, const char* password, const char* serverUrl,
                 const char* deviceId, const char* deviceType, const char* apiToken,
                 const char* doorbellId);

// Send hub's own heartbeat
void sendHubHeartbeat();

// Check if doorbell is online
DeviceStatus checkDoorbellStatus();

// Get WiFi status
bool isWiFiConnected();

// Get last heartbeat status
bool getLastHeartbeatSuccess();

#endif
