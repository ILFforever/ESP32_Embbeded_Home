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

// Note: Doorbell ring detection now uses MQTT (see mqtt_client.h)
// Polling functions removed to avoid API rate limits

// Get last heartbeat status
bool getLastHeartbeatSuccess();

// Send log/error to backend
void sendLogToBackend(const char* level, const char* message, const char* data = nullptr);


// Fetch and execute pending commands from backend (MQTT triggered)
void fetchAndExecuteCommands();

// Acknowledge command execution to backend
void acknowledgeCommand(String commandId, bool success, String action);

// Execute a command
bool executeCommand(String action, JsonObject params);

// Send mesh sensor data to backend
void sendMeshSensorData(const char* jsonData);

// Send Main_mesh local sensor data to backend
void sendMainMeshLocalData(const char* jsonData);

#endif
