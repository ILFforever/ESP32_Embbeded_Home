#include "doorlock_mqtt.h"
#include "heartbeat.h"
#include <WiFi.h>
#include <ArduinoJson.h>

// MQTT Configuration (HiveMQ Public Broker)
const char* MQTT_SERVER = "broker.hivemq.com";
const int MQTT_PORT = 1883;

// MQTT Topics
const char* TOPIC_DOORLOCK_STATUS = "smarthome/doorlock/status";
const char* TOPIC_DEVICE_COMMAND_TEMPLATE = "smarthome/device/%s/command"; // %s will be replaced with device ID

// Global MQTT objects
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

// Device ID storage
static String doorlockDeviceId = "";

// ============================================================================
// MQTT Callback - Handles incoming messages
// ============================================================================
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  Serial.printf("[MQTT] Message received on topic: %s\n", topic);

  // Convert payload to String
  String message = "";
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }

  Serial.printf("[MQTT] Payload: %s\n", message.c_str());

  // Parse JSON payload
  StaticJsonDocument<512> doc;
  DeserializationError error = deserializeJson(doc, message);

  if (error) {
    Serial.printf("[MQTT] ✗ Failed to parse JSON: %s\n", error.c_str());
    return;
  }

  // Check if this is a command notification
  if (doc.containsKey("fetch_commands") && doc["fetch_commands"] == true) {
    String device_id = doc["device_id"] | "";
    String command_id = doc["command_id"] | "";
    String action = doc["action"] | "";

    Serial.println("[MQTT] ✓ Command notification received!");
    Serial.printf("  Device: %s\n", device_id.c_str());
    Serial.printf("  Command ID: %s\n", command_id.c_str());
    Serial.printf("  Action: %s\n", action.c_str());

    // Fetch and execute pending commands immediately
    Serial.println("[MQTT] → Fetching pending commands from server...");
    fetchAndExecuteCommands();
  }
}

// ============================================================================
// Initialize MQTT Client for Door Lock
// ============================================================================
void initDoorLockMQTT(const char* deviceId) {
  doorlockDeviceId = String(deviceId);

  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);  // Set callback for incoming messages

  Serial.println("[MQTT] Door Lock MQTT Initialized");
  Serial.printf("  Broker: %s:%d\n", MQTT_SERVER, MQTT_PORT);
  Serial.printf("  Device ID: %s\n", doorlockDeviceId.c_str());
  Serial.printf("  Publish Topic: %s\n", TOPIC_DOORLOCK_STATUS);

  // Build command topic
  char commandTopic[128];
  snprintf(commandTopic, sizeof(commandTopic), TOPIC_DEVICE_COMMAND_TEMPLATE, doorlockDeviceId.c_str());
  Serial.printf("  Subscribe Topic: %s\n", commandTopic);
}

// ============================================================================
// Connect to MQTT Broker
// ============================================================================
bool connectDoorLockMQTT() {
  if (mqttClient.connected()) {
    return true;
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[MQTT] WiFi not connected");
    return false;
  }

  Serial.printf("[MQTT] Connecting to broker %s...\n", MQTT_SERVER);

  // Create unique client ID
  String clientId = "doorlock_" + doorlockDeviceId;

  // Attempt to connect
  if (mqttClient.connect(clientId.c_str())) {
    Serial.println("[MQTT] ✓ Connected!");

    // Subscribe to device-specific command topic
    char commandTopic[128];
    snprintf(commandTopic, sizeof(commandTopic), TOPIC_DEVICE_COMMAND_TEMPLATE, doorlockDeviceId.c_str());

    bool subscribed = mqttClient.subscribe(commandTopic);
    if (subscribed) {
      Serial.printf("[MQTT] ✓ Subscribed to: %s\n", commandTopic);
    } else {
      Serial.printf("[MQTT] ✗ Failed to subscribe to: %s\n", commandTopic);
    }

    return true;
  } else {
    Serial.printf("[MQTT] ✗ Connection failed, rc=%d\n", mqttClient.state());
    return false;
  }
}

// ============================================================================
// Publish door lock status
// ============================================================================
void publishDoorLockStatus(const String& status, bool isLocked) {
  if (!mqttClient.connected()) {
    Serial.println("[MQTT] Not connected - attempting to reconnect before publish");
    if (!connectDoorLockMQTT()) {
      Serial.println("[MQTT] ✗ Failed to publish - no connection");
      return;
    }
  }

  // Create JSON payload with device ID, status, and timestamp
  StaticJsonDocument<256> doc;
  doc["device_id"] = doorlockDeviceId;
  doc["status"] = status;
  doc["is_locked"] = isLocked;
  doc["timestamp"] = millis();

  String payload;
  serializeJson(doc, payload);

  // Publish to topic
  bool success = mqttClient.publish(TOPIC_DOORLOCK_STATUS, payload.c_str());

  if (success) {
    Serial.println("[MQTT] ✓ Door lock status published!");
    Serial.printf("  Topic: %s\n", TOPIC_DOORLOCK_STATUS);
    Serial.printf("  Payload: %s\n", payload.c_str());
  } else {
    Serial.println("[MQTT] ✗ Failed to publish door lock status");
  }
}

// ============================================================================
// Process MQTT (maintains connection, call in loop)
// ============================================================================
void processDoorLockMQTT() {
  if (!mqttClient.connected()) {
    // Try to reconnect periodically
    static unsigned long lastReconnectAttempt = 0;
    unsigned long now = millis();

    if (now - lastReconnectAttempt > 5000) {
      lastReconnectAttempt = now;
      connectDoorLockMQTT();
    }
  } else {
    mqttClient.loop();
  }
}

// ============================================================================
// Check if MQTT is connected
// ============================================================================
bool isDoorLockMQTTConnected() {
  return mqttClient.connected();
}
