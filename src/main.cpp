#include <TFT_eSPI.h>
#include <SPI.h>
#include <TaskScheduler.h>

#define RX2 16
#define TX2 17

// Create objects
TFT_eSPI tft = TFT_eSPI();
Scheduler myscheduler;

void UART_handler();
void UART_Ping();

Task taskUART_handler(10, TASK_FOREVER, &UART_handler);

void setup()
{
  Serial.begin(115200);
  delay(500);

  Serial.println("Starting TFT_eSPI ST7789 screen");
  tft.init();
  tft.setRotation(0);
  delay(100);

  Serial.println("Starting Wire UART on RX : " + String(RX2) + " DX : " + String(TX2));
  Serial2.begin(115200, SERIAL_8N1, RX2, TX2);

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

void checkUART() {
  if (Serial2.available()) {
    String received = Serial2.readStringUntil('\n');
    Serial.print("Received: ");
    Serial.println(received);
    
    // Echo back
    Serial2.println("Echo: " + received);
  }
}

void UART_handler(){

}

void UART_Ping(){
  
}