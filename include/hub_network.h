#ifndef HUB_NETWORK_H
#define HUB_NETWORK_H

#include <Arduino.h>

// Device status structure
struct DeviceStatus {
  bool online;
  String last_seen;
  unsigned long last_heartbeat_ms;
  int wifi_rssi;
  int free_heap;
  bool data_valid;
};

// Initialize heartbeat module (WiFi must already be connected)
void initHeartbeat(const char* serverUrl, const char* deviceId,
                   const char* deviceType, const char* apiToken,
                   const char* doorbellId);

// Send hub's own heartbeat
void sendHubHeartbeat();

// Check if doorbell is online
DeviceStatus checkDoorbellStatus();

// Get last heartbeat status
bool getLastHeartbeatSuccess();

#endif
