#include "http_control.h"
#include "uart_commands.h"
#include <WiFi.h>
#include <WebServer.h>

// WiFi credentials - CHANGE THESE
const char* ssid = "ILFforever2";
const char* password = "19283746";

WebServer server(80);

// Root endpoint - API documentation
void handleRoot() {
  String html = "<!DOCTYPE html><html><head>";
  html += "<title>ESP32 UART Controller</title>";
  html += "<style>body{font-family:Arial;padding:20px;background:#f0f0f0;}";
  html += ".container{max-width:800px;margin:0 auto;background:white;padding:20px;border-radius:8px;}";
  html += "h1{color:#333;}";
  html += ".endpoint{background:#e8f4f8;padding:15px;margin:10px 0;border-radius:5px;}";
  html += ".method{color:#0066cc;font-weight:bold;}";
  html += "button{background:#0066cc;color:white;border:none;padding:10px 20px;border-radius:5px;cursor:pointer;margin:5px;}";
  html += "button:hover{background:#0052a3;}";
  html += ".status{padding:10px;margin:10px 0;border-radius:5px;background:#d4edda;color:#155724;}";
  html += "</style></head><body>";
  html += "<div class='container'>";
  html += "<h1>ESP32 UART Controller</h1>";
  html += "<h2>Available Endpoints:</h2>";

  html += "<div class='endpoint'>";
  html += "<span class='method'>GET</span> /camera/start - Start camera";
  html += "<br><button onclick='fetch(\"/camera/start\").then(r=>r.text()).then(alert)'>Start Camera</button>";
  html += "</div>";

  html += "<div class='endpoint'>";
  html += "<span class='method'>GET</span> /camera/stop - Stop camera";
  html += "<br><button onclick='fetch(\"/camera/stop\").then(r=>r.text()).then(alert)'>Stop Camera</button>";
  html += "</div>";

  html += "<div class='endpoint'>";
  html += "<span class='method'>GET</span> /status - Get slave status";
  html += "<br><button onclick='fetch(\"/status\").then(r=>r.text()).then(alert)'>Get Status</button>";
  html += "</div>";

  html += "<div class='endpoint'>";
  html += "<span class='method'>GET</span> /ping - Send ping to slave";
  html += "<br><button onclick='fetch(\"/ping\").then(r=>r.text()).then(alert)'>Send Ping</button>";
  html += "</div>";

  html += "<div class='endpoint'>";
  html += "<span class='method'>POST</span> /command - Send custom command";
  html += "<br>Body: {\"cmd\":\"command_name\", \"param\":\"param_value\", \"value\":123}";
  html += "</div>";

  html += "<div class='status' id='status'>Ready</div>";
  html += "<script>setInterval(()=>{fetch('/info').then(r=>r.json()).then(d=>{";
  html += "document.getElementById('status').innerHTML='IP: '+d.ip+'<br>Uptime: '+d.uptime+'ms<br>Slave Status: '+d.slave_status;";
  html += "})},2000);</script>";
  html += "</div></body></html>";

  server.send(200, "text/html", html);
}

// Camera start
void handleCameraStart() {
  sendUARTCommand("camera_control", "camera_start");
  server.send(200, "text/plain", "Camera start command sent");
}

// Camera stop
void handleCameraStop() {
  sendUARTCommand("camera_control", "camera_stop");
  server.send(200, "text/plain", "Camera stop command sent");
}

// Get status
void handleStatus() {
  sendUARTCommand("get_status");
  server.send(200, "text/plain", "Status request sent");
}

// Send ping
void handlePing() {
  sendUARTPing();
  server.send(200, "text/plain", "Ping sent");
}

// Get system info
void handleInfo() {
  String json = "{";
  json += "\"ip\":\"" + WiFi.localIP().toString() + "\",";
  json += "\"uptime\":" + String(millis()) + ",";
  json += "\"slave_status\":" + String(slave_status) + ",";
  json += "\"free_heap\":" + String(ESP.getFreeHeap()) + ",";
  json += "\"ping_count\":" + String(ping_counter);
  json += "}";

  server.send(200, "application/json", json);
}

// Custom command endpoint
void handleCustomCommand() {
  if (server.hasArg("plain")) {
    String body = server.arg("plain");

    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, body);

    if (error) {
      server.send(400, "text/plain", "Invalid JSON");
      return;
    }

    const char* cmd = doc["cmd"];
    const char* param = doc.containsKey("param") ? doc["param"] : nullptr;
    int value = doc.containsKey("value") ? doc["value"] : -1;

    sendUARTCommand(cmd, param, value);
    server.send(200, "text/plain", "Command sent: " + String(cmd));
  } else {
    server.send(400, "text/plain", "No body provided");
  }
}

// 404 handler
void handleNotFound() {
  server.send(404, "text/plain", "Not Found");
}

// Initialize HTTP server
void initHTTPServer() {
  // Connect to WiFi
  Serial.println("\n=== WiFi Setup ===");
  Serial.printf("Connecting to %s...\n", ssid);

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

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
  } else {
    Serial.println("\n❌ WiFi Connection Failed!");
    Serial.println("HTTP server will not start");
    return;
  }

  // Setup HTTP endpoints
  server.on("/", HTTP_GET, handleRoot);
  server.on("/camera/start", HTTP_GET, handleCameraStart);
  server.on("/camera/stop", HTTP_GET, handleCameraStop);
  server.on("/status", HTTP_GET, handleStatus);
  server.on("/ping", HTTP_GET, handlePing);
  server.on("/info", HTTP_GET, handleInfo);
  server.on("/command", HTTP_POST, handleCustomCommand);
  server.onNotFound(handleNotFound);

  server.begin();
  Serial.println("✅ HTTP server started on port 80");
  Serial.println("\nAvailable endpoints:");
  Serial.println("  GET  /                - Web interface");
  Serial.println("  GET  /camera/start    - Start camera");
  Serial.println("  GET  /camera/stop     - Stop camera");
  Serial.println("  GET  /status          - Get slave status");
  Serial.println("  GET  /ping            - Send ping");
  Serial.println("  GET  /info            - Get system info");
  Serial.println("  POST /command         - Send custom command");
}

// Handle HTTP client requests
void handleHTTPClient() {
  server.handleClient();
}
