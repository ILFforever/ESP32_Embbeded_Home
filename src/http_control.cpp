#include "http_control.h"
#include "uart_commands.h"
#include "audio_client.h"
#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>

#include <time.h> // For time functions

// WiFi credentials - CHANGE THESE
const char* WIFI_SSID = "ILFforever2";
const char* WIFI_PASSWORD = "19283746";

// Camera IP for audio streaming
const char* CAMERA_IP = "192.168.1.100";  // TODO: Update with actual camera IP

// mDNS hostname - device will be accessible at http://doorbell.local
const char* MDNS_HOSTNAME = "doorbell";

WebServer server(80);
AudioClient* audioClient = nullptr;

// CORS headers for all responses
void enableCORS() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
}

// OPTIONS handler for CORS preflight
void handleOptions() {
  enableCORS();
  server.send(204);
}

// Root endpoint - API info (JSON)
void handleRoot() {
  enableCORS();

  JsonDocument doc;
  doc["name"] = "ESP32 Doorbell LCD API";
  doc["version"] = "1.0";
  doc["endpoints"]["GET /status"] = "Get system status";
  doc["endpoints"]["GET /info"] = "Get device info";
  doc["endpoints"]["GET /camera/start"] = "Start camera";
  doc["endpoints"]["GET /camera/stop"] = "Stop camera";
  doc["endpoints"]["GET /ping"] = "Send ping to slave";
  doc["endpoints"]["GET /face/count"] = "Get face count";
  doc["endpoints"]["GET /face/list"] = "List faces (to serial)";
  doc["endpoints"]["GET /face/check"] = "Check face DB";
  doc["endpoints"]["GET /mic/start"] = "Start microphone";
  doc["endpoints"]["GET /mic/stop"] = "Stop microphone";
  doc["endpoints"]["GET /mic/status"] = "Microphone status";
  doc["endpoints"]["GET /audio/start"] = "Start audio stream";
  doc["endpoints"]["GET /audio/stop"] = "Stop audio stream";
  doc["endpoints"]["GET /audio/status"] = "Audio stream status";
  doc["endpoints"]["GET /amp/play?url=<url>"] = "Play URL on amp";
  doc["endpoints"]["GET /amp/stop"] = "Stop amp playback";
  doc["endpoints"]["GET /amp/restart"] = "Restart amp ESP32";
  doc["endpoints"]["GET /system/restart"] = "Restart LCD ESP32";
  doc["endpoints"]["POST /command"] = "Send custom UART command";
  doc["note"] = "Web UI available at: https://github.com/yourusername/doorbell-ui or open doorbell-control.html";

  String output;
  serializeJson(doc, output);
  server.send(200, "application/json", output);
}

// Camera start
void handleCameraStart() {
  enableCORS();
  sendUARTCommand("camera_control", "camera_start");
  server.send(200, "application/json", "{\"status\":\"ok\",\"message\":\"Camera start command sent\"}");
}

// Camera stop
void handleCameraStop() {
  enableCORS();
  sendUARTCommand("camera_control", "camera_stop");
  server.send(200, "application/json", "{\"status\":\"ok\",\"message\":\"Camera stop command sent\"}");
}

// Get status
void handleStatus() {
  enableCORS();
  sendUARTCommand("get_status");

  JsonDocument doc;
  doc["status"] = "ok";
  doc["slave_status"] = slave_status;
  doc["message"] = "Status request sent";

  String output;
  serializeJson(doc, output);
  server.send(200, "application/json", output);
}

// Send ping
void handlePing() {
  enableCORS();
  sendUARTPing();
  server.send(200, "application/json", "{\"status\":\"ok\",\"message\":\"Ping sent\"}");
}

// Get face count from database
void handleGetFaceCount() {
  enableCORS();
  sendUARTCommand("get_face_count");
  server.send(200, "application/json", "{\"status\":\"ok\",\"message\":\"Get face count command sent\"}");
}

// Print all faces (output to slave serial console)
void handlePrintFaces() {
  enableCORS();
  sendUARTCommand("print_faces");
  server.send(200, "application/json", "{\"status\":\"ok\",\"message\":\"Print faces command sent (check slave serial)\"}");
}

// Check database status
void handleCheckDB() {
  enableCORS();
  sendUARTCommand("check_db");
  server.send(200, "application/json", "{\"status\":\"ok\",\"message\":\"Check database command sent\"}");
}

// Get system info
void handleInfo() {
  enableCORS();

  JsonDocument doc;
  doc["ip"] = WiFi.localIP().toString();
  doc["uptime"] = millis();
  doc["slave_status"] = slave_status;
  doc["amp_status"] = amp_status;
  doc["free_heap"] = ESP.getFreeHeap();
  doc["ping_count"] = ping_counter;

  String output;
  serializeJson(doc, output);
  server.send(200, "application/json", output);
}

// Custom command endpoint
void handleCustomCommand() {
  enableCORS();

  if (server.hasArg("plain")) {
    String body = server.arg("plain");

    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, body);

    if (error) {
      server.send(400, "application/json", "{\"status\":\"error\",\"message\":\"Invalid JSON\"}");
      return;
    }

    if (!doc.containsKey("cmd")) {
      server.send(400, "application/json", "{\"status\":\"error\",\"message\":\"Missing 'cmd' field\"}");
      return;
    }

    const char* cmd = doc["cmd"];

    // Build UART JSON command
    JsonDocument uart_doc;
    uart_doc["cmd"] = cmd;

    // Check if params object exists and add it
    if (doc.containsKey("params") && doc["params"].is<JsonObject>()) {
      uart_doc["params"] = doc["params"];
    }

    // Send to UART
    String output;
    serializeJson(uart_doc, output);
    Serial.println(output);  // Debug
    MasterSerial.println(output);

    String response = "{\"status\":\"ok\",\"message\":\"Command sent: ";
    response += cmd;
    response += "\"}";
    server.send(200, "application/json", response);
  } else {
    server.send(400, "application/json", "{\"status\":\"error\",\"message\":\"No body provided\"}");
  }
}

// Microphone start
void handleMicStart() {
  enableCORS();
  sendUARTCommand("mic_start");
  server.send(200, "application/json", "{\"status\":\"ok\",\"message\":\"Microphone start command sent\"}");
}

// Microphone stop
void handleMicStop() {
  enableCORS();
  sendUARTCommand("mic_stop");
  server.send(200, "application/json", "{\"status\":\"ok\",\"message\":\"Microphone stop command sent\"}");
}

// Microphone status
void handleMicStatus() {
  enableCORS();
  sendUARTCommand("mic_status");
  server.send(200, "application/json", "{\"status\":\"ok\",\"message\":\"Microphone status request sent\"}");
}

// Audio stream start - automatically starts microphone first
void handleAudioStreamStart() {
  enableCORS();
  Serial.println("[HTTP] Audio start request received");

  // Clean up any existing audio client to prevent socket leaks
  if (audioClient) {
    Serial.println("[HTTP] Cleaning up existing AudioClient...");
    if (audioClient->isStreaming()) {
      audioClient->stop();
    }
    delete audioClient;
    audioClient = nullptr;
  }

  Serial.println("[HTTP] Sending mic_start to camera...");
  sendUARTCommand("mic_start");

  server.send(200, "application/json", "{\"status\":\"ok\",\"message\":\"Microphone started (audio streaming disabled)\"}");
}

// Audio stream stop - automatically stops microphone too
void handleAudioStreamStop() {
  enableCORS();

  // Clean up any existing audio client to prevent socket leaks
  if (audioClient) {
    Serial.println("[HTTP] Cleaning up AudioClient...");
    if (audioClient->isStreaming()) {
      audioClient->stop();
    }
    delete audioClient;
    audioClient = nullptr;
  }

  // Stop the microphone on camera via UART
  sendUARTCommand("mic_stop");

  server.send(200, "application/json", "{\"status\":\"ok\",\"message\":\"Microphone stopped (audio streaming disabled)\"}");
}

// Audio stream status - shows both microphone and stream status
void handleAudioStreamStatus() {
  enableCORS();

  JsonDocument doc;
  doc["status"] = "ok";
  doc["mic_status"] = "checking";
  doc["stream_status"] = "disabled";
  doc["message"] = "Audio streaming functionality not active";

  sendUARTCommand("mic_status");

  String output;
  serializeJson(doc, output);
  server.send(200, "application/json", output);
}

// ==================== Audio Amp (UART2) Handlers ====================

void handleAmpPlay() {
  enableCORS();

  if (!server.hasArg("url")) {
    server.send(400, "application/json", "{\"status\":\"error\",\"message\":\"Missing 'url' parameter\"}");
    return;
  }

  String url = server.arg("url");
  sendUART2Command("play", url.c_str());

  JsonDocument doc;
  doc["status"] = "ok";
  doc["message"] = "Sent play command to Amp";
  doc["url"] = url;

  String output;
  serializeJson(doc, output);
  server.send(200, "application/json", output);
}

void handleAmpStop() {
  enableCORS();
  sendUART2Command("stop", "");
  server.send(200, "application/json", "{\"status\":\"ok\",\"message\":\"Sent stop command to Amp\"}");
}

void handleAmpRestart() {
  enableCORS();
  sendUART2Command("restart", "");
  server.send(200, "application/json", "{\"status\":\"ok\",\"message\":\"Sent restart command to Amp - Board will reboot\"}");
}

void handleLCDRestart() {
  enableCORS();
  server.send(200, "application/json", "{\"status\":\"ok\",\"message\":\"LCD ESP32 restarting in 1 second...\"}");
  delay(1000);
  ESP.restart();
}

// 404 handler
void handleNotFound() {
  enableCORS();
  server.send(404, "application/json", "{\"status\":\"error\",\"message\":\"Not Found\"}");
}

// Initialize HTTP server
void initHTTPServer() {
  // Connect to WiFi
  Serial.println("\n=== WiFi Setup ===");
  Serial.printf("Connecting to %s...\n", WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int timeout = 20; // 20 second timeout
  while (WiFi.status() != WL_CONNECTED && timeout > 0) {
    delay(500);
    Serial.print(".");
    timeout--;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ WiFi Connected!");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());

    // Start mDNS service
    if (MDNS.begin(MDNS_HOSTNAME)) {
      Serial.printf("✅ mDNS responder started: http://%s.local\n", MDNS_HOSTNAME);
    } else {
      Serial.println("❌ Error starting mDNS");
    }

    // Configure NTP for Thailand (UTC+7)
    Serial.println("Configuring time for Thailand (UTC+7)...");
    configTime(7 * 3600, 0, "pool.ntp.org");
  } else {
    Serial.println("\n❌ WiFi Connection Failed!");
    Serial.println("HTTP server will not start");
    return;
  }

  // Setup HTTP endpoints
  // CORS preflight handler - must be registered before specific endpoints
  server.onNotFound([]() {
    if (server.method() == HTTP_OPTIONS) {
      handleOptions();
    } else {
      handleNotFound();
    }
  });

  server.on("/", HTTP_GET, handleRoot);
  server.on("/camera/start", HTTP_GET, handleCameraStart);
  server.on("/camera/stop", HTTP_GET, handleCameraStop);
  server.on("/status", HTTP_GET, handleStatus);
  server.on("/ping", HTTP_GET, handlePing);
  server.on("/info", HTTP_GET, handleInfo);
  server.on("/face/count", HTTP_GET, handleGetFaceCount);
  server.on("/face/list", HTTP_GET, handlePrintFaces);
  server.on("/face/check", HTTP_GET, handleCheckDB);
  server.on("/mic/start", HTTP_GET, handleMicStart);
  server.on("/mic/stop", HTTP_GET, handleMicStop);
  server.on("/mic/status", HTTP_GET, handleMicStatus);
  server.on("/audio/start", HTTP_GET, handleAudioStreamStart);
  server.on("/audio/stop", HTTP_GET, handleAudioStreamStop);
  server.on("/audio/status", HTTP_GET, handleAudioStreamStatus);
  server.on("/amp/play", HTTP_GET, handleAmpPlay);
  server.on("/amp/stop", HTTP_GET, handleAmpStop);
  server.on("/amp/restart", HTTP_GET, handleAmpRestart);
  server.on("/system/restart", HTTP_GET, handleLCDRestart);
  server.on("/command", HTTP_POST, handleCustomCommand);

  server.begin();
  Serial.println("✅ HTTP server started on port 80");
  Serial.println("\nAvailable endpoints:");
  Serial.println("  GET  /                - Web interface");
  Serial.println("  GET  /camera/start    - Start camera");
  Serial.println("  GET  /camera/stop     - Stop camera");
  Serial.println("  GET  /status          - Get slave status");
  Serial.println("  GET  /ping            - Send ping");
  Serial.println("  GET  /info            - Get system info");
  Serial.println("  GET  /face/count      - Get face count from camera");
  Serial.println("  GET  /face/list       - Print face list (slave serial)");
  Serial.println("  GET  /face/check      - Check database status");
  Serial.println("  GET  /mic/start       - Start microphone");
  Serial.println("  GET  /mic/stop        - Stop microphone");
  Serial.println("  GET  /mic/status      - Get microphone status");
  Serial.println("  GET  /audio/start     - Start audio streaming from camera");
  Serial.println("  GET  /audio/stop      - Stop audio streaming");
  Serial.println("  GET  /audio/status    - Get audio stream status");
  Serial.println("  GET  /amp/play?url=<url> - Play audio URL on Amp (UART2)");
  Serial.println("  GET  /amp/stop        - Stop Amp playback (UART2)");
  Serial.println("  POST /command         - Send custom command");
}

// Handle HTTP client requests
void handleHTTPClient() {
  server.handleClient();
}
