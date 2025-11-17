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
#include "TaskFunctions.h"
#include "wifi_functions.h"
#include "WiFi.h"

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

void IRAM_ATTR touchISR()
{
  touchDataReady = true;
}

// ============================================================================
// Task Definitions
// ============================================================================
void DisplayUpdate();
void updateTopBar();
void updateContent();
void updateTouch();
void updateCapSensor();
void pushSpritesToDisplay();
void sendHeartbeatTask();
void checkDoorbellTask();
void checkDoorbellRingTask();
void onDoorbellRing();
void drawWifiSymbol(int x, int y, int strength);

Task taskUpdateTopBar(1000, TASK_FOREVER, &updateTopBar);
Task taskUpdateContent(TASK_SECOND * 10, TASK_FOREVER, &updateContent);
Task taskTouchUpdate(20, TASK_FOREVER, &updateTouch);
Task taskCapSensorUpdate(100, TASK_FOREVER, &updateCapSensor);
Task taskPushSprites(50, TASK_FOREVER, &pushSpritesToDisplay);          // Every 50ms = 20 FPS max
Task taskSendHeartbeat(60000, TASK_FOREVER, &sendHeartbeatTask);        // Every 60s
Task taskCheckDoorbell(60000, TASK_FOREVER, &checkDoorbellTask);        // Every 60s
Task taskCheckDoorbellRing(1000, TASK_FOREVER, &checkDoorbellRingTask); // Every 1s - Poll for doorbell rings
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

  // Initialize heartbeat module (WiFi already initialized by wifi_init())
  initHeartbeat(
    "http://embedded-smarthome.fly.dev",   // Backend URL
    "hb_001",                              // Hub device ID
    "hub",                                  // Device type
    "f59ac83960ac8d7cd4fdc2915af85ed30ce562b410cfc0217b88b6fd2f7c4739", // Hub API token
    "db_001"                                // Doorbell device ID to monitor
  );

  // Register doorbell ring callback
  setDoorbellRingCallback(onDoorbellRing);

  // Setup scheduler tasks
  scheduler.addTask(taskUpdateTopBar);
  scheduler.addTask(taskUpdateContent);
  scheduler.addTask(taskTouchUpdate);
  scheduler.addTask(taskCapSensorUpdate);
  scheduler.addTask(taskPushSprites);
  scheduler.addTask(taskSendHeartbeat);
  scheduler.addTask(taskCheckDoorbell);
  scheduler.addTask(taskCheckDoorbellRing);

  taskUpdateTopBar.enable();
  taskUpdateContent.enable();
  taskTouchUpdate.enable();
  taskCapSensorUpdate.enable();
  taskPushSprites.enable();
  taskSendHeartbeat.enable();
  taskCheckDoorbell.enable();
  taskCheckDoorbellRing.enable();
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
  if (doorbellStatus.data_valid) {
    if (doorbellOnline) {
      topBar.setTextColor(TFT_GREEN, TFT_WHITE);
      topBar.drawString("DB: ON", 600, 10);
      topBar.setTextColor(TFT_BLACK, TFT_WHITE);
    } else {
      topBar.setTextColor(TFT_RED, TFT_WHITE);
      topBar.drawString("DB: OFF", 600, 10);
      topBar.setTextColor(TFT_BLACK, TFT_WHITE);
    }
  } else {
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
  // Update content area periodically
  contentArea.fillScreen(TFT_BLUE);
  contentArea.setTextColor(TFT_WHITE, TFT_BLUE);
  contentArea.setTextSize(3);
  contentArea.drawString("LovyanGFX Multi-Sprite!", 50, 10);

  // Display system info
  contentArea.setTextSize(2);
  char buffer[100];
  sprintf(buffer, "Free Heap: %d bytes", ESP.getFreeHeap());
  contentArea.drawString(buffer, 50, 100);

  sprintf(buffer, "Free PSRAM: %d bytes", ESP.getFreePsram());
  contentArea.drawString(buffer, 50, 130);

  // Display detailed doorbell info
  if (doorbellStatus.data_valid && doorbellOnline) {
    sprintf(buffer, "Doorbell RSSI: %d dBm", doorbellStatus.wifi_rssi);
    contentArea.drawString(buffer, 50, 160);
  }

  // Display doorbell ring notification (large, centered)
  if (doorbellJustRang && (millis() - doorbellRingTime < RING_NOTIFICATION_DURATION)) {
    // Draw large notification
    contentArea.fillRect(100, 200, 600, 100, TFT_RED);
    contentArea.setTextColor(TFT_WHITE, TFT_RED);
    contentArea.setTextSize(5);
    contentArea.drawString("DOORBELL RINGING!", 150, 220);

    contentArea.setTextSize(3);
    contentArea.setTextColor(TFT_YELLOW, TFT_RED);
    contentArea.drawString("Someone is at the door", 200, 270);
  } else if (doorbellJustRang) {
    // Clear notification after duration
    doorbellJustRang = false;
  }

  // Mark that content needs update
  contentNeedsUpdate = true;
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

// Task: Check for doorbell ring events (polls every 1 second)
void checkDoorbellRingTask()
{
  checkDoorbellRing();
}

// Callback: Called when doorbell rings
void onDoorbellRing()
{
  Serial.println("[Hub] 🔔 DOORBELL RANG! Playing notification...");

  // Set flag for visual notification
  doorbellJustRang = true;
  doorbellRingTime = millis();
  contentNeedsUpdate = true; // Trigger content area update

  // TODO: Add audio playback here when audio hardware is connected
  // Example: playDoorbellSound();
  // or send command to audio module via UART/I2C
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
