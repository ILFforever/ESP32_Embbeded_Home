/**
 * ESP32-S3 Main Mesh Node
 *
 * Architecture:
 * - Receives sensor data from other ESP32 nodes via Painless Mesh
 * - Reads local PMS5003 (PM sensor) and DHT11 (temp/humidity)
 * - Sends each device's sensor data separately via UART to Main LCD
 * - Main LCD forwards to backend
 *
 * Hardware:
 * - ESP32-S3-DevKit-C-1-N16R8V
 * - PMS5003 PM Sensor (UART)
 * - DHT11 Temperature/Humidity Sensor
 * - UART connection to Main LCD
 */

#include <Arduino.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <PMS.h>
#include "mesh_handler.h"

// ============================================================================
// PIN CONFIGURATION
// ============================================================================

// DHT11 Sensor
#define DHT_PIN           4      // GPIO4 - DHT11 Data Pin
#define DHT_TYPE          DHT11

// PMS5003 Sensor (Hardware Serial 1)
#define PMS_RX_PIN        17     // GPIO16 - Connect to PMS5003 TX
#define PMS_TX_PIN        -1     // GPIO17 - Connect to PMS5003 RX

// UART to Main LCD (Hardware Serial 2)
#define LCD_RX_PIN        16     // GPIO18 - Connect to Main LCD TX
#define LCD_TX_PIN        18     // GPIO19 - Connect to Main LCD RX

// Status LED
#define LED_PIN           48     // GPIO48 - Built-in RGB LED (ESP32-S3)

// ============================================================================
// TIMING CONFIGURATION
// ============================================================================

#define DHT_INTERVAL      5000   // Read DHT11 every 5 seconds
#define PMS_INTERVAL      10000  // Read PMS5003 every 10 seconds
#define SEND_INTERVAL     30000  // Send aggregated data every 15 seconds
#define MESH_CLEANUP      1200000    // Clean old mesh data every 2 minutes

// ============================================================================
// DEVICE IDENTIFICATION
// ============================================================================

const char* DEVICE_ID = "hb_001";
const char* DEVICE_TYPE = "mesh_hub";

// ============================================================================
// GLOBAL OBJECTS
// ============================================================================

Scheduler userScheduler;
MeshHandler meshHandler(DEVICE_ID, DEVICE_TYPE);

DHT dht(DHT_PIN, DHT_TYPE);
PMS pms(Serial1);
PMS::DATA pmsData;

HardwareSerial LcdSerial(2); // UART2 for Main LCD communication

// ============================================================================
// DATA STRUCTURES
// ============================================================================

// Local sensor data from this node
struct LocalSensorData {
  float temperature = 0.0;
  float humidity = 0.0;
  uint16_t pm1_0 = 0;
  uint16_t pm2_5 = 0;
  uint16_t pm10 = 0;
  bool dhtValid = false;
  bool pmsValid = false;
  unsigned long lastDhtRead = 0;
  unsigned long lastPmsRead = 0;
} localSensors;

// ============================================================================
// FUNCTION PROTOTYPES
// ============================================================================

void setupPins();
void setupSensors();
void setupUART();
void readDHT11();
void readPMS5003();
void sendLocalSensorDataToLCD();
void forwardMeshDataToLCD(uint32_t nodeId, StaticJsonDocument<512>& doc);
void blinkLED(int times, int delayMs);
void printLocalSensorData();
void handleLcdUartMessages();

// Task declarations
Task taskReadDHT(DHT_INTERVAL, TASK_FOREVER, &readDHT11);
Task taskReadPMS(PMS_INTERVAL, TASK_FOREVER, &readPMS5003);
Task taskSendData(SEND_INTERVAL, TASK_FOREVER, &sendLocalSensorDataToLCD);

// Wrapper function for mesh cleanup task
void cleanupMeshData() {
  meshHandler.cleanupOldData();
}
Task taskCleanup(MESH_CLEANUP, TASK_FOREVER, &cleanupMeshData);

// ============================================================================
// SETUP
// ============================================================================

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n\n");
  Serial.println("========================================");
  Serial.println("  ESP32-S3 Main Mesh Node Starting");
  Serial.println("========================================");

  setupPins();
  setupSensors();
  setupUART();

  // Initialize mesh handler
  meshHandler.begin(&userScheduler);

  // Set up instant forwarding callback for mesh data
  meshHandler.setDataReceivedCallback(forwardMeshDataToLCD);

  // Add tasks to scheduler
  userScheduler.addTask(taskReadDHT);
  userScheduler.addTask(taskReadPMS);
  userScheduler.addTask(taskSendData);
  userScheduler.addTask(taskCleanup);

  taskReadDHT.enable();
  taskReadPMS.enable();
  taskSendData.enable();
  taskCleanup.enable();

  Serial.println("[SETUP] ✓ All systems initialized");
  Serial.println("========================================\n");

  blinkLED(3, 200);
}

// ============================================================================
// MAIN LOOP
// ============================================================================

void loop() {
  meshHandler.update();
  userScheduler.execute();
  handleLcdUartMessages();  // Check for incoming UART messages from Main LCD
}

// ============================================================================
// INITIALIZATION FUNCTIONS
// ============================================================================

void setupPins() {
  Serial.println("[SETUP] Configuring GPIO pins...");
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  Serial.println("[SETUP] ✓ GPIO pins configured");
}

void setupSensors() {
  Serial.println("[SETUP] Initializing sensors...");

  // Initialize DHT11
  dht.begin();
  Serial.println("[SETUP] ✓ DHT11 initialized on GPIO4");

  // Initialize PMS5003 on Serial1
  Serial1.begin(9600, SERIAL_8N1, PMS_RX_PIN, PMS_TX_PIN);
  pms.passiveMode();
  Serial.println("[SETUP] ✓ PMS5003 initialized on GPIO16/17");

  Serial.println("[SETUP] ✓ All sensors ready");
}

void setupUART() {
  Serial.println("[SETUP] Initializing UART to Main LCD...");
  // Increase TX buffer to handle large JSON messages with mesh sensor data
  LcdSerial.setTxBufferSize(2048);
  LcdSerial.begin(115200, SERIAL_8N1, LCD_RX_PIN, LCD_TX_PIN);
  delay(100);
  Serial.println("[SETUP] ✓ UART2 initialized on GPIO16/18, TxBuffer=2048");
  Serial.println("[SETUP] ✓ Main LCD communication ready");
}

// ============================================================================
// SENSOR READING FUNCTIONS
// ============================================================================

void readDHT11() {
  float h = dht.readHumidity();
  float t = dht.readTemperature();

  if (isnan(h) || isnan(t)) {
    Serial.println("[DHT11] ✗ Read failed");
    localSensors.dhtValid = false;
    return;
  }

  localSensors.temperature = t;
  localSensors.humidity = h;
  localSensors.dhtValid = true;
  localSensors.lastDhtRead = millis();

  Serial.printf("[DHT11] ✓ Temp: %.1f°C | Humidity: %.1f%%\n", t, h);
}

void readPMS5003() {
  pms.requestRead();

  if (pms.readUntil(pmsData, 2000)) {
    localSensors.pm1_0 = pmsData.PM_AE_UG_1_0;
    localSensors.pm2_5 = pmsData.PM_AE_UG_2_5;
    localSensors.pm10 = pmsData.PM_AE_UG_10_0;
    localSensors.pmsValid = true;
    localSensors.lastPmsRead = millis();

    Serial.printf("[PMS5003] ✓ PM1.0: %d | PM2.5: %d | PM10: %d µg/m³\n",
                  localSensors.pm1_0, localSensors.pm2_5, localSensors.pm10);

    // Air quality assessment
    if (localSensors.pm2_5 <= 12) {
      Serial.println("[PMS5003]   Air Quality: GOOD ✓");
    } else if (localSensors.pm2_5 <= 35) {
      Serial.println("[PMS5003]   Air Quality: MODERATE ⚠");
    } else if (localSensors.pm2_5 <= 55) {
      Serial.println("[PMS5003]   Air Quality: UNHEALTHY ✗");
    } else {
      Serial.println("[PMS5003]   Air Quality: VERY UNHEALTHY ✗✗");
    }
  } else {
    Serial.println("[PMS5003] ✗ Read timeout");
    localSensors.pmsValid = false;
  }
}

// ============================================================================
// DATA TRANSMISSION
// ============================================================================

// Send local sensor data (called periodically every 15 seconds)
void sendLocalSensorDataToLCD() {
  if (!(localSensors.dhtValid || localSensors.pmsValid)) {
    Serial.println("\n[UART] ⚠ No valid local sensor data to send");
    return;
  }

  Serial.println("\n[UART] ══════════════════════════════════════════════════════════════");
  Serial.println("[UART] 📤 SENDING LOCAL SENSOR DATA TO LCD");
  Serial.println("[UART] ══════════════════════════════════════════════════════════════");

  StaticJsonDocument<512> localDoc;

  localDoc["source"] = "main_mesh";
  localDoc["device_id"] = DEVICE_ID;
  localDoc["device_type"] = DEVICE_TYPE;
  localDoc["mesh_node_id"] = meshHandler.getNodeId();
  localDoc["timestamp"] = millis();

  JsonObject sensors = localDoc.createNestedObject("sensors");
  if (localSensors.dhtValid) {
    sensors["temperature"] = localSensors.temperature;
    sensors["humidity"] = localSensors.humidity;
  }

  if (localSensors.pmsValid) {
    sensors["pm1_0"] = localSensors.pm1_0;
    sensors["pm2_5"] = localSensors.pm2_5;
    sensors["pm10"] = localSensors.pm10;
  }

  String localJsonString;
  serializeJson(localDoc, localJsonString);

  Serial.printf("[UART]   JSON: %s\n", localJsonString.c_str());
  LcdSerial.println(localJsonString);

  Serial.printf("[UART] ✓ Sent local device: %s (%d bytes)\n",
                DEVICE_ID, localJsonString.length());
  if (localSensors.dhtValid) {
    Serial.printf("[UART]   └─ Temp=%.1f°C, Humidity=%.1f%%\n",
                  localSensors.temperature, localSensors.humidity);
  }
  if (localSensors.pmsValid) {
    Serial.printf("[UART]   └─ PM1.0=%d, PM2.5=%d, PM10=%d µg/m³\n",
                  localSensors.pm1_0, localSensors.pm2_5, localSensors.pm10);
  }

  Serial.println("[UART] ══════════════════════════════════════════════════════════════\n");

  blinkLED(1, 100);
}

// Forward mesh node data instantly when received
void forwardMeshDataToLCD(uint32_t nodeId, StaticJsonDocument<512>& doc) {
  Serial.println("\n[UART] ══════════════════════════════════════════════════════════════");
  Serial.println("[UART] 📤 FORWARDING MESH DATA INSTANTLY");
  Serial.println("[UART] ══════════════════════════════════════════════════════════════");

  const char* deviceId = doc["device_id"] | "unknown";
  const char* deviceType = doc["device_type"] | "sensor";

  Serial.printf("[UART] → Forwarding mesh device: %s (Node %u)\n", deviceId, nodeId);

  // Debug: Print received data structure
  Serial.println("[DEBUG] Received mesh data:");
  String receivedJson;
  serializeJsonPretty(doc, receivedJson);
  Serial.println(receivedJson);

  // Check if sensors field exists
  if (!doc.containsKey("sensors")) {
    Serial.println("[DEBUG] ⚠ WARNING: 'sensors' field not found in received data!");
    Serial.println("[DEBUG] Available keys:");
    for (JsonPair kv : doc.as<JsonObject>()) {
      Serial.printf("[DEBUG]   - %s\n", kv.key().c_str());
    }
  } else {
    Serial.println("[DEBUG] ✓ 'sensors' field found");
    // Print sensor values
    JsonObject sensors = doc["sensors"];
    Serial.println("[DEBUG] Sensor values:");
    for (JsonPair kv : sensors) {
      Serial.printf("[DEBUG]   - %s: ", kv.key().c_str());
      serializeJson(kv.value(), Serial);
      Serial.println();
    }
  }

  StaticJsonDocument<512> nodeDoc;

  nodeDoc["source"] = "mesh_node";
  nodeDoc["device_id"] = deviceId;
  nodeDoc["device_type"] = deviceType;
  nodeDoc["mesh_node_id"] = nodeId;
  nodeDoc["timestamp"] = millis();
  nodeDoc["data_age_ms"] = 0;  // Fresh data

  // Copy all relevant fields from the received mesh data
  nodeDoc["sensors"] = doc["sensors"];

  // Copy battery information if present
  if (doc.containsKey("battery_voltage")) {
    nodeDoc["battery_voltage"] = doc["battery_voltage"];
  }
  if (doc.containsKey("battery_percent")) {
    nodeDoc["battery_percent"] = doc["battery_percent"];
  }

  // Copy API token if present (required for backend authentication)
  if (doc.containsKey("api_token")) {
    nodeDoc["api_token"] = doc["api_token"];
  }

  // Copy alert/averaging flags if present
  if (doc.containsKey("alert")) {
    nodeDoc["alert"] = doc["alert"];
  }
  if (doc.containsKey("averaged")) {
    nodeDoc["averaged"] = doc["averaged"];
  }
  if (doc.containsKey("sample_count")) {
    nodeDoc["sample_count"] = doc["sample_count"];
  }

  // Copy boot count if present
  if (doc.containsKey("boot_count")) {
    nodeDoc["boot_count"] = doc["boot_count"];
  }

  String nodeJsonString;
  serializeJson(nodeDoc, nodeJsonString);

  Serial.println("[DEBUG] Forwarding JSON:");
  String forwardedJson;
  serializeJsonPretty(nodeDoc, forwardedJson);
  Serial.println(forwardedJson);

  Serial.printf("[UART]   Compact JSON: %s\n", nodeJsonString.c_str());
  LcdSerial.println(nodeJsonString);

  Serial.printf("[UART] ✓ Forwarded mesh device: %s (%d bytes)\n",
                deviceId, nodeJsonString.length());
  Serial.println("[UART] ══════════════════════════════════════════════════════════════\n");
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

void blinkLED(int times, int delayMs) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_PIN, HIGH);
    delay(delayMs);
    digitalWrite(LED_PIN, LOW);
    delay(delayMs);
  }
}

void printLocalSensorData() {
  Serial.println("\n[SENSORS] ═══════ Local Sensors ═══════");
  if (localSensors.dhtValid) {
    Serial.printf("[SENSORS] Temperature: %.1f°C\n", localSensors.temperature);
    Serial.printf("[SENSORS] Humidity: %.1f%%\n", localSensors.humidity);
  } else {
    Serial.println("[SENSORS] DHT11: No valid data");
  }

  if (localSensors.pmsValid) {
    Serial.printf("[SENSORS] PM1.0: %d µg/m³\n", localSensors.pm1_0);
    Serial.printf("[SENSORS] PM2.5: %d µg/m³\n", localSensors.pm2_5);
    Serial.printf("[SENSORS] PM10: %d µg/m³\n", localSensors.pm10);
  } else {
    Serial.println("[SENSORS] PMS5003: No valid data");
  }
  Serial.println("[SENSORS] ═══════════════════════════════\n");
}

// ============================================================================
// UART MESSAGE HANDLING (PING/PONG WITH MAIN LCD)
// ============================================================================

void handleLcdUartMessages() {
  // Check if data available from Main LCD
  if (LcdSerial.available()) {
    String receivedMsg = LcdSerial.readStringUntil('\n');
    receivedMsg.trim();

    if (receivedMsg.length() == 0) {
      return;
    }

    //Serial.printf("\n[UART] ← Received from Main LCD: %s\n", receivedMsg.c_str());

    // Parse JSON command
    StaticJsonDocument<256> cmdDoc;
    DeserializationError error = deserializeJson(cmdDoc, receivedMsg);

    if (error) {
      Serial.printf("[UART] ✗ JSON parse error: %s\n", error.c_str());

      // Send error response
      StaticJsonDocument<128> response;
      response["type"] = "error";
      response["message"] = "Invalid JSON";
      String respStr;
      serializeJson(response, respStr);
      LcdSerial.println(respStr);
      return;
    }

    const char* msgType = cmdDoc["type"] | "unknown";
    // Serial.printf("[UART]   Message type: %s\n", msgType);

    // Handle different message types
    if (strcmp(msgType, "ping") == 0) {
      // Respond with simplified pong (just ping counter and uptime)
      StaticJsonDocument<128> pongDoc;
      pongDoc["type"] = "pong";
      pongDoc["seq"] = cmdDoc["seq"] | 0;  // Echo back ping counter
      pongDoc["uptime_ms"] = millis();

      String pongStr;
      serializeJson(pongDoc, pongStr);
      LcdSerial.println(pongStr);

      blinkLED(2, 50);

    } else if (strcmp(msgType, "status") == 0) {
      // Respond with detailed status
      StaticJsonDocument<512> statusDoc;
      statusDoc["type"] = "status_response";
      statusDoc["device_id"] = DEVICE_ID;
      statusDoc["uptime_ms"] = millis();

      JsonObject sensors = statusDoc.createNestedObject("sensors");
      sensors["dht_valid"] = localSensors.dhtValid;
      sensors["pms_valid"] = localSensors.pmsValid;
      if (localSensors.dhtValid) {
        sensors["temperature"] = localSensors.temperature;
        sensors["humidity"] = localSensors.humidity;
      }
      if (localSensors.pmsValid) {
        sensors["pm2_5"] = localSensors.pm2_5;
      }

      JsonObject meshInfo = statusDoc.createNestedObject("mesh");
      meshInfo["node_id"] = meshHandler.getNodeId();
      meshInfo["connections"] = meshHandler.getConnectedNodeCount();
      meshInfo["stored_nodes"] = meshHandler.getStoredNodeCount();

      String statusStr;
      serializeJson(statusDoc, statusStr);
      LcdSerial.println(statusStr);

      Serial.println("[UART] → Sent STATUS response");

    } else if (strcmp(msgType, "reset_stats") == 0) {
      // Reset/clear mesh node data
      meshHandler.clearAllData();

      StaticJsonDocument<128> ackDoc;
      ackDoc["type"] = "ack";
      ackDoc["message"] = "Stats reset";

      String ackStr;
      serializeJson(ackDoc, ackStr);
      LcdSerial.println(ackStr);

      Serial.println("[UART] → Stats reset, ACK sent");

    } else {
      // Unknown command
      StaticJsonDocument<128> response;
      response["type"] = "error";
      response["message"] = "Unknown command type";

      String respStr;
      serializeJson(response, respStr);
      LcdSerial.println(respStr);

      Serial.printf("[UART] ✗ Unknown command: %s\n", msgType);
    }
  }
}
