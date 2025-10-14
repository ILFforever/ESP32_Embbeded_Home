#include "http_control.h"
#include "uart_commands.h"
#include <WiFi.h>
#include <WebServer.h>

#include <time.h> // For time functions
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
  html += "<span class='method'>Face Management (Native ESP-WHO)</span>";
  html += "<br><button onclick='sendCmd(\"enroll_face\")'>Enroll Next Face</button>";
  html += "<button onclick='sendCmd(\"delete_last\")'>Delete Last Face</button>";
  html += "<button onclick='sendCmd(\"reset_database\")' style='background:#dc3545;'>Reset DB</button>";
  html += "<button onclick='sendCmd(\"resume_detection\")'>Resume Detection</button>";
  html += "</div>";

  html += "<div class='endpoint'>";
  html += "<span class='method'>Face Database Management</span>";
  html += "<br><button onclick='fetch(\"/face/count\").then(r=>r.text()).then(alert)'>Get Face Count</button>";
  html += "<button onclick='fetch(\"/face/list\").then(r=>r.text()).then(alert)'>Print Faces (Serial)</button>";
  html += "<button onclick='fetch(\"/face/check\").then(r=>r.text()).then(alert)'>Check DB Status</button>";
  html += "</div>";

  html += "<div class='endpoint'>";
  html += "<span class='method'>Name Management</span>";
  html += "<br><label>Face ID: <input type='number' id='faceId' min='1' style='width:60px;padding:5px;'></label>";
  html += "<label> Name: <input type='text' id='faceName' placeholder='e.g. John' style='width:150px;padding:5px;'></label>";
  html += "<br><button onclick='setName()'>Set Name</button>";
  html += "<button onclick='getName()'>Get Name</button>";
  html += "</div>";

  html += "<div class='endpoint'>";
  html += "<span class='method'>Custom Command</span>";
  html += "<br><label>Command: <input type='text' id='cmd' placeholder='e.g. enroll_face' style='width:200px;padding:5px;'></label>";
  html += "<br><label>Params (JSON): <input type='text' id='params' placeholder='e.g. {\"name\":\"John\"}' style='width:300px;padding:5px;margin-top:5px;'></label>";
  html += "<br><button onclick='sendCustomCmd()'>Send Command</button>";
  html += "</div>";

  html += "<div class='status' id='status'>Ready</div>";
  html += "<script>";
  html += "function sendCmd(cmd,params){";
  html += "let body={cmd:cmd};";
  html += "if(params)body.params=params;";
  html += "fetch('/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})";
  html += ".then(r=>r.text()).then(alert).catch(e=>alert('Error: '+e));";
  html += "}";
  html += "function sendCustomCmd(){";
  html += "let cmd=document.getElementById('cmd').value;";
  html += "let params=document.getElementById('params').value;";
  html += "if(!cmd){alert('Command required');return;}";
  html += "let body={cmd:cmd};";
  html += "if(params){try{body.params=JSON.parse(params);}catch(e){alert('Invalid JSON in params');return;}}";
  html += "fetch('/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})";
  html += ".then(r=>r.text()).then(alert).catch(e=>alert('Error: '+e));";
  html += "}";
  html += "function setName(){";
  html += "let id=parseInt(document.getElementById('faceId').value);";
  html += "let name=document.getElementById('faceName').value;";
  html += "if(!id||id<1){alert('Valid Face ID required');return;}";
  html += "let body={cmd:'set_name',params:{id:id,name:name}};";
  html += "fetch('/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})";
  html += ".then(r=>r.text()).then(alert).catch(e=>alert('Error: '+e));";
  html += "}";
  html += "function getName(){";
  html += "let id=parseInt(document.getElementById('faceId').value);";
  html += "if(!id||id<1){alert('Valid Face ID required');return;}";
  html += "let body={cmd:'get_name',params:{id:id}};";
  html += "fetch('/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})";
  html += ".then(r=>r.text()).then(alert).catch(e=>alert('Error: '+e));";
  html += "}";
  html += "</script>";
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

// Get face count from database
void handleGetFaceCount() {
  sendUARTCommand("get_face_count");
  server.send(200, "text/plain", "Get face count command sent");
}

// Print all faces (output to slave serial console)
void handlePrintFaces() {
  sendUARTCommand("print_faces");
  server.send(200, "text/plain", "Print faces command sent (check slave serial)");
}

// Check database status
void handleCheckDB() {
  sendUARTCommand("check_db");
  server.send(200, "text/plain", "Check database command sent");
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

    if (!doc.containsKey("cmd")) {
      server.send(400, "text/plain", "Missing 'cmd' field");
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
    SlaveSerial.println(output);

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

    // Configure NTP for Thailand (UTC+7)
    Serial.println("Configuring time for Thailand (UTC+7)...");
    configTime(7 * 3600, 0, "pool.ntp.org");
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
  server.on("/face/count", HTTP_GET, handleGetFaceCount);
  server.on("/face/list", HTTP_GET, handlePrintFaces);
  server.on("/face/check", HTTP_GET, handleCheckDB);
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
  Serial.println("  GET  /face/count      - Get face count from camera");
  Serial.println("  GET  /face/list       - Print face list (slave serial)");
  Serial.println("  GET  /face/check      - Check database status");
  Serial.println("  POST /command         - Send custom command");
}

// Handle HTTP client requests
void handleHTTPClient() {
  server.handleClient();
}
