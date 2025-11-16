#ifndef HEARTBEAT_H
#define HEARTBEAT_H

#include <Arduino.h>

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

// Get last heartbeat status
bool getLastHeartbeatSuccess();
unsigned long getLastHeartbeatTime();

#endif
