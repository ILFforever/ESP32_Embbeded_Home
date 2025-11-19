#ifndef DISPLAY_CONFIG_H
#define DISPLAY_CONFIG_H

#include <LovyanGFX.hpp>
#include <Panel_RA8875_Fixed.h>

// ============================================================================
// Display Configuration with EastRising Fix
// ============================================================================

class LGFX : public lgfx::LGFX_Device
{
  lgfx::Panel_RA8875_Fixed _panel_instance;
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

// Touch position struct for application use
struct TouchPosition
{
  uint16_t x;
  uint16_t y;
  bool isPressed;
  uint32_t timestamp;
};

// Touch button struct for UI button areas
struct TouchButton
{
  uint16_t x;          // Top-left X coordinate
  uint16_t y;          // Top-left Y coordinate
  uint16_t width;      // Button width
  uint16_t height;     // Button height
  const char* label;   // Button label text
  uint16_t fgColor;    // Foreground (text) color
  uint16_t bgColor;    // Background color
  bool isPressed;      // Current press state
  void (*callback)();  // Function to call when pressed

  // Helper function to check if touch is within button bounds
  bool contains(uint16_t touchX, uint16_t touchY) const
  {
    return (touchX >= x && touchX <= (x + width) &&
            touchY >= y && touchY <= (y + height));
  }
};

#endif // DISPLAY_CONFIG_H
