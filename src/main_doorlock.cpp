/**
 * ESP32 Smart Door Lock System
 *
 * Features:
 * - Servo motor for physical lock mechanism
 * - Buzzer for audio feedback (locked/unlocked)
 * - MQTT subscription for remote commands
 * - Fetches commands from backend server
 * - WiFi connectivity
 * - Status LED indicators
 *
 * Hardware:
 * - ESP32-DevKitC or ESP32-S3-DevKitC
 * - SG90 Servo Motor (or similar)
 * - Passive Buzzer
 * - Status LED
 * - 5V Power Supply
 */

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>
#include "doorlock_mqtt.h"

// ============================================================================
// DEVICE IDENTIFICATION
// ============================================================================
#ifndef DEVICE_ID
#define DEVICE_ID "dl_001"
#endif
#ifndef DEVICE_TYPE
#define DEVICE_TYPE "doorlock"
#endif
#ifndef LOCATION_NAME
#define LOCATION_NAME "Front Door"
#endif

// ============================================================================
// SECURITY CONFIGURATION
// ============================================================================
// API Token for backend authentication
const char* DEVICE_API_TOKEN = "1ccb0937632f6a1eb242d881a211b156f8c3a21fae38ee0e3b2ddad748b3e5ab";

// ============================================================================
// WIFI CONFIGURATION
// ============================================================================
const char* WIFI_SSID = "ILFforever2";
const char* WIFI_PASSWORD = "19283746";

// ============================================================================
// BACKEND SERVER CONFIGURATION
// ============================================================================
// Base URL for backend API (will append /pending and /manual-unlock)
// Example: "http://192.168.1.100:3000/api/v1/devices/commands"
const char* BACKEND_URL = "https://embedded-smarthome.fly.dev/api/v1/devices/commands";

// ============================================================================
// GPIO PIN CONFIGURATION
// ============================================================================
#define SERVO_PIN           12  // PWM pin for servo
#define BUZZER_PIN          14  // Pin for buzzer
#define STATUS_LED_PIN      2   // Onboard LED
#define UNLOCK_BUTTON_PIN   13  // Physical button to unlock door

// ============================================================================
// SERVO CONFIGURATION
// ============================================================================
#define SERVO_LOCKED_POS    0    // Servo angle for locked position (0°)
#define SERVO_UNLOCKED_POS  90   // Servo angle for unlocked position (90°)

// ============================================================================
// BUZZER TONES (in Hz)
// ============================================================================
#define TONE_LOCKED         2000  // Higher pitch for locked
#define TONE_UNLOCKED       1000  // Lower pitch for unlocked
#define TONE_ERROR          500   // Low pitch for error
#define TONE_DURATION       200   // Duration in milliseconds

// ============================================================================
// TIMING CONFIGURATION
// ============================================================================
#define COMMAND_FETCH_INTERVAL  5000   // Fetch commands every 5 seconds
#define WIFI_CONNECT_TIMEOUT    10000  // 10 seconds WiFi timeout
#define HEARTBEAT_INTERVAL      30000  // Send heartbeat every 30 seconds

// ============================================================================
// GLOBAL OBJECTS
// ============================================================================
Servo doorLockServo;

// ============================================================================
// LOCK STATE
// ============================================================================
enum LockState {
  LOCKED,
  UNLOCKED,
  UNKNOWN
};

LockState currentLockState = UNKNOWN;
unsigned long lastCommandFetch = 0;
unsigned long lastHeartbeat = 0;

// Button debouncing
unsigned long lastButtonPress = 0;
const unsigned long DEBOUNCE_DELAY = 500;  // 500ms debounce

// ============================================================================
// FUNCTION PROTOTYPES
// ============================================================================
void setupPins();
void setupWiFi();
void setupServo();
void lockDoor();
void unlockDoor();
void unlockDoorManual();
void playTone(int frequency, int duration);
void playLockedTone();
void playUnlockedTone();
void playErrorTone();
void fetchAndExecuteCommands();
void executeCommand(const String& action);
void sendHeartbeat();
void notifyServerManualUnlock();
void checkUnlockButton();
void blinkLED(int times, int delayMs);

// ============================================================================
// SETUP
// ============================================================================
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n\n========================================");
  Serial.printf("  %s - Smart Door Lock\n", DEVICE_ID);
  Serial.printf("  Location: %s\n", LOCATION_NAME);
  Serial.println("========================================");

  setupPins();
  setupServo();
  setupWiFi();

  // Initialize MQTT
  initDoorLockMQTT(DEVICE_ID);
  connectDoorLockMQTT();

  // Initialize to locked state for security
  Serial.println("[INIT] Setting initial state to LOCKED");
  lockDoor();

  Serial.println("[SETUP] ✓ All systems initialized\n");
}

// ============================================================================
// MAIN LOOP
// ============================================================================
void loop() {
  // Check if unlock button is pressed
  checkUnlockButton();

  // Maintain MQTT connection and process messages
  processDoorLockMQTT();

  // NOTE: Periodic command fetching DISABLED - only fetch when MQTT notification received
  // Commands are fetched immediately when MQTT callback receives fetch_commands notification

  // Send periodic heartbeat
  unsigned long now = millis();
  if (now - lastHeartbeat >= HEARTBEAT_INTERVAL) {
    lastHeartbeat = now;
    sendHeartbeat();
  }

  // Check WiFi connection
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WIFI] Connection lost - reconnecting...");
    setupWiFi();
  }

  delay(100);  // Small delay to prevent busy loop
}

// ============================================================================
// INITIALIZATION FUNCTIONS
// ============================================================================

void setupPins() {
  Serial.println("[SETUP] Configuring GPIO pins...");

  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(STATUS_LED_PIN, OUTPUT);
  pinMode(UNLOCK_BUTTON_PIN, INPUT);  // Button with pull-up (active LOW)

  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(STATUS_LED_PIN, LOW);

  Serial.println("[SETUP] ✓ GPIO configured");
  Serial.println("[SETUP] ✓ Unlock button ready (GPIO 34)");
}

void setupServo() {
  Serial.println("[SETUP] Initializing servo...");

  // Allow allocation of all timers for servo library
  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  ESP32PWM::allocateTimer(2);
  ESP32PWM::allocateTimer(3);

  doorLockServo.setPeriodHertz(50);  // Standard 50Hz servo
  doorLockServo.attach(SERVO_PIN, 500, 2400);  // Min/max pulse width in microseconds

  Serial.println("[SETUP] ✓ Servo initialized");
}

void setupWiFi() {
  Serial.println("[WIFI] Connecting to WiFi...");
  Serial.printf("  SSID: %s\n", WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long startTime = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - startTime < WIFI_CONNECT_TIMEOUT)) {
    delay(500);
    Serial.print(".");
    blinkLED(1, 100);
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WIFI] ✓ Connected!");
    Serial.printf("  IP Address: %s\n", WiFi.localIP().toString().c_str());
    Serial.printf("  Signal Strength: %d dBm\n", WiFi.RSSI());
    blinkLED(3, 100);
  } else {
    Serial.println("\n[WIFI] ✗ Connection failed!");
    playErrorTone();
  }
}

// ============================================================================
// LOCK CONTROL FUNCTIONS
// ============================================================================

void lockDoor() {
  Serial.println("[LOCK] 🔒 Locking door...");

  // Move servo to locked position
  doorLockServo.write(SERVO_LOCKED_POS);
  delay(500);  // Wait for servo to reach position

  currentLockState = LOCKED;

  // Audio feedback
  playLockedTone();

  // Visual feedback
  blinkLED(2, 100);

  // Publish status to MQTT
  publishDoorLockStatus("locked", true);

  Serial.println("[LOCK] ✓ Door is LOCKED");
}

void unlockDoor() {
  Serial.println("[LOCK] 🔓 Unlocking door (remote)...");

  // Move servo to unlocked position
  doorLockServo.write(SERVO_UNLOCKED_POS);
  delay(500);  // Wait for servo to reach position

  currentLockState = UNLOCKED;

  // Audio feedback
  playUnlockedTone();

  // Visual feedback
  blinkLED(3, 100);

  // Publish status to MQTT
  publishDoorLockStatus("unlocked", false);

  Serial.println("[LOCK] ✓ Door is UNLOCKED");
}

void unlockDoorManual() {
  Serial.println("[LOCK] 🔓 Unlocking door (MANUAL BUTTON)...");

  // Move servo to unlocked position
  doorLockServo.write(SERVO_UNLOCKED_POS);
  delay(500);  // Wait for servo to reach position

  currentLockState = UNLOCKED;

  // Audio feedback - double beep for manual unlock
  playUnlockedTone();
  delay(200);
  playUnlockedTone();

  // Visual feedback - longer blink pattern
  blinkLED(5, 100);

  // Publish status to MQTT
  publishDoorLockStatus("unlocked_manual", false);

  // Notify server about manual unlock
  notifyServerManualUnlock();

  Serial.println("[LOCK] ✓ Door is UNLOCKED (Manual)");
}

// ============================================================================
// BUZZER FUNCTIONS
// ============================================================================

void playTone(int frequency, int duration) {
  tone(BUZZER_PIN, frequency, duration);
  delay(duration);
  noTone(BUZZER_PIN);
}

void playLockedTone() {
  // Two short high beeps for locked
  playTone(TONE_LOCKED, TONE_DURATION);
  delay(100);
  playTone(TONE_LOCKED, TONE_DURATION);
}

void playUnlockedTone() {
  // One long low beep for unlocked
  playTone(TONE_UNLOCKED, TONE_DURATION * 2);
}

void playErrorTone() {
  // Three short low beeps for error
  for (int i = 0; i < 3; i++) {
    playTone(TONE_ERROR, TONE_DURATION);
    delay(100);
  }
}

// ============================================================================
// COMMAND FETCHING AND EXECUTION
// ============================================================================

void fetchAndExecuteCommands() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[CMD] WiFi not connected - skipping command fetch");
    return;
  }

  Serial.println("[CMD] Fetching pending commands from backend...");

  HTTPClient http;

  // Build URL - POST to /pending endpoint (same as doorbell)
  String url = String(BACKEND_URL) + "/pending";

  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  // Add Authorization header with Bearer token
  if (DEVICE_API_TOKEN && strlen(DEVICE_API_TOKEN) > 0) {
    String authHeader = String("Bearer ") + DEVICE_API_TOKEN;
    http.addHeader("Authorization", authHeader.c_str());
  }

  http.setTimeout(5000);

  // Build JSON payload with device_id (same as doorbell)
  StaticJsonDocument<256> requestDoc;
  requestDoc["device_id"] = DEVICE_ID;

  String jsonString;
  serializeJson(requestDoc, jsonString);

  // Send POST request (not GET - matches doorbell pattern)
  int httpCode = http.POST(jsonString);

  if (httpCode > 0) {
    Serial.printf("[CMD] HTTP Response: %d\n", httpCode);

    if (httpCode == HTTP_CODE_OK) {
      String payload = http.getString();
      Serial.printf("[CMD] Response: %s\n", payload.c_str());

      // Parse JSON response
      StaticJsonDocument<2048> doc;
      DeserializationError error = deserializeJson(doc, payload);

      if (error) {
        Serial.printf("[CMD] ✗ JSON parse error: %s\n", error.c_str());
        playErrorTone();
        http.end();
        return;
      }

      // Check if there are pending commands
      if (doc.containsKey("commands") && doc["commands"].is<JsonArray>()) {
        JsonArray commands = doc["commands"].as<JsonArray>();

        if (commands.size() > 0) {
          Serial.printf("[CMD] ✓ Found %d pending command(s)\n", commands.size());

          // Execute each command
          for (JsonObject cmd : commands) {
            String action = cmd["action"] | "";
            String commandId = cmd["id"] | "";

            Serial.printf("[CMD] Executing command ID: %s, Action: %s\n",
                         commandId.c_str(), action.c_str());

            executeCommand(action);

            // TODO: Optionally send acknowledgment back to server
            // acknowledgeCommand(commandId, true, action);
          }
        } else {
          Serial.println("[CMD] No pending commands");
        }
      }
    }
  } else {
    Serial.printf("[CMD] ✗ HTTP request failed: %s\n", http.errorToString(httpCode).c_str());
    playErrorTone();
  }

  http.end();
}

void executeCommand(const String& action) {
  Serial.printf("[CMD] Executing action: %s\n", action.c_str());

  if (action == "lock" || action == "LOCK") {
    lockDoor();
  }
  else if (action == "unlock" || action == "UNLOCK") {
    unlockDoor();
  }
  else if (action == "status" || action == "STATUS") {
    // Report current status
    String status = (currentLockState == LOCKED) ? "locked" :
                   (currentLockState == UNLOCKED) ? "unlocked" : "unknown";
    publishDoorLockStatus(status, currentLockState == LOCKED);
  }
  else {
    Serial.printf("[CMD] ⚠ Unknown action: %s\n", action.c_str());
    playErrorTone();
  }
}

// ============================================================================
// HEARTBEAT FUNCTION
// ============================================================================

void sendHeartbeat() {
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  Serial.println("[HEARTBEAT] Sending status update...");

  String status = (currentLockState == LOCKED) ? "locked" :
                 (currentLockState == UNLOCKED) ? "unlocked" : "unknown";

  publishDoorLockStatus(status, currentLockState == LOCKED);
}

// ============================================================================
// BUTTON HANDLING
// ============================================================================

void checkUnlockButton() {
  // Read button state (active LOW with INPUT_PULLUP)
  int buttonState = digitalRead(UNLOCK_BUTTON_PIN);

  // Button is pressed when LOW
  if (buttonState == HIGH) {
    unsigned long now = millis();

    // Check debounce
    if (now - lastButtonPress > DEBOUNCE_DELAY) {
      lastButtonPress = now;

      Serial.println("[BUTTON] Unlock button pressed!");

      // Only unlock if currently locked
      if (currentLockState == LOCKED) {
        unlockDoorManual();
      } else {
        Serial.println("[BUTTON] Door already unlocked");
        playErrorTone();
      }
    }
  }
}

void notifyServerManualUnlock() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[SERVER] WiFi not connected - cannot notify server");
    return;
  }

  Serial.println("[SERVER] Notifying backend of manual unlock...");

  HTTPClient http;

  // Build notification URL
  String url = String(BACKEND_URL) + "/manual-unlock";

  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  // Create JSON payload
  StaticJsonDocument<256> doc;
  doc["device_id"] = DEVICE_ID;
  doc["device_type"] = DEVICE_TYPE;
  doc["location"] = LOCATION_NAME;
  doc["action"] = "manual_unlock";
  doc["timestamp"] = millis();
  doc["api_token"] = DEVICE_API_TOKEN;

  String payload;
  serializeJson(doc, payload);

  // Send POST request
  int httpCode = http.POST(payload);

  if (httpCode > 0) {
    Serial.printf("[SERVER] HTTP Response: %d\n", httpCode);

    if (httpCode == HTTP_CODE_OK || httpCode == HTTP_CODE_CREATED) {
      String response = http.getString();
      Serial.printf("[SERVER] ✓ Server notified: %s\n", response.c_str());
    }
  } else {
    Serial.printf("[SERVER] ✗ HTTP request failed: %s\n", http.errorToString(httpCode).c_str());
  }

  http.end();
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
