/**
 * ESP32-S3 Main Mesh Node
 *
 * Sensors:
 * - PMS5003 PM Sensor (Particulate Matter)
 * - DHT11 Temperature & Humidity Sensor
 *
 * Features:
 * - Read PM1.0, PM2.5, PM10 values
 * - Read temperature and humidity
 * - Send data to main hub via mesh network
 * - WiFi connectivity for cloud reporting
 */

#include <Arduino.h>
#include <DHT.h>
#include <PMS.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ============================================================================
// PIN CONFIGURATION
// ============================================================================

// DHT11 Sensor
#define DHT_PIN           4      // GPIO4 - DHT11 Data Pin
#define DHT_TYPE          DHT11  // DHT11 sensor type

// PMS5003 Sensor (UART)
#define PMS_RX_PIN        16     // GPIO16 - Connect to PMS5003 TX
#define PMS_TX_PIN        17     // GPIO17 - Connect to PMS5003 RX (optional, for sleep mode)
#define PMS_SET_PIN       -1     // Not used (set to -1 to disable)

// Status LED
#define LED_PIN           48     // GPIO48 - Built-in RGB LED on ESP32-S3

// ============================================================================
// CONFIGURATION
// ============================================================================

// WiFi Credentials
const char* WIFI_SSID     = "YourWiFiSSID";
const char* WIFI_PASSWORD = "YourWiFiPassword";

// Backend API
const char* API_URL       = "https://embedded-smarthome.fly.dev/api/v1/devices/sensor";
const char* DEVICE_ID     = "main_mesh_001";
const char* API_TOKEN     = "your_device_api_token_here";

// Reading Intervals
const unsigned long DHT_INTERVAL   = 5000;   // Read DHT every 5 seconds
const unsigned long PMS_INTERVAL   = 30000;  // Read PMS every 30 seconds
const unsigned long SEND_INTERVAL  = 60000;  // Send to server every 60 seconds

// ============================================================================
// GLOBAL OBJECTS
// ============================================================================

DHT dht(DHT_PIN, DHT_TYPE);
HardwareSerial pmsSerial(1);  // Use UART1 for PMS5003
PMS pms(pmsSerial);
PMS::DATA pmsData;

// Sensor Data Storage
struct SensorData {
  float temperature = 0.0;
  float humidity = 0.0;
  uint16_t pm1_0 = 0;
  uint16_t pm2_5 = 0;
  uint16_t pm10 = 0;
  bool dhtValid = false;
  bool pmsValid = false;
  unsigned long lastDhtRead = 0;
  unsigned long lastPmsRead = 0;
  unsigned long lastSend = 0;
} sensorData;

// ============================================================================
// FUNCTION PROTOTYPES
// ============================================================================

void setupWiFi();
void setupSensors();
void readDHT11();
void readPMS5003();
void sendDataToServer();
void printSensorData();
void blinkLED(int times, int delayMs);

// ============================================================================
// SETUP
// ============================================================================

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n\n========================================");
  Serial.println("ESP32-S3 Main Mesh Node");
  Serial.println("PMS5003 + DHT11 Sensors");
  Serial.println("========================================\n");

  // Setup LED
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  blinkLED(3, 200);

  // Setup WiFi
  setupWiFi();

  // Setup Sensors
  setupSensors();

  Serial.println("\n[Setup] Complete! Starting sensor readings...\n");
}

// ============================================================================
// MAIN LOOP
// ============================================================================

void loop() {
  unsigned long currentMillis = millis();

  // Read DHT11 sensor
  if (currentMillis - sensorData.lastDhtRead >= DHT_INTERVAL) {
    readDHT11();
    sensorData.lastDhtRead = currentMillis;
  }

  // Read PMS5003 sensor
  if (currentMillis - sensorData.lastPmsRead >= PMS_INTERVAL) {
    readPMS5003();
    sensorData.lastPmsRead = currentMillis;
    printSensorData();
  }

  // Send data to server
  if (currentMillis - sensorData.lastSend >= SEND_INTERVAL) {
    if (WiFi.status() == WL_CONNECTED) {
      sendDataToServer();
    } else {
      Serial.println("[WiFi] Not connected, attempting reconnect...");
      setupWiFi();
    }
    sensorData.lastSend = currentMillis;
  }

  delay(100);
}

// ============================================================================
// WIFI SETUP
// ============================================================================

void setupWiFi() {
  Serial.print("[WiFi] Connecting to ");
  Serial.print(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println(" Connected!");
    Serial.print("[WiFi] IP Address: ");
    Serial.println(WiFi.localIP());
    Serial.print("[WiFi] Signal Strength: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
    blinkLED(2, 100);
  } else {
    Serial.println(" Failed!");
    Serial.println("[WiFi] Will retry in next cycle");
  }
}

// ============================================================================
// SENSOR SETUP
// ============================================================================

void setupSensors() {
  Serial.println("\n[Sensors] Initializing...");

  // Initialize DHT11
  Serial.println("[DHT11] Starting sensor...");
  dht.begin();
  delay(2000);  // DHT11 needs 2s to stabilize
  Serial.println("[DHT11] ✓ Ready");

  // Initialize PMS5003
  Serial.println("[PMS5003] Starting sensor...");
  pmsSerial.begin(9600, SERIAL_8N1, PMS_RX_PIN, PMS_TX_PIN);
  pms.passiveMode();  // Switch to passive mode for manual reading
  delay(1000);
  pms.wakeUp();  // Wake up sensor
  delay(2000);   // PMS needs 30s to stabilize, but we'll read gradually
  Serial.println("[PMS5003] ✓ Ready");
  Serial.println("[PMS5003] Note: First readings may take 30s to stabilize");

  Serial.println("[Sensors] All sensors initialized\n");
}

// ============================================================================
// READ DHT11 SENSOR
// ============================================================================

void readDHT11() {
  float h = dht.readHumidity();
  float t = dht.readTemperature();

  // Check if readings are valid
  if (isnan(h) || isnan(t)) {
    Serial.println("[DHT11] ✗ Read failed - Check wiring!");
    sensorData.dhtValid = false;
    return;
  }

  sensorData.temperature = t;
  sensorData.humidity = h;
  sensorData.dhtValid = true;

  Serial.printf("[DHT11] Temperature: %.1f°C | Humidity: %.1f%%\n", t, h);
}

// ============================================================================
// READ PMS5003 SENSOR
// ============================================================================

void readPMS5003() {
  Serial.println("[PMS5003] Requesting data...");

  pms.requestRead();

  if (pms.readUntil(pmsData, 2000)) {  // 2 second timeout
    sensorData.pm1_0 = pmsData.PM_AE_UG_1_0;
    sensorData.pm2_5 = pmsData.PM_AE_UG_2_5;
    sensorData.pm10 = pmsData.PM_AE_UG_10_0;
    sensorData.pmsValid = true;

    Serial.printf("[PMS5003] ✓ PM1.0: %d µg/m³ | PM2.5: %d µg/m³ | PM10: %d µg/m³\n",
                  sensorData.pm1_0, sensorData.pm2_5, sensorData.pm10);

    // Air Quality Assessment
    if (sensorData.pm2_5 <= 12) {
      Serial.println("[PMS5003] Air Quality: GOOD");
    } else if (sensorData.pm2_5 <= 35) {
      Serial.println("[PMS5003] Air Quality: MODERATE");
    } else if (sensorData.pm2_5 <= 55) {
      Serial.println("[PMS5003] Air Quality: UNHEALTHY (Sensitive Groups)");
    } else {
      Serial.println("[PMS5003] Air Quality: UNHEALTHY");
    }
  } else {
    Serial.println("[PMS5003] ✗ No data - Sensor warming up or check wiring");
    sensorData.pmsValid = false;
  }
}

// ============================================================================
// SEND DATA TO SERVER
// ============================================================================

void sendDataToServer() {
  if (!sensorData.dhtValid && !sensorData.pmsValid) {
    Serial.println("[Server] ✗ No valid sensor data to send");
    return;
  }

  HTTPClient http;
  http.begin(API_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + API_TOKEN);

  // Create JSON payload
  StaticJsonDocument<512> doc;
  doc["device_id"] = DEVICE_ID;

  JsonObject sensors = doc.createNestedObject("sensors");

  if (sensorData.dhtValid) {
    sensors["temperature"] = sensorData.temperature;
    sensors["humidity"] = sensorData.humidity;
  }

  if (sensorData.pmsValid) {
    sensors["pm1_0"] = sensorData.pm1_0;
    sensors["pm2_5"] = sensorData.pm2_5;
    sensors["pm10"] = sensorData.pm10;
  }

  String payload;
  serializeJson(doc, payload);

  Serial.println("\n[Server] Sending data...");
  Serial.print("[Server] Payload: ");
  Serial.println(payload);

  int httpCode = http.POST(payload);

  if (httpCode > 0) {
    Serial.printf("[Server] ✓ Response code: %d\n", httpCode);
    String response = http.getString();
    Serial.print("[Server] Response: ");
    Serial.println(response);
    blinkLED(1, 50);
  } else {
    Serial.printf("[Server] ✗ Error: %s\n", http.errorToString(httpCode).c_str());
  }

  http.end();
}

// ============================================================================
// PRINT SENSOR DATA SUMMARY
// ============================================================================

void printSensorData() {
  Serial.println("\n========== SENSOR READINGS ==========");

  if (sensorData.dhtValid) {
    Serial.printf("Temperature: %.1f°C\n", sensorData.temperature);
    Serial.printf("Humidity:    %.1f%%\n", sensorData.humidity);
  } else {
    Serial.println("Temperature: N/A");
    Serial.println("Humidity:    N/A");
  }

  if (sensorData.pmsValid) {
    Serial.printf("PM1.0:       %d µg/m³\n", sensorData.pm1_0);
    Serial.printf("PM2.5:       %d µg/m³\n", sensorData.pm2_5);
    Serial.printf("PM10:        %d µg/m³\n", sensorData.pm10);
  } else {
    Serial.println("PM1.0:       N/A");
    Serial.println("PM2.5:       N/A");
    Serial.println("PM10:        N/A");
  }

  Serial.println("====================================\n");
}

// ============================================================================
// UTILITY: BLINK LED
// ============================================================================

void blinkLED(int times, int delayMs) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_PIN, HIGH);
    delay(delayMs);
    digitalWrite(LED_PIN, LOW);
    delay(delayMs);
  }
}
