/*
 * ESP32 ST7789 LCD Demo using TFT_eSPI
 * Fixed configuration based on working Adafruit setup
 */

#include <TFT_eSPI.h>
#include <SPI.h>

// Create display object
TFT_eSPI tft = TFT_eSPI();

void demoColors();
void demoShapes();
void demoText();
void demoGradient();
void demoAnimation();
void demoSprites();

void setup()
{
  Serial.begin(115200);
  delay(1000);
  Serial.println("TFT_eSPI ST7789 Demo Starting....");

  // Initialize display
  Serial.println("Initializing display...");
  tft.init();
  delay(100);

  Serial.println("Display initialized!");

  tft.setRotation(0);

  // Clear screen
  Serial.println("Clearing screen...");
  tft.fillScreen(TFT_BLACK);
  delay(500);

  Serial.println("Running demos...");

}

void loop()
{
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setTextSize(2);
  tft.setCursor(20, 20);
  tft.println("TFT_eSPI");
}
