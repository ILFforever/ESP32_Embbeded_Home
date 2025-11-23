#include "uart_slaves.h"
#include "hub_network.h"

// UART interfaces
HardwareSerial MeshSerial(1);  // UART1
HardwareSerial AmpSerial(2);   // UART2

// Main Mesh ping-pong state
uint32_t mesh_ping_counter = 0;
unsigned long last_mesh_pong_time = 0;
int mesh_status = 0;

// Main Amp ping-pong state
uint32_t amp_ping_counter = 0;
unsigned long last_amp_pong_time = 0;
int amp_status = 0;

// ============================================================================
// Main Mesh UART Functions
// ============================================================================

// Send ping message to Main Mesh
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

// Send command to Main Mesh (for future expansion)
void sendMeshCommand(const char *cmd, const char *param)
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
}

// Handle UART response from Main Mesh
void handleMeshResponse(String line)
{
  // Skip empty lines
  if (line.length() == 0)
  {
    return;
  }

  // Parse JSON response
  StaticJsonDocument<4096> doc;
  DeserializationError error = deserializeJson(doc, line);
  if (error)
  {
    Serial.print("[MESH] RX: ");
    Serial.println(line);
    Serial.print("[MESH] JSON parse error: ");
    Serial.println(error.c_str());
    return;
  }

  // Handle pong response (silently update timestamp)
  if (doc.containsKey("type") && doc["type"] == "pong")
  {
    last_mesh_pong_time = millis();
    return;
  }

  // Handle sensor data from mesh
  if (doc.containsKey("source") && doc["source"] == "main_mesh")
  {
    Serial.println("[MESH] ✓ Received sensor data from Main Mesh");

    // Extract local sensors
    if (doc.containsKey("local_sensors"))
    {
      JsonObject local = doc["local_sensors"];
      if (local.containsKey("temperature"))
      {
        float temp = local["temperature"];
        float humidity = local["humidity"];
        Serial.printf("[MESH]   Local: Temp=%.1f°C, Humidity=%.1f%%\n", temp, humidity);
      }
      if (local.containsKey("pm2_5"))
      {
        int pm25 = local["pm2_5"];
        Serial.printf("[MESH]   Local: PM2.5=%d µg/m³\n", pm25);
      }
    }

    // Extract mesh sensor count
    if (doc.containsKey("mesh_node_count"))
    {
      int nodeCount = doc["mesh_node_count"];
      Serial.printf("[MESH]   Mesh nodes: %d\n", nodeCount);
    }

    // Forward Main_mesh local sensor data to backend
    if (doc.containsKey("local_sensors"))
    {
      JsonObject localSensors = doc["local_sensors"];
      if (localSensors.size() > 0)
      {
        Serial.printf("[MESH]   Forwarding Main_mesh local sensors to backend...\n");
        sendMainMeshLocalData(line.c_str());
      }
    }

    // Forward mesh sensor data to backend
    if (doc.containsKey("mesh_sensors"))
    {
      JsonArray meshSensors = doc["mesh_sensors"];
      if (meshSensors.size() > 0)
      {
        Serial.printf("[MESH]   Forwarding %d room sensor(s) to backend...\n", meshSensors.size());
        sendMeshSensorData(line.c_str());
      }
    }

    return;
  }

  // Log other responses
  Serial.print("[MESH] RX: ");
  Serial.println(line);
}

// ============================================================================
// Main Amp UART Functions
// ============================================================================

// Send ping message to Main Amp
void sendAmpPing()
{
  JsonDocument doc;
  doc["type"] = "ping";
  doc["seq"] = amp_ping_counter++;
  doc["timestamp"] = millis();

  String output;
  serializeJson(doc, output);

  AmpSerial.println(output);
}

// Send command to Main Amp
void sendAmpCommand(const char *cmd, const char *url)
{
  JsonDocument doc;
  doc["cmd"] = cmd;
  doc["url"] = url;

  String output;
  serializeJson(doc, output);
  AmpSerial.println(output);
}

// Handle UART response from Main Amp
void handleAmpResponse(String line)
{
  // Skip empty lines
  if (line.length() == 0)
  {
    return;
  }

  // Parse JSON response
  StaticJsonDocument<4096> doc;
  DeserializationError error = deserializeJson(doc, line);
  if (error)
  {
    Serial.print("[AMP] RX: ");
    Serial.println(line);
    Serial.print("[AMP] JSON parse error: ");
    Serial.println(error.c_str());
    return;
  }

  // Handle pong response (silently update timestamp)
  if (doc.containsKey("type") && doc["type"] == "pong")
  {
    last_amp_pong_time = millis();
    return;
  }

  // Handle other amp responses (for future expansion)
  Serial.print("[AMP] RX: ");
  Serial.println(line);
}
