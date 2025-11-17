#include "heartbeat.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// Configuration variables (set via initHeartbeat)
const char* BACKEND_SERVER_URL = "";
const char* DEVICE_ID = "";
const char* DEVICE_TYPE = "";
const char* DEVICE_API_TOKEN = "";

// Status tracking
static bool lastHeartbeatSuccess = false;
static unsigned long lastHeartbeatTime = 0;

// ============================================================================
// Initialize heartbeat module with server config
// ============================================================================
void initHeartbeat(const char* serverUrl, const char* deviceId, const char* deviceType, const char* apiToken) {
  BACKEND_SERVER_URL = serverUrl;
  DEVICE_ID = deviceId;
  DEVICE_TYPE = deviceType;
  DEVICE_API_TOKEN = apiToken;

  Serial.println("[Heartbeat] Initialized");
  Serial.printf("  Server: %s\n", serverUrl);
  Serial.printf("  Device: %s (%s)\n", deviceId, deviceType);
  Serial.printf("  Token: %s\n", apiToken && strlen(apiToken) > 0 ? "***configured***" : "NOT SET");
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

  http.begin(url);  // Plain HTTP - no SSL (memory optimization for ESP32)
  http.addHeader("Content-Type", "application/json");

  // Add Authorization header with Bearer token
  if (DEVICE_API_TOKEN && strlen(DEVICE_API_TOKEN) > 0) {
    String authHeader = String("Bearer ") + DEVICE_API_TOKEN;
    http.addHeader("Authorization", authHeader.c_str());
  }

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

  http.begin(url);  // Plain HTTP - no SSL (memory optimization for ESP32)
  http.addHeader("Content-Type", "application/json");

  // Add Authorization header with Bearer token
  if (DEVICE_API_TOKEN && strlen(DEVICE_API_TOKEN) > 0) {
    String authHeader = String("Bearer ") + DEVICE_API_TOKEN;
    http.addHeader("Authorization", authHeader.c_str());
  }

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

  http.begin(url);  // Plain HTTP - no SSL (memory optimization for ESP32)
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
// Send doorbell ring event to backend (notify hub to play audio)
// ============================================================================
void sendDoorbellRing() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[Doorbell] WiFi not connected - skipping ring event");
    return;
  }

  HTTPClient http;
  String url = String(BACKEND_SERVER_URL) + "/api/v1/devices/doorbell/ring";

  http.begin(url);  // Plain HTTP - no SSL (memory optimization for ESP32)
  http.addHeader("Content-Type", "application/json");

  // Add Authorization header with Bearer token
  if (DEVICE_API_TOKEN && strlen(DEVICE_API_TOKEN) > 0) {
    String authHeader = String("Bearer ") + DEVICE_API_TOKEN;
    http.addHeader("Authorization", authHeader.c_str());
  }

  http.setTimeout(5000);

  // Build JSON payload
  JsonDocument doc;
  doc["device_id"] = DEVICE_ID;

  String jsonString;
  serializeJson(doc, jsonString);

  // Send POST request
  int httpResponseCode = http.POST(jsonString);

  if (httpResponseCode > 0) {
    String response = http.getString();

    if (httpResponseCode == 200) {
      Serial.printf("[Doorbell] ✓ Ring event sent (code: %d)\n", httpResponseCode);

      // Optional: Parse response
      JsonDocument responseDoc;
      DeserializationError error = deserializeJson(responseDoc, response);
      if (!error && responseDoc.containsKey("status")) {
        const char* status = responseDoc["status"];
        Serial.printf("[Doorbell] → Server response: %s\n", status);
      }
    } else {
      Serial.printf("[Doorbell] ✗ Failed (code: %d)\n", httpResponseCode);
      Serial.printf("[Doorbell] Response: %s\n", response.c_str());
    }
  } else {
    Serial.printf("[Doorbell] ✗ Connection failed: %s\n",
                  http.errorToString(httpResponseCode).c_str());
  }

  http.end();
}

// ============================================================================
// Send face detection event to backend (saves to Firebase, publishes to Hub)
// ============================================================================
void sendFaceDetection(bool recognized, const char* name, float confidence, const char* imageData) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[FaceDetection] WiFi not connected - skipping");
    return;
  }

  HTTPClient http;
  String url = String(BACKEND_SERVER_URL) + "/api/v1/devices/doorbell/face-detection";

  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  // Add Authorization header with Bearer token
  if (DEVICE_API_TOKEN && strlen(DEVICE_API_TOKEN) > 0) {
    String authHeader = String("Bearer ") + DEVICE_API_TOKEN;
    http.addHeader("Authorization", authHeader.c_str());
  }

  http.setTimeout(10000); // Longer timeout for image uploads

  // Build JSON payload
  JsonDocument doc;
  doc["device_id"] = DEVICE_ID;
  doc["name"] = name;
  doc["confidence"] = confidence;
  if (imageData != nullptr) {
    doc["image"] = imageData; // Base64 encoded image or URL
  }
  doc["timestamp"] = millis();

  String jsonString;
  serializeJson(doc, jsonString);

  // Send POST request
  int httpResponseCode = http.POST(jsonString);

  if (httpResponseCode > 0) {
    String response = http.getString();

    if (httpResponseCode == 200) {
      Serial.printf("[FaceDetection] ✓ Sent to backend (recognized: %s, name: %s, conf: %.2f)\n",
                    recognized ? "Yes" : "No", name, confidence);

      // Parse response
      JsonDocument responseDoc;
      DeserializationError error = deserializeJson(responseDoc, response);
      if (!error && responseDoc.containsKey("event_id")) {
        const char* eventId = responseDoc["event_id"];
        Serial.printf("[FaceDetection] → Event ID: %s\n", eventId);
      }
    } else {
      Serial.printf("[FaceDetection] ✗ Failed (code: %d)\n", httpResponseCode);
      Serial.printf("[FaceDetection] Response: %s\n", response.c_str());
    }
  } else {
    Serial.printf("[FaceDetection] ✗ Connection failed: %s\n",
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
