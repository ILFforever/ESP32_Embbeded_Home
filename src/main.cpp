#include <Arduino.h>
#include <ArduinoJson.h>
#include <HardwareSerial.h>
#include <TFT_eSPI.h>
#include <SPI.h>
#include <TaskScheduler.h>
#include "uart_commands.h"
#include "http_control.h"
#include "SPIMaster.h"
#include <TJpg_Decoder.h>
#include <cstring>

#define RX2 16
#define TX2 17
#define UART_BAUD 115200

// Create objects
TFT_eSPI tft = TFT_eSPI();
Scheduler myscheduler;
HardwareSerial SlaveSerial(2); // Use UART2
extern TFT_eSPI tft;           // Your initialized display object
extern uint8_t *g_spiFrame;    // Pointer to SPI-received JPEG frame
extern size_t g_spiFrameSize;  // Size of JPEG frame
SPIMaster spiMaster;

// Ping-Pong
uint32_t ping_counter = 0;
unsigned long last_pong_time = 0;
#define PONG_TIMEOUT 10000
int slave_status = 0; // 0 = standby, -1 = disconneccted, 1 = camera_running, 2 = face_recog running

void checkUARTData();
void sendPingTask();
void checkPingTimeout();
void LCDhandler();
void handleHTTPTask();
void UpdateSPI();
void ProcessFrame();
void PrintStats();
bool tft_jpg_render_callback(int16_t x, int16_t y, uint16_t w, uint16_t h, uint16_t *bitmap);

Task taskCheckUART(20, TASK_FOREVER, &checkUARTData);         // Check UART buffer every 20ms
Task taskSendPing(2500, TASK_FOREVER, &sendPingTask);         // Send ping every 3s
Task taskCheckTimeout(1000, TASK_FOREVER, &checkPingTimeout); // Check timeout every 1s
Task taskLCDhandler(50, TASK_FOREVER, &LCDhandler);           // handle display updates every 50ms (around 20 fps)
Task taskHTTPHandler(10, TASK_FOREVER, &handleHTTPTask);      // Handle HTTP requests every 10ms
Task taskUpdateSPI(10, TASK_FOREVER, &UpdateSPI);             // Update SPI every 10ms
Task taskProcessFrame(5, TASK_FOREVER, &ProcessFrame);        // Check for frames every 5ms
Task taskPrintStats(5000, TASK_FOREVER, &PrintStats);         // Print stats every 5s

void setup()
{
  Serial.begin(115200);
  Serial.println("\n\n=================================");
  Serial.println("ESP32_Embbeded_Home - Doorbell_lcd");
  Serial.println("=================================\n");
  delay(500);

  Serial.println("Starting TFT_eSPI ST7789 screen");
  tft.init();
  tft.setRotation(0);
  delay(100);

  SlaveSerial.begin(UART_BAUD, SERIAL_8N1, RX2, TX2);
  Serial.printf("UART initialized: RX=GPIO%d, TX=GPIO%d, Baud=%d\n", RX2, TX2, UART_BAUD);
  delay(100);

  if (!spiMaster.begin())
  {
    Serial.println("[ERROR] SPI initialization failed");
    while (1)
      delay(100);
  }
  Serial.println("SPI initialization started");

  // Initialize HTTP server
  initHTTPServer();
  delay(100);

  // Configure TJpg_Decoder
  TJpgDec.setCallback(tft_jpg_render_callback); // Set the callback
  TJpgDec.setJpgScale(1);                       // Full resolution
  TJpgDec.setSwapBytes(true);

  last_pong_time = millis();

  // Add tasks to scheduler
  myscheduler.addTask(taskCheckUART);
  myscheduler.addTask(taskSendPing);
  myscheduler.addTask(taskCheckTimeout);
  myscheduler.addTask(taskLCDhandler);
  myscheduler.addTask(taskHTTPHandler);
  myscheduler.addTask(taskUpdateSPI);
  myscheduler.addTask(taskProcessFrame);
  myscheduler.addTask(taskPrintStats);

  taskCheckUART.enable();
  taskSendPing.enable();
  taskCheckTimeout.enable();
  // taskLCDhandler.enable();
  taskHTTPHandler.enable();
  taskUpdateSPI.enable();
  taskProcessFrame.enable();
  taskPrintStats.enable();

  last_pong_time = millis();
  sendUARTCommand("get_status");

  // Clear screen
  Serial.println("Clearing screen...");
  tft.fillScreen(TFT_RED);
  // sendUARTCommand("camera_control","camera_start");
}

void loop()
{
  myscheduler.execute();
}

// TJpg_Decoder callback: draw a decoded block to TFT
bool tft_jpg_render_callback(int16_t x, int16_t y, uint16_t w, uint16_t h, uint16_t *bitmap)
{
  // Clip vertically
  int drawHeight = h;
  if (y + h > tft.height())
    drawHeight = tft.height() - y;

  // Clip horizontally (optional)
  int drawWidth = w;
  if (x + w > tft.width())
    drawWidth = tft.width() - x;

  tft.pushImage(x, y + 20, drawWidth, drawHeight, bitmap);

  return true; // always continue decoding
}

// Task: Update SPI
void UpdateSPI()
{
  spiMaster.update();
}

// Task: Process complete frames (This marks frames as used)
// Task: Process SPI frames and display on LCD
void ProcessFrame()
{
  if (!spiMaster.isFrameReady())
    return;

  static unsigned long lastFrameTime = 0;
  static unsigned long frameCount = 0;
  static float currentFPS = 0.0;

  uint8_t *frame = spiMaster.getFrameData();
  uint32_t frameSize = spiMaster.getFrameSize();
  uint16_t frameId = spiMaster.getFrameId();

  if (!frame || frameSize == 0)
    return;

  // Calculate FPS
  unsigned long now = millis();
  frameCount++;
  if (now - lastFrameTime >= 1000) {  // Update every second
    currentFPS = frameCount * 1000.0 / (now - lastFrameTime);
    frameCount = 0;
    lastFrameTime = now;
  }

  // Quick validation (minimal logging)
  if (frameSize < 100 || frame[0] != 0xFF || frame[1] != 0xD8) {
    Serial.println("[ERROR] Invalid JPEG");
    spiMaster.ackFrame();
    return;
  }

  // Decode and draw JPEG
  uint16_t result = TJpgDec.drawJpg(0, 0, frame, frameSize);

  if (result != 0) {  // JDR_OK = 0 means success!
    Serial.printf("[ERROR] JPEG decode failed: %d\n", result);
  }

  // Draw FPS counter at bottom
  if (currentFPS > 0) {
    int16_t textY = tft.height() - 40;
    tft.fillRect(40, textY - 2, 80, 12, TFT_BLACK);
    tft.setTextColor(TFT_GREEN, TFT_BLACK);
    tft.setCursor(40, textY);
    tft.setTextSize(1);
    tft.printf("FPS: %.1f", currentFPS);
  }

  spiMaster.ackFrame();
}

// Task: Print statistics
void PrintStats()
{
  Serial.println("\n[STATS] SPI Statistics:");
  Serial.print("  Frames received: ");
  Serial.println(spiMaster.getFramesReceived());
  Serial.print("  Frames dropped: ");
  Serial.println(spiMaster.getFramesDropped());
  Serial.print("  Current state: ");

  switch (spiMaster.getState())
  {
  case SPI_IDLE:
    Serial.println("IDLE");
    break;
  case SPI_RECEIVING_HEADER:
    Serial.println("RECEIVING_HEADER");
    break;
  case SPI_RECEIVING_DATA:
    Serial.println("RECEIVING_DATA");
    break;
  case SPI_COMPLETE:
    Serial.println("COMPLETE");
    break;
  case SPI_ERROR:
    Serial.println("ERROR");
    break;
  }
}

// Task: Check for incoming UART data
void checkUARTData()
{
  while (SlaveSerial.available())
  {
    String line = SlaveSerial.readStringUntil('\n');
    if (line.length() > 0)
    {
      handleUARTResponse(line);
    }
  }
}

// Task: Send periodic ping
void sendPingTask()
{
  static int tag = 0;
  if (tag < 5)
  {
    tag++;
    sendUARTPing();
  }
  else
  {
    sendUARTCommand("get_status");
    tag = 0;
  }
}

// Task: Check for ping timeout
void checkPingTimeout()
{
  if (ping_counter > 0 && (millis() - last_pong_time > PONG_TIMEOUT))
  {
    Serial.println("!!! WARNING: No pong response for 5 seconds !!!");
    Serial.println("Connection to slave may be lost.\n");
    // TODO : Attempt reconnection or something
    last_pong_time = millis() - PONG_TIMEOUT + 3000;
  }
  else if (slave_status == -1)
    slave_status = 0; // back to standby
}

void LCDhandler()
{
  if (!spiMaster.isFrameReady())
  {
    Serial.println("No frame ready");
    return;
  }

  uint8_t *frame = spiMaster.getFrameData();
  uint32_t frameSize = spiMaster.getFrameSize();

  if (!frame || frameSize < 10)
    return;

  Serial.print("Drawing frame, size=");
  Serial.println(frameSize);

  if (TJpgDec.drawJpg(0, 0, frame, frameSize) == 0)
  {
    Serial.println("JPEG decode failed");
  }

  spiMaster.ackFrame();
}

// Task: Handle HTTP requests
void handleHTTPTask()
{
  handleHTTPClient();
}