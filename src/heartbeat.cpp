#include "heartbeat.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// Configuration variables (set via initHeartbeat)
const char* BACKEND_SERVER_URL = "";
const char* DEVICE_ID = "";
const char* DEVICE_TYPE = "";

// Status tracking
static bool lastHeartbeatSuccess = false;
static unsigned long lastHeartbeatTime = 0;

// ============================================================================
// Initialize heartbeat module with server config
// ============================================================================
void initHeartbeat(const char* serverUrl, const char* deviceId, const char* deviceType) {
  BACKEND_SERVER_URL = serverUrl;
  DEVICE_ID = deviceId;
  DEVICE_TYPE = deviceType;

  Serial.println("[Heartbeat] Initialized");
  Serial.printf("  Server: %s\n", serverUrl);
  Serial.printf("  Device: %s (%s)\n", deviceId, deviceType);
}

// ============================================================================
// Send heartbeat to backend server
// ============================================================================
void sendHeartbeat() {
  // Check WiFi connection
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[Heartbeat] WiFi not connected - skipping");
    lastHeartbeatSuccess = false;
    return;
  }

  HTTPClient http;
  String url = String(BACKEND_SERVER_URL) + "/api/v1/devices/heartbeat";

  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000); // 5 second timeout

  // Build JSON payload
  JsonDocument doc;
  doc["device_id"] = DEVICE_ID;
  doc["device_type"] = DEVICE_TYPE;
  doc["uptime_ms"] = millis();
  doc["free_heap"] = ESP.getFreeHeap();
  doc["wifi_rssi"] = WiFi.RSSI();
  doc["ip_address"] = WiFi.localIP().toString();

  String jsonString;
  serializeJson(doc, jsonString);

  // Send POST request
  int httpResponseCode = http.POST(jsonString);

  if (httpResponseCode > 0) {
    String response = http.getString();

    if (httpResponseCode == 200) {
      Serial.printf("[Heartbeat] ✓ Sent (code: %d)\n", httpResponseCode);
      lastHeartbeatSuccess = true;
      lastHeartbeatTime = millis();

      // Optional: Parse response to see if data was written to Firebase
      JsonDocument responseDoc;
      DeserializationError error = deserializeJson(responseDoc, response);
      if (!error && responseDoc.containsKey("written")) {
        bool written = responseDoc["written"];
        if (written) {
          Serial.println("[Heartbeat] → Written to Firebase");
        } else {
          Serial.println("[Heartbeat] → Throttled (cached)");
        }
      }
    } else {
      Serial.printf("[Heartbeat] ✗ Failed (code: %d)\n", httpResponseCode);
      lastHeartbeatSuccess = false;
    }
  } else {
    Serial.printf("[Heartbeat] ✗ Connection failed: %s\n",
                  http.errorToString(httpResponseCode).c_str());
    lastHeartbeatSuccess = false;
  }

  http.end();
}

// ============================================================================
// Send sensor data to backend (with smart throttling on backend side)
// ============================================================================
void sendSensorData(float temperature, float humidity, int motion) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[Sensor] WiFi not connected - skipping");
    return;
  }

  HTTPClient http;
  String url = String(BACKEND_SERVER_URL) + "/api/v1/devices/sensor";

  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);

  // Build JSON payload
  JsonDocument doc;
  doc["device_id"] = DEVICE_ID;

  JsonObject sensors = doc["sensors"].to<JsonObject>();
  sensors["temperature"] = temperature;
  sensors["humidity"] = humidity;
  sensors["motion"] = motion;

  String jsonString;
  serializeJson(doc, jsonString);

  // Send POST request
  int httpResponseCode = http.POST(jsonString);

  if (httpResponseCode == 200) {
    Serial.println("[Sensor] ✓ Data sent");
  } else {
    Serial.printf("[Sensor] ✗ Failed (code: %d)\n", httpResponseCode);
  }

  http.end();
}

// ============================================================================
// Send disconnect warning to backend (for 30+ second disconnects)
// ============================================================================
void sendDisconnectWarning(const char* module_name, bool isDisconnected) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[Warning] WiFi not connected - cannot send warning");
    return;
  }

  HTTPClient http;
  String url = String(BACKEND_SERVER_URL) + "/api/v1/devices/warning";

  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);

  // Build JSON payload
  JsonDocument doc;
  doc["device_id"] = DEVICE_ID;
  doc["module"] = module_name;
  doc["status"] = isDisconnected ? "disconnected" : "reconnected";
  doc["timestamp"] = millis();

  String jsonString;
  serializeJson(doc, jsonString);

  // Send POST request
  int httpResponseCode = http.POST(jsonString);

  if (httpResponseCode > 0) {
    Serial.printf("[Warning] Module '%s' %s - sent to server (code: %d)\n",
                  module_name,
                  isDisconnected ? "DISCONNECTED" : "RECONNECTED",
                  httpResponseCode);
  } else {
    Serial.printf("[Warning] Failed to send warning: %s\n",
                  http.errorToString(httpResponseCode).c_str());
  }

  http.end();
}

// ============================================================================
// Status getters
// ============================================================================
bool getLastHeartbeatSuccess() {
  return lastHeartbeatSuccess;
}

unsigned long getLastHeartbeatTime() {
  return lastHeartbeatTime;
}
