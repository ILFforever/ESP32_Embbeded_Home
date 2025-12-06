#pragma once

#include <LovyanGFX.hpp>
#include "lgfx/v1/panel/Panel_RA8875.hpp"

namespace lgfx
{
 inline namespace v1
 {
  // Custom Panel_RA8875 with RA8875 hardware acceleration fixes
  class Panel_RA8875_Fixed : public Panel_RA8875
  {
  public:
    Panel_RA8875_Fixed(void) : Panel_RA8875() {}

    // Override the broken writeFillRectPreclipped with our fixed version
    void writeFillRectPreclipped(uint_fast16_t x, uint_fast16_t y, uint_fast16_t w, uint_fast16_t h, uint32_t rawcolor) override
    {
      _xs = x;
      _xe = x + w - 1;
      _ys = y;
      _ye = y + h - 1;

      if (h == 1 && w <= 8)
      {
        _set_write_pos(x, y);
        writeBlock(rawcolor, w);
      }
      else
      {
        // Handle rotation first
        uint_fast8_t r = _internal_rotation;
        if (r)
        {
          if ((1u << r) & 0b10010110) { y = _height - (y + h); }
          if (r & 2)                  { x = _width  - (x + w); }
          if (r & 1) { std::swap(x, y);  std::swap(w, h); }
        }

        x += _colstart;
        y += _rowstart;

        // Calculate END coordinates (RA8875 hardware uses X0,Y0 to X1,Y1)
        uint16_t x1 = x + w - 1;
        uint16_t y1 = y + h - 1;

        // Write X0 (start X) to registers 0x91, 0x92
        _write_reg(0x91, x & 0xFF);
        _write_reg(0x92, x >> 8);

        // Write Y0 (start Y) to registers 0x93, 0x94
        _write_reg(0x93, y & 0xFF);
        _write_reg(0x94, y >> 8);

        // Write X1 (end X) to registers 0x95, 0x96
        _write_reg(0x95, x1 & 0xFF);
        _write_reg(0x96, x1 >> 8);

        // Write Y1 (end Y) to registers 0x97, 0x98
        _write_reg(0x97, y1 & 0xFF);
        _write_reg(0x98, y1 >> 8);

        // Set color registers 0x63-0x65 (R, G, B)
        // LovyanGFX may pass byte-swapped colors, so unswap first to get native RGB565
        if (_write_depth == rgb565_2Byte)
        {
          // Unswap the color to get native RGB565 format
          uint16_t color565 = getSwap16(rawcolor);

          // Extract RGB components from RGB565 (RRRRRGGGGGGBBBBB)
          _write_reg(0x63, (color565 & 0xF800) >> 11);  // Red (bits 15-11) -> 5 bits
          _write_reg(0x64, (color565 & 0x07E0) >> 5);   // Green (bits 10-5) -> 6 bits
          _write_reg(0x65, (color565 & 0x001F));        // Blue (bits 4-0) -> 5 bits
        }
        else
        {
          _write_reg(0x63, rawcolor >> 5);
          _write_reg(0x64, rawcolor >> 2);
          _write_reg(0x65, rawcolor);
        }

        // Issue draw command: register 0x90 (DCR) = 0xB0 for filled rectangle
        _write_reg(0x90, 0xB0);

        // Simple delay instead of polling to avoid hanging
        delayMicroseconds(100);

        _latestcolor = rawcolor;
      }
    }
  };
 }
}
