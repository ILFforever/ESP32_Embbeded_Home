#include "http_control.h"
#include "uart_commands.h"
#include "audio_client.h"
#include "SPIMaster.h"
#include <WiFi.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <ESPmDNS.h>

#include <time.h> // For time functions

// External reference to SPI frame buffer
extern SPIMaster spiMaster;

// WiFi credentials - CHANGE THESE
const char *WIFI_SSID = "ILFforever2";
const char *WIFI_PASSWORD = "19283746";
#define Ready_led 2
// mDNS hostname - device will be accessible at http://doorbell.local
const char *MDNS_HOSTNAME = "doorbell";

AsyncWebServer server(80);
AudioClient *audioClient = nullptr;

// CORS headers helper for AsyncWebServer
void enableCORS(AsyncWebServerResponse *response)
{
  response->addHeader("Access-Control-Allow-Origin", "*");
  response->addHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response->addHeader("Access-Control-Allow-Headers", "Content-Type");
}

// Initialize HTTP server
void initHTTPServer()
{
  // Connect to WiFi
  Serial.println("\n=== WiFi Setup ===");
  Serial.printf("Connecting to %s...\n", WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true); // Auto-reconnect on WiFi drop
  WiFi.setAutoConnect(true);
  WiFi.setSleep(false); // Disable WiFi sleep for better stability
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int timeout = 20; // 20 second timeout
  while (WiFi.status() != WL_CONNECTED && timeout > 0)
  {
    delay(500);
    Serial.print(".");
    timeout--;
  }

  if (WiFi.status() == WL_CONNECTED)
  {
    Serial.println("\n✅ WiFi Connected!");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());

    // Start mDNS service
    if (MDNS.begin(MDNS_HOSTNAME))
    {
      Serial.printf("✅ mDNS responder started: http://%s.local\n", MDNS_HOSTNAME);
    }
    else
    {
      Serial.println("❌ Error starting mDNS");
    }

    // Configure NTP for Thailand (UTC+7)
    Serial.println("Configuring time for Thailand (UTC+7)...");
    configTime(7 * 3600, 0, "pool.ntp.org");
  }
  else
  {
    Serial.println("\n❌ WiFi Connection Failed!");
    Serial.println("HTTP server will not start");
    return;
  }

  // ==================== CORS Preflight Handler ====================
  server.onNotFound([](AsyncWebServerRequest *request)
                    {
    if (request->method() == HTTP_OPTIONS) {
      AsyncWebServerResponse *response = request->beginResponse(204);
      enableCORS(response);
      request->send(response);
    } else {
      AsyncWebServerResponse *response = request->beginResponse(404, "application/json", "{\"status\":\"error\",\"message\":\"Not Found\"}");
      enableCORS(response);
      request->send(response);
    } });

  // ==================== Root - API Info ====================
  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request)
            {
    StaticJsonDocument<1024> doc;
    doc["name"] = "ESP32 Doorbell LCD API";
    doc["version"] = "2.0-async";
    doc["endpoints"]["GET /status"] = "Get system status";
    doc["endpoints"]["GET /info"] = "Get device info";
    doc["endpoints"]["GET /camera/start"] = "Start camera";
    doc["endpoints"]["GET /camera/stop"] = "Stop camera";
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
    doc["endpoints"]["GET /snapshot"] = "Get current JPEG frame";
    doc["endpoints"]["GET /system/restart"] = "Restart LCD ESP32";
    doc["endpoints"]["POST /command"] = "Send custom UART command";
    doc["note"] = "Web UI available at: open doorbell-control.html";

    String output;
    serializeJson(doc, output);

    AsyncWebServerResponse *response = request->beginResponse(200, "application/json", output);
    enableCORS(response);
    request->send(response); });

  // ==================== Camera Control ====================
  server.on("/camera/start", HTTP_GET, [](AsyncWebServerRequest *request)
            {
    digitalWrite(Ready_led, HIGH);
    Ready_led_on_time = millis();
    sendUARTCommand("camera_control", "camera_start");
    AsyncWebServerResponse *response = request->beginResponse(200, "application/json", "{\"status\":\"ok\",\"message\":\"Camera start command sent\"}");
    enableCORS(response);
    request->send(response); });

  server.on("/camera/stop", HTTP_GET, [](AsyncWebServerRequest *request)
            {
    digitalWrite(Ready_led, HIGH);
    Ready_led_on_time = millis();
    sendUARTCommand("camera_control", "camera_stop");
    AsyncWebServerResponse *response = request->beginResponse(200, "application/json", "{\"status\":\"ok\",\"message\":\"Camera stop command sent\"}");
    enableCORS(response);
    request->send(response); });

  server.on("/camera/restart", HTTP_GET, [](AsyncWebServerRequest *request)
            {
    digitalWrite(Ready_led, HIGH);
    Ready_led_on_time = millis();
    sendUARTCommand("reboot");
    AsyncWebServerResponse *response = request->beginResponse(200, "application/json", "{\"status\":\"ok\",\"message\":\"Camera restart command sent\"}");
    enableCORS(response);
    request->send(response); });

  // ==================== Status & Ping ====================
  server.on("/status", HTTP_GET, [](AsyncWebServerRequest *request)
            {
    digitalWrite(Ready_led, HIGH);
    Ready_led_on_time = millis();
    sendUARTCommand("get_status");

    StaticJsonDocument<512> doc;
    doc["status"] = "ok";
    doc["slave_status"] = slave_status;
    doc["message"] = "Status request sent";

    String output;
    serializeJson(doc, output);

    AsyncWebServerResponse *response = request->beginResponse(200, "application/json", output);
    enableCORS(response);
    request->send(response); });

  server.on("/info", HTTP_GET, [](AsyncWebServerRequest *request)
            {
    digitalWrite(Ready_led, HIGH);
    Ready_led_on_time = millis();
    StaticJsonDocument<512> doc;
    doc["ip"] = WiFi.localIP().toString();
    doc["uptime"] = millis();
    doc["slave_status"] = slave_status;
    doc["amp_status"] = amp_status;
    doc["free_heap"] = ESP.getFreeHeap();
    doc["ping_count"] = ping_counter;

    String output;
    serializeJson(doc, output);

    AsyncWebServerResponse *response = request->beginResponse(200, "application/json", output);
    enableCORS(response);
    request->send(response); });

  // ==================== Face Management ====================
  server.on("/face/count", HTTP_GET, [](AsyncWebServerRequest *request)
            {
    digitalWrite(Ready_led, HIGH);
    Ready_led_on_time = millis();
    sendUARTCommand("get_face_count");
    AsyncWebServerResponse *response = request->beginResponse(200, "application/json", "{\"status\":\"ok\",\"message\":\"Get face count command sent\"}");
    enableCORS(response);
    request->send(response); });

  server.on("/face/list", HTTP_GET, [](AsyncWebServerRequest *request)
            {
    digitalWrite(Ready_led, HIGH);
    Ready_led_on_time = millis();
    sendUARTCommand("print_faces");
    AsyncWebServerResponse *response = request->beginResponse(200, "application/json", "{\"status\":\"ok\",\"message\":\"Print faces command sent (check slave serial)\"}");
    enableCORS(response);
    request->send(response); });

  server.on("/face/check", HTTP_GET, [](AsyncWebServerRequest *request)
            {
    sendUARTCommand("check_db");
    AsyncWebServerResponse *response = request->beginResponse(200, "application/json", "{\"status\":\"ok\",\"message\":\"Check database command sent\"}");
    enableCORS(response);
    request->send(response); });

  // ==================== Microphone Control ====================
  server.on("/mic/start", HTTP_GET, [](AsyncWebServerRequest *request)
            {
    digitalWrite(Ready_led, HIGH);
    Ready_led_on_time = millis();
    sendUARTCommand("mic_start");
    AsyncWebServerResponse *response = request->beginResponse(200, "application/json", "{\"status\":\"ok\",\"message\":\"Microphone start command sent\"}");
    enableCORS(response);
    request->send(response); });

  server.on("/mic/stop", HTTP_GET, [](AsyncWebServerRequest *request)
            {
    digitalWrite(Ready_led, HIGH);
    Ready_led_on_time = millis();
    sendUARTCommand("mic_stop");
    AsyncWebServerResponse *response = request->beginResponse(200, "application/json", "{\"status\":\"ok\",\"message\":\"Microphone stop command sent\"}");
    enableCORS(response);
    request->send(response); });

  server.on("/mic/status", HTTP_GET, [](AsyncWebServerRequest *request)
            {
    digitalWrite(Ready_led, HIGH);
    Ready_led_on_time = millis();
    sendUARTCommand("mic_status");
    AsyncWebServerResponse *response = request->beginResponse(200, "application/json", "{\"status\":\"ok\",\"message\":\"Microphone status request sent\"}");
    enableCORS(response);
    request->send(response); });

  // ==================== Audio Streaming ====================
  server.on("/audio/start", HTTP_GET, [](AsyncWebServerRequest *request)
            {
    digitalWrite(Ready_led, HIGH);
    Ready_led_on_time = millis();
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

    AsyncWebServerResponse *response = request->beginResponse(200, "application/json", "{\"status\":\"ok\",\"message\":\"Microphone started (audio streaming disabled)\"}");
    enableCORS(response);
    request->send(response); });

  server.on("/audio/stop", HTTP_GET, [](AsyncWebServerRequest *request)
            {
    digitalWrite(Ready_led, HIGH);
    Ready_led_on_time = millis();
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

    AsyncWebServerResponse *response = request->beginResponse(200, "application/json", "{\"status\":\"ok\",\"message\":\"Microphone stopped (audio streaming disabled)\"}");
    enableCORS(response);
    request->send(response); });

  server.on("/audio/status", HTTP_GET, [](AsyncWebServerRequest *request)
            {
    digitalWrite(Ready_led, HIGH);
    Ready_led_on_time = millis();
    StaticJsonDocument<512> doc;
    doc["status"] = "ok";
    doc["mic_status"] = "checking";
    doc["stream_status"] = "disabled";
    doc["message"] = "Audio streaming functionality not active";

    sendUARTCommand("mic_status");

    String output;
    serializeJson(doc, output);

    AsyncWebServerResponse *response = request->beginResponse(200, "application/json", output);
    enableCORS(response);
    request->send(response); });

  // ==================== Audio Amp Control (UART2) ====================
  server.on("/amp/play", HTTP_GET, [](AsyncWebServerRequest *request)
            {
    digitalWrite(Ready_led, HIGH);
    Ready_led_on_time = millis();
    if (!request->hasParam("url")) {
      AsyncWebServerResponse *response = request->beginResponse(400, "application/json", "{\"status\":\"error\",\"message\":\"Missing 'url' parameter\"}");
      enableCORS(response);
      request->send(response);
      return;
    }

    String url = request->getParam("url")->value();
    sendUART2Command("play", url.c_str());

    StaticJsonDocument<512> doc;
    doc["status"] = "ok";
    doc["message"] = "Sent play command to Amp";
    doc["url"] = url;

    String output;
    serializeJson(doc, output);

    AsyncWebServerResponse *response = request->beginResponse(200, "application/json", output);
    enableCORS(response);
    request->send(response); });

  server.on("/amp/stop", HTTP_GET, [](AsyncWebServerRequest *request)
            {
    digitalWrite(Ready_led, HIGH);
    Ready_led_on_time = millis();
    sendUART2Command("stop", "");
    AsyncWebServerResponse *response = request->beginResponse(200, "application/json", "{\"status\":\"ok\",\"message\":\"Sent stop command to Amp\"}");
    enableCORS(response);
    request->send(response); });

  server.on("/amp/restart", HTTP_GET, [](AsyncWebServerRequest *request)
            {
    sendUART2Command("restart", "");
    AsyncWebServerResponse *response = request->beginResponse(200, "application/json", "{\"status\":\"ok\",\"message\":\"Sent restart command to Amp - Board will reboot\"}");
    enableCORS(response);
    request->send(response); });

  // ==================== System Control ====================
  server.on("/system/restart", HTTP_GET, [](AsyncWebServerRequest *request)
            {
    digitalWrite(Ready_led, HIGH);
    Ready_led_on_time = millis();
    AsyncWebServerResponse *response = request->beginResponse(200, "application/json", "{\"status\":\"ok\",\"message\":\"LCD ESP32 restarting in 1 second...\"}");
    enableCORS(response);
    request->send(response);
    delay(1000);
    ESP.restart(); });

  // ==================== Custom Command (POST) ====================
  server.on("/command", HTTP_POST, [](AsyncWebServerRequest *request) {}, NULL, [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total)
            {
      digitalWrite(Ready_led, HIGH);
      Ready_led_on_time = millis();
      // Parse JSON body
      StaticJsonDocument<512> doc;
      DeserializationError error = deserializeJson(doc, (const char*)data);

      if (error) {
        AsyncWebServerResponse *response = request->beginResponse(400, "application/json", "{\"status\":\"error\",\"message\":\"Invalid JSON\"}");
        enableCORS(response);
        request->send(response);
        return;
      }

      if (!doc.containsKey("cmd")) {
        AsyncWebServerResponse *response = request->beginResponse(400, "application/json", "{\"status\":\"error\",\"message\":\"Missing 'cmd' field\"}");
        enableCORS(response);
        request->send(response);
        return;
      }

      const char* cmd = doc["cmd"];

      // Build UART JSON command
      StaticJsonDocument<512> uart_doc;
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

      String response_body = "{\"status\":\"ok\",\"message\":\"Command sent: ";
      response_body += cmd;
      response_body += "\"}";

      AsyncWebServerResponse *response = request->beginResponse(200, "application/json", response_body);
      enableCORS(response);
      request->send(response); });
  Serial.printf("Free heap: %d bytes\n", ESP.getFreeHeap());
  server.begin();
  Serial.println("✅ AsyncWebServer started on port 80");

  Serial.println("\nAvailable endpoints:");
  Serial.println("  GET  /                - API documentation");
  Serial.println("  GET  /camera/start    - Start camera");
  Serial.println("  GET  /camera/stop     - Stop camera");
  Serial.println("  GET  /status          - Get slave status");
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
  Serial.println("  GET  /amp/restart     - Restart Amp ESP32 (UART2)");
  Serial.println("  GET  /snapshot        - Get current JPEG frame");
  Serial.println("  GET  /system/restart  - Restart LCD ESP32");
  Serial.println("  POST /command         - Send custom command");
  Serial.println("\n🌐 Open doorbell-control.html in your browser");
  Serial.printf("📡 API URL: http://%s.local or http://%s\n", MDNS_HOSTNAME, WiFi.localIP().toString().c_str());
}

// WiFi watchdog - call periodically to check connection
void checkWiFiConnection()
{
  if (WiFi.status() != WL_CONNECTED)
  {
    Serial.println("⚠️ WiFi disconnected! Attempting reconnect...");
    WiFi.reconnect();
  }
}
