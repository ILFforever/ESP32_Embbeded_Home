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

// Doorbell ring tracking removed - now using MQTT instead of polling

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

        // NEW: Check for pending commands
        if (responseDoc.containsKey("has_pending_commands")) {
          bool hasPendingCommands = responseDoc["has_pending_commands"];
          if (hasPendingCommands) {
            Serial.println("[Heartbeat] → Server says we have pending commands!");
            // Immediately fetch and execute commands
            fetchAndExecuteCommands();
          }
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
// Doorbell ring polling removed - now using MQTT for real-time notifications
// See mqtt_client.cpp for MQTT implementation
// ============================================================================

// ============================================================================
// Helper functions
// ============================================================================
bool getLastHeartbeatSuccess() {
  return lastHeartbeatSuccess;
}

// ============================================================================
// Send log/error to backend for Firebase storage
// ============================================================================
void sendLogToBackend(const char* level, const char* message, const char* data) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[HubLog] WiFi not connected - can't send log");
    return;
  }

  HTTPClient http;
  String url = String(BACKEND_SERVER_URL) + "/api/v1/devices/hub/log";

  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Token", HUB_API_TOKEN);

  // Create JSON payload
  JsonDocument doc;
  doc["device_id"] = HUB_DEVICE_ID;
  doc["level"] = level;  // "error", "warning", "info", "debug"
  doc["message"] = message;
  if (data != nullptr) {
    doc["data"] = data;
  }
  doc["timestamp"] = millis();

  String jsonString;
  serializeJson(doc, jsonString);

  int httpResponseCode = http.POST(jsonString);

  if (httpResponseCode == 200) {
    Serial.printf("[HubLog] ✓ Log sent to backend: [%s] %s\n", level, message);
  } else {
    Serial.printf("[HubLog] ✗ Failed to send log (code %d)\n", httpResponseCode);
  }

  http.end();
}

// ============================================================================
// Execute a command received from backend
// ============================================================================
bool executeCommand(String action, JsonObject params) {
  Serial.printf("[Commands] Executing action: %s\n", action.c_str());

  // Hub Alert command (NEW!)
  if (action == "hub_alert") {
    if (params.containsKey("message")) {
      const char* message = params["message"];
      const char* level = params["level"] | "info";
      int duration = params["duration"] | 10;

      Serial.printf("[Commands] Hub Alert: [%s] %s (duration: %d sec)\n", level, message, duration);

      // TODO: Display alert on LCD screen
      // You'll need to implement this based on your LCD library
      // displayAlert(message, level, duration);

      return true;
    } else {
      Serial.println("[Commands] hub_alert requires 'message' parameter");
      return false;
    }
  }

  // Amplifier commands
  else if (action == "amp_play") {
    if (params.containsKey("url")) {
      const char* url = params["url"];
      Serial.printf("[Commands] Playing amplifier URL: %s\n", url);
      sendAmpCommand("play", url);
      return true;
    } else {
      Serial.println("[Commands] amp_play requires 'url' parameter");
      return false;
    }
  }
  else if (action == "amp_stop") {
    Serial.println("[Commands] Stopping amplifier");
    sendAmpCommand("stop", "");
    return true;
  }
  else if (action == "amp_restart") {
    Serial.println("[Commands] Restarting amplifier");
    sendAmpCommand("restart", "");
    return true;
  }
  else if (action == "amp_volume") {
    if (params.containsKey("level")) {
      int level = params["level"];
      Serial.printf("[Commands] Setting amplifier volume to %d\n", level);

      // Send volume command to amplifier
      JsonDocument doc;
      doc["cmd"] = "volume";
      doc["level"] = level;
      String output;
      serializeJson(doc, output);
      AmpSerial.println(output);

      return true;
    } else {
      Serial.println("[Commands] amp_volume requires 'level' parameter");
      return false;
    }
  }
  else if (action == "amp_status") {
    Serial.println("[Commands] Requesting amplifier status");

    // Send status command to amplifier
    JsonDocument doc;
    doc["cmd"] = "status";
    String output;
    serializeJson(doc, output);
    AmpSerial.println(output);

    return true;
  }

  // Unknown command
  else {
    Serial.printf("[Commands] Unknown action: %s\n", action.c_str());
    return false;
  }
}

// ============================================================================
// Fetch and execute pending commands from backend
// ============================================================================
void fetchAndExecuteCommands() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[Commands] WiFi not connected - cannot fetch commands");
    return;
  }

  HTTPClient http;
  String url = String(BACKEND_SERVER_URL) + "/api/v1/devices/commands/pending";

  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  // Add Authorization header with Bearer token
  if (HUB_API_TOKEN && strlen(HUB_API_TOKEN) > 0) {
    String authHeader = String("Bearer ") + HUB_API_TOKEN;
    http.addHeader("Authorization", authHeader.c_str());
  }

  http.setTimeout(5000);

  // Build JSON payload
  JsonDocument doc;
  doc["device_id"] = HUB_DEVICE_ID;

  String jsonString;
  serializeJson(doc, jsonString);

  // Send POST request
  int httpResponseCode = http.POST(jsonString);

  if (httpResponseCode == 200) {
    String response = http.getString();

    // Parse response
    JsonDocument responseDoc;
    DeserializationError error = deserializeJson(responseDoc, response);

    if (!error && responseDoc.containsKey("commands")) {
      JsonArray commands = responseDoc["commands"];
      int commandCount = commands.size();

      Serial.printf("[Commands] Fetched %d pending command(s)\n", commandCount);

      for (JsonObject cmd : commands) {
        String commandId = cmd["id"].as<String>();
        String action = cmd["action"].as<String>();
        JsonObject params = cmd["params"];

        Serial.printf("[Commands] Executing: %s (ID: %s)\n", action.c_str(), commandId.c_str());

        // Special handling for system_restart: acknowledge BEFORE executing
        if (action == "system_restart" || action == "reboot") {
          Serial.println("[Commands] System restart requested - acknowledging before execution");
          acknowledgeCommand(commandId, true, action);

          Serial.println("[Commands] Rebooting Hub in 3 seconds...");
          delay(3000);
          ESP.restart();
          // Won't reach here
        }

        // Execute command
        bool success = executeCommand(action, params);

        // Acknowledge execution
        acknowledgeCommand(commandId, success, action);
      }
    }
  } else {
    Serial.printf("[Commands] Failed to fetch (code: %d)\n", httpResponseCode);
  }

  http.end();
}

// ============================================================================
// Acknowledge command execution to backend
// ============================================================================
void acknowledgeCommand(String commandId, bool success, String action) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[Commands] WiFi not connected - cannot acknowledge");
    return;
  }

  HTTPClient http;
  String url = String(BACKEND_SERVER_URL) + "/api/v1/devices/commands/ack";

  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  // Add Authorization header with Bearer token
  if (HUB_API_TOKEN && strlen(HUB_API_TOKEN) > 0) {
    String authHeader = String("Bearer ") + HUB_API_TOKEN;
    http.addHeader("Authorization", authHeader.c_str());
  }

  http.setTimeout(5000);

  // Build JSON payload
  JsonDocument doc;
  doc["device_id"] = HUB_DEVICE_ID;
  doc["command_id"] = commandId;
  doc["success"] = success;
  if (success) {
    doc["result"] = "Command executed: " + action;
  } else {
    doc["error"] = "Failed to execute: " + action;
  }

  String jsonString;
  serializeJson(doc, jsonString);

  // Send POST request
  int httpResponseCode = http.POST(jsonString);

  if (httpResponseCode == 200) {
    Serial.printf("[Commands] ✓ Acknowledged command %s (%s)\n",
                  commandId.c_str(), success ? "success" : "failed");
  } else {
    Serial.printf("[Commands] ✗ Failed to acknowledge (code: %d)\n", httpResponseCode);
  }

  http.end();
}
