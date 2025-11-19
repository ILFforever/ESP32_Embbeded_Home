/*
 * LovyanGFX Sprite Examples for RA8875
 *
 * Hardware: ESP32 + EastRising RA8875 800x480 Display
 */

#define LGFX_USE_V1
#include <LovyanGFX.hpp>
#include <Wire.h>
#include <WiFi.h>
#include <Touch.h>
#include <CapSensor.h>
#include "TaskScheduler.h"
#include "DisplayConfig.h"
#include "hub_network.h"
#include "uart_slaves.h"
#include "wifi_functions.h"
#include "mqtt_client.h"
#include "GUI/screen_manager.h"
#include "Capacitive/cap_sensor_manager.h"

// ============================================================================
// UART Pin Configuration
// ============================================================================
#define MESH_RX 26 // Main Mesh UART RX
#define MESH_TX 25 // Main Mesh UART TX
#define AMP_RX 4   // Main Amp UART RX
#define AMP_TX 33  // Main Amp UART TX
#define UART_BAUD 115200

#define PONG_TIMEOUT 10000 // 10 seconds timeout for ping-pong

// ============================================================================
// Global Objects
// ============================================================================

LGFX lcd; // Removed 'static' to match 'extern' declaration in screen_manager.h
Scheduler scheduler;

// Sprites
LGFX_Sprite topBar(&lcd);      // Top status bar (800x40)
LGFX_Sprite contentArea(&lcd); // Main content area (800x440)
LGFX_Sprite botBar(&lcd);      // Main content area (800x440)
LGFX_Sprite touchArea(&lcd);   // Full screen touch area (800x480)

// Touch state
TouchPosition currentTouch = {0, 0, false, 0};
volatile bool touchDataReady = false;

// Doorbell status
DeviceStatus doorbellStatus;
bool doorbellOnline = false;

// Doorbell ring notification
volatile bool doorbellJustRang = false;
unsigned long doorbellRingTime = 0;
#define RING_NOTIFICATION_DURATION 3000 // Show notification for 3 seconds

// Sprite update tracking
volatile bool topBarNeedsUpdate = false;
volatile bool botBarNeedsUpdate = false;
volatile bool contentNeedsUpdate = false;
volatile bool touchAreaNeedsUpdate = false;
volatile bool forcePageUpdate = false;
// Track previous values to detect changes
static int prevFreeHeap = 0;
static int prevFreePsram = 0;
static int prevDoorbellRssi = 0;
static bool prevDoorbellOnline = false;
static bool prevDoorbellDataValid = false;
static bool prevDoorbellRinging = false;
static bool contentInitialized = false;

void IRAM_ATTR touchISR()
{
  touchDataReady = true;
}

// Track screens
int cur_Screen = 0;
int Last_Screen = -1; // so we start with an update
// ============================================================================
// Task Definitions
// ============================================================================
// Screen and cap sensor functions are now in screen_manager.h and cap_sensor_manager.h
void sendHeartbeatTask();
void checkDoorbellTask();
void checkMeshUARTData();
void checkAmpUARTData();
void sendMeshPingTask();
void sendAmpPingTask();
void checkMeshTimeout();
void checkAmpTimeout();
void processMQTTTask();
void onDoorbellRing();
void onFaceDetection(bool recognized, const char *name, float confidence);

Task taskUpdateTopBar(1000, TASK_FOREVER, &updateTopBar);
Task taskUpdateContent(100, TASK_FOREVER, &updateContent);
Task taskTouchUpdate(20, TASK_FOREVER, &updateTouchllv);
Task taskCapSensorUpdate(100, TASK_FOREVER, &updateCapSensor);
Task taskSendHeartbeat(60000, TASK_FOREVER, &sendHeartbeatTask);  // Every 60s
Task taskCheckDoorbell(60000, TASK_FOREVER, &checkDoorbellTask);  // Every 60s
Task taskProcessMQTT(100, TASK_FOREVER, &processMQTTTask);        // Every 100ms
Task taskCheckMeshUART(20, TASK_FOREVER, &checkMeshUARTData);     // Check Mesh UART every 20ms
Task taskCheckAmpUART(20, TASK_FOREVER, &checkAmpUARTData);       // Check Amp UART every 20ms
Task taskSendMeshPing(1000, TASK_FOREVER, &sendMeshPingTask);     // Send ping every 1s
Task taskSendAmpPing(1000, TASK_FOREVER, &sendAmpPingTask);       // Send ping every 1s
Task taskCheckMeshTimeout(1000, TASK_FOREVER, &checkMeshTimeout); // Check timeout every 1s
Task taskCheckAmpTimeout(1000, TASK_FOREVER, &checkAmpTimeout);   // Check timeout every 1s
// ============================================================================
// Setup and Main Loop
// ============================================================================

void setup(void)
{
  Serial.begin(115200);
  delay(200);

  Serial.println("\n╔════════════════════════════════════════╗");
  Serial.println("║  LovyanGFX Sprite Examples            ║");
  Serial.println("║  for RA8875 800x480 Display           ║");
  Serial.println("╚════════════════════════════════════════╝\n");

  // Check PSRAM availability
  if (psramFound())
  {
    Serial.printf("PSRAM found! Total: %d bytes, Free: %d bytes\n",
                  ESP.getPsramSize(), ESP.getFreePsram());
  }
  else
  {
    Serial.println("WARNING: PSRAM not found!");
    ESP.restart(); // restart since something is definitely wrong
  }
  Serial.println("Initializing display...");
  lcd.init();
  lcd.setRotation(2); // 180-degree rotation
  Serial.println("Display ready!\n");

  // Top bar sprite (800x40 = 64,000 bytes)
  topBar.setColorDepth(8);
  topBar.setPsram(true);
  bool topBarCreated = topBar.createSprite(800, 40);

  // Bottom bar sprite (800x20 = 32,000 bytes)
  botBar.setColorDepth(8);
  botBar.setPsram(true);
  bool botBarCreated = botBar.createSprite(800, 20);

  // Content area sprite (800x440 = 704,000 bytes)
  contentArea.setColorDepth(8);
  contentArea.setPsram(true);
  bool contentCreated = contentArea.createSprite(800, 440);

  // Touch area sprite (800x480) with transparency
  touchArea.setColorDepth(8);
  touchArea.setPsram(true);
  bool touchCreated = touchArea.createSprite(800, 480);
  touchArea.setPaletteColor(0, TFT_BLACK); // Index 0 = transparent color
  touchArea.fillSprite(0); // Fill with transparent

  if (topBarCreated && contentCreated && botBarCreated && touchCreated)
  {
    Serial.printf("Sprites created successfully!\n");
    Serial.printf("  Top bar: 800x40 (%d bytes)\n", 800 * 40 * 2);
    Serial.printf("  Content: 800x440 (%d bytes)\n", 800 * 440 * 2);
    Serial.printf("  Bottom bar: 800x20 (%d bytes)\n", 800 * 20 * 2);
    Serial.printf("  Touch area: 800x480 (%d bytes)\n", 800 * 480 * 2);
    Serial.printf("Free PSRAM after sprites: %d bytes\n", ESP.getFreePsram());

    // Initialize top bar
    topBar.fillScreen(TFT_WHITE);
    topBar.setTextColor(TFT_BLACK, TFT_WHITE);
    topBar.setTextSize(2);
    topBar.drawCenterString("Initialization Begin", 400, 20);
    topBar.pushSprite(0, 0);

    // Initialize content area
    contentArea.fillScreen(TFT_BLUE);
    contentArea.setTextColor(TFT_WHITE, TFT_BLUE);
    contentArea.setTextSize(3);
    contentArea.drawCenterString("Starting... ", 400, 120);
    drawProgressBar(&contentArea, 180, 220, 440, 70, 0, getProgressColor(0), TFT_BLACK, TFT_WHITE, 5);
    contentArea.pushSprite(0, 40); // Below top bar
  }
  else
  {
    Serial.println("ERROR: Failed to create sprites!");
    ESP.restart();
  }

  Serial.println();
  contentArea.fillScreen(TFT_BLUE);
  contentArea.drawCenterString("Initializing Wire...", 400, 120);
  drawProgressBar(&contentArea, 180, 220, 440, 70, 10, getProgressColor(10), TFT_BLACK, TFT_WHITE, 5);
  contentArea.pushSprite(0, 40); // Below top bar

  // Initialize I2C (shared by touch screen and capacitive sensor)
  Wire.begin(); // SDA=21, SCL=22

  // delay(150); //comment for now add back in prod
  contentArea.fillScreen(TFT_BLUE);
  contentArea.drawCenterString("Initializing TouchScreen...", 400, 120);
  drawProgressBar(&contentArea, 180, 220, 440, 70, 25, getProgressColor(25), TFT_BLACK, TFT_WHITE, 5);
  contentArea.pushSprite(0, 40); // Below top bar

  // Initialize touch screen (uses I2C)
  touchsetup();

  // delay(150); //comment for now add back in prod
  contentArea.fillScreen(TFT_BLUE);
  contentArea.drawCenterString("Initializing Capacitive Front pads...", 400, 120);
  drawProgressBar(&contentArea, 180, 220, 440, 70, 40, getProgressColor(40), TFT_BLACK, TFT_WHITE, 5);
  contentArea.pushSprite(0, 40); // Below top bar

  // Setup touch interrupt
  pinMode(GSL1680_INT, INPUT);
  attachInterrupt(digitalPinToInterrupt(GSL1680_INT), touchISR, RISING);
  Serial.println("Touch interrupt enabled on pin 34");

  // Initialize capacitive sensor (uses same I2C bus)
  // Try a few times sometimes it fails
  for (int i = 0; i < 3; i++)
  {
    if (!capSensorSetup())
      Serial.println("Warning: Capacitive sensor initialization failed!");
    else
      break;
  }

  // delay(150); //comment for now add back in prod
  contentArea.fillScreen(TFT_BLUE);
  contentArea.drawCenterString("Connecting to secondary modules...", 400, 120);
  drawProgressBar(&contentArea, 180, 220, 440, 70, 50, getProgressColor(50), TFT_BLACK, TFT_WHITE, 5);
  contentArea.pushSprite(0, 40); // Below top bar

  // Initialize UART for Main Mesh (UART1: RX=26, TX=25)
  MeshSerial.begin(UART_BAUD, SERIAL_8N1, MESH_RX, MESH_TX);
  Serial.printf("Main Mesh UART initialized: RX=GPIO%d, TX=GPIO%d, Baud=%d\n", MESH_RX, MESH_TX, UART_BAUD);
  delay(100);

  drawProgressBar(&contentArea, 180, 220, 440, 70, 60, getProgressColor(60), TFT_BLACK, TFT_WHITE, 5);
  contentArea.pushSprite(0, 40); // Below top bar

  // Initialize UART for Main Amp (UART2: RX=4, TX=33)
  AmpSerial.begin(UART_BAUD, SERIAL_8N1, AMP_RX, AMP_TX);
  Serial.printf("Main Amp UART initialized: RX=GPIO%d, TX=GPIO%d, Baud=%d\n", AMP_RX, AMP_TX, UART_BAUD);
  delay(100);

  // Initialize ping-pong timestamps
  last_mesh_pong_time = millis();
  last_amp_pong_time = millis();

  // delay(150); //comment for now add back in prod
  contentArea.fillScreen(TFT_BLUE);
  contentArea.drawCenterString("Connecting to WIFI", 400, 120);
  drawProgressBar(&contentArea, 180, 220, 440, 70, 70, getProgressColor(70), TFT_BLACK, TFT_WHITE, 5);
  contentArea.pushSprite(0, 40); // Below top bar

  wifi_init();

  contentArea.fillScreen(TFT_BLUE);
  contentArea.drawCenterString("Handshaking with Backend", 400, 120);
  drawProgressBar(&contentArea, 180, 220, 440, 70, 80, getProgressColor(80), TFT_BLACK, TFT_WHITE, 5);
  contentArea.pushSprite(0, 40); // Below top bar
  // Initialize heartbeat module

  initHeartbeat(
      "http://embedded-smarthome.fly.dev",                                // Backend URL
      "hb_001",                                                           // Hub device ID
      "hub",                                                              // Device type
      "f59ac83960ac8d7cd4fdc2915af85ed30ce562b410cfc0217b88b6fd2f7c4739", // Hub API token
      "db_001"                                                            // Doorbell device ID to monitor
  );

  // delay(150); //comment for now add back in prod
  contentArea.fillScreen(TFT_BLUE);
  contentArea.drawCenterString("Subscribing to MQTT topic", 400, 120);
  drawProgressBar(&contentArea, 180, 220, 440, 70, 90, getProgressColor(90), TFT_BLACK, TFT_WHITE, 5);
  contentArea.pushSprite(0, 40); // Below top bar

  // Initialize MQTT client
  initMQTT("hub_hb_001", onDoorbellRing, onFaceDetection);
  connectMQTT(); // Initial connection attempt

  Serial.println("[MQTT] Hub will receive doorbell rings and face detection via MQTT!");

  // Setup scheduler tasks
  scheduler.addTask(taskUpdateTopBar);
  scheduler.addTask(taskUpdateContent);
  scheduler.addTask(taskTouchUpdate);
  scheduler.addTask(taskCapSensorUpdate);
  scheduler.addTask(taskSendHeartbeat);
  scheduler.addTask(taskCheckDoorbell);
  scheduler.addTask(taskProcessMQTT);
  scheduler.addTask(taskCheckMeshUART);
  scheduler.addTask(taskCheckAmpUART);
  scheduler.addTask(taskSendMeshPing);
  scheduler.addTask(taskSendAmpPing);
  scheduler.addTask(taskCheckMeshTimeout);
  scheduler.addTask(taskCheckAmpTimeout);

  taskUpdateTopBar.enable();
  taskUpdateContent.enable();
  taskTouchUpdate.enable();
  taskCapSensorUpdate.enable();
  taskSendHeartbeat.enable();
  taskCheckDoorbell.enable();
  taskProcessMQTT.enable();
  taskCheckMeshUART.enable();
  taskCheckAmpUART.enable();
  taskSendMeshPing.enable();
  taskSendAmpPing.enable();
  taskCheckMeshTimeout.enable();
  taskCheckAmpTimeout.enable();
  Serial.println("\n✅ All systems initialized - Ready!");

  contentArea.fillScreen(TFT_BLUE);
  contentArea.drawCenterString("All systems Ready :)", 400, 120);
  drawProgressBar(&contentArea, 180, 220, 440, 70, 100, getProgressColor(100), TFT_BLACK, TFT_WHITE, 5);
  contentArea.pushSprite(0, 40); // Below top bar
}

void loop(void)
{
  scheduler.execute();
}

// ============================================================================
// Screen and capacitive sensor functions are now in separate files:
// - screen_manager.cpp: updateTopBar(), updateContent(), updateTouch(),
//                        pushSpritesToDisplay(), drawWifiSymbol()
// - cap_sensor_manager.cpp: updateCapSensor()
// ============================================================================

// Task: Send hub's heartbeat to backend
void sendHeartbeatTask()
{
  sendHubHeartbeat();
}

// Task: Check doorbell online/offline status
void checkDoorbellTask()
{
  doorbellStatus = checkDoorbellStatus();
  doorbellOnline = doorbellStatus.online;
}

// Task: Process MQTT messages (replaces polling!)
void processMQTTTask()
{
  processMQTT();
}

// Callback: Called when doorbell rings (triggered by MQTT)
void onDoorbellRing()
{
  Serial.println("[Hub] 🔔 DOORBELL RANG via MQTT! Playing notification...");

  // Set flag for visual notification
  doorbellJustRang = true;
  doorbellRingTime = millis();
  contentNeedsUpdate = true; // Trigger content area update
  sendAmpCommand("play", "success");
}

// Callback: Called when face detection event received (triggered by MQTT)
void onFaceDetection(bool recognized, const char *name, float confidence)
{
  Serial.printf("[Hub] 👤 Face Detection via MQTT!\n");
  Serial.printf("  Name: %s\n", name);
  Serial.printf("  Recognized: %s\n", recognized ? "Yes" : "No");
  Serial.printf("  Confidence: %.2f\n", confidence);

  // TODO: Display face detection on screen
  // TODO: Log to Firebase via backend
  // TODO: Show notification based on recognized status

  contentNeedsUpdate = true; // Trigger content area update
}

// ============================================================================
// UART Task Functions
// ============================================================================

// Task: Check for incoming UART data from Main Mesh
void checkMeshUARTData()
{
  while (MeshSerial.available())
  {
    String line = MeshSerial.readStringUntil('\n');
    if (line.length() > 0)
    {
      handleMeshResponse(line);
    }
  }
}

// Task: Check for incoming UART data from Main Amp
void checkAmpUARTData()
{
  while (AmpSerial.available())
  {
    String line = AmpSerial.readStringUntil('\n');
    if (line.length() > 0)
    {
      handleAmpResponse(line);
    }
  }
}

// Task: Send periodic ping to Main Mesh
void sendMeshPingTask()
{
  sendMeshPing();
}

// Task: Send periodic ping to Main Amp
void sendAmpPingTask()
{
  sendAmpPing();
}

// Task: Check for Main Mesh ping timeout
void checkMeshTimeout()
{
  if (mesh_ping_counter > 0 && (millis() - last_mesh_pong_time > PONG_TIMEOUT))
  {
    if (mesh_status != -1)
    {
      Serial.println("[MESH] ⚠️ WARNING: No pong response for 10 seconds");
      Serial.println("[MESH] Connection to Main Mesh may be lost");
      mesh_status = -1; // mark as disconnected
    }
    // Keep checking - stay in disconnected state
  }
  else if (mesh_status == -1 && mesh_ping_counter > 0 && (millis() - last_mesh_pong_time < PONG_TIMEOUT))
  {
    // Recover from disconnected state if we're receiving pongs again
    Serial.println("[MESH] ✓ Connection restored!");
    mesh_status = 0; // back to standby
  }
}

// Task: Check for Main Amp ping timeout
void checkAmpTimeout()
{
  if (amp_ping_counter > 0 && (millis() - last_amp_pong_time > PONG_TIMEOUT))
  {
    if (amp_status != -1)
    {
      Serial.println("[AMP] ⚠️ WARNING: No pong response for 10 seconds");
      Serial.println("[AMP] Connection to Main Amp may be lost");
      amp_status = -1; // mark as disconnected
    }
    // Keep checking - stay in disconnected state
  }
  else if (amp_status == -1 && amp_ping_counter > 0 && (millis() - last_amp_pong_time < PONG_TIMEOUT))
  {
    // Recover from disconnected state if we're receiving pongs again
    Serial.println("[AMP] ✓ Connection restored!");
    amp_status = 0; // back to standby
  }
}
