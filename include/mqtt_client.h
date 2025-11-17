#ifndef MQTT_CLIENT_H
#define MQTT_CLIENT_H

#include <Arduino.h>
#include <PubSubClient.h>

// MQTT callback function type for doorbell ring
typedef void (*MqttDoorbellCallback)();

// Initialize MQTT client
void initMQTT(const char* clientId, MqttDoorbellCallback doorbellCallback);

// Connect/reconnect to MQTT broker
bool connectMQTT();

// Process MQTT messages (call in loop)
void processMQTT();

// Check if MQTT is connected
bool isMQTTConnected();

// Get MQTT client for advanced usage
PubSubClient& getMQTTClient();

#endif
