/*
 * LovyanGFX Sprite Examples for RA8875
 *
 * Hardware: ESP32 + EastRising RA8875 800x480 Display
 */

#define LGFX_USE_V1
#include <LovyanGFX.hpp>
#include <Panel_RA8875_Fixed.h>
#include "TaskScheduler.h"

// ============================================================================
// Display Configuration with EastRising Fix
// ============================================================================

class LGFX : public lgfx::LGFX_Device
{
  lgfx::Panel_RA8875_Fixed _panel_instance; // Use our fixed version
  lgfx::Bus_SPI _bus_instance;
  lgfx::Light_PWM _light_instance;

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

    {
      auto cfg = _light_instance.config();
      cfg.pin_bl = -1;
      cfg.invert = false;
      _light_instance.config(cfg);
      _panel_instance.setLight(&_light_instance);
    }

    setPanel(&_panel_instance);
  }
};

static LGFX lcd;
Scheduler scheduler;

// ============================================================================
// Sprite Examples
// ============================================================================
void DisplayUpdate();

Task taskDisplayUpdate(TASK_SECOND * 0.05, TASK_FOREVER, &DisplayUpdate);

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
  Serial.println("Display ready!\n");

  scheduler.addTask(taskDisplayUpdate);
  taskDisplayUpdate.enable();
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
}