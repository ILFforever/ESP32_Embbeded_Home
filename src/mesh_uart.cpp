#include "mesh_uart.h"

// Mesh ping-pong tracking
uint32_t mesh_ping_counter = 0;
unsigned long last_mesh_pong_time = 0;
int mesh_status = 0; // 0 = standby, -1 = disconnected, 1 = active

// Mesh disconnect warning tracking
unsigned long mesh_disconnect_start = 0;
bool mesh_disconnect_warning_sent = false;

// Define timeout constants
#define MESH_PONG_TIMEOUT 10000          // 10 seconds
#define DISCONNECT_WARNING_INTERVAL 30000 // 30 seconds

// Mesh Serial object (will be initialized in main.cpp)
HardwareSerial MeshSerial(0); // UART0

// ============================================================================
// Initialize Mesh UART communication
// ============================================================================
void initMeshUART(int rxPin, int txPin, unsigned long baud)
{
  MeshSerial.begin(baud, SERIAL_8N1, rxPin, txPin);
  Serial.printf("[MeshUART] Initialized on RX=%d, TX=%d, Baud=%lu\n", rxPin, txPin, baud);

  last_mesh_pong_time = millis();
  mesh_status = 0;
}

// ============================================================================
// Send ping message to Mesh
// ============================================================================
void sendMeshPing()
{
  JsonDocument doc;
  doc["type"] = "ping";
  doc["seq"] = mesh_ping_counter++;
  doc["timestamp"] = millis();

  String output;
  serializeJson(doc, output);

  MeshSerial.println(output);
}

// ============================================================================
// Send command to Mesh
// ============================================================================
void sendMeshCommand(const char* cmd, const char* param)
{
  JsonDocument doc;
  doc["cmd"] = cmd;

  if (param != nullptr)
  {
    doc["param"] = param;
  }

  String output;
  serializeJson(doc, output);

  MeshSerial.println(output);
  Serial.printf("[MeshUART] Sent command: %s\n", output.c_str());
}

// ============================================================================
// Handle UART response from Mesh
// ============================================================================
void handleMeshResponse(String line)
{
  // Skip empty lines
  if (line.length() == 0)
  {
    return;
  }

  // Skip ESP-IDF log messages (format: "I (timestamp) TAG: message")
  if (line.startsWith("I (") || line.startsWith("W (") ||
      line.startsWith("E (") || line.startsWith("D ("))
  {
    return;
  }

  // Parse JSON response
  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, line);

  if (error)
  {
    Serial.print("[MeshUART] 📥 RX (non-JSON): ");
    Serial.println(line);
    return;
  }

  // Handle pong response (silently, no print)
  if (doc.containsKey("type") && doc["type"] == "pong")
  {
    last_mesh_pong_time = millis();

    // Mark as active if we got a pong
    if (mesh_status != 1)
    {
      mesh_status = 1;
      Serial.println("[MeshUART] ✓ Mesh module connected");
    }
    return;
  }

  // Handle sensor data from mesh
  if (doc.containsKey("type") && doc["type"] == "sensor_data")
  {
    Serial.println("[MeshUART] 📊 Sensor data received:");

    if (doc.containsKey("temperature"))
    {
      float temp = doc["temperature"];
      Serial.printf("  Temperature: %.1f°C\n", temp);
    }

    if (doc.containsKey("humidity"))
    {
      float humidity = doc["humidity"];
      Serial.printf("  Humidity: %.1f%%\n", humidity);
    }

    if (doc.containsKey("motion"))
    {
      bool motion = doc["motion"];
      Serial.printf("  Motion: %s\n", motion ? "Detected" : "None");
    }

    return;
  }

  // Handle other mesh responses
  Serial.print("[MeshUART] 📥 RX: ");
  Serial.println(line);
}

// ============================================================================
// Check Mesh UART for incoming data
// ============================================================================
void checkMeshUART()
{
  while (MeshSerial.available())
  {
    String line = MeshSerial.readStringUntil('\n');
    line.trim();
    handleMeshResponse(line);
  }
}

// ============================================================================
// Check Mesh ping timeout
// ============================================================================
void checkMeshTimeout()
{
  unsigned long now = millis();
  unsigned long timeSinceLastPong = now - last_mesh_pong_time;

  // Check for timeout (10 seconds)
  if (timeSinceLastPong > MESH_PONG_TIMEOUT)
  {
    if (mesh_status != -1)
    {
      mesh_status = -1;
      Serial.println("[MeshUART] ⚠ Mesh module disconnected (timeout)");
      mesh_disconnect_start = now;
      mesh_disconnect_warning_sent = false;
    }

    // Check for 30-second disconnect warning
    unsigned long disconnectDuration = now - mesh_disconnect_start;
    if (disconnectDuration > DISCONNECT_WARNING_INTERVAL && !mesh_disconnect_warning_sent)
    {
      mesh_disconnect_warning_sent = true;
      Serial.println("[MeshUART] ⚠⚠ WARNING: Mesh module disconnected for 30+ seconds!");

      // TODO: Send warning to backend via hub_network
      // sendDisconnectWarning("mesh", true);
    }
  }
  else
  {
    // Reset disconnect tracking if reconnected
    if (mesh_status == -1)
    {
      mesh_status = 0;
      Serial.println("[MeshUART] ✓ Mesh module reconnected");

      if (mesh_disconnect_warning_sent)
      {
        // TODO: Send reconnect notification to backend
        // sendDisconnectWarning("mesh", false);
      }

      mesh_disconnect_warning_sent = false;
    }
  }
}
