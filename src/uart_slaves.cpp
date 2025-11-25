#include "uart_slaves.h"
#include "hub_network.h"

// UART interfaces
HardwareSerial MeshSerial(1); // UART1
HardwareSerial AmpSerial(2);  // UART2

// Main Mesh ping-pong state
uint32_t mesh_ping_counter = 0;
unsigned long last_mesh_pong_time = 0;
int mesh_status = 0;

// Main Amp ping-pong state
uint32_t amp_ping_counter = 0;
unsigned long last_amp_pong_time = 0;
int amp_status = 0;

// Main_mesh local sensor data (DHT11 + PMS5003)
MainMeshLocalSensors meshLocalSensors = {
    .temperature = 0.0f,
    .humidity = 0.0f,
    .pm2_5 = 0,
    .timestamp = 0,
    .valid = false};

// Flag to trigger screen refresh when new sensor data arrives
volatile bool meshSensorDataUpdated = false;

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

  // Handle pong response (update timestamp and optionally log)
  if (doc.containsKey("type") && doc["type"] == "pong")
  {
    last_mesh_pong_time = millis();

// Optional: Log pong details for debugging
#ifdef DEBUG_PING_PONG
    uint32_t seq = doc["seq"] | 0;
    unsigned long uptime = doc["uptime_ms"] | 0;
    Serial.printf("[MESH] PONG: seq=%u, uptime=%lums\n", seq, uptime);
#endif

    return;
  }
  
  // Log other responses
  Serial.print("[MESH] RX: ");
  Serial.println(line);
  // Handle sensor data from mesh (both local hub sensors and mesh nodes)
  // Formats:
  // - Main_mesh local: {"device_id":"hb_001","device_type":"mesh_hub","sensors":{...}}
  // - Mesh node: {"source":"mesh_node","device_id":"ss_xxx","sensors":{...}}
  if (doc.containsKey("sensors") && !doc["sensors"].isNull())
  {
    JsonObject sensors = doc["sensors"];
    const char *deviceId = doc["device_id"] | "unknown";
    const char *deviceType = doc["device_type"] | "sensor";
    bool isLocalHub = (strcmp(deviceType, "mesh_hub") == 0);

    if (isLocalHub)
    {
      // Main_mesh local sensors (DHT11 + PMS5003)
      Serial.println("[MESH] ✓ Received Main_mesh local sensor data");

      // Extract temperature and humidity from DHT11
      if (sensors.containsKey("temperature") && sensors.containsKey("humidity"))
      {
        meshLocalSensors.temperature = sensors["temperature"];
        meshLocalSensors.humidity = sensors["humidity"];
        Serial.printf("[MESH]   DHT11: Temp=%.1f°C, Humidity=%.1f%%\n",
                      meshLocalSensors.temperature, meshLocalSensors.humidity);
      }

      // Extract PM2.5 from PMS5003
      if (sensors.containsKey("pm2_5"))
      {
        meshLocalSensors.pm2_5 = sensors["pm2_5"];
        Serial.printf("[MESH]   PMS5003: PM2.5=%d µg/m³\n", meshLocalSensors.pm2_5);
      }

      // Update timestamp and mark as valid
      meshLocalSensors.timestamp = millis();
      meshLocalSensors.valid = true;
      meshSensorDataUpdated = true;
    }
    else
    {
      // Mesh node sensors (remote room sensors)
      Serial.printf("[MESH] ✓ Received sensor data from mesh node: %s\n", deviceId);

      // Log sensor values - support multiple sensor types
      if (sensors.containsKey("temperature"))
      {
        float temp = sensors["temperature"];
        float humidity = sensors["humidity"] | 0.0;
        Serial.printf("[MESH]   %s: Temp=%.2f°C, Humidity=%.2f%%\n", deviceId, temp, humidity);
      }
      if (sensors.containsKey("light_lux"))
      {
        float lightLux = sensors["light_lux"];
        Serial.printf("[MESH]   %s: Light=%.2f lux\n", deviceId, lightLux);
      }
      if (sensors.containsKey("gas_level"))
      {
        int gasLevel = sensors["gas_level"];
        Serial.printf("[MESH]   %s: Gas=%d\n", deviceId, gasLevel);
      }
      if (sensors.containsKey("pm2_5"))
      {
        int pm25 = sensors["pm2_5"];
        Serial.printf("[MESH]   %s: PM2.5=%d µg/m³\n", deviceId, pm25);
      }
    }

    // Forward mesh node sensor data to backend
    Serial.printf("[MESH]   Forwarding %s data to backend...\n", deviceId);
    sendMeshSensorData(line.c_str());
    return;
  }
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

  // Handle pong response (update timestamp and optionally log)
  if (doc.containsKey("type") && doc["type"] == "pong")
  {
    last_amp_pong_time = millis();

// Optional: Log pong details for debugging
#ifdef DEBUG_PING_PONG
    uint32_t seq = doc["seq"] | 0;
    unsigned long uptime = doc["uptime_ms"] | 0;
    Serial.printf("[AMP] PONG: seq=%u, uptime=%lums\n", seq, uptime);
#endif

    return;
  }

  // Handle other amp responses (for future expansion)
  Serial.print("[AMP] RX: ");
  Serial.println(line);
}
