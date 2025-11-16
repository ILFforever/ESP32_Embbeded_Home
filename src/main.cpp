/*
 * LovyanGFX Sprite Examples for RA8875
 *
 * Hardware: ESP32 + EastRising RA8875 800x480 Display
 */

#define LGFX_USE_V1
#include <LovyanGFX.hpp>
#include <Panel_RA8875_Fixed.h>
#include "TaskScheduler.h"
#include <Wire.h>
#include <WiFi.h>
#include <Touch.h>
#include <CapSensor.h>
#include "hub_network.h"
// ============================================================================
// Display Configuration with EastRising Fix
// ============================================================================

lgfx::touch_point_t tp;

class LGFX : public lgfx::LGFX_Device
{
  lgfx::Panel_RA8875_Fixed _panel_instance; // Use our fixed version
  lgfx::Bus_SPI _bus_instance;

public:
  LGFX(void)
  {
    {
      auto cfg = _bus_instance.config();
      cfg.spi_host = VSPI_HOST;
      cfg.freq_write = 4000000;
      cfg.freq_read = 4000000;
      cfg.pin_sclk = 18;
      cfg.pin_mosi = 23;
      cfg.pin_miso = 19;
      cfg.spi_3wire = false;
      _bus_instance.config(cfg);
      _panel_instance.setBus(&_bus_instance);
    }

    {
      auto cfg = _panel_instance.config();
      cfg.pin_cs = 5;
      cfg.pin_rst = 16;
      cfg.pin_busy = -1;
      cfg.panel_width = 800;
      cfg.panel_height = 480;
      cfg.memory_width = 800;
      cfg.memory_height = 480;
      cfg.offset_x = 0;
      cfg.offset_y = 0;
      cfg.dummy_read_pixel = 16;
      cfg.dummy_read_bits = 0;
      cfg.readable = false;
      _panel_instance.config(cfg);
    }

    setPanel(&_panel_instance);
  }
};

static LGFX lcd;
Scheduler scheduler;

// Touch position struct for application use
struct TouchPosition
{
  uint16_t x;
  uint16_t y;
  bool isPressed;
  uint32_t timestamp;
};

TouchPosition currentTouch = {0, 0, false, 0};

// Touch interrupt flag
volatile bool touchDataReady = false;

// Doorbell status
DeviceStatus doorbellStatus;
bool doorbellOnline = false;

void IRAM_ATTR touchISR()
{
  touchDataReady = true;
}

// ============================================================================
// Task Functions
// ============================================================================
void DisplayUpdate();
void updateTouch();
void updateCapSensor();
void sendHeartbeatTask();
void checkDoorbellTask();

Task taskDisplayUpdate(TASK_SECOND * 5, TASK_FOREVER, &DisplayUpdate);
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

  Serial.println("Initializing display...");
  lcd.init();
  lcd.setRotation(2);
  Serial.println("Display ready!\n");

  // Initialize I2C (shared by touch screen and capacitive sensor)
  Wire.begin(); // SDA=21, SCL=22 (default ESP32 pins)

  // Initialize touch screen (uses I2C)
  touchsetup();

  // Setup touch interrupt
  pinMode(GSL1680_INT, INPUT);
  attachInterrupt(digitalPinToInterrupt(GSL1680_INT), touchISR, RISING);
  Serial.println("Touch interrupt enabled on pin 34");

  // Initialize capacitive sensor (uses same I2C bus)
  // Try a few times
  for (int i = 0; i < 3; i++)
  {
    if (!capSensorSetup())
      Serial.println("Warning: Capacitive sensor initialization failed!");
    else
      break;
  }

  // Initialize WiFi
  // TODO: Update WiFi credentials
  Serial.println("\n[WiFi] Connecting...");
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin("YOUR_WIFI_SSID", "YOUR_WIFI_PASSWORD");

  int timeout = 20;
  while (WiFi.status() != WL_CONNECTED && timeout > 0) {
    delay(500);
    Serial.print(".");
    timeout--;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] ✓ Connected!");
    Serial.printf("  IP: %s\n", WiFi.localIP().toString().c_str());
    Serial.printf("  RSSI: %d dBm\n", WiFi.RSSI());
  } else {
    Serial.println("\n[WiFi] ✗ Connection Failed!");
  }

  // Initialize heartbeat module (WiFi must be connected first)
  // TODO: Update device tokens
  initHeartbeat(
    "http://embedded-smarthome.fly.dev",   // Backend URL
    "hub_001",                              // Hub device ID
    "hub",                                  // Device type
    "YOUR_HUB_TOKEN_HERE",                 // Hub API token (from registration)
    "db_001"                                // Doorbell device ID to monitor
  );

  // Setup scheduler tasks
  scheduler.addTask(taskDisplayUpdate);
  scheduler.addTask(taskTouchUpdate);
  scheduler.addTask(taskCapSensorUpdate);
  scheduler.addTask(taskSendHeartbeat);
  scheduler.addTask(taskCheckDoorbell);

  taskDisplayUpdate.enable();
  taskTouchUpdate.enable();
  taskCapSensorUpdate.enable();
  taskSendHeartbeat.enable();
  taskCheckDoorbell.enable();
}

void loop(void)
{
  scheduler.execute();
}

// This function renders the display and handles touch
void DisplayUpdate()
{
  static int num = 1;
  switch (num)
  {
  case 1:
    lcd.fillScreen(TFT_GREEN);
    num++;
    break;
  case 2:
    lcd.fillScreen(TFT_RED);
    num++;
    break;
  case 3:
    lcd.fillScreen(TFT_BLUE);
    num++;
    break;
  }

  if (num > 3)
  {
    num = 1;
  }

  // Display hub info
  lcd.drawString("ESP32 Hub - Control Center", 50, 50);

  // Display WiFi status
  if (WiFi.status() == WL_CONNECTED) {
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

  if (ts_event.fingers == 1)
  {
    lcd.fillCircle(ts_event.x1 & 0x0FFF, ts_event.y1 & 0x0FFF, 5, TFT_RED);
  }
  if (ts_event.fingers == 2)
  {
    lcd.fillCircle(ts_event.x1 & 0x0FFF, ts_event.y1 & 0x0FFF, 5, TFT_RED);
    lcd.fillCircle(ts_event.x2 & 0x0FFF, ts_event.y2 & 0x0FFF, 5, TFT_GREEN);
  }
  if (ts_event.fingers == 3)
  {
    lcd.fillCircle(ts_event.x1 & 0x0FFF, ts_event.y1 & 0x0FFF, 5, TFT_RED);
    lcd.fillCircle(ts_event.x2 & 0x0FFF, ts_event.y2 & 0x0FFF, 5, TFT_GREEN);
    lcd.fillCircle(ts_event.x3 & 0x0FFF, ts_event.y3 & 0x0FFF, 5, TFT_BLUE);
  }
  if (ts_event.fingers == 4)
  {
    lcd.fillCircle(ts_event.x1 & 0x0FFF, ts_event.y1 & 0x0FFF, 5, TFT_RED);
    lcd.fillCircle(ts_event.x2 & 0x0FFF, ts_event.y2 & 0x0FFF, 5, TFT_GREEN);
    lcd.fillCircle(ts_event.x3 & 0x0FFF, ts_event.y3 & 0x0FFF, 5, TFT_BLUE);
    lcd.fillCircle(ts_event.x4 & 0x0FFF, ts_event.y4 & 0x0FFF, 5, TFT_CYAN);
  }
  if (ts_event.fingers == 5)
  {
    lcd.fillCircle(ts_event.x1 & 0x0FFF, ts_event.y1 & 0x0FFF, 5, TFT_RED);
    lcd.fillCircle(ts_event.x2 & 0x0FFF, ts_event.y2 & 0x0FFF, 5, TFT_GREEN);
    lcd.fillCircle(ts_event.x3 & 0x0FFF, ts_event.y3 & 0x0FFF, 5, TFT_BLUE);
    lcd.fillCircle(ts_event.x4 & 0x0FFF, ts_event.y4 & 0x0FFF, 5, TFT_CYAN);
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
