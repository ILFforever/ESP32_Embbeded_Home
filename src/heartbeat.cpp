#include "heartbeat.h"
#include "nfc_scan_state.h"
#include "face_detection_sender.h"
#include "uart_commands.h"
#include "logger.h"
#include "network_manager.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "slave_state_manager.h"
#include "streaming_state.h"
#include "lcd_helper.h"

// Configuration variables (set via initHeartbeat)
const char *BACKEND_SERVER_URL = "";
const char *DEVICE_ID = "";
const char *DEVICE_TYPE = "";
const char *DEVICE_API_TOKEN = "";

// Status tracking
static bool lastHeartbeatSuccess = false;
static unsigned long lastHeartbeatTime = 0;

// Helper: add Bearer token header without heap String concatenation
static void addAuthHeader(HTTPClient &http)
{
  if (DEVICE_API_TOKEN && strlen(DEVICE_API_TOKEN) > 0)
  {
    char authHeader[256];
    snprintf(authHeader, sizeof(authHeader), "Bearer %s", DEVICE_API_TOKEN);
    http.addHeader("Authorization", authHeader);
  }
}

// ============================================================================
// Initialize heartbeat module with server config
// ============================================================================
void initHeartbeat(const char *serverUrl, const char *deviceId, const char *deviceType, const char *apiToken)
{
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
// Now checks for pending commands and fetches them automatically
// ============================================================================
void sendHeartbeat()
{
  if (!enqueueHeartbeat())
  {
    Serial.println("[Heartbeat] Failed to queue heartbeat");
  }
}

void sendHeartbeatImmediate()
{
  // Skip if face detection upload in progress to prevent socket exhaustion
  if (faceDetectionUploadInProgress)
  {
    Serial.println("[Heartbeat] Skipping - face detection upload in progress");
    return;
  }

  // Check WiFi connection
  if (WiFi.status() != WL_CONNECTED)
  {
    Serial.println("[Heartbeat] WiFi not connected - skipping");
    lastHeartbeatSuccess = false;
    return;
  }

  HTTPClient http;
  char url[160];
  snprintf(url, sizeof(url), "%s/api/v1/devices/heartbeat", BACKEND_SERVER_URL);

  http.begin(url); // Plain HTTP - no SSL (memory optimization for ESP32)
  http.addHeader("Content-Type", "application/json");

  // Add Authorization header with Bearer token
  addAuthHeader(http);

  http.setTimeout(5000); // 5 second timeout

  // Build JSON payload (~16 members, keys are literals so only slots + ip string)
  StaticJsonDocument<512> doc;
  doc["device_id"] = DEVICE_ID;
  doc["device_type"] = DEVICE_TYPE;
  doc["uptime_ms"] = millis();
  doc["free_heap"] = ESP.getFreeHeap();
  doc["largest_heap_block"] = ESP.getMaxAllocHeap();
  doc["wifi_rssi"] = WiFi.RSSI();
  doc["ip_address"] = WiFi.localIP().toString();

  FaceDetectionStats faceStats = getFaceDetectionStats();
  doc["face_queue_pending"] = getPendingFaceDetectionCount();
  doc["face_total_queued"] = faceStats.totalQueued;
  doc["face_total_sent"] = faceStats.totalSent;
  doc["face_total_failed"] = faceStats.totalFailed;
  doc["face_queue_overflows"] = faceStats.queueOverflows;

  NetworkManagerStats networkStats = getNetworkManagerStats();
  doc["network_queue_pending"] = getPendingNetworkJobCount();
  doc["network_total_queued"] = networkStats.queued;
  doc["network_total_failed"] = networkStats.failed;
  doc["network_total_dropped"] = networkStats.dropped;

  char jsonString[512];
  size_t jsonLen = serializeJson(doc, jsonString, sizeof(jsonString));

  // Send POST request
  int httpResponseCode = http.POST(reinterpret_cast<uint8_t *>(jsonString), jsonLen);

  if (httpResponseCode > 0)
  {
    String response = http.getString();

    if (httpResponseCode == 200)
    {
      Serial.printf("[Heartbeat] ✓ Sent (code: %d)\n", httpResponseCode);
      lastHeartbeatSuccess = true;
      lastHeartbeatTime = millis();

      // Parse response to check for pending commands
      // Filter keeps only the two keys we read, so a small doc always suffices
      StaticJsonDocument<96> filter;
      filter["written"] = true;
      filter["has_pending_commands"] = true;

      StaticJsonDocument<192> responseDoc;
      DeserializationError error = deserializeJson(responseDoc, response,
                                                   DeserializationOption::Filter(filter));
      if (!error)
      {
        // Check if data was written to Firebase
        if (responseDoc.containsKey("written"))
        {
          bool written = responseDoc["written"];
          if (written)
          {
            Serial.println("[Heartbeat] → Written to Firebase");
          }
          else
          {
            Serial.println("[Heartbeat] → Throttled (cached)");
          }
        }

        // NEW: Check for pending commands
        if (responseDoc.containsKey("has_pending_commands"))
        {
          bool hasPendingCommands = responseDoc["has_pending_commands"];
          if (hasPendingCommands)
          {
            Serial.println("[Heartbeat] → Server says we have pending commands!");
            // Immediately fetch and execute commands
            enqueueFetchCommands();
          }
        }
      }
    }
    else
    {
      Serial.printf("[Heartbeat] ✗ Failed (code: %d)\n", httpResponseCode);
      lastHeartbeatSuccess = false;
    }
  }
  else
  {
    Serial.printf("[Heartbeat] ✗ Connection failed: %s\n",
                  http.errorToString(httpResponseCode).c_str());
    lastHeartbeatSuccess = false;
  }

  http.end();
}

// ============================================================================
// Send disconnect warning to backend (for 30+ second disconnects)
// ============================================================================
void sendDisconnectWarning(const char *module_name, bool isDisconnected)
{
  StaticJsonDocument<256> doc;
  doc["device_id"] = DEVICE_ID;
  doc["module"] = module_name;
  doc["status"] = isDisconnected ? "disconnected" : "reconnected";
  doc["timestamp"] = millis();

  char jsonString[192];
  serializeJson(doc, jsonString, sizeof(jsonString));

  enqueueBackendPost("/api/v1/devices/warning", jsonString, "warning", false, 5000);

  // Also log to logging endpoint
  StaticJsonDocument<256> meta;
  JsonObject metadata = meta.to<JsonObject>();
  metadata["module"] = module_name;
  metadata["status"] = isDisconnected ? "disconnected" : "reconnected";
  metadata["uptime_ms"] = millis();

  if (isDisconnected)
  {
    char msg[128];
    snprintf(msg, sizeof(msg), "Module %s not responding", module_name);
    logError("device_monitor", msg, metadata);
  }
  else
  {
    char msg[128];
    snprintf(msg, sizeof(msg), "Module %s reconnected", module_name);
    logInfo("device_monitor", msg, metadata);
  }
}

// ============================================================================
// Send doorbell ring event to backend (notify hub to play audio)
// ============================================================================
void sendDoorbellRing()
{
  StaticJsonDocument<64> doc;
  doc["device_id"] = DEVICE_ID;

  char jsonString[96];
  serializeJson(doc, jsonString, sizeof(jsonString));

  if (!enqueueBackendPost("/api/v1/devices/doorbell/ring", jsonString, "doorbell_ring", true, 5000))
  {
    Serial.println("[Doorbell] Failed to queue ring event");
  }
}

// ============================================================================
// Send doorbell status to backend (camera_active, mic_active)
// ALSO acts as heartbeat - resets TTL timer
// ============================================================================
void sendDoorbellStatus(bool camera_active, bool mic_active)
{
  StaticJsonDocument<256> doc;
  doc["device_id"] = DEVICE_ID;
  doc["camera_active"] = camera_active;
  doc["mic_active"] = mic_active;

  // Include heartbeat info
  doc["uptime_ms"] = millis();
  doc["free_heap"] = ESP.getFreeHeap();
  doc["wifi_rssi"] = WiFi.RSSI();
  doc["ip_address"] = WiFi.localIP().toString();

  char jsonString[256];
  serializeJson(doc, jsonString, sizeof(jsonString));

  if (!enqueueBackendPost("/api/v1/devices/doorbell/status", jsonString, "doorbell_status", true, 5000))
  {
    Serial.println("[DoorbellStatus] Failed to queue status");
  }
}

// ============================================================================
// Send face detection event asynchronously (NON-BLOCKING)
// ============================================================================
bool sendFaceDetectionAsync(bool recognized, const char *name, float confidence,
                            const uint8_t *imageData, size_t imageSize)
{
  Serial.printf("[Heartbeat] Queueing face detection (async) - recognized: %s, name: %s\n",
                recognized ? "Yes" : "No", name);

  bool success = queueFaceDetection(recognized, name, confidence, imageData, imageSize);

  if (success)
  {
    Serial.println("[Heartbeat] ✓ Face detection queued (non-blocking)");
  }
  else
  {
    Serial.println("[Heartbeat] ✗ Failed to queue (queue full or error)");
  }

  return success;
}

// ============================================================================
// Send face database result to backend (face_count, face_list, face_check)
// ============================================================================
void sendFaceDatabaseResult(const char *type, int count, JsonArray faces, const char *db_status, const char *db_message)
{
  StaticJsonDocument<2048> doc;
  doc["type"] = type;

  if (strcmp(type, "face_count") == 0 && count >= 0)
  {
    doc["count"] = count;
  }
  else if (strcmp(type, "face_list") == 0 && !faces.isNull())
  {
    JsonArray facesArray = doc.createNestedArray("faces");
    for (JsonObject face : faces)
    {
      JsonObject newFace = facesArray.createNestedObject();
      newFace["id"] = face["id"];
      newFace["name"] = face["name"];
    }
  }
  else if (strcmp(type, "face_check") == 0)
  {
    if (db_status != nullptr)
    {
      doc["status"] = db_status;
    }
    if (db_message != nullptr)
    {
      doc["message"] = db_message;
    }
  }

  // Face list size is unbounded, so keep a String here but pre-reserve the
  // exact serialized size to avoid repeated reallocations
  String jsonString;
  jsonString.reserve(measureJson(doc) + 1);
  serializeJson(doc, jsonString);

  char endpoint[96];
  snprintf(endpoint, sizeof(endpoint), "/api/v1/devices/%s/face-database/result", DEVICE_ID);
  if (!enqueueBackendPost(endpoint, jsonString.c_str(), "face_db", true, 5000))
  {
    Serial.printf("[FaceDB] Failed to queue %s result\n", type);
  }
}

// ============================================================================
// Fetch and execute pending commands from backend
// ============================================================================
void fetchAndExecuteCommands()
{
  if (!enqueueFetchCommands())
  {
    Serial.println("[Commands] Failed to queue command fetch");
  }
}

void fetchAndExecuteCommandsImmediate()
{
  if (WiFi.status() != WL_CONNECTED)
  {
    Serial.println("[Commands] WiFi not connected - cannot fetch commands");
    return;
  }

  HTTPClient http;
  char url[160];
  snprintf(url, sizeof(url), "%s/api/v1/devices/commands/pending", BACKEND_SERVER_URL);

  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  // Add Authorization header with Bearer token
  addAuthHeader(http);

  http.setTimeout(5000);

  // Build JSON payload
  StaticJsonDocument<64> doc;
  doc["device_id"] = DEVICE_ID;

  char jsonString[96];
  size_t jsonLen = serializeJson(doc, jsonString, sizeof(jsonString));

  // Send POST request
  int httpResponseCode = http.POST(reinterpret_cast<uint8_t *>(jsonString), jsonLen);

  if (httpResponseCode == 200)
  {
    String response = http.getString();

    // Parse response
    StaticJsonDocument<2048> responseDoc;
    DeserializationError error = deserializeJson(responseDoc, response);

    if (!error && responseDoc.containsKey("commands"))
    {
      JsonArray commands = responseDoc["commands"];
      int commandCount = commands.size();

      Serial.printf("[Commands] Fetched %d pending command(s)\n", commandCount);

      for (JsonObject cmd : commands)
      {
        String commandId = cmd["id"].as<String>();
        String action = cmd["action"].as<String>();
        JsonObject params = cmd["params"];

        Serial.printf("[Commands] Executing: %s (ID: %s)\n", action.c_str(), commandId.c_str());

        // Special handling for reboot/system_restart: acknowledge BEFORE executing
        // (otherwise acknowledgment will never reach backend)
        if (action == "system_restart" || action == "reboot")
        {
          Serial.println("[Commands] Reboot requested - acknowledging before execution");
          acknowledgeCommand(commandId, true, action);

          // Log critical reboot event
          StaticJsonDocument<256> meta;
          JsonObject metadata = meta.to<JsonObject>();
          metadata["reason"] = "remote_command";
          metadata["uptime_ms"] = millis();
          metadata["free_heap"] = ESP.getFreeHeap();
          logInfo("system", "System restart via remote command", metadata);

          Serial.println("[Commands] Rebooting system in 3 seconds...");
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
  }
  else
  {
    Serial.printf("[Commands] Failed to fetch (code: %d)\n", httpResponseCode);
  }

  http.end();
}

// ============================================================================
// Execute a command received from backend
// ============================================================================
bool executeCommand(String action, JsonObject params)
{
  Serial.printf("[Commands] Executing action: %s\n", action.c_str());

  // Camera commands
  if (action == "camera_start")
  {
    sendUARTCommand("stream_control", "camera_start");
    isStreaming = true;
    setDesiredMode(1);
    return true;
  }
  else if (action == "camera_stop")
  {
    sendUARTCommand("stream_control", "camera_stop");
    isStreaming = false;
    setDesiredMode(0);
    return true;
  }
  else if (action == "camera_restart")
  {
    isStreaming = false;
    setDesiredMode(0); // Shut off?
    sendUARTCommand("reboot");
    return true;
  }

  // Microphone commands
  else if (action == "mic_start")
  {
    isStreaming = true;
    sendUARTCommand("stream_control", "mic_start");
    return true;
  }
  else if (action == "mic_stop")
  {
    isStreaming = false;
    sendUARTCommand("stream_control", "mic_stop");
    return true;
  }
  else if (action == "stream_status")
  {
    sendUARTCommand("stream_control", "stream_status");
    return true;
  }
  else if (action == "start_stream")
  {
    isStreaming = true;
    setDesiredMode(1);
    sendUARTCommand("stream_control", "camera_start");
    sendUARTCommand("stream_control", "mic_start");
  }
  else if (action == "stop_stream")
  {
    isStreaming = false;
    setDesiredMode(0);
    sendUARTCommand("stream_control", "camera_stop");
    sendUARTCommand("stream_control", "mic_stop");
  }

  // Amplifier commands
  else if (action == "amp_play")
  {
    if (params.containsKey("url"))
    {
      const char *url = params["url"];
      Serial.printf("[Commands] Playing amplifier URL: %s\n", url);
      sendUART2Command("play", url);
      // Send URL twice if it starts with http
      if (strncmp(url, "http", 4) == 0)
      {
        delay(100);
        sendUART2Command("play", url);
      }
      return true;
    }
    else
    {
      Serial.println("[Commands] amp_play requires 'url' parameter");
      return false;
    }
  }
  else if (action == "amp_stop")
  {
    sendUART2Command("stop", "");
    return true;
  }
  else if (action == "amp_restart")
  {
    Serial.println("[Commands] Restarting amplifier");
    sendUART2Command("restart", "");
    return true;
  }
  else if (action == "amp_volume")
  {
    if (params.containsKey("level"))
    {
      int level = params["level"];
      Serial.printf("[Commands] Setting amplifier volume to %d\n", level);

      // Send volume command to amplifier
      StaticJsonDocument<64> doc;
      doc["cmd"] = "volume";
      doc["level"] = level;
      char output[64];
      serializeJson(doc, output, sizeof(output));
      AmpSerial.println(output);

      return true;
    }
    else
    {
      Serial.println("[Commands] amp_volume requires 'level' parameter");
      return false;
    }
  }
  else if (action == "amp_status")
  {
    Serial.println("[Commands] Requesting amplifier status");

    // Send status command to amplifier
    StaticJsonDocument<32> doc;
    doc["cmd"] = "status";
    char output[32];
    serializeJson(doc, output, sizeof(output));
    AmpSerial.println(output);

    return true;
  }
  else if (action == "amp_list")
  {
    Serial.println("[Commands] Requesting amplifier file list");

    // Send list command to amplifier
    StaticJsonDocument<32> doc;
    doc["cmd"] = "list";
    char output[32];
    serializeJson(doc, output, sizeof(output));
    AmpSerial.println(output);

    return true;
  }
  else if (action == "amp_wifi")
  {
    if (params.containsKey("ssid") && params.containsKey("password"))
    {
      const char *ssid = params["ssid"];
      const char *password = params["password"];
      Serial.printf("[Commands] Updating amplifier WiFi credentials (SSID: %s)\n", ssid);

      // Send WiFi command to amplifier
      StaticJsonDocument<192> doc;
      doc["cmd"] = "wifi";
      doc["ssid"] = ssid;
      doc["password"] = password;
      char output[192];
      serializeJson(doc, output, sizeof(output));
      AmpSerial.println(output);

      return true;
    }
    else
    {
      Serial.println("[Commands] amp_wifi requires 'ssid' and 'password' parameters");
      return false;
    }
  }

  // Face recognition commands
  else if (action == "face_count")
  {
    sendUARTCommand("face_count");
    return true;
  }
  else if (action == "face_list")
  {
    sendUARTCommand("list_faces");
    return true;
  }
  else if (action == "face_check")
  {
    sendUARTCommand("check_face_db");
    return true;
  }
  else if (action == "sync_database")
  {
    // Execute all three face database commands in sequence
    Serial.println("[Commands] Syncing face database - executing all three commands...");
    sendUARTCommand("face_count");
    delay(250); // Small delay between commands
    sendUARTCommand("check_face_db");
    delay(250); // Small delay between commands
    sendUARTCommand("list_faces");
    Serial.println("[Commands] ✓ All face database commands sent");
    return true;
  }
  else if (action == "face_enroll")
  {
    if (params.containsKey("user_name"))
    {
      const char *userName = params["user_name"];
      Serial.printf("[Commands] Enrolling new face for user: %s\n", userName);
      updateStatusMsg("Enrolling new face...", true, "Enrolling");
      sendUARTCommand("camera_control", "camera_start");
      delay(100);
      sendUARTCommand("resume_detection");
      delay(100);
      sendUARTCommand("enroll_and_name", userName);
      return true;
    }
    else
    {
      Serial.println("[Commands] face_enroll requires 'user_name' parameter");
      return false;
    }
  }
  else if (action == "rename_face")
  {
    if (params.containsKey("face_id") && params.containsKey("new_name"))
    {
      int faceId = params["face_id"];
      const char *newName = params["new_name"];
      Serial.printf("[Commands] Renaming face ID %d to: %s\n", faceId, newName);
      sendRenameFace(faceId, newName);
      return true;
    }
    else
    {
      Serial.println("[Commands] rename_face requires 'face_id' and 'new_name' parameters");
      return false;
    }
  }
  else if (action == "set_face_name")
  {
    if (params.containsKey("face_id") && params.containsKey("name"))
    {
      int faceId = params["face_id"];
      const char *name = params["name"];
      Serial.printf("[Commands] Setting name for face ID %d to: %s\n", faceId, name);
      sendSetName(faceId, name);
      return true;
    }
    else
    {
      Serial.println("[Commands] set_face_name requires 'face_id' and 'name' parameters");
      return false;
    }
  }
  else if (action == "delete_last_face")
  {
    Serial.println("[Commands] Deleting last enrolled face");
    sendDeleteLastFace();
    return true;
  }

  // System commands
  // Note: reboot/system_restart is handled specially in fetchAndExecuteCommands()
  // to ensure acknowledgment happens before reboot
  else if (action == "system_restart" || action == "reboot")
  {
    Serial.println("[Commands] ERROR: Reboot should be handled in fetchAndExecuteCommands()");
    return false;
  }

  // Legacy recording commands
  else if (action == "recording_start")
  {
    // Start face detection/recognition
    sendUARTCommand("resume_detection");
    return true;
  }
  else if (action == "recording_stop")
  {
    sendUARTCommand("stop_detection");
    return true;
  }

  // Doorbell button commands (two-step interaction)
  else if (action == "start_preview")
  {
    // Step 1: Button held down - start camera preview and resume detection
    Serial.println("[Commands] Starting camera preview mode");
    sendUARTCommand("camera_control", "camera_start");
    delay(100);
    sendUARTCommand("resume_detection");
    return true;
  }
  else if (action == "recognize_face")
  {
    // Step 2: Button pressed again - trigger face recognition
    Serial.println("[Commands] Triggering face recognition");
    sendUARTCommand("camera_control", "camera_start");
    delay(100);
    sendUARTCommand("recognize_face");
    return true;
  }
  else if (action == "start_nfc_registration")
  {
    if (params.containsKey("sessionId")) {
        nfcScanState.sessionId = params["sessionId"].as<String>();
        nfcScanState.active = true;
        Serial.printf("[Commands] Enabling NFC scan mode with session ID: %s\n", nfcScanState.sessionId.c_str());
        updateStatusMsg("Tap card to register", true, "Scanning");
        return true;
    } else {
        Serial.println("[Commands] nfc_scan_mode requires 'sessionId' parameter");
        return false;
    }
  }

  // Unknown command
  else
  {
    Serial.printf("[Commands] Unknown action: %s\n", action.c_str());
    return false;
  }
}

// ============================================================================
// Acknowledge command execution to backend
// ============================================================================
void acknowledgeCommand(String commandId, bool success, String action)
{
  if (WiFi.status() != WL_CONNECTED)
  {
    Serial.println("[Commands] WiFi not connected - cannot acknowledge");
    return;
  }

  HTTPClient http;
  char url[160];
  snprintf(url, sizeof(url), "%s/api/v1/devices/commands/ack", BACKEND_SERVER_URL);

  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  // Add Authorization header with Bearer token
  addAuthHeader(http);

  http.setTimeout(5000);

  // Build JSON payload
  StaticJsonDocument<384> doc;
  doc["device_id"] = DEVICE_ID;
  doc["command_id"] = commandId;
  doc["success"] = success;

  char resultMsg[96];
  if (success)
  {
    snprintf(resultMsg, sizeof(resultMsg), "Command executed: %s", action.c_str());
    doc["result"] = resultMsg;
  }
  else
  {
    snprintf(resultMsg, sizeof(resultMsg), "Failed to execute: %s", action.c_str());
    doc["error"] = resultMsg;
  }

  char jsonString[256];
  size_t jsonLen = serializeJson(doc, jsonString, sizeof(jsonString));

  // Send POST request
  int httpResponseCode = http.POST(reinterpret_cast<uint8_t *>(jsonString), jsonLen);

  if (httpResponseCode == 200)
  {
    Serial.printf("[Commands] ✓ Acknowledged command %s (%s)\n",
                  commandId.c_str(), success ? "success" : "failed");
  }
  else
  {
    Serial.printf("[Commands] ✗ Failed to acknowledge (code: %d)\n", httpResponseCode);
  }

  http.end();
}

// ============================================================================
// Status getters
// ============================================================================
bool getLastHeartbeatSuccess()
{
  return lastHeartbeatSuccess;
}

unsigned long getLastHeartbeatTime()
{
  return lastHeartbeatTime;
}
