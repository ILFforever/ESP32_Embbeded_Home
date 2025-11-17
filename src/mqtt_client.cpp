#include "mqtt_client.h"
#include <WiFi.h>

// MQTT Configuration (HiveMQ Public Broker)
const char* MQTT_SERVER = "broker.hivemq.com";
const int MQTT_PORT = 1883;

// MQTT Topics
const char* TOPIC_DOORBELL_RING = "smarthome/doorbell/ring";
const char* TOPIC_HUB_COMMAND = "smarthome/hub/command";

// Global MQTT objects
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

// Callback storage
static MqttDoorbellCallback doorbellCallback = nullptr;
static String clientId = "";

// ============================================================================
// MQTT Message Callback
// ============================================================================
void mqttMessageCallback(char* topic, byte* payload, unsigned int length) {
  // Convert payload to string
  String message = "";
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }

  Serial.printf("[MQTT] Message received on topic '%s': %s\n", topic, message.c_str());

  // Handle doorbell ring
  if (strcmp(topic, TOPIC_DOORBELL_RING) == 0) {
    Serial.println("[MQTT] 🔔 Doorbell ring detected via MQTT!");
    if (doorbellCallback != nullptr) {
      doorbellCallback();
    }
  }
  // Handle hub commands
  else if (strcmp(topic, TOPIC_HUB_COMMAND) == 0) {
    Serial.printf("[MQTT] Hub command received: %s\n", message.c_str());
    // Parse JSON command here if needed
  }
}

// ============================================================================
// Initialize MQTT Client
// ============================================================================
void initMQTT(const char* clientIdParam, MqttDoorbellCallback callback) {
  clientId = String(clientIdParam);
  doorbellCallback = callback;

  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setCallback(mqttMessageCallback);

  Serial.println("[MQTT] Initialized");
  Serial.printf("  Broker: %s:%d\n", MQTT_SERVER, MQTT_PORT);
  Serial.printf("  Client ID: %s\n", clientId.c_str());
}

// ============================================================================
// Connect to MQTT Broker
// ============================================================================
bool connectMQTT() {
  if (mqttClient.connected()) {
    return true;
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[MQTT] WiFi not connected");
    return false;
  }

  Serial.printf("[MQTT] Connecting to broker %s...\n", MQTT_SERVER);

  // Attempt to connect
  if (mqttClient.connect(clientId.c_str())) {
    Serial.println("[MQTT] ✓ Connected!");

    // Subscribe to topics
    mqttClient.subscribe(TOPIC_DOORBELL_RING);
    Serial.printf("[MQTT] Subscribed to: %s\n", TOPIC_DOORBELL_RING);

    mqttClient.subscribe(TOPIC_HUB_COMMAND);
    Serial.printf("[MQTT] Subscribed to: %s\n", TOPIC_HUB_COMMAND);

    return true;
  } else {
    Serial.printf("[MQTT] ✗ Connection failed, rc=%d\n", mqttClient.state());
    return false;
  }
}

// ============================================================================
// Process MQTT (call in loop)
// ============================================================================
void processMQTT() {
  if (!mqttClient.connected()) {
    // Try to reconnect
    static unsigned long lastReconnectAttempt = 0;
    unsigned long now = millis();

    if (now - lastReconnectAttempt > 5000) {
      lastReconnectAttempt = now;
      connectMQTT();
    }
  } else {
    mqttClient.loop();
  }
}

// ============================================================================
// Check if MQTT is connected
// ============================================================================
bool isMQTTConnected() {
  return mqttClient.connected();
}

// ============================================================================
// Get MQTT client reference
// ============================================================================
PubSubClient& getMQTTClient() {
  return mqttClient;
}
