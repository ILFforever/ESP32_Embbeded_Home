#ifndef DOORBELL_MQTT_H
#define DOORBELL_MQTT_H

#include <PubSubClient.h>

// Initialize MQTT client for doorbell
void initDoorbellMQTT(const char* deviceId);

// Connect to MQTT broker (call after WiFi is connected)
bool connectDoorbellMQTT();

// Publish doorbell ring event to MQTT
void publishDoorbellRing();

// Process MQTT (maintains connection, call in loop)
void processDoorbellMQTT();

// Check if MQTT is connected
bool isDoorbellMQTTConnected();

#endif
