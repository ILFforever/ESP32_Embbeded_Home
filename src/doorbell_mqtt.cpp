#include "doorbell_mqtt.h"
#include "heartbeat.h"
#include "face_detection_sender.h"
#include <WiFi.h>
#include <ArduinoJson.h>

// MQTT Configuration (HiveMQ Public Broker)
const char* MQTT_SERVER = "broker.hivemq.com";
const int MQTT_PORT = 1883;

// MQTT Topics
const char* TOPIC_DOORBELL_RING = "smarthome/doorbell/ring";
const char* TOPIC_DEVICE_COMMAND_TEMPLATE = "smarthome/device/%s/command"; // %s will be replaced with device ID

// Global MQTT objects
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

// Device ID storage
static char doorbellDeviceId[48] = "";

// ============================================================================
// MQTT Callback - Handles incoming messages
// ============================================================================
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  Serial.printf("[MQTT] Message received on topic: %s\n", topic);

  Serial.printf("[MQTT] Payload: %.*s\n", (int)length, (const char*)payload);

  // Parse JSON payload directly from the MQTT buffer (no String copy)
  StaticJsonDocument<512> doc;
  DeserializationError error = deserializeJson(doc, (const char*)payload, length);

  if (error) {
    Serial.printf("[MQTT] ✗ Failed to parse JSON: %s\n", error.c_str());
    return;
  }

  // Check if this is a command notification
  if (doc.containsKey("fetch_commands") && doc["fetch_commands"] == true) {
    const char* device_id = doc["device_id"] | "";
    const char* command_id = doc["command_id"] | "";
    const char* action = doc["action"] | "";

    Serial.println("[MQTT] ✓ Command notification received!");
    Serial.printf("  Device: %s\n", device_id);
    Serial.printf("  Command ID: %s\n", command_id);
    Serial.printf("  Action: %s\n", action);

    // Fetch and execute pending commands immediately
    Serial.println("[MQTT] → Fetching pending commands from server...");
    fetchAndExecuteCommands();
  }
}

// ============================================================================
// Initialize MQTT Client for Doorbell
// ============================================================================
void initDoorbellMQTT(const char* deviceId) {
  snprintf(doorbellDeviceId, sizeof(doorbellDeviceId), "%s", deviceId);

  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);  // Set callback for incoming messages

  Serial.println("[MQTT] Doorbell MQTT Initialized");
  Serial.printf("  Broker: %s:%d\n", MQTT_SERVER, MQTT_PORT);
  Serial.printf("  Device ID: %s\n", doorbellDeviceId);
  Serial.printf("  Publish Topic: %s\n", TOPIC_DOORBELL_RING);

  // Build command topic
  char commandTopic[128];
  snprintf(commandTopic, sizeof(commandTopic), TOPIC_DEVICE_COMMAND_TEMPLATE, doorbellDeviceId);
  Serial.printf("  Subscribe Topic: %s\n", commandTopic);
}

// ============================================================================
// Connect to MQTT Broker
// ============================================================================
bool connectDoorbellMQTT() {
  // Skip if face detection upload in progress
  if (faceDetectionUploadInProgress) {
    return mqttClient.connected();  // Return current connection status without trying to reconnect
  }

  if (mqttClient.connected()) {
    return true;
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[MQTT] WiFi not connected");
    return false;
  }

  Serial.printf("[MQTT] Connecting to broker %s...\n", MQTT_SERVER);

  // Create unique client ID
  char clientId[64];
  snprintf(clientId, sizeof(clientId), "doorbell_%s", doorbellDeviceId);

  // Attempt to connect
  if (mqttClient.connect(clientId)) {
    Serial.println("[MQTT] ✓ Connected!");

    // Subscribe to device-specific command topic
    char commandTopic[128];
    snprintf(commandTopic, sizeof(commandTopic), TOPIC_DEVICE_COMMAND_TEMPLATE, doorbellDeviceId);

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
// Publish doorbell ring event
// ============================================================================
void publishDoorbellRing() {
  // Skip if face detection upload in progress
  if (faceDetectionUploadInProgress) {
    Serial.println("[MQTT] Skipping publish - face detection upload in progress");
    return;
  }

  if (!mqttClient.connected()) {
    Serial.println("[MQTT] Not connected - attempting to reconnect before publish");
    if (!connectDoorbellMQTT()) {
      Serial.println("[MQTT] ✗ Failed to publish - no connection");
      return;
    }
  }

  // Create JSON payload with device ID and timestamp
  char payload[96];
  snprintf(payload, sizeof(payload), "{\"device_id\":\"%s\",\"timestamp\":%lu}", doorbellDeviceId, millis());

  // Publish to topic
  bool success = mqttClient.publish(TOPIC_DOORBELL_RING, payload);

  if (success) {
    Serial.println("[MQTT] ✓ Doorbell ring published!");
    Serial.printf("  Topic: %s\n", TOPIC_DOORBELL_RING);
    Serial.printf("  Payload: %s\n", payload);
  } else {
    Serial.println("[MQTT] ✗ Failed to publish doorbell ring");
  }
}

// ============================================================================
// Process MQTT (maintains connection, call in loop)
// ============================================================================
void processDoorbellMQTT() {
  if (!mqttClient.connected()) {
    // Try to reconnect periodically
    static unsigned long lastReconnectAttempt = 0;
    unsigned long now = millis();

    if (now - lastReconnectAttempt > 5000) {
      lastReconnectAttempt = now;
      connectDoorbellMQTT();
    }
  } else {
    mqttClient.loop();
  }
}

// ============================================================================
// Check if MQTT is connected
// ============================================================================
bool isDoorbellMQTTConnected() {
  return mqttClient.connected();
}
