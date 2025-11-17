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
// Uses chunked sending to avoid socket buffer overflow with large images
// ============================================================================
void sendFaceDetection(bool recognized, const char* name, float confidence, const uint8_t* imageData, size_t imageSize) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[FaceDetection] WiFi not connected - skipping");
    return;
  }

  // Parse backend URL to extract host and port
  String serverUrl = String(BACKEND_SERVER_URL);
  serverUrl.replace("http://", "");
  serverUrl.replace("https://", "");

  int colonIdx = serverUrl.indexOf(':');
  int slashIdx = serverUrl.indexOf('/');

  String host = (colonIdx > 0) ? serverUrl.substring(0, colonIdx) :
                (slashIdx > 0) ? serverUrl.substring(0, slashIdx) : serverUrl;
  int port = (colonIdx > 0) ? serverUrl.substring(colonIdx + 1, (slashIdx > 0) ? slashIdx : serverUrl.length()).toInt() : 80;
  String path = (slashIdx > 0) ? serverUrl.substring(slashIdx) : "";

  // Ensure path starts with / but avoid double slashes
  if (path.length() == 0 || path == "/") {
    path = "/api/v1/devices/doorbell/face-detection";
  } else if (path.endsWith("/")) {
    path += "api/v1/devices/doorbell/face-detection";
  } else {
    path += "/api/v1/devices/doorbell/face-detection";
  }

  Serial.printf("[FaceDetection] Connecting to %s:%d%s\n", host.c_str(), port, path.c_str());

  WiFiClient client;
  if (!client.connect(host.c_str(), port)) {
    Serial.println("[FaceDetection] ✗ Connection failed");
    return;
  }

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
  if (imageData != nullptr && imageSize > 0) {
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
  if (DEVICE_API_TOKEN && strlen(DEVICE_API_TOKEN) > 0) {
    client.print("X-Device-Token: " + String(DEVICE_API_TOKEN) + "\r\n");
  }
  client.print("Connection: close\r\n\r\n");

  // Send form data (metadata fields)
  client.print(formData);

  // Send image in chunks if provided
  if (imageData != nullptr && imageSize > 0) {
    client.print(imageHeader);

    const size_t CHUNK_SIZE = 1024; // Send 1KB at a time
    size_t sent = 0;

    Serial.printf("[FaceDetection] Sending image in chunks (%u bytes total)\n", imageSize);

    while (sent < imageSize) {
      size_t toSend = min(CHUNK_SIZE, imageSize - sent);
      size_t written = client.write(imageData + sent, toSend);

      if (written != toSend) {
        Serial.printf("[FaceDetection] ✗ Write failed at %u/%u bytes\n", sent, imageSize);
        client.stop();
        return;
      }

      sent += written;

      // Small delay to let socket buffer drain
      if (sent < imageSize) {
        delay(10);
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
  while (client.available() == 0) {
    if (millis() - timeout > 15000) {
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

  while (client.available() && !headersEnd) {
    String line = client.readStringUntil('\n');
    if (line.startsWith("HTTP/1.")) {
      int spaceIdx = line.indexOf(' ');
      if (spaceIdx > 0) {
        httpCode = line.substring(spaceIdx + 1, spaceIdx + 4).toInt();
      }
    }
    if (line == "\r" || line.length() == 0) {
      headersEnd = true;
    }
  }

  String responseBody = "";
  while (client.available()) {
    responseBody += client.readString();
  }

  client.stop();

  if (httpCode == 200) {
    Serial.printf("[FaceDetection] ✓ Sent to backend (recognized: %s, name: %s, conf: %.2f)\n",
                  recognized ? "Yes" : "No", name, confidence);

    // Parse response
    JsonDocument responseDoc;
    DeserializationError error = deserializeJson(responseDoc, responseBody);
    if (!error && responseDoc.containsKey("event_id")) {
      const char* eventId = responseDoc["event_id"];
      Serial.printf("[FaceDetection] → Event ID: %s\n", eventId);
    }
  } else {
    Serial.printf("[FaceDetection] ✗ Failed (code: %d)\n", httpCode);
    Serial.printf("[FaceDetection] Response: %s\n", responseBody.c_str());
  }
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
