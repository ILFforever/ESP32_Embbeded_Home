#ifndef HUB_NETWORK_H
#define HUB_NETWORK_H

#include <Arduino.h>
#include <ArduinoJson.h>

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

// Flag to indicate pending commands need to be fetched (non-blocking)
extern volatile bool hasPendingCommands;

// Process pending commands (call from main loop, non-blocking check)
void processPendingCommands();

// Acknowledge command execution to backend
void acknowledgeCommand(String commandId, bool success, String action);

// Execute a command
bool executeCommand(String action, JsonObject params);

// Send mesh sensor data to backend
void sendMeshSensorData(const char* jsonData);

// Send Main_mesh local sensor data to backend
void sendMainMeshLocalData(const char* jsonData);

// Structure for alert data
struct Alert {
  char message[100];
  char level[20];  // "error", "warning", "info"
  char timestamp[30];
  bool valid;
};

// Fetch recent alerts for home screen (limit 5)
bool fetchHomeAlerts(Alert* alerts, int maxAlerts);

// Structure for sensor data
struct SensorData {
  // Device info
  char device_id[20];
  char device_type[20];
  char forwarded_by[20];

  // Sensor readings
  float temperature;
  float humidity;
  float gas_level;
  float light_lux;
  float battery_voltage;
  int battery_percent;
  int boot_count;

  // Metadata
  char last_updated[30];
  char timestamp[30];
  bool alert;
  bool averaged;
  int sample_count;

  // Status
  bool valid;
};

// Fetch sensor data for a specific sensor device
bool fetchSensorData(const char* deviceId, SensorData* sensorData);

#endif
