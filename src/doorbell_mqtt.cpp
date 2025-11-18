#include "doorbell_mqtt.h"
#include <WiFi.h>

// MQTT Configuration (HiveMQ Public Broker)
const char* MQTT_SERVER = "broker.hivemq.com";
const int MQTT_PORT = 1883;

// MQTT Topics
const char* TOPIC_DOORBELL_RING = "smarthome/doorbell/ring";

// Global MQTT objects
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

// Device ID storage
static String doorbellDeviceId = "";

// ============================================================================
// Initialize MQTT Client for Doorbell
// ============================================================================
void initDoorbellMQTT(const char* deviceId) {
  doorbellDeviceId = String(deviceId);

  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);

  Serial.println("[MQTT] Doorbell MQTT Initialized");
  Serial.printf("  Broker: %s:%d\n", MQTT_SERVER, MQTT_PORT);
  Serial.printf("  Device ID: %s\n", doorbellDeviceId.c_str());
  Serial.printf("  Publish Topic: %s\n", TOPIC_DOORBELL_RING);
}

// ============================================================================
// Connect to MQTT Broker
// ============================================================================
bool connectDoorbellMQTT() {
  if (mqttClient.connected()) {
    return true;
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[MQTT] WiFi not connected");
    return false;
  }

  Serial.printf("[MQTT] Connecting to broker %s...\n", MQTT_SERVER);

  // Create unique client ID
  String clientId = "doorbell_" + doorbellDeviceId;

  // Attempt to connect
  if (mqttClient.connect(clientId.c_str())) {
    Serial.println("[MQTT] ✓ Connected!");
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
  if (!mqttClient.connected()) {
    Serial.println("[MQTT] Not connected - attempting to reconnect before publish");
    if (!connectDoorbellMQTT()) {
      Serial.println("[MQTT] ✗ Failed to publish - no connection");
      return;
    }
  }

  // Create JSON payload with device ID and timestamp
  String payload = "{\"device_id\":\"" + doorbellDeviceId + "\",\"timestamp\":" + String(millis()) + "}";

  // Publish to topic
  bool success = mqttClient.publish(TOPIC_DOORBELL_RING, payload.c_str());

  if (success) {
    Serial.println("[MQTT] ✓ Doorbell ring published!");
    Serial.printf("  Topic: %s\n", TOPIC_DOORBELL_RING);
    Serial.printf("  Payload: %s\n", payload.c_str());
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
