//                            USER DEFINED SETTINGS
//   Custom setup for ESP32 WROOM with ST7789 LCD (right-side pins)
//
//   Copy this entire file and replace the contents of:
//   Arduino/libraries/TFT_eSPI/User_Setup.h

#define USER_SETUP_ID 18

// ##################################################################################
//
// Section 1. Call up the right driver file and any options for it
//
// ##################################################################################

// Only define one driver - ST7789 for your display
#define ST7789_DRIVER          // Enable ST7789 driver

// Leave color inversion and RGB order COMMENTED OUT - let library auto-detect
// Only uncomment if you have color issues after testing
// #define TFT_INVERSION_ON
// #define TFT_INVERSION_OFF
// #define TFT_RGB_ORDER TFT_RGB
// #define TFT_RGB_ORDER TFT_BGR

// ##################################################################################
//
// Section 2. Define the pins that are used to interface with the display here
//
// ##################################################################################

// ESP32 pins - using RIGHT SIDE pins for clean wiring
#define TFT_MOSI 23    // SDA/DIN pin
#define TFT_SCLK 22    // SCK/CLK pin
#define TFT_CS   21    // Chip select control pin
#define TFT_DC   19    // Data Command control pin
#define TFT_RST  18    // Reset pin (could connect to ESP32 RST pin)
//#define TFT_RST  -1  // Set TFT_RST to -1 if display RESET is connected to ESP32 board RST

// Optional: Backlight control (if you wired it to a GPIO pin)
// Since yours is connected to 3.3V directly, leave this commented out
// #define TFT_BL   17              // LED back-light control pin
// #define TFT_BACKLIGHT_ON HIGH    // Level to turn ON back-light (HIGH or LOW)

// ##################################################################################
//
// Section 3. Define the fonts that are to be used here
//
// ##################################################################################

// Load all fonts for maximum flexibility
#define LOAD_GLCD   // Font 1. Original Adafruit 8 pixel font needs ~1820 bytes in FLASH
#define LOAD_FONT2  // Font 2. Small 16 pixel high font, needs ~3534 bytes in FLASH, 96 characters
#define LOAD_FONT4  // Font 4. Medium 26 pixel high font, needs ~5848 bytes in FLASH, 96 characters
#define LOAD_FONT6  // Font 6. Large 48 pixel font, needs ~2666 bytes in FLASH, only characters 1234567890:-.apm
#define LOAD_FONT7  // Font 7. 7 segment 48 pixel font, needs ~2438 bytes in FLASH, only characters 1234567890:-.
#define LOAD_FONT8  // Font 8. Large 75 pixel font needs ~3256 bytes in FLASH, only characters 1234567890:-.
#define LOAD_GFXFF  // FreeFonts. Include access to the 48 Adafruit_GFX free fonts FF1 to FF48 and custom fonts

// Smooth font support
#define SMOOTH_FONT

// ##################################################################################
//
// Section 4. Other options
//
// ##################################################################################

// Define the SPI clock frequency
// Start with 27MHz like the working example
#define SPI_FREQUENCY  27000000  // 27MHz - stable and fast
// #define SPI_FREQUENCY  40000000  // 40MHz - can try if 27MHz works
// #define SPI_FREQUENCY  80000000  // 80MHz - maximum speed

// Optional reduced SPI frequency for reading TFT
#define SPI_READ_FREQUENCY  20000000

// Touch screen SPI frequency
#define SPI_TOUCH_FREQUENCY  2500000

// Transaction support - commented out like the working example
// #define SUPPORT_TRANSACTIONS

// ##################################################################################
//
// SETUP COMPLETE - Save this file and upload your sketch!
//
// ##################################################################################

/*
 * PIN SUMMARY for your reference:
 * ===============================
 * ESP32 WROOM (Right Side)  →  ST7789 LCD
 * 3V3                       →  VCC
 * GND                       →  GND
 * GPIO 23                   →  DIN/MOSI
 * GPIO 22                   →  CLK/SCLK
 * GPIO 21                   →  CS
 * GPIO 19                   →  DC
 * GPIO 18                   →  RST
 * (BL connected to 3.3V directly)
 * 
 * TROUBLESHOOTING:
 * ================
 * - If colors are inverted: Uncomment TFT_INVERSION_ON or TFT_INVERSION_OFF
 * - If red/blue swapped: Uncomment TFT_RGB_ORDER TFT_BGR
 * - If display is rotated: Use tft.setRotation(0-3) in your sketch
 * - If display flickers: Lower SPI_FREQUENCY to 20000000
 */