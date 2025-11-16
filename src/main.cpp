/*
 * LovyanGFX Sprite Examples for RA8875
 *
 * Hardware: ESP32 + EastRising RA8875 800x480 Display
 */

#define LGFX_USE_V1
#include <LovyanGFX.hpp>
#include <Wire.h>
#include <Touch.h>
#include <CapSensor.h>
#include "hub_network.h"
// ============================================================================
// Global Objects
// ============================================================================

static LGFX lcd;
Scheduler scheduler;

// Sprites for better performance
LGFX_Sprite topBar(&lcd);      // Top status bar (800x40)
LGFX_Sprite contentArea(&lcd); // Main content area (800x440)

// Touch state
TouchPosition currentTouch = {0, 0, false, 0};
volatile bool touchDataReady = false;

// Doorbell status
DeviceStatus doorbellStatus;
bool doorbellOnline = false;

void IRAM_ATTR touchISR()
{
  touchDataReady = true;
}

// ============================================================================
// Task Definitions
// ============================================================================
void DisplayUpdate();
void updateTouch();
void updateCapSensor();
void sendHeartbeatTask();
void checkDoorbellTask();

Task taskUpdateTopBar(1000, TASK_FOREVER, &updateTopBar);
Task taskUpdateContent(TASK_SECOND * 10, TASK_FOREVER, &updateContent);
Task taskTouchUpdate(20, TASK_FOREVER, &updateTouch);
Task taskCapSensorUpdate(100, TASK_FOREVER, &updateCapSensor);
Task taskSendHeartbeat(60000, TASK_FOREVER, &sendHeartbeatTask);        // Every 60s
Task taskCheckDoorbell(60000, TASK_FOREVER, &checkDoorbellTask);        // Every 60s
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

  // Initialize network and heartbeat
  // TODO: Update WiFi credentials and device tokens
  initNetwork(
    "YOUR_WIFI_SSID",                       // WiFi SSID
    "YOUR_WIFI_PASSWORD",                   // WiFi password
    "http://embedded-smarthome.fly.dev",   // Backend URL
    "hub_001",                              // Hub device ID
    "hub",                                  // Device type
    "YOUR_HUB_TOKEN_HERE",                 // Hub API token (from registration)
    "db_001"                                // Doorbell device ID to monitor
  );

  // Setup scheduler tasks
  scheduler.addTask(taskUpdateTopBar);
  scheduler.addTask(taskUpdateContent);
  scheduler.addTask(taskTouchUpdate);
  scheduler.addTask(taskCapSensorUpdate);
  scheduler.addTask(taskSendHeartbeat);
  scheduler.addTask(taskCheckDoorbell);

  taskUpdateTopBar.enable();
  taskUpdateContent.enable();
  taskTouchUpdate.enable();
  taskCapSensorUpdate.enable();
  taskSendHeartbeat.enable();
  taskCheckDoorbell.enable();
}

void loop(void)
{
  scheduler.execute();
}

void updateTopBar()
{
  static uint32_t secondCounter = 0;

  if (num > 3)
  {
    num = 1;
  }

  // Display hub info
  lcd.drawString("ESP32 Hub - Control Center", 50, 50);

  // Display WiFi status
  if (isWiFiConnected()) {
    lcd.drawString("WiFi: Connected", 50, 100);
  } else {
    lcd.drawString("WiFi: Disconnected", 50, 100);
  }

  // Display doorbell status
  if (doorbellStatus.data_valid) {
    if (doorbellOnline) {
      lcd.setTextColor(TFT_GREEN);
      lcd.drawString("Doorbell: ONLINE", 50, 150);
    } else {
      lcd.setTextColor(TFT_RED);
      lcd.drawString("Doorbell: OFFLINE", 50, 150);
    }
    lcd.setTextColor(TFT_WHITE);

    // Show additional info if available
    if (doorbellOnline) {
      char buffer[50];
      sprintf(buffer, "RSSI: %d dBm", doorbellStatus.wifi_rssi);
      lcd.drawString(buffer, 50, 200);
    }
  } else {
    lcd.setTextColor(TFT_YELLOW);
    lcd.drawString("Doorbell: Checking...", 50, 150);
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
