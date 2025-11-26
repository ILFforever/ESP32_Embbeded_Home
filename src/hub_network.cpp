#include "hub_network.h"
#include "uart_slaves.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <time.h>

// Configuration variables
static const char* BACKEND_SERVER_URL = "";
static const char* HUB_DEVICE_ID = "";
static const char* HUB_DEVICE_TYPE = "";
static const char* HUB_API_TOKEN = "";
static const char* DOORBELL_DEVICE_ID = "";

// Status tracking
static bool lastHeartbeatSuccess = false;
static unsigned long lastHeartbeatTime = 0;

// Flag to indicate pending commands (set by MQTT or heartbeat, processed in main loop)
volatile bool hasPendingCommands = false;

// ============================================================================
// Helper function to get current Unix timestamp (seconds since epoch)
// ============================================================================
static unsigned long getCurrentTimestamp() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    // NTP not synced yet, log warning and return 0
    Serial.println("[Time] ⚠ NTP not synced - timestamp will be 0");
    return 0;
  }
  time_t now;
  time(&now);

  // Debug: Print the timestamp being returned
  Serial.printf("[Time] Current timestamp: %lu (%d-%02d-%02d %02d:%02d:%02d)\n",
                (unsigned long)now,
                timeinfo.tm_year + 1900,
                timeinfo.tm_mon + 1,
                timeinfo.tm_mday,
                timeinfo.tm_hour,
                timeinfo.tm_min,
                timeinfo.tm_sec);

  return (unsigned long)now;
}

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

        // Command notifications are now handled via MQTT (real-time)
        // No need to poll for commands via heartbeat
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
  String url = String(BACKEND_SERVER_URL) + "/api/v1/devices/" + String(DOORBELL_DEVICE_ID) + "/status/device";

  Serial.printf("[Status] Checking doorbell status for %s\n", DOORBELL_DEVICE_ID);
  Serial.printf("[Status] URL: %s\n", url.c_str());

  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  // Add Authorization header
  if (HUB_API_TOKEN && strlen(HUB_API_TOKEN) > 0) {
    String authHeader = String("Bearer ") + HUB_API_TOKEN;
    http.addHeader("Authorization", authHeader.c_str());
  }

  http.setTimeout(5000);

  // Build JSON body with hub device_id
  JsonDocument requestDoc;
  requestDoc["device_id"] = "hb_001";  // Hub device ID
  String requestBody;
  serializeJson(requestDoc, requestBody);

  Serial.printf("[Status] Request body: %s\n", requestBody.c_str());

  // Send GET request with body
  int httpResponseCode = http.sendRequest("GET", requestBody);

  if (httpResponseCode == 200) {
    String response = http.getString();

    // Debug: Print raw response
    Serial.println("[Status] Raw JSON response:");
    Serial.println(response);

    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, response);

    if (!error) {
      status.online = doc["online"] | false;
      status.last_seen = doc["last_seen"] | "Unknown";
      status.wifi_rssi = doc["wifi_rssi"] | 0;
      status.free_heap = doc["free_heap"] | 0;
      status.data_valid = true;

      Serial.printf("[Status] Parsed - online=%s, data_valid=%s\n",
                    status.online ? "TRUE" : "FALSE",
                    status.data_valid ? "TRUE" : "FALSE");
      Serial.printf("[Status] Doorbell: %s (RSSI: %d dBm, Heap: %d bytes)\n",
                    status.online ? "ONLINE ✓" : "OFFLINE ✗",
                    status.wifi_rssi,
                    status.free_heap);
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
  String url = String(BACKEND_SERVER_URL) + "/api/v1/devices/" + String(HUB_DEVICE_ID) + "/log";

  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  // Add Authorization header with Bearer token
  if (HUB_API_TOKEN && strlen(HUB_API_TOKEN) > 0) {
    String authHeader = String("Bearer ") + HUB_API_TOKEN;
    http.addHeader("Authorization", authHeader.c_str());
  }

  // Create JSON payload
  JsonDocument doc;
  doc["device_id"] = HUB_DEVICE_ID;
  doc["level"] = level;  // "error", "warning", "info", "debug"
  doc["message"] = message;
  if (data != nullptr) {
    doc["data"] = data;
  }
  doc["timestamp"] = getCurrentTimestamp();  // Unix timestamp (seconds since epoch)

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
// Process pending commands flag (non-blocking check, call from main loop)
// ============================================================================
void processPendingCommands() {
  if (hasPendingCommands) {
    hasPendingCommands = false;  // Clear flag before processing
    fetchAndExecuteCommands();
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
  if (incomingDoc.containsKey("source") && (incomingDoc["source"] == "mesh_node"||incomingDoc["source"] == "main_mesh")) {
    // Single mesh node sensor data
    const char* deviceId = incomingDoc["device_id"] | "unknown";
    const char* deviceType = incomingDoc["device_type"] | "sensor";

    // Check if sensors data exists and is not null
    if (!incomingDoc.containsKey("sensors") || incomingDoc["sensors"].isNull()) {
      Serial.printf("[MeshData] ⚠ No sensor data from %s\n", deviceId);
      return;
    }

    JsonObject sensorData = incomingDoc["sensors"];

    // Extract mesh node's API token if present
    const char* meshNodeToken = nullptr;
    if (incomingDoc.containsKey("api_token")) {
      meshNodeToken = incomingDoc["api_token"];
    }

    HTTPClient http;
    String url = String(BACKEND_SERVER_URL) + "/api/v1/devices/sensor-data";

    http.begin(url);
    http.addHeader("Content-Type", "application/json");

    // Use mesh node's own token if available, otherwise fall back to hub's token
    if (meshNodeToken && strlen(meshNodeToken) > 0) {
      String authHeader = String("Bearer ") + meshNodeToken;
      http.addHeader("Authorization", authHeader.c_str());
    } else if (HUB_API_TOKEN && strlen(HUB_API_TOKEN) > 0) {
      String authHeader = String("Bearer ") + HUB_API_TOKEN;
      http.addHeader("Authorization", authHeader.c_str());
    } else {
      Serial.printf("[MeshData] ✗ No authentication token for %s\n", deviceId);
    }

    http.setTimeout(5000);

    // Build JSON payload
    JsonDocument doc;
    doc["device_id"] = deviceId;
    doc["device_type"] = deviceType;
    doc["timestamp"] = getCurrentTimestamp();  // Unix timestamp (seconds since epoch)
    doc["forwarded_by"] = HUB_DEVICE_ID;

    // Copy all sensor data
    JsonObject data = doc.createNestedObject("data");
    for (JsonPair kv : sensorData) {
      data[kv.key()] = kv.value();
    }

    // Copy battery information if present
    if (incomingDoc.containsKey("battery_voltage")) {
      data["battery_voltage"] = incomingDoc["battery_voltage"];
    }
    if (incomingDoc.containsKey("battery_percent")) {
      data["battery_percent"] = incomingDoc["battery_percent"];
    }

    // Copy mesh metadata if present
    if (incomingDoc.containsKey("mesh_node_id")) {
      doc["mesh_node_id"] = incomingDoc["mesh_node_id"];
    }
    if (incomingDoc.containsKey("data_age_ms")) {
      doc["data_age_ms"] = incomingDoc["data_age_ms"];
    }

    // Copy alert/averaging flags if present
    if (incomingDoc.containsKey("alert")) {
      data["alert"] = incomingDoc["alert"];
    }
    if (incomingDoc.containsKey("averaged")) {
      data["averaged"] = incomingDoc["averaged"];
    }
    if (incomingDoc.containsKey("sample_count")) {
      data["sample_count"] = incomingDoc["sample_count"];
    }

    // Copy boot count if present
    if (incomingDoc.containsKey("boot_count")) {
      data["boot_count"] = incomingDoc["boot_count"];
    }

    String jsonString;
    serializeJson(doc, jsonString);

    // Send POST
    int httpResponseCode = http.POST(jsonString);

    if (httpResponseCode > 0) {
      if (httpResponseCode == 200) {
        Serial.printf("[MeshData] ✓ %s forwarded\n", deviceId);
      } else {
        Serial.printf("[MeshData] ✗ %s failed (code: %d)\n", deviceId, httpResponseCode);
      }
    } else {
      Serial.printf("[MeshData] ✗ %s connection failed\n", deviceId);
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
      Serial.printf("[MeshData] ⚠ No API token for %s\n", deviceId);
    }

    http.setTimeout(5000);

    // Build JSON payload for this sensor
    JsonDocument doc;
    doc["device_id"] = deviceId;
    doc["device_type"] = deviceType;
    doc["timestamp"] = getCurrentTimestamp();  // Unix timestamp (seconds since epoch)
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
        successCount++;
      } else {
        Serial.printf("[MeshData] ✗ %s failed (code: %d)\n", deviceId, httpResponseCode);
        failCount++;
      }
    } else {
      Serial.printf("[MeshData] ✗ %s connection failed\n", deviceId);
      failCount++;
    }

    http.end();

    // Small delay between requests to avoid overwhelming the backend
    if (sensorCount > 1) {
      delay(100);
    }
  }

  if (failCount > 0) {
    Serial.printf("[MeshData] Summary: %d succeeded, %d failed\n", successCount, failCount);
  }
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

  HTTPClient http;
  String url = String(BACKEND_SERVER_URL) + "/api/v1/devices/sensor-data";

  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  // Add Authorization header with Bearer token
  // Main_mesh doesn't have its own API token since it communicates via UART
  // Use the hub's token for authentication
  if (HUB_API_TOKEN && strlen(HUB_API_TOKEN) > 0) {
    String authHeader = String("Bearer ") + HUB_API_TOKEN;
    http.addHeader("Authorization", authHeader.c_str());
  } else {
    Serial.println("[MainMeshLocal] ⚠ No API token set");
  }

  http.setTimeout(5000);

  // Build JSON payload
  JsonDocument doc;
  doc["device_id"] = deviceId;
  doc["device_type"] = deviceType;
  doc["timestamp"] = getCurrentTimestamp();  // Unix timestamp (seconds since epoch)
  doc["forwarded_by"] = HUB_DEVICE_ID;

  // Copy all local sensor data
  JsonObject data = doc.createNestedObject("data");
  for (JsonPair kv : localSensors) {
    data[kv.key()] = kv.value();
  }

  String jsonString;
  serializeJson(doc, jsonString);

  // Debug: Print the JSON being sent
  Serial.printf("[MainMeshLocal] Sending: %s\n", jsonString.c_str());

  // Send POST
  int httpResponseCode = http.POST(jsonString);

  if (httpResponseCode > 0) {
    if (httpResponseCode == 200) {
      Serial.printf("[MainMeshLocal] ✓ %s data forwarded\n", deviceId);
    } else {
      Serial.printf("[MainMeshLocal] ✗ Failed (code: %d)\n", httpResponseCode);
      // Get error response from server
      String response = http.getString();
      if (response.length() > 0) {
        Serial.printf("[MainMeshLocal] Server response: %s\n", response.c_str());
      }
    }
  } else {
    Serial.printf("[MainMeshLocal] ✗ Connection failed\n");
  }

  http.end();
}

// ============================================================================
// Fetch recent alerts for home screen (limit 5 to avoid heap issues)
// GET /api/v1/alerts/device?limit=5
// ============================================================================
bool fetchHomeAlerts(Alert* alerts, int maxAlerts) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[Alerts] ✗ WiFi not connected");
    return false;
  }

  if (!HUB_API_TOKEN || strlen(HUB_API_TOKEN) == 0) {
    Serial.println("[Alerts] ✗ No API token set");
    return false;
  }

  HTTPClient http;
  String url = String(BACKEND_SERVER_URL) + "/api/v1/alerts/device?limit=" + String(maxAlerts) + "&device_id=hb_001";

  Serial.printf("[Alerts] Request URL: %s\n", url.c_str());
  Serial.printf("[Alerts] Using token: %s\n", HUB_API_TOKEN);

  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  // Add Authorization header with hub's API token
  String authHeader = String("Bearer ") + HUB_API_TOKEN;
  http.addHeader("Authorization", authHeader.c_str());

  http.setTimeout(5000);

  Serial.println("[Alerts] Sending GET request...");
  int httpResponseCode = http.GET();

  Serial.printf("[Alerts] Response code: %d\n", httpResponseCode);

  if (httpResponseCode == 200) {
    String response = http.getString();

    // Parse JSON response
    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, response);

    if (error) {
      Serial.printf("[Alerts] ✗ JSON parse error: %s\n", error.c_str());
      http.end();
      return false;
    }

    // Check if alerts array exists
    if (!doc.containsKey("alerts") || !doc["alerts"].is<JsonArray>()) {
      Serial.println("[Alerts] ✗ No alerts array in response");
      http.end();
      return false;
    }

    JsonArray alertsArray = doc["alerts"];
    int count = min((int)alertsArray.size(), maxAlerts);

    Serial.printf("[Alerts] ✓ Fetched %d alerts\n", count);

    // Populate alert structures
    for (int i = 0; i < count; i++) {
      JsonObject alert = alertsArray[i];

      alerts[i].valid = true;

      // Extract message (truncate if too long)
      const char* message = alert["message"] | "No message";
      strncpy(alerts[i].message, message, sizeof(alerts[i].message) - 1);
      alerts[i].message[sizeof(alerts[i].message) - 1] = '\0';

      // Extract level
      const char* level = alert["level"] | "info";
      strncpy(alerts[i].level, level, sizeof(alerts[i].level) - 1);
      alerts[i].level[sizeof(alerts[i].level) - 1] = '\0';

      // Extract timestamp
      const char* timestamp = alert["timestamp"] | "";
      strncpy(alerts[i].timestamp, timestamp, sizeof(alerts[i].timestamp) - 1);
      alerts[i].timestamp[sizeof(alerts[i].timestamp) - 1] = '\0';
    }

    // Mark remaining alerts as invalid
    for (int i = count; i < maxAlerts; i++) {
      alerts[i].valid = false;
    }

    http.end();
    return true;
  } else {
    Serial.printf("[Alerts] ✗ HTTP error: %d\n", httpResponseCode);
    http.end();
    return false;
  }
}

// ============================================================================
// Fetch sensor data for a specific sensor device
// GET /api/v1/devices/:deviceId/sensor/sensors/device
// Body: {"device_id": "hb_001"} with Bearer token
// ============================================================================
bool fetchSensorData(const char* deviceId, SensorData* sensorData) {
  // Initialize as invalid
  sensorData->valid = false;

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[SensorFetch] WiFi not connected");
    return false;
  }

  if (!HUB_API_TOKEN || strlen(HUB_API_TOKEN) == 0) {
    Serial.println("[SensorFetch] ✗ No API token set");
    return false;
  }

  HTTPClient http;
  String url = String(BACKEND_SERVER_URL) + "/api/v1/devices/" + String(deviceId) + "/sensor/sensors/device";

  Serial.printf("[SensorFetch] Fetching data for %s\n", deviceId);
  Serial.printf("[SensorFetch] URL: %s\n", url.c_str());
  Serial.printf("[SensorFetch] Token: %s... (length: %d)\n",
                String(HUB_API_TOKEN).substring(0, 10).c_str(),
                strlen(HUB_API_TOKEN));

  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  // Add Authorization header with hub's API token
  String authHeader = String("Bearer ") + HUB_API_TOKEN;
  http.addHeader("Authorization", authHeader.c_str());
  Serial.printf("[SensorFetch] Auth header: Bearer %s...\n", String(HUB_API_TOKEN).substring(0, 10).c_str());

  http.setTimeout(5000);

  // Build JSON body with device_id (hb_001 - hub device ID)
  JsonDocument requestDoc;
  requestDoc["device_id"] = "hb_001";  // Hub device ID
  String requestBody;
  serializeJson(requestDoc, requestBody);

  Serial.printf("[SensorFetch] Request body: %s\n", requestBody.c_str());

  // Note: GET with body is non-standard, but some servers support it
  // HTTPClient doesn't directly support GET with body, so we use sendRequest
  int httpResponseCode = http.sendRequest("GET", requestBody);

  if (httpResponseCode == 200) {
    String response = http.getString();

    // Parse JSON response
    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, response);

    if (error) {
      Serial.printf("[SensorFetch] JSON parse error: %s\n", error.c_str());
      http.end();
      return false;
    }

    // Check if sensors object exists
    if (!doc.containsKey("sensors") || !doc["sensors"].is<JsonObject>()) {
      Serial.println("[SensorFetch] No sensors object in response");
      http.end();
      return false;
    }

    JsonObject sensors = doc["sensors"];

    // Extract device info
    const char* devId = doc["device_id"] | deviceId;
    strncpy(sensorData->device_id, devId, sizeof(sensorData->device_id) - 1);
    sensorData->device_id[sizeof(sensorData->device_id) - 1] = '\0';

    // Extract device type
    const char* devType = sensors["device_type"] | "sensor";
    strncpy(sensorData->device_type, devType, sizeof(sensorData->device_type) - 1);
    sensorData->device_type[sizeof(sensorData->device_type) - 1] = '\0';

    // Extract forwarded_by
    const char* fwdBy = sensors["forwarded_by"] | "";
    strncpy(sensorData->forwarded_by, fwdBy, sizeof(sensorData->forwarded_by) - 1);
    sensorData->forwarded_by[sizeof(sensorData->forwarded_by) - 1] = '\0';

    // Extract sensor readings
    sensorData->temperature = sensors["temperature"] | 0.0f;
    sensorData->humidity = sensors["humidity"] | 0.0f;
    sensorData->gas_level = sensors["gas_level"] | 0.0f;
    sensorData->light_lux = sensors["light_lux"] | 0.0f;
    sensorData->battery_voltage = sensors["battery_voltage"] | 0.0f;
    sensorData->battery_percent = sensors["battery_percent"] | 0;
    sensorData->boot_count = sensors["boot_count"] | 0;

    // Extract metadata
    const char* lastUpdated = sensors["last_updated"] | "";
    strncpy(sensorData->last_updated, lastUpdated, sizeof(sensorData->last_updated) - 1);
    sensorData->last_updated[sizeof(sensorData->last_updated) - 1] = '\0';

    const char* ts = sensors["timestamp"] | "";
    strncpy(sensorData->timestamp, ts, sizeof(sensorData->timestamp) - 1);
    sensorData->timestamp[sizeof(sensorData->timestamp) - 1] = '\0';

    sensorData->alert = sensors["alert"] | false;
    sensorData->averaged = sensors["averaged"] | false;
    sensorData->sample_count = sensors["sample_count"] | 0;

    // Mark as valid
    sensorData->valid = true;

    Serial.printf("[SensorFetch] ✓ Data fetched for %s: Temp=%.2f°C, Humidity=%.1f%%, Gas=%.0f, Light=%.2f lux, Battery=%d%%\n",
                  deviceId,
                  sensorData->temperature,
                  sensorData->humidity,
                  sensorData->gas_level,
                  sensorData->light_lux,
                  sensorData->battery_percent);

    http.end();
    return true;
  } else {
    Serial.printf("[SensorFetch] ✗ HTTP error: %d\n", httpResponseCode);
    // Get error response body for debugging
    if (httpResponseCode > 0) {
      String errorResponse = http.getString();
      Serial.printf("[SensorFetch] Error response: %s\n", errorResponse.c_str());
    }
    http.end();
    return false;
  }
}
