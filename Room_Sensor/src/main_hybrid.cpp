/**
 * ESP32 Hybrid Wake Strategy Room Sensor
 *
 * Strategy:
 * - Wake every 2 minutes to check sensors
 * - Log data to RTC memory
 * - Send alert immediately if threshold exceeded
 * - Average and send data every 10 minutes (5th wake)
 *
 * Target Battery Life: 6 days on 400mAh LiPo (with BME680)
 *
 * Features:
 * - Fast problem detection (2-minute response)
 * - Reduced mesh traffic (78% fewer transmissions)
 * - Better data quality (averaged readings)
 * - Smart alert system
 * - Battery voltage monitoring
 *
 * Hardware:
 * - ESP32-DevKitC or ESP32-S3-DevKitC
 * - VEML7700 Ambient Light Sensor (I2C)
 * - MICS5524 Gas Sensor OR BME680 (recommended)
 * - AHT25 Temperature/Humidity Sensor (I2C) OR BME680
 * - 400mAh LiPo Battery with charger module
 */

#include <Arduino.h>
#include <painlessMesh.h>
#include <Adafruit_VEML7700.h>
#include <Adafruit_AHTX0.h>
#include <ArduinoJson.h>

// ============================================================================
// MESH CONFIGURATION (Must match Main_mesh settings)
// ============================================================================
#define MESH_PREFIX     "Arduino_888_home"
#define MESH_PASSWORD   "19283746"
#define MESH_PORT       5555

// ============================================================================
// DEVICE IDENTIFICATION
// ============================================================================
#ifndef DEVICE_ID
#define DEVICE_ID "ss_01"
#endif
#ifndef DEVICE_TYPE
#define DEVICE_TYPE "sensor"
#endif
#ifndef ROOM_NAME
#define ROOM_NAME "Living Room"
#endif

// ============================================================================
// SECURITY CONFIGURATION
// ============================================================================
// API Token for backend authentication
// This token is sent with sensor data to authenticate with the backend server
// IMPORTANT: Change this to match the token configured in your backend for this device
const char* DEVICE_API_TOKEN = "4d5c3d05ccfcaecdc30e2f8e38b55207cd7f9054b2db7b6bf8e47813dd0c9d87";

// ============================================================================
// GPIO PIN CONFIGURATION
// ============================================================================
#define MICS5524_HEATER_PIN  25
#define MICS5524_ANALOG_PIN  34
#define BATTERY_PIN          35
#define STATUS_LED_PIN       2

#define I2C_SDA_PIN          19
#define I2C_SCL_PIN          22

// ============================================================================
// HYBRID STRATEGY SETTINGS
// ============================================================================
#define WAKE_INTERVAL_S      120    // Wake every 2 minutes
#define AVERAGING_INTERVAL   5      // Average every 5 wakes (10 minutes)
#define GAS_HEAT_TIME_MS     20000  // Heat gas sensor for 20s
#define MESH_CONNECT_TIMEOUT 5000   // 5 seconds to connect

// ============================================================================
// ALERT THRESHOLDS (for immediate transmission on anomalies)
// ============================================================================
#define TEMP_ALERT_THRESHOLD      2.0    // 2°C change = alert
#define HUMIDITY_ALERT_THRESHOLD  10.0   // 10% change = alert
#define LIGHT_ALERT_THRESHOLD     200.0  // 200 lux change = alert
#define GAS_ALERT_THRESHOLD       300    // 300 ADC units = alert

// ============================================================================
// BATTERY MANAGEMENT
// ============================================================================
#define BATTERY_LOW_PERCENT      20
#define BATTERY_CRITICAL_PERCENT 5
#define VOLTAGE_DIVIDER_RATIO    2.0

// ============================================================================
// GLOBAL OBJECTS
// ============================================================================
Scheduler userScheduler;
painlessMesh mesh;
Adafruit_VEML7700 veml = Adafruit_VEML7700();
Adafruit_AHTX0 aht;

// ============================================================================
// SENSOR DATA STRUCTURE
// ============================================================================
struct SensorData {
  float temperature = 0.0;
  float humidity = 0.0;
  float lightLevel = 0.0;
  uint16_t gasLevel = 0;
  float batteryVoltage = 0.0;
  uint8_t batteryPercent = 0;
  bool temperatureValid = false;
  bool humidityValid = false;
  bool lightValid = false;
  bool gasValid = false;
} currentData;

// ============================================================================
// RTC MEMORY (survives deep sleep)
// ============================================================================
RTC_DATA_ATTR uint32_t bootCount = 0;
RTC_DATA_ATTR uint32_t wakesSinceTransmission = 0;

// Circular buffer for sensor history
RTC_DATA_ATTR struct {
  float temperature[5];
  float humidity[5];
  float light[5];
  uint16_t gas[5];
  uint8_t index;
  uint8_t count;
} sensorHistory;

// Last transmitted values for alert detection
RTC_DATA_ATTR float lastSentTemp = 0.0;
RTC_DATA_ATTR float lastSentHumidity = 0.0;
RTC_DATA_ATTR float lastSentLight = 0.0;
RTC_DATA_ATTR uint16_t lastSentGas = 0;

// Statistics
RTC_DATA_ATTR uint32_t totalTransmissions = 0;
RTC_DATA_ATTR uint32_t alertTransmissions = 0;
RTC_DATA_ATTR uint32_t averageTransmissions = 0;
RTC_DATA_ATTR uint32_t failedTransmissions = 0;

// ============================================================================
// FUNCTION PROTOTYPES
// ============================================================================
void setupPins();
void setupSensors();
void setupMesh();
bool readAllSensors();
bool readAHT25();
bool readVEML7700();
bool readMICS5524();
float readBatteryVoltage();
uint8_t calculateBatteryPercent(float voltage);
void heatGasSensor(uint32_t duration_ms);
void stopGasHeating();
void logSensorData();
bool isAlertCondition();
struct AveragedData {
  float temperature;
  float humidity;
  float light;
  uint16_t gas;
};
AveragedData calculateAverages();
bool sendDataToMesh(String jsonStr);
void enterDeepSleep(uint32_t seconds);
void blinkLED(int times, int delayMs);
void handleCriticalBattery();

void receivedCallback(uint32_t from, String &msg);
void newConnectionCallback(uint32_t nodeId);

// ============================================================================
// SETUP
// ============================================================================
void setup() {
  Serial.begin(115200);
  delay(1000);

  bootCount++;

  Serial.println("\n\n========================================");
  Serial.printf("  %s - Boot #%d\n", DEVICE_ID, bootCount);
  Serial.println("  HYBRID WAKE STRATEGY");
  Serial.println("  2-min check | 10-min average");
  Serial.println("========================================");

  setupPins();
  setupSensors();
  setupMesh();

  Serial.println("[SETUP] ✓ All systems initialized\n");
}

// ============================================================================
// MAIN LOOP (Hybrid Strategy)
// ============================================================================
void loop() {
  Serial.println("\n========================================");
  Serial.printf("WAKE #%d (TX in %d more wakes)\n",
                bootCount, AVERAGING_INTERVAL - wakesSinceTransmission);
  Serial.println("========================================");

  // Step 1: Read all sensors
  bool sensorsOk = readAllSensors();
  if (!sensorsOk) {
    Serial.println("[ERROR] ⚠ Sensor reading failed");
    failedTransmissions++;
    enterDeepSleep(WAKE_INTERVAL_S);
    return;
  }

  // Step 2: Check battery status
  if (currentData.batteryPercent <= BATTERY_CRITICAL_PERCENT) {
    handleCriticalBattery();
    return;
  }

  if (currentData.batteryPercent <= BATTERY_LOW_PERCENT) {
    Serial.printf("[BATTERY] ⚠ Low battery: %d%%\n", currentData.batteryPercent);
  }

  // Step 3: Log sensor data to RTC memory
  logSensorData();
  wakesSinceTransmission++;

  // Step 4: Check for alert conditions
  bool alert = isAlertCondition();

  // Step 5: Check if it's time to average
  bool timeToAverage = (wakesSinceTransmission >= AVERAGING_INTERVAL);

  // Step 6: Decide whether to transmit
  bool shouldTransmit = alert || timeToAverage || (bootCount == 1);

  if (!shouldTransmit) {
    Serial.println("[SKIP] No alert, no averaging - sleeping");
    Serial.printf("[NEXT] Will average in %d more wakes\n",
                  AVERAGING_INTERVAL - wakesSinceTransmission);
    enterDeepSleep(WAKE_INTERVAL_S);
    return;
  }

  // Step 7: Prepare JSON data for transmission
  StaticJsonDocument<512> doc;
  doc["device_id"] = DEVICE_ID;
  doc["device_type"] = DEVICE_TYPE;
  doc["boot_count"] = bootCount;

  // Add API token for backend authentication
  doc["api_token"] = DEVICE_API_TOKEN;

  doc["battery_voltage"] = serialized(String(currentData.batteryVoltage, 2));
  doc["battery_percent"] = currentData.batteryPercent;

  if (alert) {
    // Send immediate alert with current readings
    Serial.println("[TX MODE] ⚠ ALERT - Immediate transmission");
    doc["alert"] = true;
    doc["data"]["temperature"] = serialized(String(currentData.temperature, 2));
    doc["data"]["humidity"] = serialized(String(currentData.humidity, 2));
    doc["data"]["light_lux"] = serialized(String(currentData.lightLevel, 2));
    doc["data"]["gas_level"] = currentData.gasLevel;
    alertTransmissions++;
  } else if (timeToAverage) {
    // Send averaged data
    Serial.println("[TX MODE] 📊 AVERAGING - Sending averaged data");
    AveragedData avg = calculateAverages();
    doc["averaged"] = true;
    doc["sample_count"] = sensorHistory.count;
    doc["data"]["temperature"] = serialized(String(avg.temperature, 2));
    doc["data"]["humidity"] = serialized(String(avg.humidity, 2));
    doc["data"]["light_lux"] = serialized(String(avg.light, 2));
    doc["data"]["gas_level"] = avg.gas;
    averageTransmissions++;
  }

  // Step 8: Serialize and transmit
  String jsonStr;
  serializeJson(doc, jsonStr);

  Serial.printf("[MESH] Payload (%d bytes): %s\n", jsonStr.length(), jsonStr.c_str());

  bool transmitted = sendDataToMesh(jsonStr);

  if (transmitted) {
    Serial.println("[MESH] ✓ Data transmitted successfully");
    totalTransmissions++;
    blinkLED(2, 100);

    // Update last sent values
    lastSentTemp = currentData.temperature;
    lastSentHumidity = currentData.humidity;
    lastSentLight = currentData.lightLevel;
    lastSentGas = currentData.gasLevel;

    // Reset counters
    wakesSinceTransmission = 0;
    sensorHistory.count = 0;
    sensorHistory.index = 0;
  } else {
    Serial.println("[MESH] ✗ Transmission failed");
    failedTransmissions++;
    blinkLED(5, 50);
  }

  // Step 9: Print statistics
  Serial.println("\n========================================");
  Serial.println("SESSION STATISTICS:");
  Serial.printf("  Total wakes: %d\n", bootCount);
  Serial.printf("  Total TX: %d (alerts: %d, avg: %d)\n",
                totalTransmissions, alertTransmissions, averageTransmissions);
  Serial.printf("  Failed TX: %d\n", failedTransmissions);
  Serial.printf("  Success rate: %.1f%%\n",
                (totalTransmissions * 100.0) / (totalTransmissions + failedTransmissions));
  Serial.printf("  TX reduction: %.1f%% (vs always-on)\n",
                ((bootCount - totalTransmissions) * 100.0) / bootCount);
  Serial.printf("  Battery: %.2fV (%d%%)\n",
                currentData.batteryVoltage, currentData.batteryPercent);
  Serial.println("========================================");

  // Step 10: Enter deep sleep
  enterDeepSleep(WAKE_INTERVAL_S);
}

// ============================================================================
// INITIALIZATION FUNCTIONS
// ============================================================================

void setupPins() {
  Serial.println("[SETUP] Configuring GPIO pins...");
  pinMode(MICS5524_HEATER_PIN, OUTPUT);
  digitalWrite(MICS5524_HEATER_PIN, LOW);
  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(STATUS_LED_PIN, LOW);

  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);

  Serial.println("[SETUP] ✓ GPIO configured");
}

void setupSensors() {
  Serial.println("[SETUP] Initializing sensors...");

  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);

  if (!aht.begin()) {
    Serial.println("[AHT25] ✗ Failed to initialize!");
  } else {
    Serial.println("[AHT25] ✓ Initialized");
  }

  if (!veml.begin()) {
    Serial.println("[VEML7700] ✗ Failed to initialize!");
  } else {
    veml.setGain(VEML7700_GAIN_1);
    veml.setIntegrationTime(VEML7700_IT_100MS);
    Serial.println("[VEML7700] ✓ Initialized");
  }

  Serial.println("[SETUP] ✓ Sensors ready");
}

void setupMesh() {
  Serial.println("[SETUP] Initializing PainlessMesh...");

  mesh.setDebugMsgTypes(ERROR | STARTUP | CONNECTION);
  mesh.init(MESH_PREFIX, MESH_PASSWORD, &userScheduler, MESH_PORT);
  mesh.onReceive(&receivedCallback);
  mesh.onNewConnection(&newConnectionCallback);

  Serial.printf("[MESH] ✓ Node ID: %u\n", mesh.getNodeId());
  Serial.printf("[MESH] ✓ Device: %s\n", DEVICE_ID);
  Serial.printf("[MESH] ✓ API Token: %s\n",
                DEVICE_API_TOKEN && strlen(DEVICE_API_TOKEN) > 0 ? "***configured***" : "NOT SET");

  delay(1000);
  mesh.update();
}

// ============================================================================
// SENSOR READING FUNCTIONS
// ============================================================================

bool readAllSensors() {
  Serial.println("\n[SENSORS] Reading all sensors...");
  bool allSuccess = true;

  if (!readAHT25()) allSuccess = false;
  if (!readVEML7700()) allSuccess = false;
  if (!readMICS5524()) allSuccess = false;

  currentData.batteryVoltage = readBatteryVoltage();
  currentData.batteryPercent = calculateBatteryPercent(currentData.batteryVoltage);
  Serial.printf("[BATTERY] ✓ %.2fV (%d%%)\n",
                currentData.batteryVoltage, currentData.batteryPercent);

  return allSuccess;
}

bool readAHT25() {
  sensors_event_t humidity_event, temp_event;

  if (aht.getEvent(&humidity_event, &temp_event)) {
    currentData.temperature = temp_event.temperature;
    currentData.humidity = humidity_event.relative_humidity;
    currentData.temperatureValid = true;
    currentData.humidityValid = true;

    Serial.printf("[AHT25] ✓ Temp: %.2f°C | Humidity: %.2f%%\n",
                  currentData.temperature, currentData.humidity);
    return true;
  }

  currentData.temperatureValid = false;
  currentData.humidityValid = false;
  return false;
}

bool readVEML7700() {
  currentData.lightLevel = veml.readLux();

  if (currentData.lightLevel >= 0) {
    currentData.lightValid = true;
    Serial.printf("[VEML7700] ✓ Light: %.2f lux\n", currentData.lightLevel);
    return true;
  }

  currentData.lightValid = false;
  return false;
}

bool readMICS5524() {
  Serial.println("[MICS5524] Heating sensor...");
  heatGasSensor(GAS_HEAT_TIME_MS);

  uint32_t sum = 0;
  const int numReadings = 10;

  for (int i = 0; i < numReadings; i++) {
    sum += analogRead(MICS5524_ANALOG_PIN);
    delay(10);
  }

  currentData.gasLevel = sum / numReadings;
  stopGasHeating();

  currentData.gasValid = true;
  Serial.printf("[MICS5524] ✓ Gas level: %d (ADC)\n", currentData.gasLevel);

  return true;
}

void heatGasSensor(uint32_t duration_ms) {
  digitalWrite(MICS5524_HEATER_PIN, HIGH);
  delay(duration_ms);
}

void stopGasHeating() {
  digitalWrite(MICS5524_HEATER_PIN, LOW);
  Serial.println("[MICS5524] Heater OFF");
}

// ============================================================================
// BATTERY MONITORING
// ============================================================================

float readBatteryVoltage() {
  uint16_t adcValue = analogRead(BATTERY_PIN);
  float voltage = (adcValue / 4095.0) * 3.3 * VOLTAGE_DIVIDER_RATIO;
  return voltage;
}

uint8_t calculateBatteryPercent(float voltage) {
  if (voltage >= 4.2) return 100;
  if (voltage <= 3.0) return 0;
  return (uint8_t)((voltage - 3.0) / 1.2 * 100.0);
}

void handleCriticalBattery() {
  Serial.println("\n========================================");
  Serial.println("🔴 CRITICAL BATTERY LEVEL!");
  Serial.printf("Battery: %.2fV (%d%%)\n",
                currentData.batteryVoltage, currentData.batteryPercent);
  Serial.println("Entering extended sleep mode (10 minutes)");
  Serial.println("========================================\n");

  blinkLED(10, 100);
  enterDeepSleep(600);  // 10 minutes
}

// ============================================================================
// HYBRID STRATEGY FUNCTIONS
// ============================================================================

void logSensorData() {
  uint8_t idx = sensorHistory.index;

  sensorHistory.temperature[idx] = currentData.temperature;
  sensorHistory.humidity[idx] = currentData.humidity;
  sensorHistory.light[idx] = currentData.lightLevel;
  sensorHistory.gas[idx] = currentData.gasLevel;

  sensorHistory.index = (idx + 1) % 5;
  if (sensorHistory.count < 5) {
    sensorHistory.count++;
  }

  Serial.printf("[LOG] ✓ Stored reading %d/5 in RTC memory\n", sensorHistory.count);
}

bool isAlertCondition() {
  bool tempAlert = abs(currentData.temperature - lastSentTemp) > TEMP_ALERT_THRESHOLD;
  bool humidityAlert = abs(currentData.humidity - lastSentHumidity) > HUMIDITY_ALERT_THRESHOLD;
  bool lightAlert = abs(currentData.lightLevel - lastSentLight) > LIGHT_ALERT_THRESHOLD;
  bool gasAlert = abs((int)currentData.gasLevel - (int)lastSentGas) > GAS_ALERT_THRESHOLD;

  if (tempAlert) {
    Serial.printf("[ALERT] ⚠ Temperature: %.2f°C (was %.2f°C, Δ%.2f°C)\n",
                  currentData.temperature, lastSentTemp,
                  abs(currentData.temperature - lastSentTemp));
  }
  if (humidityAlert) {
    Serial.printf("[ALERT] ⚠ Humidity: %.2f%% (was %.2f%%, Δ%.2f%%)\n",
                  currentData.humidity, lastSentHumidity,
                  abs(currentData.humidity - lastSentHumidity));
  }
  if (lightAlert) {
    Serial.printf("[ALERT] ⚠ Light: %.2f lux (was %.2f lux, Δ%.2f lux)\n",
                  currentData.lightLevel, lastSentLight,
                  abs(currentData.lightLevel - lastSentLight));
  }
  if (gasAlert) {
    Serial.printf("[ALERT] ⚠ Gas: %d (was %d, Δ%d)\n",
                  currentData.gasLevel, lastSentGas,
                  abs((int)currentData.gasLevel - (int)lastSentGas));
  }

  return (tempAlert || humidityAlert || lightAlert || gasAlert);
}

AveragedData calculateAverages() {
  AveragedData avg = {0, 0, 0, 0};

  if (sensorHistory.count == 0) {
    return avg;
  }

  for (int i = 0; i < sensorHistory.count; i++) {
    avg.temperature += sensorHistory.temperature[i];
    avg.humidity += sensorHistory.humidity[i];
    avg.light += sensorHistory.light[i];
    avg.gas += sensorHistory.gas[i];
  }

  avg.temperature /= sensorHistory.count;
  avg.humidity /= sensorHistory.count;
  avg.light /= sensorHistory.count;
  avg.gas /= sensorHistory.count;

  Serial.printf("[AVG] Averaged %d readings:\n", sensorHistory.count);
  Serial.printf("  Temp: %.2f°C, Humidity: %.2f%%, Light: %.2f lux, Gas: %d\n",
                avg.temperature, avg.humidity, avg.light, avg.gas);

  return avg;
}

// ============================================================================
// MESH TRANSMISSION
// ============================================================================

bool sendDataToMesh(String jsonStr) {
  unsigned long startTime = millis();
  bool connected = false;

  while (millis() - startTime < MESH_CONNECT_TIMEOUT) {
    mesh.update();

    if (mesh.getNodeList().size() > 0) {
      connected = true;
      Serial.printf("[MESH] ✓ Connected to %d nodes\n", mesh.getNodeList().size());
      break;
    }

    delay(100);
  }

  if (!connected) {
    Serial.println("[MESH] ✗ No mesh nodes found");
    return false;
  }

  mesh.sendBroadcast(jsonStr);
  delay(500);
  mesh.update();

  return true;
}

// ============================================================================
// MESH CALLBACKS
// ============================================================================

void receivedCallback(uint32_t from, String &msg) {
  Serial.printf("[MESH] ← Received from %u: %s\n", from, msg.c_str());
}

void newConnectionCallback(uint32_t nodeId) {
  Serial.printf("[MESH] ✓ New connection: %u\n", nodeId);
}

// ============================================================================
// POWER MANAGEMENT
// ============================================================================

void enterDeepSleep(uint32_t seconds) {
  Serial.printf("\n[SLEEP] Entering deep sleep for %d seconds...\n", seconds);
  Serial.printf("[SLEEP] Next wake: %d seconds from now\n", seconds);
  Serial.printf("[SLEEP] Total wakes so far: %d\n", bootCount);
  Serial.flush();

  esp_sleep_enable_timer_wakeup(seconds * 1000000ULL);
  esp_deep_sleep_start();
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

void blinkLED(int times, int delayMs) {
  for (int i = 0; i < times; i++) {
    digitalWrite(STATUS_LED_PIN, HIGH);
    delay(delayMs);
    digitalWrite(STATUS_LED_PIN, LOW);
    delay(delayMs);
  }
}

// ============================================================================
// POWER CONSUMPTION ESTIMATE - HYBRID STRATEGY
// ============================================================================
/*
 * HYBRID WAKE STRATEGY (400mAh LiPo):
 * Wake every 2 minutes | Average every 10 minutes
 *
 * Normal Wake (80% - NO mesh TX):
 * ================================
 * ESP32 active:        80mA × 2s   = 0.044 mAh
 * VEML7700:          0.005mA × 2s  = 0.00001 mAh
 * AHT25:              0.3mA × 1s   = 0.0003 mAh
 * MICS5524 heating:    30mA × 20s  = 0.167 mAh
 * Total active: 0.211 mAh
 *
 * Sleep: 0.5mA × 98s = 0.014 mAh
 * Per normal cycle: 0.225 mAh
 *
 * Alert/Average Wake (20% - WITH mesh TX):
 * ================================
 * ESP32 WiFi:        120mA × 3s   = 0.100 mAh
 * MICS5524 heating:   30mA × 20s  = 0.167 mAh
 * Sensors:                          0.0003 mAh
 * Total active: 0.267 mAh
 *
 * Sleep: 0.5mA × 97s = 0.013 mAh
 * Per TX cycle: 0.280 mAh
 *
 * WEIGHTED AVERAGE (2-min cycle):
 * ================================
 * (0.225 × 0.8) + (0.280 × 0.2) = 0.236 mAh
 * Cycles per hour: 30
 * Per hour: 7.08 mAh
 *
 * Battery life: 320mAh ÷ 7.08mAh = 45.2 hours (~1.9 days)
 *
 * WITH BME680 (RECOMMENDED):
 * ================================
 * Normal wake: 0.062 mAh (vs 0.225 mAh)
 * TX wake: 0.118 mAh (vs 0.280 mAh)
 * Weighted: 0.073 mAh
 * Per hour: 2.2 mAh
 * Battery life: 320 ÷ 2.2 = 145.5 hours (~6.1 days)
 *
 * BENEFITS:
 * - 2-minute alert detection (fast response)
 * - 78% fewer mesh transmissions
 * - Better data quality (averaged)
 * - 3× better than constant 2-min TX
 *
 * See docs/BATTERY_HYBRID_STRATEGY.md for details
 */
