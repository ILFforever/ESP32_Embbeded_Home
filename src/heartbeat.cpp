#include "heartbeat.h"
#include "face_detection_sender.h"
#include "uart_commands.h"
#include "logger.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// Configuration variables (set via initHeartbeat)
const char *BACKEND_SERVER_URL = "";
const char *DEVICE_ID = "";
const char *DEVICE_TYPE = "";
const char *DEVICE_API_TOKEN = "";

// Status tracking
static bool lastHeartbeatSuccess = false;
static unsigned long lastHeartbeatTime = 0;

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
  // Check WiFi connection
  if (WiFi.status() != WL_CONNECTED)
  {
    Serial.println("[Heartbeat] WiFi not connected - skipping");
    lastHeartbeatSuccess = false;
    return;
  }

  HTTPClient http;
  String url = String(BACKEND_SERVER_URL) + "/api/v1/devices/heartbeat";

  http.begin(url); // Plain HTTP - no SSL (memory optimization for ESP32)
  http.addHeader("Content-Type", "application/json");

  // Add Authorization header with Bearer token
  if (DEVICE_API_TOKEN && strlen(DEVICE_API_TOKEN) > 0)
  {
    String authHeader = String("Bearer ") + DEVICE_API_TOKEN;
    http.addHeader("Authorization", authHeader.c_str());
  }

  http.setTimeout(5000); // 5 second timeout

  // Build JSON payload
  StaticJsonDocument<512> doc;
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

  if (httpResponseCode > 0)
  {
    String response = http.getString();

    if (httpResponseCode == 200)
    {
      Serial.printf("[Heartbeat] ✓ Sent (code: %d)\n", httpResponseCode);
      lastHeartbeatSuccess = true;
      lastHeartbeatTime = millis();

      // Parse response to check for pending commands
      StaticJsonDocument<1024> responseDoc;
      DeserializationError error = deserializeJson(responseDoc, response);
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
            fetchAndExecuteCommands();
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
  if (WiFi.status() != WL_CONNECTED)
  {
    Serial.println("[Warning] WiFi not connected - cannot send warning");
    return;
  }

  HTTPClient http;
  String url = String(BACKEND_SERVER_URL) + "/api/v1/devices/warning";

  http.begin(url); // Plain HTTP - no SSL (memory optimization for ESP32)
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);

  // Build JSON payload
  StaticJsonDocument<512> doc;
  doc["device_id"] = DEVICE_ID;
  doc["module"] = module_name;
  doc["status"] = isDisconnected ? "disconnected" : "reconnected";
  doc["timestamp"] = millis();

  String jsonString;
  serializeJson(doc, jsonString);

  // Send POST request
  int httpResponseCode = http.POST(jsonString);

  if (httpResponseCode > 0)
  {
    Serial.printf("[Warning] Module '%s' %s - sent to server (code: %d)\n",
                  module_name,
                  isDisconnected ? "DISCONNECTED" : "RECONNECTED",
                  httpResponseCode);
  }
  else
  {
    Serial.printf("[Warning] Failed to send warning: %s\n",
                  http.errorToString(httpResponseCode).c_str());
  }

  http.end();

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
  if (WiFi.status() != WL_CONNECTED)
  {
    Serial.println("[Doorbell] WiFi not connected - skipping ring event");
    return;
  }

  HTTPClient http;
  String url = String(BACKEND_SERVER_URL) + "/api/v1/devices/doorbell/ring";

  http.begin(url); // Plain HTTP - no SSL (memory optimization for ESP32)
  http.addHeader("Content-Type", "application/json");

  // Add Authorization header with Bearer token
  if (DEVICE_API_TOKEN && strlen(DEVICE_API_TOKEN) > 0)
  {
    String authHeader = String("Bearer ") + DEVICE_API_TOKEN;
    http.addHeader("Authorization", authHeader.c_str());
  }

  http.setTimeout(5000);

  // Build JSON payload
  StaticJsonDocument<512> doc;
  doc["device_id"] = DEVICE_ID;

  String jsonString;
  serializeJson(doc, jsonString);

  // Send POST request
  int httpResponseCode = http.POST(jsonString);

  if (httpResponseCode > 0)
  {
    String response = http.getString();

    if (httpResponseCode == 200)
    {
      Serial.printf("[Doorbell] ✓ Ring event sent (code: %d)\n", httpResponseCode);

      // Optional: Parse response
      StaticJsonDocument<1024> responseDoc;
      DeserializationError error = deserializeJson(responseDoc, response);
      if (!error && responseDoc.containsKey("status"))
      {
        const char *status = responseDoc["status"];
        Serial.printf("[Doorbell] → Server response: %s\n", status);
      }
    }
    else
    {
      Serial.printf("[Doorbell] ✗ Failed (code: %d)\n", httpResponseCode);
      Serial.printf("[Doorbell] Response: %s\n", response.c_str());
    }
  }
  else
  {
    Serial.printf("[Doorbell] ✗ Connection failed: %s\n",
                  http.errorToString(httpResponseCode).c_str());
  }

  http.end();
}

// ============================================================================
// Send doorbell status to backend (camera_active, mic_active)
// ALSO acts as heartbeat - resets TTL timer
// ============================================================================
void sendDoorbellStatus(bool camera_active, bool mic_active)
{
  if (WiFi.status() != WL_CONNECTED)
  {
    Serial.println("[DoorbellStatus] WiFi not connected - skipping");
    return;
  }

  HTTPClient http;
  String url = String(BACKEND_SERVER_URL) + "/api/v1/devices/doorbell/status";

  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  // Add Authorization header with Bearer token
  if (DEVICE_API_TOKEN && strlen(DEVICE_API_TOKEN) > 0)
  {
    String authHeader = String("Bearer ") + DEVICE_API_TOKEN;
    http.addHeader("Authorization", authHeader.c_str());
  }

  http.setTimeout(5000);

  // Build JSON payload
  StaticJsonDocument<512> doc;
  doc["device_id"] = DEVICE_ID;
  doc["camera_active"] = camera_active;
  doc["mic_active"] = mic_active;

  // Include heartbeat info
  doc["uptime_ms"] = millis();
  doc["free_heap"] = ESP.getFreeHeap();
  doc["wifi_rssi"] = WiFi.RSSI();
  doc["ip_address"] = WiFi.localIP().toString();

  String jsonString;
  serializeJson(doc, jsonString);

  // Send POST request
  int httpResponseCode = http.POST(jsonString);

  if (httpResponseCode > 0)
  {
    String response = http.getString();

    if (httpResponseCode == 200)
    {
      Serial.printf("[DoorbellStatus] ✓ Sent (code: %d, also acts as heartbeat)\n", httpResponseCode);
    }
    else
    {
      Serial.printf("[DoorbellStatus] ✗ Failed (code: %d)\n", httpResponseCode);
    }
  }
  else
  {
    Serial.printf("[DoorbellStatus] ✗ Connection failed: %s\n",
                  http.errorToString(httpResponseCode).c_str());
  }

  http.end();
}

// ============================================================================
// Send face detection event to backend (saves to Firebase, publishes to Hub)
// Uses chunked sending to avoid socket buffer overflow with large images
// ============================================================================
void sendFaceDetection(bool recognized, const char *name, float confidence, const uint8_t *imageData, size_t imageSize)
{
  if (WiFi.status() != WL_CONNECTED)
  {
    Serial.println("[FaceDetection] WiFi not connected - skipping");
    return;
  }

  // Parse backend URL to extract host and port
  String serverUrl = String(BACKEND_SERVER_URL);
  serverUrl.replace("http://", "");
  serverUrl.replace("https://", "");

  int colonIdx = serverUrl.indexOf(':');
  int slashIdx = serverUrl.indexOf('/');

  String host = (colonIdx > 0) ? serverUrl.substring(0, colonIdx) : (slashIdx > 0) ? serverUrl.substring(0, slashIdx)
                                                                                   : serverUrl;
  int port = (colonIdx > 0) ? serverUrl.substring(colonIdx + 1, (slashIdx > 0) ? slashIdx : serverUrl.length()).toInt() : 80;
  String path = (slashIdx > 0) ? serverUrl.substring(slashIdx) : "";

  // Ensure path construction avoids double slashes
  if (path.length() == 0 || path == "/")
  {
    path = "/api/v1/devices/doorbell/face-detection";
  }
  else if (path.endsWith("/"))
  {
    path += "api/v1/devices/doorbell/face-detection";
  }
  else
  {
    path += "/api/v1/devices/doorbell/face-detection";
  }

  Serial.printf("[FaceDetection] Connecting to %s:%d%s\n", host.c_str(), port, path.c_str());

  WiFiClient client;

  if (!client.connect(host.c_str(), port))
  {
    Serial.println("[FaceDetection] ✗ Connection failed");
    return;
  }

  Serial.println("[FaceDetection] ✓ Connected to server");

  // Disable Nagle's algorithm for faster transmission (must be after connect)
  client.setNoDelay(true);

  String boundary = "----ESP32Boundary" + String(millis());

  // Build form fields (metadata)
  String formData = "";
  formData += "--" + boundary + "\r\n";
  formData += "Content-Disposition: form-data; name=\"device_id\"\r\n\r\n";
  formData += String(DEVICE_ID) + "\r\n";

  formData += "--" + boundary + "\r\n";
  formData += "Content-Disposition: form-data; name=\"recognized\"\r\n\r\n";
  formData += String(recognized ? "true" : "false") + "\r\n";

  formData += "--" + boundary + "\r\n";
  formData += "Content-Disposition: form-data; name=\"name\"\r\n\r\n";
  formData += String(name) + "\r\n";

  formData += "--" + boundary + "\r\n";
  formData += "Content-Disposition: form-data; name=\"confidence\"\r\n\r\n";
  formData += String(confidence, 2) + "\r\n";

  formData += "--" + boundary + "\r\n";
  formData += "Content-Disposition: form-data; name=\"timestamp\"\r\n\r\n";
  formData += String(millis()) + "\r\n";

  // Image header (if image provided)
  String imageHeader = "";
  if (imageData != nullptr && imageSize > 0)
  {
    imageHeader += "--" + boundary + "\r\n";
    imageHeader += "Content-Disposition: form-data; name=\"image\"; filename=\"face.jpg\"\r\n";
    imageHeader += "Content-Type: image/jpeg\r\n\r\n";
  }

  String footer = "--" + boundary + "--\r\n";

  // Calculate total content length
  size_t contentLength = formData.length() + imageHeader.length() + imageSize + 2 + footer.length(); // +2 for \r\n after image

  // Send HTTP headers
  client.print("POST " + path + " HTTP/1.1\r\n");
  client.print("Host: " + host + "\r\n");
  client.print("Content-Type: multipart/form-data; boundary=" + boundary + "\r\n");
  client.print("Content-Length: " + String(contentLength) + "\r\n");

  // Add Authorization header with debug logging
  if (DEVICE_API_TOKEN && strlen(DEVICE_API_TOKEN) > 0)
  {
    String authHeader = "Authorization: Bearer " + String(DEVICE_API_TOKEN) + "\r\n";
    client.print(authHeader);
    Serial.printf("[FaceDetection] Sending auth header (token length: %d)\n", strlen(DEVICE_API_TOKEN));
  }
  else
  {
    Serial.println("[FaceDetection] ⚠️  WARNING: No API token configured!");
  }

  client.print("Connection: close\r\n\r\n");

  // Send form data (metadata fields)
  client.print(formData);

  // Send image in chunks if provided
  if (imageData != nullptr && imageSize > 0)
  {
    client.print(imageHeader);

    const size_t CHUNK_SIZE = 512; // Send 512 bytes at a time (reduced from 1KB for reliability)
    size_t sent = 0;

    Serial.printf("[FaceDetection] Sending image in chunks (%u bytes total)\n", imageSize);

    while (sent < imageSize)
    {
      // Check if connection is still alive before writing
      if (!client.connected())
      {
        Serial.printf("[FaceDetection] ✗ Connection lost at %u/%u bytes\n", sent, imageSize);
        client.stop();
        return;
      }

      size_t toSend = min(CHUNK_SIZE, imageSize - sent);
      size_t written = client.write(imageData + sent, toSend);

      if (written != toSend)
      {
        Serial.printf("[FaceDetection] ✗ Write failed at %u/%u bytes (expected %u, wrote %u)\n",
                      sent, imageSize, toSend, written);
        client.stop();
        return;
      }

      sent += written;

      // Flush to ensure data is sent immediately
      client.flush();

      // Delay to let socket buffer drain and server process data
      if (sent < imageSize)
      {
        delay(50); // Increased from 10ms to 50ms for better reliability
      }

      // Progress indicator every 2KB
      if (sent % 2048 == 0)
      {
        Serial.printf("[FaceDetection] Progress: %u/%u bytes (%.1f%%)\n",
                      sent, imageSize, (sent * 100.0) / imageSize);
      }
    }

    client.print("\r\n"); // End of image part
    Serial.printf("[FaceDetection] ✓ Image sent (%u bytes)\n", sent);
  }

  // Send footer
  client.print(footer);
  client.flush();

  // Wait for response
  unsigned long timeout = millis();
  while (client.available() == 0)
  {
    if (millis() - timeout > 15000)
    {
      Serial.println("[FaceDetection] ✗ Timeout waiting for response");
      client.stop();
      return;
    }
    delay(10);
  }

  // Read response
  String responseHeaders = "";
  int httpCode = 0;
  bool headersEnd = false;

  while (client.available() && !headersEnd)
  {
    String line = client.readStringUntil('\n');
    if (line.startsWith("HTTP/1."))
    {
      int spaceIdx = line.indexOf(' ');
      if (spaceIdx > 0)
      {
        httpCode = line.substring(spaceIdx + 1, spaceIdx + 4).toInt();
      }
    }
    if (line == "\r" || line.length() == 0)
    {
      headersEnd = true;
    }
  }

  String responseBody = "";
  while (client.available())
  {
    responseBody += client.readString();
  }

  client.stop();

  if (httpCode == 200)
  {
    Serial.printf("[FaceDetection] ✓ Sent to backend (recognized: %s, name: %s, conf: %.2f)\n",
                  recognized ? "Yes" : "No", name, confidence);

    // Parse response
    StaticJsonDocument<1024> responseDoc;
    DeserializationError error = deserializeJson(responseDoc, responseBody);
    if (!error && responseDoc.containsKey("event_id"))
    {
      const char *eventId = responseDoc["event_id"];
      Serial.printf("[FaceDetection] → Event ID: %s\n", eventId);
    }
  }
  else
  {
    Serial.printf("[FaceDetection] ✗ Failed (code: %d)\n", httpCode);
    Serial.printf("[FaceDetection] Response: %s\n", responseBody.c_str());
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
void sendFaceDatabaseResult(const char* type, int count, JsonArray faces, const char* db_status, const char* db_message)
{
  if (WiFi.status() != WL_CONNECTED)
  {
    Serial.println("[FaceDB] WiFi not connected - cannot send result");
    return;
  }

  HTTPClient http;
  String url = String(BACKEND_SERVER_URL) + "/api/v1/devices/" + DEVICE_ID + "/face-database/result";

  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  // Add Authorization header with Bearer token
  if (DEVICE_API_TOKEN && strlen(DEVICE_API_TOKEN) > 0)
  {
    String authHeader = String("Bearer ") + DEVICE_API_TOKEN;
    http.addHeader("Authorization", authHeader.c_str());
  }

  http.setTimeout(5000);

  // Build JSON payload
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

  String jsonString;
  serializeJson(doc, jsonString);

  // Send POST request
  int httpResponseCode = http.POST(jsonString);

  if (httpResponseCode > 0)
  {
    if (httpResponseCode == 200)
    {
      Serial.printf("[FaceDB] ✓ %s result sent successfully\n", type);
    }
    else
    {
      Serial.printf("[FaceDB] ✗ Error sending %s result (code: %d)\n", type, httpResponseCode);
    }
  }
  else
  {
    Serial.printf("[FaceDB] ✗ HTTP error: %s\n", http.errorToString(httpResponseCode).c_str());
  }

  http.end();
}

// ============================================================================
// Fetch and execute pending commands from backend
// ============================================================================
void fetchAndExecuteCommands()
{
  if (WiFi.status() != WL_CONNECTED)
  {
    Serial.println("[Commands] WiFi not connected - cannot fetch commands");
    return;
  }

  HTTPClient http;
  String url = String(BACKEND_SERVER_URL) + "/api/v1/devices/commands/pending";

  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  // Add Authorization header with Bearer token
  if (DEVICE_API_TOKEN && strlen(DEVICE_API_TOKEN) > 0)
  {
    String authHeader = String("Bearer ") + DEVICE_API_TOKEN;
    http.addHeader("Authorization", authHeader.c_str());
  }

  http.setTimeout(5000);

  // Build JSON payload
  StaticJsonDocument<256> doc;
  doc["device_id"] = DEVICE_ID;

  String jsonString;
  serializeJson(doc, jsonString);

  // Send POST request
  int httpResponseCode = http.POST(jsonString);

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
    sendUARTCommand("camera_control", "camera_start");
    return true;
  }
  else if (action == "camera_stop")
  {
    sendUARTCommand("camera_control", "camera_stop");
    return true;
  }
  else if (action == "camera_restart")
  {
    sendUARTCommand("reboot");
    return true;
  }

  // Microphone commands
  else if (action == "mic_start")
  {
    sendUARTCommand("mic_control", "mic_start");
    return true;
  }
  else if (action == "mic_stop")
  {
    sendUARTCommand("mic_control", "mic_stop");
    return true;
  }
  else if (action == "mic_status")
  {
    sendUARTCommand("mic_control", "mic_status");
    return true;
  }

  // Amplifier commands
  else if (action == "amp_play")
  {
    if (params.containsKey("url"))
    {
      const char *url = params["url"];
      Serial.printf("[Commands] Playing amplifier URL: %s\n", url);
      sendUART2Command("play", url);
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
      StaticJsonDocument<256> doc;
      doc["cmd"] = "volume";
      doc["level"] = level;
      String output;
      serializeJson(doc, output);
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
    StaticJsonDocument<256> doc;
    doc["cmd"] = "status";
    String output;
    serializeJson(doc, output);
    AmpSerial.println(output);

    return true;
  }
  else if (action == "amp_list")
  {
    Serial.println("[Commands] Requesting amplifier file list");

    // Send list command to amplifier
    StaticJsonDocument<256> doc;
    doc["cmd"] = "list";
    String output;
    serializeJson(doc, output);
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
      StaticJsonDocument<256> doc;
      doc["cmd"] = "wifi";
      doc["ssid"] = ssid;
      doc["password"] = password;
      String output;
      serializeJson(doc, output);
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
  else if (action == "face_count") {
    sendUARTCommand("face_count");
    return true;
  }
  else if (action == "face_list") {
    sendUARTCommand("list_faces");
    return true;
  }
  else if (action == "face_check") {
    sendUARTCommand("check_face_db");
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
    sendUARTCommand("recognize_face");
    return true;
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
  String url = String(BACKEND_SERVER_URL) + "/api/v1/devices/commands/ack";

  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  // Add Authorization header with Bearer token
  if (DEVICE_API_TOKEN && strlen(DEVICE_API_TOKEN) > 0)
  {
    String authHeader = String("Bearer ") + DEVICE_API_TOKEN;
    http.addHeader("Authorization", authHeader.c_str());
  }

  http.setTimeout(5000);

  // Build JSON payload
  StaticJsonDocument<512> doc;
  doc["device_id"] = DEVICE_ID;
  doc["command_id"] = commandId;
  doc["success"] = success;
  if (success)
  {
    doc["result"] = "Command executed: " + action;
  }
  else
  {
    doc["error"] = "Failed to execute: " + action;
  }

  String jsonString;
  serializeJson(doc, jsonString);

  // Send POST request
  int httpResponseCode = http.POST(jsonString);

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
