#include "mqtt_client.h"
#include "hub_network.h"
#include <WiFi.h>
#include <ArduinoJson.h>

// MQTT Configuration (HiveMQ Public Broker)
const char* MQTT_SERVER = "broker.hivemq.com";
const int MQTT_PORT = 1883;

// MQTT Topics
const char* TOPIC_DOORBELL_RING = "smarthome/doorbell/ring";
const char* TOPIC_HUB_COMMAND_TEMPLATE = "smarthome/device/%s/command"; // %s will be replaced with device ID
const char* TOPIC_FACE_DETECTION = "smarthome/face/detection";

// Global MQTT objects
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

// Callback storage
static MqttDoorbellCallback doorbellCallback = nullptr;
static MqttFaceDetectionCallback faceDetectionCallback = nullptr;
static String clientId = "";
static String hubDeviceId = "";

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
  // Handle face detection
  else if (strcmp(topic, TOPIC_FACE_DETECTION) == 0) {
    Serial.printf("[MQTT] 👤 Face detection event: %s\n", message.c_str());

    // Parse JSON payload
    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, message);

    if (!error && faceDetectionCallback != nullptr) {
      bool recognized = doc["recognized"] | false;
      const char* name = doc["name"] | "Unknown";
      float confidence = doc["confidence"] | 0.0f;

      Serial.printf("[MQTT] Name: %s, Recognized: %s, Confidence: %.2f\n",
                    name, recognized ? "Yes" : "No", confidence);

      faceDetectionCallback(recognized, name, confidence);
    } else if (error) {
      Serial.printf("[MQTT] ✗ Failed to parse face detection JSON: %s\n", error.c_str());
    }
  }
  // Handle hub commands (NEW!)
  else {
    // Check if it's a device-specific command topic
    char expectedTopic[128];
    snprintf(expectedTopic, sizeof(expectedTopic), TOPIC_HUB_COMMAND_TEMPLATE, hubDeviceId.c_str());

    if (strcmp(topic, expectedTopic) == 0) {
      Serial.printf("[MQTT] Hub command notification received: %s\n", message.c_str());

      // Parse JSON command notification
      JsonDocument doc;
      DeserializationError error = deserializeJson(doc, message);

      if (!error && doc.containsKey("fetch_commands") && doc["fetch_commands"] == true) {
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
      } else {
        Serial.printf("[MQTT] Hub command message (legacy): %s\n", message.c_str());
      }
    }
  }
}

// ============================================================================
// Initialize MQTT Client
// ============================================================================
void initMQTT(const char* clientIdParam, MqttDoorbellCallback callback, MqttFaceDetectionCallback faceCallback) {
  clientId = String(clientIdParam);
  hubDeviceId = String(clientIdParam); // Store device ID for command topic
  doorbellCallback = callback;
  faceDetectionCallback = faceCallback;

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

    // Subscribe to device-specific command topic
    char commandTopic[128];
    snprintf(commandTopic, sizeof(commandTopic), TOPIC_HUB_COMMAND_TEMPLATE, hubDeviceId.c_str());
    mqttClient.subscribe(commandTopic);
    Serial.printf("[MQTT] Subscribed to: %s\n", commandTopic);

    mqttClient.subscribe(TOPIC_FACE_DETECTION);
    Serial.printf("[MQTT] Subscribed to: %s\n", TOPIC_FACE_DETECTION);

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
