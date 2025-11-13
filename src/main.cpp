/*
 * LovyanGFX Sprite Examples for RA8875
 *
 * Hardware: ESP32 + EastRising RA8875 800x480 Display
 */

#define LGFX_USE_V1
#include <LovyanGFX.hpp>
#include <Panel_RA8875_Fixed.h>

// ============================================================================
// Display Configuration with EastRising Fix
// ============================================================================

class LGFX : public lgfx::LGFX_Device
{
  lgfx::Panel_RA8875_Fixed  _panel_instance;  // Use our fixed version
  lgfx::Bus_SPI       _bus_instance;
  lgfx::Light_PWM     _light_instance;

public:
  LGFX(void)
  {
    {
      auto cfg = _bus_instance.config();
      cfg.spi_host = VSPI_HOST;
      cfg.freq_write = 2000000;
      cfg.freq_read  = 2000000;
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
      cfg.dummy_read_bits  = 0;
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

// ============================================================================
// Sprite Examples
// ============================================================================

// Example 1: Basic Sprite Creation and Drawing
void example1_basicSprite() {
  Serial.println("\n=== Example 1: Basic Sprite ===");

  lcd.fillScreen(TFT_BLACK);

  // Create title bar sprite (workaround for direct text rendering issue)
  lgfx::LGFX_Sprite titleBar(&lcd);

  // Try to create sprite and check if it succeeded
  bool success = titleBar.createSprite(800, 70);
  if (!success) {
    Serial.println("ERROR: Failed to create title bar sprite!");
    Serial.printf("Free heap: %d bytes\n", ESP.getFreeHeap());
    return;
  }

  titleBar.fillSprite(TFT_BLACK);
  titleBar.setTextColor(TFT_WHITE);

  // Use built-in smooth font instead of bitmap font
  titleBar.setFont(&fonts::FreeSansBold18pt7b);
  titleBar.drawString("Example 1: Basic Sprite", 10, 30);

  titleBar.pushSprite(0, 0);
  titleBar.deleteSprite();

  // Create a sprite (in-memory buffer)
  lgfx::LGFX_Sprite sprite(&lcd);
  sprite.createSprite(150, 150);  // 150x150 pixel sprite

  // Draw into the sprite
  sprite.fillSprite(TFT_BLUE);
  sprite.fillCircle(75, 75, 60, TFT_RED);
  sprite.setTextColor(TFT_WHITE);
  sprite.setTextDatum(middle_center);

  // Use a nice font for the sprite text
  sprite.setFont(&fonts::FreeSansBold12pt7b);
  sprite.drawString("Sprite!", 75, 75);

  // Push sprite to display at position (100, 100)
  sprite.pushSprite(100, 100);

  // Move the sprite around - clear old position before drawing new
  int prevX = 100, prevY = 100;
  for (int i = 1; i <= 5; i++) {
    delay(500);

    int newX = 100 + i * 50;
    int newY = 100 + i * 30;

    // Clear old position by filling with background color (BLACK in this example)
    lcd.fillRect(prevX, prevY, 150, 150, TFT_BLACK);

    // Draw at new position
    sprite.pushSprite(newX, newY);

    prevX = newX;
    prevY = newY;
  }

  // Clean up
  sprite.deleteSprite();

  delay(2000);
}

// Example 2: Sprite with Transparency
void example2_transparentSprite() {
  Serial.println("\n=== Example 2: Transparent Sprite ===");

  lcd.fillScreen(TFT_BLACK);

  // Create title bar sprite (workaround for direct text rendering issue)
  lgfx::LGFX_Sprite titleBar(&lcd);
  titleBar.createSprite(800, 40);
  titleBar.fillSprite(TFT_WHITE);
  titleBar.setTextColor(TFT_BLACK);
  titleBar.setTextSize(2);
  titleBar.drawString("Example 2: Transparency", 10, 10);
  titleBar.pushSprite(0, 0);
  titleBar.deleteSprite();

  // Draw a gradient background
  for (int y = 50; y < 400; y++) {
    uint16_t color = lcd.color565(0, y / 2, 255 - y / 2);
    lcd.drawFastHLine(0, y, 800, color);
  }

  // Create sprite with transparency
  lgfx::LGFX_Sprite sprite(&lcd);
  sprite.createSprite(200, 200);

  // Set transparent color (black will be transparent)
  sprite.fillSprite(TFT_BLACK);  // This color becomes transparent

  // Draw a circle with no background
  sprite.fillCircle(100, 100, 80, TFT_RED);
  sprite.fillCircle(100, 100, 60, TFT_YELLOW);
  sprite.fillCircle(100, 100, 40, TFT_GREEN);

  // Push with transparency (black pixels won't be drawn)
  sprite.pushSprite(300, 150, TFT_BLACK);  // TFT_BLACK is transparent

  sprite.deleteSprite();
  delay(3000);
}

// Example 3: Animated Sprite (Bouncing Ball)
void example3_animatedSprite() {
  Serial.println("\n=== Example 3: Animated Sprite ===");

  lcd.fillScreen(TFT_DARKGREY);

  // Create title bar sprite (workaround for direct text rendering issue)
  lgfx::LGFX_Sprite titleBar(&lcd);
  titleBar.createSprite(800, 40);
  titleBar.fillSprite(TFT_DARKGREY);
  titleBar.setTextColor(TFT_WHITE);
  titleBar.setTextSize(2);
  titleBar.drawString("Example 3: Animation", 10, 10);
  titleBar.pushSprite(0, 0);
  titleBar.deleteSprite();

  // Create ball sprite
  lgfx::LGFX_Sprite ball(&lcd);
  ball.createSprite(50, 50);
  ball.fillSprite(TFT_BLACK);  // Transparent background
  ball.fillCircle(25, 25, 24, TFT_RED);
  ball.fillCircle(20, 20, 8, TFT_WHITE);  // Shine effect

  // Animation variables
  int x = 100, y = 100;
  int oldX = x, oldY = y;
  int dx = 5, dy = 3;

  // Animate for 5 seconds
  unsigned long startTime = millis();
  while (millis() - startTime < 5000) {
    // Update position
    x += dx;
    y += dy;

    // Bounce off walls
    if (x <= 0 || x >= 750) dx = -dx;
    if (y <= 50 || y >= 430) dy = -dy;

    // Clear old position ONLY if it moved
    if (oldX != x || oldY != y) {
      lcd.fillRect(oldX, oldY, 50, 50, TFT_DARKGREY);
    }

    // Draw at new position
    ball.pushSprite(x, y, TFT_BLACK);

    oldX = x;
    oldY = y;
    delay(20);
  }

  ball.deleteSprite();
  delay(1000);
}

// Example 4: Multiple Sprites with Layers
void example4_multipleSprites() {
  Serial.println("\n=== Example 4: Multiple Sprites ===");

  lcd.fillScreen(TFT_NAVY);

  // Create title bar sprite (workaround for direct text rendering issue)
  lgfx::LGFX_Sprite titleBar(&lcd);
  titleBar.createSprite(800, 40);
  titleBar.fillSprite(TFT_NAVY);
  titleBar.setTextColor(TFT_WHITE);
  titleBar.setTextSize(2);
  titleBar.drawString("Example 4: Multiple Sprites", 10, 10);
  titleBar.pushSprite(0, 0);
  titleBar.deleteSprite();

  // Create multiple sprite layers
  lgfx::LGFX_Sprite background(&lcd);
  lgfx::LGFX_Sprite player(&lcd);
  lgfx::LGFX_Sprite enemy(&lcd);

  // Background sprite (tile)
  background.createSprite(100, 100);
  background.fillSprite(TFT_GREEN);
  background.fillRect(10, 10, 80, 80, TFT_DARKGREEN);
  background.drawRect(0, 0, 100, 100, TFT_BLACK);

  // Player sprite
  player.createSprite(60, 60);
  player.fillSprite(TFT_BLACK);
  player.fillTriangle(30, 10, 10, 50, 50, 50, TFT_BLUE);
  player.fillCircle(30, 35, 10, TFT_CYAN);

  // Enemy sprite
  enemy.createSprite(60, 60);
  enemy.fillSprite(TFT_BLACK);
  enemy.fillRect(15, 15, 30, 30, TFT_RED);
  enemy.fillCircle(25, 25, 5, TFT_YELLOW);
  enemy.fillCircle(35, 25, 5, TFT_YELLOW);

  // Draw background tiles
  for (int y = 50; y < 400; y += 100) {
    for (int x = 0; x < 800; x += 100) {
      background.pushSprite(x, y);
    }
  }

  // Animate player and enemy
  int prevPlayerX = 100, prevEnemyX = 600;
  for (int i = 0; i < 50; i++) {
    int playerX = 100 + i * 10;
    int enemyX = 600 - i * 8;

    // Clear previous positions by redrawing background tiles
    if (i > 0) {
      // Clear player old position
      int bgX = (prevPlayerX / 100) * 100;
      int bgY = (200 / 100) * 100;
      background.pushSprite(bgX, bgY);

      // Clear enemy old position
      bgX = (prevEnemyX / 100) * 100;
      bgY = (250 / 100) * 100;
      background.pushSprite(bgX, bgY);
    }

    player.pushSprite(playerX, 200, TFT_BLACK);
    enemy.pushSprite(enemyX, 250, TFT_BLACK);

    prevPlayerX = playerX;
    prevEnemyX = enemyX;
    delay(50);
  }

  background.deleteSprite();
  player.deleteSprite();
  enemy.deleteSprite();

  delay(2000);
}

// Example 5: Sprite Rotation and Transformation
void example5_rotatedSprite() {
  Serial.println("\n=== Example 5: Sprite Rotation ===");

  lcd.fillScreen(TFT_BLACK);

  // Create title bar sprite (workaround for direct text rendering issue)
  lgfx::LGFX_Sprite titleBar(&lcd);
  titleBar.createSprite(800, 40);
  titleBar.fillSprite(TFT_BLACK);
  titleBar.setTextColor(TFT_WHITE);
  titleBar.setTextSize(2);
  titleBar.drawString("Example 5: Rotation", 10, 10);
  titleBar.pushSprite(0, 0);
  titleBar.deleteSprite();

  // Create arrow sprite
  lgfx::LGFX_Sprite arrow(&lcd);
  arrow.createSprite(100, 100);

  // Create rotated sprite buffer
  lgfx::LGFX_Sprite rotated(&lcd);
  rotated.createSprite(150, 150);

  // Draw arrow
  arrow.fillSprite(TFT_BLACK);
  arrow.fillTriangle(50, 20, 30, 80, 70, 80, TFT_GREEN);
  arrow.fillRect(40, 60, 20, 30, TFT_GREEN);

  // Rotate and display
  for (int angle = 0; angle < 360; angle += 10) {
    rotated.fillSprite(TFT_BLACK);
    arrow.pushRotateZoom(&rotated, 75, 75, angle, 1.0, 1.0, TFT_BLACK);
    rotated.pushSprite(325, 165, TFT_BLACK);
    delay(50);
  }

  arrow.deleteSprite();
  rotated.deleteSprite();
  delay(1000);
}

// Example 6: Sprite Buffer for Smooth Animation (Double Buffering)
void example6_doubleBuffer() {
  Serial.println("\n=== Example 6: Double Buffering ===");

  lcd.fillScreen(TFT_BLACK);

  // Create title bar sprite (workaround for direct text rendering issue)
  lgfx::LGFX_Sprite titleBar(&lcd);
  titleBar.createSprite(800, 40);
  titleBar.fillSprite(TFT_BLACK);
  titleBar.setTextColor(TFT_WHITE);
  titleBar.setTextSize(2);
  titleBar.drawString("Example 6: Smooth Animation", 10, 10);
  titleBar.pushSprite(0, 0);
  titleBar.deleteSprite();

  // Create full-screen sprite as buffer
  lgfx::LGFX_Sprite buffer(&lcd);
  buffer.createSprite(800, 400);

  // Animate smooth scrolling starfield
  int stars[50][3];  // x, y, speed
  for (int i = 0; i < 50; i++) {
    stars[i][0] = random(0, 800);
    stars[i][1] = random(0, 400);
    stars[i][2] = random(1, 5);
  }

  unsigned long startTime = millis();
  while (millis() - startTime < 5000) {
    // Clear buffer
    buffer.fillSprite(TFT_BLACK);

    // Update and draw stars
    for (int i = 0; i < 50; i++) {
      stars[i][0] -= stars[i][2];
      if (stars[i][0] < 0) stars[i][0] = 800;

      int brightness = stars[i][2] * 50;
      uint16_t color = buffer.color565(brightness, brightness, brightness);
      buffer.fillCircle(stars[i][0], stars[i][1], stars[i][2], color);
    }

    // Draw text on buffer
    buffer.setTextColor(TFT_CYAN);
    buffer.setTextSize(3);
    buffer.setTextDatum(middle_center);
    buffer.drawString("SMOOTH!", 400, 200);

    // Push entire buffer to screen at once (no flicker!)
    buffer.pushSprite(0, 80);

    delay(30);
  }

  buffer.deleteSprite();
  delay(1000);
}

// Example 7: Sprite with Text and Icons
void example7_uiElements() {
  Serial.println("\n=== Example 7: UI Elements ===");

  lcd.fillScreen(TFT_LIGHTGREY);

  // Create button sprite
  lgfx::LGFX_Sprite button(&lcd);
  button.createSprite(150, 60);

  // Create icon sprite
  lgfx::LGFX_Sprite icon(&lcd);
  icon.createSprite(40, 40);

  // Draw icon (play button)
  icon.fillSprite(TFT_BLACK);
  icon.fillCircle(20, 20, 19, TFT_GREEN);
  icon.fillTriangle(15, 10, 15, 30, 30, 20, TFT_WHITE);

  // Draw multiple buttons
  const char* labels[] = {"Play", "Pause", "Stop", "Record"};
  uint16_t colors[] = {TFT_GREEN, TFT_YELLOW, TFT_RED, TFT_BLUE};

  for (int i = 0; i < 4; i++) {
    // Draw button
    button.fillSprite(colors[i]);
    button.fillRoundRect(5, 5, 140, 50, 10, colors[i]);
    button.drawRoundRect(5, 5, 140, 50, 10, TFT_BLACK);
    button.setTextColor(TFT_BLACK);
    button.setTextDatum(middle_center);

    // Use nice font for button labels
    button.setFont(&fonts::FreeSansBold12pt7b);
    button.drawString(labels[i], 75, 35);

    // Position button
    int x = 50 + (i % 2) * 200;
    int y = 100 + (i / 2) * 100;
    button.pushSprite(x, y);

    // Add icon
    icon.pushSprite(x + 10, y + 10, TFT_BLACK);
  }

  // Draw status bar
  lgfx::LGFX_Sprite statusBar(&lcd);
  statusBar.createSprite(800, 40);
  statusBar.fillSprite(TFT_DARKGREY);
  statusBar.setTextColor(TFT_WHITE);

  // Use nice font for status bar
  statusBar.setFont(&fonts::FreeSansBold18pt7b);
  statusBar.drawString("LovyanGFX UI Demo", 10, 30);
  statusBar.pushSprite(0, 0);

  button.deleteSprite();
  icon.deleteSprite();
  statusBar.deleteSprite();

  delay(5000);
}

// ============================================================================
// Setup and Main Loop
// ============================================================================

void setup(void) {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n╔════════════════════════════════════════╗");
  Serial.println("║  LovyanGFX Sprite Examples            ║");
  Serial.println("║  for RA8875 800x480 Display           ║");
  Serial.println("╚════════════════════════════════════════╝\n");

  Serial.println("Initializing display...");
  lcd.init();
  Serial.println("Display ready!\n");

  // Show welcome screen
  lcd.fillScreen(TFT_BLUE);

  // Create welcome screen sprite (workaround for direct text rendering issue)
  lgfx::LGFX_Sprite welcome(&lcd);
  welcome.createSprite(800, 480);
  welcome.setColorDepth(8);
  welcome.fillSprite(TFT_BLUE);
  welcome.setTextColor(TFT_WHITE);
  welcome.setTextDatum(middle_center);

  // Use beautiful TrueType fonts
  welcome.setFont(&fonts::FreeSansBold24pt7b);
  welcome.drawString("LovyanGFX", 400, 200);

  welcome.setFont(&fonts::FreeSans18pt7b);
  welcome.drawString("Sprite Examples", 400, 260);

  welcome.setFont(&fonts::FreeSans12pt7b);
  welcome.drawString("Starting in 2 seconds...", 400, 320);

  welcome.pushSprite(0, 0);
  welcome.deleteSprite();
  delay(2000);

  // Run all examples
  example1_basicSprite();
  example2_transparentSprite();
  example3_animatedSprite();
  example4_multipleSprites();
  example5_rotatedSprite();
  example6_doubleBuffer();
  example7_uiElements();

  // Final screen
  lcd.fillScreen(TFT_GREEN);

  // Create final screen sprite (workaround for direct text rendering issue)
  lgfx::LGFX_Sprite final(&lcd);
  final.createSprite(800, 480);
  final.fillSprite(TFT_GREEN);
  final.setTextColor(TFT_BLACK);
  final.setTextDatum(middle_center);

  // Use bold font for completion message
  final.setFont(&fonts::FreeSansBold24pt7b);
  final.drawString("All Examples", 400, 220);
  final.drawString("Complete!", 400, 280);

  final.pushSprite(0, 0);
  final.deleteSprite();

  Serial.println("\n╔════════════════════════════════════════╗");
  Serial.println("║  All examples completed!              ║");
  Serial.println("║  Loop will repeat continuously...     ║");
  Serial.println("╚════════════════════════════════════════╝\n");
}

void loop(void) {
  // Repeat examples continuously
  delay(3000);

  example1_basicSprite();
  example2_transparentSprite();
  example3_animatedSprite();
  example4_multipleSprites();
  example5_rotatedSprite();
  example6_doubleBuffer();
  example7_uiElements();
}
