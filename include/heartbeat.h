#ifndef HEARTBEAT_H
#define HEARTBEAT_H

#include <Arduino.h>

// Configuration - Update these for your deployment
extern const char* BACKEND_SERVER_URL;
extern const char* DEVICE_ID;
extern const char* DEVICE_TYPE;
extern const char* DEVICE_API_TOKEN;

// Initialize heartbeat module (includes starting background WiFi task)
void initHeartbeat(const char* serverUrl, const char* deviceId, const char* deviceType, const char* apiToken);

// Send heartbeat to backend server (blocking - used in task scheduler)
void sendHeartbeat();

// Send sensor data to backend server (blocking - used in task scheduler)
void sendSensorData(float temperature, float humidity, int motion);

// Send warning to backend (for 30s disconnect events) (blocking)
void sendDisconnectWarning(const char* module_name, bool isDisconnected);

// Send doorbell ring event to backend (blocking)
void sendDoorbellRing();

// Send face detection event to backend (NON-BLOCKING - queues event for background task)
// Copies image data into queue item (max 10KB), returns immediately
// Image data can be safely reused after this function returns
void sendFaceDetection(bool recognized, const char* name, float confidence, const uint8_t* imageData = nullptr, size_t imageSize = 0);

// Get last heartbeat status
bool getLastHeartbeatSuccess();
unsigned long getLastHeartbeatTime();

#endif
