#ifndef MQTT_CLIENT_H
#define MQTT_CLIENT_H

#include <Arduino.h>
#include <PubSubClient.h>

// MQTT callback function types
typedef void (*MqttDoorbellCallback)();
typedef void (*MqttFaceDetectionCallback)(bool recognized, const char* name, float confidence);

// Initialize MQTT client
void initMQTT(const char* clientId, MqttDoorbellCallback doorbellCallback, MqttFaceDetectionCallback faceCallback);

// Connect/reconnect to MQTT broker
bool connectMQTT();

// Process MQTT messages (call in loop)
void processMQTT();

// Check if MQTT is connected
bool isMQTTConnected();

// Get MQTT client for advanced usage
PubSubClient& getMQTTClient();

#endif
