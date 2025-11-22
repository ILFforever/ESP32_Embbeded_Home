/**
 * Battery-Optimized ESP32 Sensor Node
 * Target: 24-48 hours on 400mAh LiPo
 *
 * Sensors: VEML7700, MICS5524, AHT25
 * Network: PainlessMesh
 *
 * Power Optimization Techniques:
 * 1. Deep sleep between readings (60s intervals)
 * 2. Intermittent gas sensor heating
 * 3. Conditional mesh transmission
 * 4. Battery voltage monitoring
 */

#include <Arduino.h>
#include <painlessMesh.h>
#include <Adafruit_VEML7700.h>
#include <Adafruit_AHTX0.h>
#include <ArduinoJson.h>

// ==================== CONFIGURATION ====================
#define MESH_PREFIX     "ESP32_SmartHome_Mesh"
#define MESH_PASSWORD   "19283746"
#define MESH_PORT       5555

// GPIO Pins
#define MICS5524_HEATER_PIN  25  // Control heater power
#define MICS5524_ANALOG_PIN  34  // Read gas sensor output
#define BATTERY_PIN          35  // Battery voltage divider

// Power optimization settings
#define SLEEP_DURATION_S     60  // Sleep 60 seconds between readings
#define GAS_HEAT_TIME_MS     20000  // Heat gas sensor for 20s before reading
#define CHANGE_THRESHOLD     2.0    // Only transmit if value changed by 2%

// Thresholds for data transmission
#define TEMP_THRESHOLD       0.5  // 0.5°C
#define HUMIDITY_THRESHOLD   2.0  // 2%
#define LIGHT_THRESHOLD      50   // 50 lux

// ==================== GLOBAL OBJECTS ====================
Scheduler userScheduler;
painlessMesh mesh;
Adafruit_VEML7700 veml = Adafruit_VEML7700();
Adafruit_AHTX0 aht;

// ==================== SENSOR DATA ====================
struct SensorData {
  float temperature = 0;
  float humidity = 0;
  float lightLevel = 0;
  uint16_t gasLevel = 0;
  float batteryVoltage = 0;
  uint8_t batteryPercent = 0;
} currentData, lastSentData;

// ==================== RTC MEMORY (survives deep sleep) ====================
RTC_DATA_ATTR int bootCount = 0;
RTC_DATA_ATTR float lastTemp = 0;
RTC_DATA_ATTR float lastHumidity = 0;
RTC_DATA_ATTR float lastLight = 0;
RTC_DATA_ATTR uint16_t lastGas = 0;

// ==================== BATTERY MONITORING ====================
float readBatteryVoltage() {
  // Assuming voltage divider: 100k + 100k (divide by 2)
  // ESP32 ADC: 0-3.3V = 0-4095
  uint16_t adcValue = analogRead(BATTERY_PIN);
  float voltage = (adcValue / 4095.0) * 3.3 * 2.0; // Adjust multiplier based on divider
  return voltage;
}

uint8_t calculateBatteryPercent(float voltage) {
  // LiPo voltage range: 3.0V (empty) to 4.2V (full)
  if (voltage >= 4.2) return 100;
  if (voltage <= 3.0) return 0;
  return (uint8_t)((voltage - 3.0) / 1.2 * 100);
}

// ==================== GAS SENSOR CONTROL ====================
void heatGasSensor(uint32_t duration_ms) {
  Serial.printf("[GAS] Heating sensor for %d seconds...\n", duration_ms / 1000);
  digitalWrite(MICS5524_HEATER_PIN, HIGH);
  delay(duration_ms);
}

uint16_t readGasSensor() {
  // Read analog value from gas sensor
  uint16_t rawValue = analogRead(MICS5524_ANALOG_PIN);
  Serial.printf("[GAS] Raw ADC: %d\n", rawValue);
  return rawValue;
}

void stopGasHeating() {
  digitalWrite(MICS5524_HEATER_PIN, LOW);
  Serial.println("[GAS] Heater OFF - saving power");
}

// ==================== SENSOR READING ====================
bool readAllSensors() {
  Serial.println("\n[SENSORS] Reading all sensors...");
  bool success = true;

  // 1. Read AHT25 (Temperature & Humidity)
  sensors_event_t humidity_event, temp_event;
  if (aht.getEvent(&humidity_event, &temp_event)) {
    currentData.temperature = temp_event.temperature;
    currentData.humidity = humidity_event.relative_humidity;
    Serial.printf("[AHT25] ✓ Temp: %.2f°C | Humidity: %.2f%%\n",
                  currentData.temperature, currentData.humidity);
  } else {
    Serial.println("[AHT25] ✗ Failed to read");
    success = false;
  }

  // 2. Read VEML7700 (Ambient Light)
  currentData.lightLevel = veml.readLux();
  Serial.printf("[VEML7700] ✓ Light: %.2f lux\n", currentData.lightLevel);

  // 3. Read MICS5524 (Gas Sensor with heating)
  heatGasSensor(GAS_HEAT_TIME_MS);
  currentData.gasLevel = readGasSensor();
  stopGasHeating();  // Turn off heater immediately to save power

  // 4. Read Battery
  currentData.batteryVoltage = readBatteryVoltage();
  currentData.batteryPercent = calculateBatteryPercent(currentData.batteryVoltage);
  Serial.printf("[BATTERY] ✓ Voltage: %.2fV (%d%%)\n",
                currentData.batteryVoltage, currentData.batteryPercent);

  return success;
}

// ==================== DATA CHANGE DETECTION ====================
bool hasSignificantChange() {
  // Check if any sensor value changed significantly
  bool tempChanged = abs(currentData.temperature - lastTemp) > TEMP_THRESHOLD;
  bool humidityChanged = abs(currentData.humidity - lastHumidity) > HUMIDITY_THRESHOLD;
  bool lightChanged = abs(currentData.lightLevel - lastLight) > LIGHT_THRESHOLD;
  bool gasChanged = abs(currentData.gasLevel - lastGas) > 50;  // ADC units

  if (tempChanged || humidityChanged || lightChanged || gasChanged) {
    Serial.println("[CHANGE] Significant change detected - will transmit");
    return true;
  }

  Serial.println("[CHANGE] No significant change - skipping transmission");
  return false;
}

// ==================== MESH TRANSMISSION ====================
void sendDataToMesh() {
  StaticJsonDocument<256> doc;

  doc["device_id"] = "battery_sensor_001";
  doc["device_type"] = "multi_sensor";
  doc["boot_count"] = bootCount;

  JsonObject data = doc.createNestedObject("data");
  data["temperature"] = currentData.temperature;
  data["humidity"] = currentData.humidity;
  data["light"] = currentData.lightLevel;
  data["gas_level"] = currentData.gasLevel;
  data["battery_v"] = currentData.batteryVoltage;
  data["battery_pct"] = currentData.batteryPercent;

  String jsonStr;
  serializeJson(doc, jsonStr);

  mesh.sendBroadcast(jsonStr);
  Serial.printf("[MESH] ✓ Sent %d bytes\n", jsonStr.length());

  // Update last sent values
  lastTemp = currentData.temperature;
  lastHumidity = currentData.humidity;
  lastLight = currentData.lightLevel;
  lastGas = currentData.gasLevel;
}

// ==================== DEEP SLEEP ====================
void enterDeepSleep() {
  Serial.printf("\n[SLEEP] Entering deep sleep for %d seconds...\n", SLEEP_DURATION_S);
  Serial.printf("[SLEEP] Boot count: %d\n", bootCount);
  Serial.flush();

  // Configure wake-up timer
  esp_sleep_enable_timer_wakeup(SLEEP_DURATION_S * 1000000ULL);

  // Enter deep sleep
  esp_deep_sleep_start();
}

// ==================== MESH CALLBACKS ====================
void receivedCallback(uint32_t from, String &msg) {
  Serial.printf("[MESH] ← Received from %u: %s\n", from, msg.c_str());
}

void newConnectionCallback(uint32_t nodeId) {
  Serial.printf("[MESH] ✓ New connection: %u\n", nodeId);
}

void changedConnectionCallback() {
  Serial.println("[MESH] Topology changed");
}

// ==================== SETUP ====================
void setup() {
  Serial.begin(115200);
  delay(1000);

  bootCount++;
  Serial.println("\n========================================");
  Serial.printf("Battery-Optimized Sensor Node - Boot #%d\n", bootCount);
  Serial.println("========================================");

  // Configure GPIO
  pinMode(MICS5524_HEATER_PIN, OUTPUT);
  digitalWrite(MICS5524_HEATER_PIN, LOW);  // Heater off by default
  pinMode(BATTERY_PIN, INPUT);

  // Configure ADC for battery monitoring
  analogReadResolution(12);  // 0-4095
  analogSetAttenuation(ADC_11db);  // 0-3.3V range

  // Initialize sensors
  Serial.println("\n[SETUP] Initializing sensors...");

  if (!aht.begin()) {
    Serial.println("[AHT25] ✗ Failed to initialize!");
  } else {
    Serial.println("[AHT25] ✓ Initialized");
  }

  if (!veml.begin()) {
    Serial.println("[VEML7700] ✗ Failed to initialize!");
  } else {
    Serial.println("[VEML7700] ✓ Initialized");
    veml.setGain(VEML7700_GAIN_1);
    veml.setIntegrationTime(VEML7700_IT_100MS);
  }

  // Initialize mesh (brief connection)
  Serial.println("\n[SETUP] Initializing mesh...");
  mesh.setDebugMsgTypes(ERROR | STARTUP | CONNECTION);
  mesh.init(MESH_PREFIX, MESH_PASSWORD, &userScheduler, MESH_PORT);
  mesh.onReceive(&receivedCallback);
  mesh.onNewConnection(&newConnectionCallback);
  mesh.onChangedConnections(&changedConnectionCallback);

  Serial.printf("[MESH] ✓ Node ID: %u\n", mesh.getNodeId());

  // Wait for mesh to stabilize
  delay(2000);
  mesh.update();
}

// ==================== MAIN LOOP ====================
void loop() {
  Serial.println("\n========================================");
  Serial.println("WAKE CYCLE START");
  Serial.println("========================================");

  // 1. Read all sensors
  bool sensorsOk = readAllSensors();

  if (!sensorsOk) {
    Serial.println("[ERROR] Sensor reading failed - entering sleep");
    enterDeepSleep();
    return;
  }

  // 2. Check if data should be transmitted
  bool shouldTransmit = (bootCount == 1) || hasSignificantChange();

  if (shouldTransmit) {
    // 3. Brief mesh connection and transmission
    unsigned long startTime = millis();
    bool transmitted = false;

    while (millis() - startTime < 5000) {  // Try for max 5 seconds
      mesh.update();

      if (!transmitted && mesh.getNodeList().size() > 0) {
        sendDataToMesh();
        transmitted = true;
        delay(500);  // Allow message to send
        break;
      }

      delay(100);
    }

    if (!transmitted) {
      Serial.println("[MESH] ✗ No nodes found - data not sent");
    }
  } else {
    Serial.println("[SKIP] No transmission needed");
  }

  // 4. Low battery warning
  if (currentData.batteryPercent < 20) {
    Serial.println("\n⚠️  WARNING: Battery below 20%!");
  }

  if (currentData.batteryPercent < 5) {
    Serial.println("🔴 CRITICAL: Battery below 5% - extended sleep");
    esp_sleep_enable_timer_wakeup(300 * 1000000ULL);  // Sleep 5 minutes
    esp_deep_sleep_start();
  }

  // 5. Enter deep sleep
  enterDeepSleep();
}

// ==================== POWER CONSUMPTION ESTIMATES ====================
/*
 * POWER ANALYSIS (400mAh LiPo Battery):
 *
 * Active Phase (per cycle):
 * - ESP32 WiFi: ~120mA × 3s = 0.1mAh
 * - VEML7700: ~0.3mA × 3s = 0.0003mAh
 * - AHT25: ~0.55mA × 1s = 0.0002mAh
 * - MICS5524: ~30mA × 20s = 0.167mAh
 * - Total per cycle: ~0.27mAh
 *
 * Sleep Phase (per cycle):
 * - ESP32 deep sleep: ~0.05mA × 57s = 0.0008mAh
 * - Sensors off: 0mA
 * - Total per cycle: ~0.0008mAh
 *
 * Total per cycle (60s): 0.27 + 0.0008 = 0.2708mAh
 * Cycles per hour: 60
 * Power per hour: 60 × 0.2708 = 16.25mAh
 *
 * BATTERY LIFE: 400mAh ÷ 16.25mAh = 24.6 hours
 *
 * With conditional transmission (50% reduction):
 * BATTERY LIFE: ~36-48 hours
 *
 * FURTHER OPTIMIZATIONS:
 * 1. Increase sleep to 120s: ~48-72 hours
 * 2. Replace MICS5524 with BME680: ~3-5 days
 * 3. Use RTC + ultra-low-power mode: ~1 week
 */
