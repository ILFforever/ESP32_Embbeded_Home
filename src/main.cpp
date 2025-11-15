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

Task taskDisplayUpdate(TASK_SECOND * 5, TASK_FOREVER, &DisplayUpdate);
Task taskTouchUpdate(20, TASK_FOREVER, &updateTouch);
Task taskCapSensorUpdate(100, TASK_FOREVER, &updateCapSensor);
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

  // Setup scheduler tasks
  scheduler.addTask(taskDisplayUpdate);
  scheduler.addTask(taskTouchUpdate);
  scheduler.addTask(taskCapSensorUpdate);

  taskDisplayUpdate.enable();
  taskTouchUpdate.enable();
  taskCapSensorUpdate.enable();
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
  lcd.drawString("LovyanGFX Sprite Example", 50, 50);
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
