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

static LGFX lcd;
Scheduler scheduler;

// Sprites
LGFX_Sprite topBar(&lcd);      // Top status bar (800x40)
LGFX_Sprite contentArea(&lcd); // Main content area (800x440)

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
volatile bool contentNeedsUpdate = false;

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

// ============================================================================
// Task Definitions
// ============================================================================
void updateTopBar();
void updateContent();
void updateTouch();
void updateCapSensor();
void pushSpritesToDisplay();
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
void drawWifiSymbol(int x, int y, int strength);

Task taskUpdateTopBar(1000, TASK_FOREVER, &updateTopBar);
Task taskUpdateContent(100, TASK_FOREVER, &updateContent);
Task taskTouchUpdate(20, TASK_FOREVER, &updateTouch);
Task taskCapSensorUpdate(100, TASK_FOREVER, &updateCapSensor);
Task taskPushSprites(50, TASK_FOREVER, &pushSpritesToDisplay);
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
  wifi_init();
  Serial.println("Initializing display...");
  lcd.init();
  lcd.setRotation(2); // 180-degree rotation
  Serial.println("Display ready!\n");

  // Top bar sprite (800x40 = 64,000 bytes)
  topBar.setColorDepth(16);
  topBar.setPsram(true);
  bool topBarCreated = topBar.createSprite(800, 40);

  // Content area sprite (800x440 = 704,000 bytes)
  contentArea.setColorDepth(16);
  contentArea.setPsram(true);
  bool contentCreated = contentArea.createSprite(800, 440);

  if (topBarCreated && contentCreated)
  {
    Serial.printf("Sprites created successfully!\n");
    Serial.printf("  Top bar: 800x40 (%d bytes)\n", 800 * 40 * 2);
    Serial.printf("  Content: 800x440 (%d bytes)\n", 800 * 440 * 2);
    Serial.printf("Free PSRAM after sprites: %d bytes\n", ESP.getFreePsram());

    // Initialize top bar
    topBar.fillScreen(TFT_WHITE);
    topBar.setTextColor(TFT_BLACK, TFT_WHITE);
    topBar.setTextSize(2);
    topBar.setCursor(350, 10);
    topBar.print("12:00:00");
    topBar.pushSprite(0, 0);

    // Initialize content area
    contentArea.fillScreen(TFT_BLUE);
    contentArea.setTextColor(TFT_WHITE, TFT_BLUE);
    contentArea.setTextSize(3);
    contentArea.drawString("LovyanGFX Multi-Sprite!", 50, 10);
    contentArea.pushSprite(0, 40); // Below top bar
  }
  else
  {
    Serial.println("ERROR: Failed to create sprites!");
    ESP.restart();
  }

  Serial.println();

  // Initialize I2C (shared by touch screen and capacitive sensor)
  Wire.begin(); // SDA=21, SCL=22

  // Initialize touch screen (uses I2C)
  touchsetup();

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

  // Initialize UART for Main Mesh (UART1: RX=26, TX=25)
  MeshSerial.begin(UART_BAUD, SERIAL_8N1, MESH_RX, MESH_TX);
  Serial.printf("Main Mesh UART initialized: RX=GPIO%d, TX=GPIO%d, Baud=%d\n", MESH_RX, MESH_TX, UART_BAUD);
  delay(100);

  // Initialize UART for Main Amp (UART2: RX=4, TX=33)
  AmpSerial.begin(UART_BAUD, SERIAL_8N1, AMP_RX, AMP_TX);
  Serial.printf("Main Amp UART initialized: RX=GPIO%d, TX=GPIO%d, Baud=%d\n", AMP_RX, AMP_TX, UART_BAUD);
  delay(100);

  // Initialize ping-pong timestamps
  last_mesh_pong_time = millis();
  last_amp_pong_time = millis();

  // Initialize heartbeat module (WiFi already initialized by wifi_init())
  initHeartbeat(
      "http://embedded-smarthome.fly.dev",                                // Backend URL
      "hb_001",                                                           // Hub device ID
      "hub",                                                              // Device type
      "f59ac83960ac8d7cd4fdc2915af85ed30ce562b410cfc0217b88b6fd2f7c4739", // Hub API token
      "db_001"                                                            // Doorbell device ID to monitor
  );

  // Initialize MQTT client (WiFi already initialized)
  initMQTT("hub_hb_001", onDoorbellRing, onFaceDetection);
  connectMQTT(); // Initial connection attempt

  Serial.println("[MQTT] Hub will receive doorbell rings and face detection via MQTT!");

  // Setup scheduler tasks
  scheduler.addTask(taskUpdateTopBar);
  scheduler.addTask(taskUpdateContent);
  scheduler.addTask(taskTouchUpdate);
  scheduler.addTask(taskCapSensorUpdate);
  scheduler.addTask(taskPushSprites);
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
  taskPushSprites.enable();
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
}

void loop(void)
{
  scheduler.execute();
}

void updateTopBar()
{
  static uint32_t secondCounter = 0;

  // Clear top bar
  topBar.fillScreen(TFT_WHITE);
  topBar.setTextColor(TFT_BLACK, TFT_WHITE);
  topBar.setTextSize(2);

  // Display hub info
  topBar.drawString("ESP32 Hub - Control Center", 50, 10);

  // Display doorbell status - show brief status in top bar
  if (doorbellStatus.data_valid)
  {
    if (doorbellOnline)
    {
      topBar.setTextColor(TFT_GREEN, TFT_WHITE);
      topBar.drawString("DB: ON", 600, 10);
      topBar.setTextColor(TFT_BLACK, TFT_WHITE);
    }
    else
    {
      topBar.setTextColor(TFT_RED, TFT_WHITE);
      topBar.drawString("DB: OFF", 600, 10);
      topBar.setTextColor(TFT_BLACK, TFT_WHITE);
    }
  }
  else
  {
    topBar.setTextColor(TFT_YELLOW, TFT_WHITE);
    topBar.drawString("DB: ...", 600, 10);
    topBar.setTextColor(TFT_BLACK, TFT_WHITE);
  }

  // WiFi indicator: Calculate strength based on RSSI
  int wifiStrength = 0;
  if (WiFi.status() == WL_CONNECTED)
  {
    int32_t rssi = WiFi.RSSI();
    // RSSI to bars conversion:
    // > -50 dBm = Excellent (3 bars)
    // -50 to -60 dBm = Good (3 bars)
    // -60 to -70 dBm = Fair (2 bars)
    // -70 to -80 dBm = Weak (1 bar)
    // < -80 dBm = Very weak (0 bars)
    if (rssi > -60)
    {
      wifiStrength = 3;
    }
    else if (rssi > -70)
    {
      wifiStrength = 2;
    }
    else if (rssi > -80)
    {
      wifiStrength = 1;
    }
    else
    {
      wifiStrength = 0;
    }
  }
  drawWifiSymbol(780, 20, wifiStrength);

  // Mark that top bar needs update
  topBarNeedsUpdate = true;
}

void updateContent()
{
  bool needsUpdate = false;
  char buffer[100];

  // Initialize content area on first run (draw static elements once)
  if (!contentInitialized)
  {
    contentArea.fillScreen(TFT_BLUE);
    contentArea.setTextColor(TFT_WHITE, TFT_BLUE);
    contentArea.setTextSize(3);
    contentArea.drawString("LovyanGFX Multi-Sprite!", 50, 10);
    contentInitialized = true;
    needsUpdate = true;
  }

  // Display Main Mesh status
  if (mesh_status == -1)
  {
    lcd.setTextColor(TFT_RED);
    lcd.drawString("Main Mesh: OFFLINE", 50, 150);
  }
  else if (mesh_status == 0)
  {
    lcd.setTextColor(TFT_YELLOW);
    lcd.drawString("Main Mesh: STANDBY", 50, 150);
  }
  else
  {
    lcd.setTextColor(TFT_GREEN);
    lcd.drawString("Main Mesh: RUNNING", 50, 150);
  }
  lcd.setTextColor(TFT_WHITE);

  // Display Main Amp status
  if (amp_status == -1)
  {
    lcd.setTextColor(TFT_RED);
    lcd.drawString("Main Amp: OFFLINE", 50, 200);
  }
  else if (amp_status == 0)
  {
    lcd.setTextColor(TFT_YELLOW);
    lcd.drawString("Main Amp: STANDBY", 50, 200);
  }
  else
  {
    lcd.setTextColor(TFT_GREEN);
    lcd.drawString("Main Amp: PLAYING", 50, 200);
  }
  lcd.setTextColor(TFT_WHITE);

  // Display doorbell status
  if (doorbellStatus.data_valid)
  {
    if (doorbellOnline)
    {
      lcd.setTextColor(TFT_GREEN);
      lcd.drawString("Doorbell: ONLINE", 50, 250);
    }
    else
    {
      lcd.setTextColor(TFT_RED);
      lcd.drawString("Doorbell: OFFLINE", 50, 250);
    }

    // Show additional info if available
    if (doorbellOnline)
    {
      char buffer[50];
      sprintf(buffer, "RSSI: %d dBm", doorbellStatus.wifi_rssi);
      lcd.drawString(buffer, 50, 300);
    }
  }
  else
  {
    lcd.setTextColor(TFT_YELLOW);
    lcd.drawString("Doorbell: Checking...", 50, 250);
    lcd.setTextColor(TFT_WHITE);
  }
}

void updateTouch()
{
  // Only read if interrupt fired
  if (!touchDataReady)
    return;
  touchDataReady = false;

  GSLX680_read_data();

  // Update currentTouch struct
  if (ts_event.fingers > 0)
  {
    currentTouch.x = ts_event.x1 & 0x0FFF;
    currentTouch.y = ts_event.y1 & 0x0FFF;
    currentTouch.isPressed = true;
    currentTouch.timestamp = millis();
  }
  else
  {
    currentTouch.isPressed = false;
  }

  // Draw touch points DIRECTLY to LCD for immediate, responsive feedback
  if (ts_event.fingers >= 1)
  {
    lcd.fillCircle(ts_event.x1 & 0x0FFF, ts_event.y1 & 0x0FFF, 5, TFT_RED);
  }
  if (ts_event.fingers >= 2)
  {
    lcd.fillCircle(ts_event.x2 & 0x0FFF, ts_event.y2 & 0x0FFF, 5, TFT_GREEN);
  }
  if (ts_event.fingers >= 3)
  {
    lcd.fillCircle(ts_event.x3 & 0x0FFF, ts_event.y3 & 0x0FFF, 5, TFT_BLUE);
  }
  if (ts_event.fingers >= 4)
  {
    lcd.fillCircle(ts_event.x4 & 0x0FFF, ts_event.y4 & 0x0FFF, 5, TFT_CYAN);
  }
  if (ts_event.fingers >= 5)
  {
    lcd.fillCircle(ts_event.x5 & 0x0FFF, ts_event.y5 & 0x0FFF, 5, TFT_MAGENTA);
  }
}

void updateCapSensor()
{
  capSensorUpdate();

  // Example: Check specific pads
  // if (isPadPressed(0))
  // {
  //   Serial.println("Button 0 pressed!");
  //   lcd.fillCircle(100, 100, 20, TFT_YELLOW);
  // }
}

// Push sprites to display at controlled rate (50ms = 20 FPS max)
void pushSpritesToDisplay()
{
  // Push top bar if updated (small: 800x40 = 64KB, ~8ms transfer)
  if (topBarNeedsUpdate)
  {
    topBar.pushSprite(0, 0);
    topBarNeedsUpdate = false;
  }

  // Push content if updated (larger: 800x440 = 704KB, ~88ms transfer)
  if (contentNeedsUpdate)
  {
    contentArea.pushSprite(0, 40); // Position below top bar
    contentNeedsUpdate = false;
  }
}

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

// Draw WiFi symbol with signal strength indicator
void drawWifiSymbol(int x, int y, int strength)
{
  // strength: 0=very weak/off, 1=weak, 2=medium, 3=strong
  uint16_t color = (strength > 0) ? TFT_GREEN : TFT_RED;

  // Draw dot at center
  topBar.fillCircle(x, y, 2, color);

  // Draw arcs based on strength using drawArc(x, y, r0, r1, angle0, angle1, color)
  if (strength >= 1)
  {
    topBar.drawArc(x, y, 5, 6, 225, 315, color); // Smallest arc
  }
  if (strength >= 2)
  {
    topBar.drawArc(x, y, 9, 10, 225, 315, color); // Middle arc
  }
  if (strength >= 3)
  {
    topBar.drawArc(x, y, 13, 14, 225, 315, color); // Largest arc
  }
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
