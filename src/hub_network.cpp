#include "hub_network.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// Configuration variables
static const char* BACKEND_SERVER_URL = "";
static const char* HUB_DEVICE_ID = "";
static const char* HUB_DEVICE_TYPE = "";
static const char* HUB_API_TOKEN = "";
static const char* DOORBELL_DEVICE_ID = "";

// Status tracking
static bool lastHeartbeatSuccess = false;
static unsigned long lastHeartbeatTime = 0;

// Doorbell ring tracking
static unsigned long lastKnownRingMs = 0;
static DoorbellRingCallback doorbellRingCallback = nullptr;

// ============================================================================
// Initialize heartbeat module (WiFi must already be connected)
// ============================================================================
void initHeartbeat(const char* serverUrl, const char* deviceId,
                   const char* deviceType, const char* apiToken,
                   const char* doorbellId) {
  BACKEND_SERVER_URL = serverUrl;
  HUB_DEVICE_ID = deviceId;
  HUB_DEVICE_TYPE = deviceType;
  HUB_API_TOKEN = apiToken;
  DOORBELL_DEVICE_ID = doorbellId;

  Serial.println("[Heartbeat] Initialized");
  Serial.printf("  Server: %s\n", serverUrl);
  Serial.printf("  Hub ID: %s (%s)\n", deviceId, deviceType);
  Serial.printf("  Token: %s\n", apiToken && strlen(apiToken) > 0 ? "***configured***" : "NOT SET");
  Serial.printf("  Monitoring: %s\n", doorbellId);
}

// ============================================================================
// Send hub's heartbeat to backend
// ============================================================================
void sendHubHeartbeat() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[Heartbeat] WiFi not connected - skipping");
    lastHeartbeatSuccess = false;
    return;
  }

  HTTPClient http;
  String url = String(BACKEND_SERVER_URL) + "/api/v1/devices/heartbeat";

  http.begin(url);  // Plain HTTP
  http.addHeader("Content-Type", "application/json");

  // Add Authorization header
  if (HUB_API_TOKEN && strlen(HUB_API_TOKEN) > 0) {
    String authHeader = String("Bearer ") + HUB_API_TOKEN;
    http.addHeader("Authorization", authHeader.c_str());
  }

  http.setTimeout(5000);

  // Build JSON payload
  JsonDocument doc;
  doc["device_id"] = HUB_DEVICE_ID;
  doc["device_type"] = HUB_DEVICE_TYPE;
  doc["uptime_ms"] = millis();
  doc["free_heap"] = ESP.getFreeHeap();
  doc["wifi_rssi"] = WiFi.RSSI();
  doc["ip_address"] = WiFi.localIP().toString();

  String jsonString;
  serializeJson(doc, jsonString);

  // Send POST
  int httpResponseCode = http.POST(jsonString);

  if (httpResponseCode > 0) {
    if (httpResponseCode == 200) {
      Serial.printf("[Heartbeat] ✓ Hub heartbeat sent (code: %d)\n", httpResponseCode);
      lastHeartbeatSuccess = true;
      lastHeartbeatTime = millis();

      // Parse response
      String response = http.getString();
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
// Check doorbell status from backend
// ============================================================================
DeviceStatus checkDoorbellStatus() {
  DeviceStatus status;
  status.online = false;
  status.data_valid = false;

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[Status] WiFi not connected - cannot check doorbell");
    return status;
  }

  HTTPClient http;
  String url = String(BACKEND_SERVER_URL) + "/api/v1/devices/" + String(DOORBELL_DEVICE_ID) + "/status";

  http.begin(url);  // Plain HTTP, no auth needed for status check
  http.setTimeout(5000);

  int httpResponseCode = http.GET();

  if (httpResponseCode == 200) {
    String response = http.getString();

    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, response);

    if (!error) {
      status.online = doc["online"] | false;
      status.last_seen = doc["last_seen"] | "Unknown";
      status.wifi_rssi = doc["wifi_rssi"] | 0;
      status.free_heap = doc["free_heap"] | 0;
      status.data_valid = true;

      Serial.printf("[Status] Doorbell: %s (RSSI: %d dBm)\n",
                    status.online ? "ONLINE" : "OFFLINE",
                    status.wifi_rssi);
    } else {
      Serial.printf("[Status] ✗ JSON parse error: %s\n", error.c_str());
    }
  } else {
    Serial.printf("[Status] ✗ HTTP error: %d\n", httpResponseCode);
  }

  http.end();
  return status;
}

// ============================================================================
// Check for new doorbell ring events by polling Firebase
// Returns true if a new ring was detected
// ============================================================================
bool checkDoorbellRing() {
  if (WiFi.status() != WL_CONNECTED) {
    return false;
  }

  HTTPClient http;
  String url = String(BACKEND_SERVER_URL) + "/api/v1/devices/" + String(DOORBELL_DEVICE_ID) + "/status";

  http.begin(url);  // Plain HTTP
  http.setTimeout(3000); // Shorter timeout for frequent polling

  int httpResponseCode = http.GET();

  if (httpResponseCode == 200) {
    String response = http.getString();

    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, response);

    if (!error) {
      // Check if last_ring_ms field exists and has changed
      if (doc.containsKey("last_ring_ms")) {
        unsigned long ringMs = doc["last_ring_ms"] | 0;

        // First time or value changed
        if (lastKnownRingMs == 0) {
          // Initialize on first run - don't trigger
          lastKnownRingMs = ringMs;
          Serial.printf("[Doorbell] Initialized ring tracking (last_ring_ms: %lu)\n", ringMs);
          http.end();
          return false;
        } else if (ringMs > lastKnownRingMs) {
          // New ring detected!
          Serial.printf("[Doorbell] 🔔 NEW RING DETECTED! (old: %lu, new: %lu)\n", lastKnownRingMs, ringMs);
          lastKnownRingMs = ringMs;

          // Call callback if set
          if (doorbellRingCallback != nullptr) {
            doorbellRingCallback();
          }

          http.end();
          return true;
        }
      }
    }
  }

  http.end();
  return false;
}

// ============================================================================
// Set callback function for doorbell ring events
// ============================================================================
void setDoorbellRingCallback(DoorbellRingCallback callback) {
  doorbellRingCallback = callback;
  Serial.println("[Doorbell] Ring callback registered");
}

// ============================================================================
// Helper functions
// ============================================================================
bool getLastHeartbeatSuccess() {
  return lastHeartbeatSuccess;
}
