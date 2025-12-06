#ifndef DOORLOCK_MQTT_H
#define DOORLOCK_MQTT_H

#include <Arduino.h>
#include <PubSubClient.h>

// ============================================================================
// MQTT Configuration
// ============================================================================
extern const char* MQTT_SERVER;
extern const int MQTT_PORT;

// ============================================================================
// MQTT Topics
// ============================================================================
extern const char* TOPIC_DOORLOCK_STATUS;
extern const char* TOPIC_DEVICE_COMMAND_TEMPLATE;

// ============================================================================
// Function Declarations
// ============================================================================
void initDoorLockMQTT(const char* deviceId);
bool connectDoorLockMQTT();
void processDoorLockMQTT();
bool isDoorLockMQTTConnected();
void publishDoorLockStatus(const String& status, bool isLocked);

#endif // DOORLOCK_MQTT_H
