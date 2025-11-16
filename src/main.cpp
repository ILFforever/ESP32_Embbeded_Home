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
      cfg.freq_write = 40000000;
      cfg.freq_read = 40000000;
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
      cfg.pin_rst = -1;
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

// Create two sprites for better performance
LGFX_Sprite topBar(&lcd);      // Top status bar (800x40)
LGFX_Sprite contentArea(&lcd);  // Main content area (800x440)

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

// Sprite update flags
volatile bool topBarNeedsUpdate = false;
volatile bool contentNeedsUpdate = false;

void IRAM_ATTR touchISR()
{
  touchDataReady = true;
}

// ============================================================================
// Task Functions
// ============================================================================
void updateTopBar();
void updateContent();
void updateTouch();
void updateCapSensor();
void pushSpritesToDisplay();

Task taskUpdateTopBar(1000, TASK_FOREVER, &updateTopBar);  // Update top bar every 1 second (time display)
Task taskUpdateContent(TASK_SECOND * 10, TASK_FOREVER, &updateContent);  // Update content every 10 seconds
Task taskTouchUpdate(20, TASK_FOREVER, &updateTouch);
Task taskCapSensorUpdate(250, TASK_FOREVER, &updateCapSensor);
Task taskPushSprites(50, TASK_FOREVER, &pushSpritesToDisplay);  // Push sprites at 20 FPS
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
    Serial.println("WARNING: PSRAM not found! Large sprites may fail.");
  }

  Serial.println("Initializing display...");
  lcd.init();
  lcd.setRotation(2);
  Serial.println("Display ready!\n");

  // Create two sprites in PSRAM for better performance
  Serial.println("Creating sprites in PSRAM...");

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
    topBar.fillScreen(TFT_BLACK);
    topBar.setTextColor(TFT_WHITE, TFT_BLACK);
    topBar.setTextSize(2);
    topBar.setCursor(350, 10);
    topBar.print("12:00:00");
    topBar.pushSprite(0, 0);

    // Initialize content area
    contentArea.fillScreen(TFT_BLUE);
    contentArea.setTextColor(TFT_WHITE, TFT_BLUE);
    contentArea.setTextSize(3);
    contentArea.drawString("LovyanGFX Multi-Sprite!", 50, 10);
    contentArea.pushSprite(0, 40);  // Below top bar
  }
  else
  {
    Serial.println("ERROR: Failed to create sprites!");
  }

  Serial.println();

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

  // Setup scheduler tasks
  scheduler.addTask(taskUpdateTopBar);
  scheduler.addTask(taskUpdateContent);
  scheduler.addTask(taskTouchUpdate);
  scheduler.addTask(taskCapSensorUpdate);
  scheduler.addTask(taskPushSprites);

  taskUpdateTopBar.enable();
  taskUpdateContent.enable();
  taskTouchUpdate.enable();
  taskCapSensorUpdate.enable();
  taskPushSprites.enable();
}

void loop(void)
{
  scheduler.execute();
}

void updateTopBar()
{
  static uint32_t secondCounter = 0;

  // Clear the top bar
  topBar.fillScreen(TFT_BLACK);
  topBar.setTextColor(TFT_WHITE, TFT_BLACK);
  topBar.setTextSize(2);

  // Format time as HH:MM:SS
  uint32_t hours = (secondCounter / 3600) % 24;
  uint32_t minutes = (secondCounter / 60) % 60;
  uint32_t seconds = secondCounter % 60;

  char timeStr[9];
  sprintf(timeStr, "%02d:%02d:%02d", hours, minutes, seconds);

  // Center the time (roughly centered for 8-char string with textSize 2)
  topBar.setCursor(350, 10);
  topBar.print(timeStr);

  // Mark for update
  topBarNeedsUpdate = true;

  secondCounter++;
}

void updateContent()
{
  static int colorIndex = 0;
  uint32_t colors[] = {TFT_BLUE, TFT_GREEN, TFT_RED, TFT_CYAN, TFT_MAGENTA, TFT_YELLOW};

  // Fill content area with rotating colors
  contentArea.fillScreen(colors[colorIndex]);
  contentArea.setTextColor(TFT_WHITE, colors[colorIndex]);
  contentArea.setTextSize(3);
  contentArea.drawString("LovyanGFX Multi-Sprite!", 50, 10);

  // Show memory info
  contentArea.setTextSize(2);
  char psramStr[40];
  sprintf(psramStr, "Free PSRAM: %d bytes", ESP.getFreePsram());
  contentArea.drawString(psramStr, 50, 60);

  char heapStr[40];
  sprintf(heapStr, "Free Heap: %d bytes", ESP.getFreeHeap());
  contentArea.drawString(heapStr, 50, 90);

  // Mark for update
  contentNeedsUpdate = true;

  colorIndex = (colorIndex + 1) % 6;
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
    contentArea.pushSprite(0, 40);  // Position below top bar
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
