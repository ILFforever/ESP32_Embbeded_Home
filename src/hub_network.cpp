#include "hub_network.h"
#include "uart_slaves.h"
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
  String url = String(BACKEND_SERVER_URL) + "/api/v1/devices/doorbell/" + String(DOORBELL_DEVICE_ID) + "/status";

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

// ============================================================================
// Send mesh sensor data to backend
// Forwards sensor data from room sensors (received via Main_mesh) to backend
// ============================================================================
void sendMeshSensorData(const char* jsonData) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[MeshData] WiFi not connected - skipping");
    return;
  }

  // Parse the incoming JSON
  JsonDocument incomingDoc;
  DeserializationError error = deserializeJson(incomingDoc, jsonData);

  if (error) {
    Serial.printf("[MeshData] ✗ JSON parse error: %s\n", error.c_str());
    return;
  }

  // Check if this is a single mesh_node message (new format)
  if (incomingDoc.containsKey("source") && incomingDoc["source"] == "mesh_node") {
    // Single mesh node sensor data
    const char* deviceId = incomingDoc["device_id"] | "unknown";
    const char* deviceType = incomingDoc["device_type"] | "sensor";

    // Check if sensors data exists and is not null
    if (!incomingDoc.containsKey("sensors") || incomingDoc["sensors"].isNull()) {
      Serial.printf("[MeshData] ⚠ No sensor data from %s\n", deviceId);
      return;
    }

    JsonObject sensorData = incomingDoc["sensors"];

    Serial.printf("[MeshData] Forwarding mesh node %s to backend\n", deviceId);

    HTTPClient http;
    String url = String(BACKEND_SERVER_URL) + "/api/v1/devices/sensor-data";

    http.begin(url);
    http.addHeader("Content-Type", "application/json");

    // Use hub's token for authentication (mesh nodes don't have their own tokens)
    if (HUB_API_TOKEN && strlen(HUB_API_TOKEN) > 0) {
      String authHeader = String("Bearer ") + HUB_API_TOKEN;
      http.addHeader("Authorization", authHeader.c_str());
    }

    http.setTimeout(5000);

    // Build JSON payload
    JsonDocument doc;
    doc["device_id"] = deviceId;
    doc["device_type"] = deviceType;
    doc["timestamp"] = millis();
    doc["forwarded_by"] = HUB_DEVICE_ID;

    // Copy all sensor data
    JsonObject data = doc.createNestedObject("data");
    for (JsonPair kv : sensorData) {
      data[kv.key()] = kv.value();
    }

    String jsonString;
    serializeJson(doc, jsonString);

    // Send POST
    int httpResponseCode = http.POST(jsonString);

    if (httpResponseCode > 0) {
      if (httpResponseCode == 200) {
        Serial.printf("[MeshData] ✓ Mesh node %s data forwarded (code: %d)\n",
                      deviceId, httpResponseCode);

        // Parse response
        String response = http.getString();
        JsonDocument responseDoc;
        DeserializationError respError = deserializeJson(responseDoc, response);
        if (!respError && responseDoc.containsKey("written")) {
          bool written = responseDoc["written"];
          if (written) {
            Serial.printf("[MeshData]   → Written to Firebase\n");
          } else {
            Serial.printf("[MeshData]   → Throttled (cached)\n");
          }
        }
      } else {
        Serial.printf("[MeshData] ✗ Failed to forward mesh node %s (code: %d)\n",
                      deviceId, httpResponseCode);
      }
    } else {
      Serial.printf("[MeshData] ✗ Connection failed: %s\n",
                    http.errorToString(httpResponseCode).c_str());
    }

    http.end();
    return;
  }

  // Old format: Check if we have mesh_sensors array
  if (!incomingDoc.containsKey("mesh_sensors")) {
    Serial.println("[MeshData] No mesh_sensors array or mesh_node data found");
    return;
  }

  JsonArray meshSensors = incomingDoc["mesh_sensors"];
  int sensorCount = meshSensors.size();

  if (sensorCount == 0) {
    Serial.println("[MeshData] No mesh sensors to forward");
    return;
  }

  Serial.printf("[MeshData] Forwarding %d mesh sensor(s) to backend\n", sensorCount);

  // Send each mesh sensor's data to the backend
  int successCount = 0;
  int failCount = 0;

  for (JsonObject sensor : meshSensors) {
    // Extract sensor information
    const char* deviceId = sensor["device_id"] | "unknown";
    const char* deviceType = sensor["device_type"] | "sensor";

    // Extract the nested data object
    JsonObject sensorData = sensor["data"];

    // Extract API token from the sensor data if present
    const char* apiToken = nullptr;
    if (sensorData.containsKey("api_token")) {
      apiToken = sensorData["api_token"];
    }

    HTTPClient http;
    String url = String(BACKEND_SERVER_URL) + "/api/v1/devices/sensor-data";

    http.begin(url);
    http.addHeader("Content-Type", "application/json");

    // Add Authorization header using the sensor's API token
    if (apiToken && strlen(apiToken) > 0) {
      String authHeader = String("Bearer ") + apiToken;
      http.addHeader("Authorization", authHeader.c_str());
    } else {
      Serial.printf("[MeshData] ⚠ Warning: No API token for sensor %s\n", deviceId);
    }

    http.setTimeout(5000);

    // Build JSON payload for this sensor
    JsonDocument doc;
    doc["device_id"] = deviceId;
    doc["device_type"] = deviceType;
    doc["timestamp"] = millis();
    doc["forwarded_by"] = HUB_DEVICE_ID;

    // Copy all sensor data (excluding api_token as it's in header)
    JsonObject data = doc.createNestedObject("data");
    for (JsonPair kv : sensorData) {
      if (strcmp(kv.key().c_str(), "api_token") != 0) {
        data[kv.key()] = kv.value();
      }
    }

    String jsonString;
    serializeJson(doc, jsonString);

    // Send POST
    int httpResponseCode = http.POST(jsonString);

    if (httpResponseCode > 0) {
      if (httpResponseCode == 200) {
        Serial.printf("[MeshData] ✓ Sensor %s data forwarded (code: %d)\n",
                      deviceId, httpResponseCode);
        successCount++;

        // Parse response
        String response = http.getString();
        JsonDocument responseDoc;
        DeserializationError respError = deserializeJson(responseDoc, response);
        if (!respError && responseDoc.containsKey("written")) {
          bool written = responseDoc["written"];
          if (written) {
            Serial.printf("[MeshData]   → Written to Firebase\n");
          } else {
            Serial.printf("[MeshData]   → Throttled (cached)\n");
          }
        }
      } else {
        Serial.printf("[MeshData] ✗ Failed to forward sensor %s (code: %d)\n",
                      deviceId, httpResponseCode);
        failCount++;
      }
    } else {
      Serial.printf("[MeshData] ✗ Connection failed for sensor %s: %s\n",
                    deviceId, http.errorToString(httpResponseCode).c_str());
      failCount++;
    }

    http.end();

    // Small delay between requests to avoid overwhelming the backend
    if (sensorCount > 1) {
      delay(100);
    }
  }

  Serial.printf("[MeshData] Summary: %d succeeded, %d failed\n", successCount, failCount);
}

// ============================================================================
// Send Main_mesh local sensor data to backend
// Forwards local sensor data from Main_mesh (DHT11, PMS5003) to backend
// ============================================================================
void sendMainMeshLocalData(const char* jsonData) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[MainMeshLocal] WiFi not connected - skipping");
    return;
  }

  // Parse the incoming JSON to extract local sensors
  JsonDocument incomingDoc;
  DeserializationError error = deserializeJson(incomingDoc, jsonData);

  if (error) {
    Serial.printf("[MainMeshLocal] ✗ JSON parse error: %s\n", error.c_str());
    return;
  }

  // Check if we have sensors object
  if (!incomingDoc.containsKey("sensors")) {
    Serial.println("[MainMeshLocal] No sensors found in data");
    return;
  }

  JsonObject localSensors = incomingDoc["sensors"];

  // Check if there's any data
  if (localSensors.size() == 0) {
    Serial.println("[MainMeshLocal] No local sensor data to forward");
    return;
  }

  // Extract device info from the message
  const char* deviceId = incomingDoc["device_id"] | "hb_001";
  const char* deviceType = incomingDoc["device_type"] | "hub";

  Serial.printf("[MainMeshLocal] Forwarding Main_mesh local sensors to backend (device: %s)\n", deviceId);

  HTTPClient http;
  String url = String(BACKEND_SERVER_URL) + "/api/v1/devices/sensor-data";

  Serial.printf("[MainMeshLocal] DEBUG: URL = %s\n", url.c_str());
  Serial.printf("[MainMeshLocal] DEBUG: Device ID = %s\n", deviceId);
  Serial.printf("[MainMeshLocal] DEBUG: Device Type = %s\n", deviceType);

  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  // Add Authorization header with Bearer token
  // Main_mesh doesn't have its own API token since it communicates via UART
  // Use the hub's token for authentication
  if (HUB_API_TOKEN && strlen(HUB_API_TOKEN) > 0) {
    String authHeader = String("Bearer ") + HUB_API_TOKEN;
    http.addHeader("Authorization", authHeader.c_str());
    Serial.printf("[MainMeshLocal] DEBUG: Auth token = %s\n", HUB_API_TOKEN && strlen(HUB_API_TOKEN) > 0 ? "***SET***" : "MISSING");
  } else {
    Serial.println("[MainMeshLocal] DEBUG: ⚠ WARNING - No API token set!");
  }

  http.setTimeout(5000);

  // Build JSON payload
  JsonDocument doc;
  doc["device_id"] = deviceId;
  doc["device_type"] = deviceType;
  doc["timestamp"] = millis();
  doc["forwarded_by"] = HUB_DEVICE_ID;

  // Copy all local sensor data
  JsonObject data = doc.createNestedObject("data");
  for (JsonPair kv : localSensors) {
    data[kv.key()] = kv.value();
  }

  String jsonString;
  serializeJson(doc, jsonString);

  Serial.printf("[MainMeshLocal] DEBUG: JSON payload = %s\n", jsonString.c_str());

  // Send POST
  int httpResponseCode = http.POST(jsonString);

  if (httpResponseCode > 0) {
    if (httpResponseCode == 200) {
      Serial.printf("[MainMeshLocal] ✓ Main_mesh local data forwarded (code: %d)\n", httpResponseCode);

      // Parse response
      String response = http.getString();
      JsonDocument responseDoc;
      DeserializationError respError = deserializeJson(responseDoc, response);
      if (!respError && responseDoc.containsKey("written")) {
        bool written = responseDoc["written"];
        if (written) {
          Serial.printf("[MainMeshLocal]   → Written to Firebase\n");
        } else {
          Serial.printf("[MainMeshLocal]   → Throttled (cached)\n");
        }
      }
    } else {
      Serial.printf("[MainMeshLocal] ✗ Failed to forward (code: %d)\n", httpResponseCode);
      String response = http.getString();
      if (response.length() > 0) {
        Serial.printf("[MainMeshLocal] DEBUG: Error response = %s\n", response.c_str());
      }
    }
  } else {
    Serial.printf("[MainMeshLocal] ✗ Connection failed: %s\n",
                  http.errorToString(httpResponseCode).c_str());
  }

  http.end();
}
