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
#include <Touch.h>
#include <CapSensor.h>
#include "hub_network.h"
#include "uart_slaves.h"

// ============================================================================
// UART Pin Configuration
// ============================================================================
#define MESH_RX 26  // Main Mesh UART RX
#define MESH_TX 25  // Main Mesh UART TX
#define AMP_RX 4    // Main Amp UART RX
#define AMP_TX 33   // Main Amp UART TX
#define UART_BAUD 115200

#define PONG_TIMEOUT 10000  // 10 seconds timeout for ping-pong

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
void checkMeshUARTData();
void checkAmpUARTData();
void sendMeshPingTask();
void sendAmpPingTask();
void checkMeshTimeout();
void checkAmpTimeout();

Task taskDisplayUpdate(TASK_SECOND * 5, TASK_FOREVER, &DisplayUpdate);
Task taskTouchUpdate(20, TASK_FOREVER, &updateTouch);
Task taskCapSensorUpdate(100, TASK_FOREVER, &updateCapSensor);
Task taskSendHeartbeat(60000, TASK_FOREVER, &sendHeartbeatTask);        // Every 60s
Task taskCheckDoorbell(60000, TASK_FOREVER, &checkDoorbellTask);        // Every 60s
Task taskCheckMeshUART(20, TASK_FOREVER, &checkMeshUARTData);           // Check Mesh UART every 20ms
Task taskCheckAmpUART(20, TASK_FOREVER, &checkAmpUARTData);             // Check Amp UART every 20ms
Task taskSendMeshPing(1000, TASK_FOREVER, &sendMeshPingTask);           // Send ping every 1s
Task taskSendAmpPing(1000, TASK_FOREVER, &sendAmpPingTask);             // Send ping every 1s
Task taskCheckMeshTimeout(1000, TASK_FOREVER, &checkMeshTimeout);       // Check timeout every 1s
Task taskCheckAmpTimeout(1000, TASK_FOREVER, &checkAmpTimeout);         // Check timeout every 1s
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
  scheduler.addTask(taskDisplayUpdate);
  scheduler.addTask(taskTouchUpdate);
  scheduler.addTask(taskCapSensorUpdate);
  scheduler.addTask(taskSendHeartbeat);
  scheduler.addTask(taskCheckDoorbell);
  scheduler.addTask(taskCheckMeshUART);
  scheduler.addTask(taskCheckAmpUART);
  scheduler.addTask(taskSendMeshPing);
  scheduler.addTask(taskSendAmpPing);
  scheduler.addTask(taskCheckMeshTimeout);
  scheduler.addTask(taskCheckAmpTimeout);

  taskDisplayUpdate.enable();
  taskTouchUpdate.enable();
  taskCapSensorUpdate.enable();
  taskSendHeartbeat.enable();
  taskCheckDoorbell.enable();
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
  if (isWiFiConnected()) {
    lcd.drawString("WiFi: Connected", 50, 100);
  } else {
    lcd.drawString("WiFi: Disconnected", 50, 100);
  }

  // Display Main Mesh status
  if (mesh_status == -1) {
    lcd.setTextColor(TFT_RED);
    lcd.drawString("Main Mesh: OFFLINE", 50, 150);
  } else if (mesh_status == 0) {
    lcd.setTextColor(TFT_YELLOW);
    lcd.drawString("Main Mesh: STANDBY", 50, 150);
  } else {
    lcd.setTextColor(TFT_GREEN);
    lcd.drawString("Main Mesh: RUNNING", 50, 150);
  }
  lcd.setTextColor(TFT_WHITE);

  // Display Main Amp status
  if (amp_status == -1) {
    lcd.setTextColor(TFT_RED);
    lcd.drawString("Main Amp: OFFLINE", 50, 200);
  } else if (amp_status == 0) {
    lcd.setTextColor(TFT_YELLOW);
    lcd.drawString("Main Amp: STANDBY", 50, 200);
  } else {
    lcd.setTextColor(TFT_GREEN);
    lcd.drawString("Main Amp: PLAYING", 50, 200);
  }
  lcd.setTextColor(TFT_WHITE);

  // Display doorbell status
  if (doorbellStatus.data_valid) {
    if (doorbellOnline) {
      lcd.setTextColor(TFT_GREEN);
      lcd.drawString("Doorbell: ONLINE", 50, 250);
    } else {
      lcd.setTextColor(TFT_RED);
      lcd.drawString("Doorbell: OFFLINE", 50, 250);
    }
    lcd.setTextColor(TFT_WHITE);

    // Show additional info if available
    if (doorbellOnline) {
      char buffer[50];
      sprintf(buffer, "RSSI: %d dBm", doorbellStatus.wifi_rssi);
      lcd.drawString(buffer, 50, 300);
    }
  } else {
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
