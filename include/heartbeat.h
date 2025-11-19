#ifndef HEARTBEAT_H
#define HEARTBEAT_H

#include <Arduino.h>
#include <ArduinoJson.h>

// Configuration - Update these for your deployment
extern const char* BACKEND_SERVER_URL;
extern const char* DEVICE_ID;
extern const char* DEVICE_TYPE;
extern const char* DEVICE_API_TOKEN;

// Initialize heartbeat module
void initHeartbeat(const char* serverUrl, const char* deviceId, const char* deviceType, const char* apiToken);

// Send heartbeat to backend server
void sendHeartbeat();

// Send sensor data to backend server
void sendSensorData(float temperature, float humidity, int motion);

// Send warning to backend (for 30s disconnect events)
void sendDisconnectWarning(const char* module_name, bool isDisconnected);

// Send doorbell ring event to backend (notify hub to play audio)
void sendDoorbellRing();

// Send doorbell status to backend (camera_active, mic_active)
// ALSO acts as heartbeat - resets TTL timer
void sendDoorbellStatus(bool camera_active, bool mic_active);

// Send face detection event to backend (saves to Firebase, publishes to Hub via MQTT)
// BLOCKING VERSION - Use sendFaceDetectionAsync() instead for non-blocking operation
void sendFaceDetection(bool recognized, const char* name, float confidence, const uint8_t* imageData = nullptr, size_t imageSize = 0);

// Send face detection event asynchronously (NON-BLOCKING)
// Queues the event to be sent by a background task
// Returns true if queued successfully, false if queue is full
bool sendFaceDetectionAsync(bool recognized, const char* name, float confidence, const uint8_t* imageData = nullptr, size_t imageSize = 0);

// Get last heartbeat status
bool getLastHeartbeatSuccess();
unsigned long getLastHeartbeatTime();

// Ping-Pong Command Queue (NEW)
// These functions are called automatically by sendHeartbeat() when server indicates pending commands
void fetchAndExecuteCommands();
bool executeCommand(String action, JsonObject params);
void acknowledgeCommand(String commandId, bool success, String action);

#endif
