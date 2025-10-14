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
TFT_eSprite videoSprite = TFT_eSprite(&tft); // Sprite for video frames
TFT_eSprite topuiSprite = TFT_eSprite(&tft); // Sprite for UI overlay
TFT_eSprite botuiSprite = TFT_eSprite(&tft); // Sprite for UI overlay
TFT_eSprite miduiSprite = TFT_eSprite(&tft); // Sprite for UI overlay

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

// UI state
bool uiNeedsUpdate = true; // Flag to redraw UI elements
#define VIDEO_Y_OFFSET 40  // Reserve top 20px for status bar
#define VIDEO_HEIGHT 200   // Video area height

// Face detection bounding box
bool hasFaceDetection = false;
int face_bbox_x = 0;
int face_bbox_y = 0;
int face_bbox_w = 0;
int face_bbox_h = 0;
unsigned long lastFaceDetectionTime = 0;
#define FACE_DETECTION_TIMEOUT 1500  // Clear bbox after 1.5 seconds

void checkUARTData();
void sendPingTask();
void checkPingTimeout();
void handleHTTPTask();
void UpdateSPI();
void ProcessFrame();
void PrintStats();
void drawUIOverlay();
void lcdhandoff();
void drawWifiSymbol(int x, int y, int strength);
bool tft_jpg_render_callback(int16_t x, int16_t y, uint16_t w, uint16_t h, uint16_t *bitmap);
String getCurrentTimeAsString();
String getCurrentDateAsString();

Task taskCheckUART(20, TASK_FOREVER, &checkUARTData);         // Check UART buffer every 20ms
Task taskSendPing(1000, TASK_FOREVER, &sendPingTask);         // Send ping every 3s
Task taskCheckTimeout(1000, TASK_FOREVER, &checkPingTimeout); // Check timeout every 1s
Task taskHTTPHandler(10, TASK_FOREVER, &handleHTTPTask);      // Handle HTTP requests every 10ms
Task taskUpdateSPI(10, TASK_FOREVER, &UpdateSPI);             // Update SPI every 10ms
Task taskProcessFrame(5, TASK_FOREVER, &ProcessFrame);        // Check for frames every 5ms
Task taskPrintStats(5000, TASK_FOREVER, &PrintStats);         // Print stats every 5s
Task taskdrawUIOverlay(10, TASK_FOREVER, &drawUIOverlay);     // Update UI overlay every 10ms
Task tasklcdhandoff(100, TASK_FOREVER, &lcdhandoff);          // Check if we need to hand off LCD to ProcessFrame
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
  tft.setSwapBytes(true); // Match TFT byte order

  // Initialize sprites
  Serial.println("Creating video sprite...");
  videoSprite.setColorDepth(16); // 16-bit color for video
  videoSprite.createSprite(tft.width(), VIDEO_HEIGHT);

  Serial.println("Creating UI sprite...");
  topuiSprite.setColorDepth(16); // 16-bit for UI overlay
  topuiSprite.createSprite(tft.width(), VIDEO_Y_OFFSET + 5);

  miduiSprite.setColorDepth(16);
  miduiSprite.createSprite(tft.width(), tft.height() - 93);

  botuiSprite.setColorDepth(16);
  botuiSprite.createSprite(tft.width(), VIDEO_Y_OFFSET + 5);

  Serial.println("Sprites initialized successfully");

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
  myscheduler.addTask(taskHTTPHandler);
  myscheduler.addTask(taskUpdateSPI);
  myscheduler.addTask(taskProcessFrame);
  myscheduler.addTask(taskPrintStats);
  myscheduler.addTask(taskdrawUIOverlay);
  myscheduler.addTask(tasklcdhandoff);
  taskCheckUART.enable();
  taskSendPing.enable();
  taskCheckTimeout.enable();
  taskHTTPHandler.enable();
  taskUpdateSPI.enable();
  taskProcessFrame.enable();
  //taskPrintStats.enable();
  taskdrawUIOverlay.enable();
  tasklcdhandoff.enable();

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

// TJpg_Decoder callback: draw a decoded block to videoSprite
bool tft_jpg_render_callback(int16_t x, int16_t y, uint16_t w, uint16_t h, uint16_t *bitmap)
{
  // Clip vertically to video sprite bounds
  int drawHeight = h;
  if (y + h > VIDEO_HEIGHT)
    drawHeight = VIDEO_HEIGHT - y;

  // Clip horizontally
  int drawWidth = w;
  if (x + w > videoSprite.width())
    drawWidth = videoSprite.width() - x;

  // Draw to video sprite instead of TFT directly
  if (drawHeight > 0 && drawWidth > 0)
  {
    videoSprite.pushImage(x, y, drawWidth, drawHeight, bitmap);
  }

  return true; // always continue decoding
}

// Task: Update SPI
void UpdateSPI()
{
  spiMaster.update();
}

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
  if (now - lastFrameTime >= 1000)
  { // Update every second
    currentFPS = frameCount * 1000.0 / (now - lastFrameTime);
    frameCount = 0;
    lastFrameTime = now;
    uiNeedsUpdate = true; // Trigger UI update for FPS counter
  }

  // Quick validation (minimal logging)
  if (frameSize < 100 || frame[0] != 0xFF || frame[1] != 0xD8)
  {
    Serial.println("[ERROR] Invalid JPEG");
    spiMaster.ackFrame();
    return;
  }

  // Clear video sprite
  videoSprite.fillSprite(TFT_BLACK);

  // Decode JPEG to video sprite (via callback)
  uint16_t result = TJpgDec.drawJpg(0, 0, frame, frameSize);

  if (result != 0)
  { // JDR_OK = 0 means success!
    Serial.printf("[ERROR] JPEG decode failed: %d\n", result);
  }

  // Draw face detection bounding box if available
  if (hasFaceDetection)
  {
    // Check if detection has timed out
    if (millis() - lastFaceDetectionTime > FACE_DETECTION_TIMEOUT)
    {
      hasFaceDetection = false;
    }
    else
    {
      // Scale bounding box from camera resolution to display (tft.width() x VIDEO_HEIGHT)
      // Camera appears to be wider, adjust X scale
      float scaleX = (float)videoSprite.width() / 280.0;  // Adjusted for wider camera FOV
      float scaleY = (float)VIDEO_HEIGHT / 240.0;

      int scaled_x = (int)(face_bbox_x * scaleX);
      int scaled_y = (int)(face_bbox_y * scaleY);
      int scaled_w = (int)(face_bbox_w * scaleX);
      int scaled_h = (int)(face_bbox_h * scaleY);

      // Draw thicker rectangle (2px thick)
      videoSprite.drawRect(scaled_x, scaled_y, scaled_w, scaled_h, TFT_RED);
      videoSprite.drawRect(scaled_x + 1, scaled_y + 1, scaled_w - 2, scaled_h - 2, TFT_RED);
    }
  }

  // Composite: Push video sprite to screen
  videoSprite.pushSprite(0, VIDEO_Y_OFFSET + 25);

  // Draw UI overlay if needed
  if (uiNeedsUpdate)
  {
    // Serial.println("Redrawing UI overlay from ProcessFrame");
    drawUIOverlay();
    uiNeedsUpdate = false;
  }

  spiMaster.ackFrame();
}

void lcdhandoff() // check if we need to hand off LCD to ProcessFrame
{
  if ((slave_status > 0) && taskdrawUIOverlay.isEnabled()) // if slave camera is running
  {
    taskdrawUIOverlay.disable(); // This task will be called by ProcessFrame() when a new frame is processed
    Serial.println("UI overlay hand off to ProcessFrame");
  }
  else if ((slave_status <= 0) && (!taskdrawUIOverlay.isEnabled()))
  {
    taskdrawUIOverlay.enable();
    Serial.println("UI overlay given back to lcd task");
  }
}

// Draw UI overlay (status bar, icons, etc.)
void drawUIOverlay()
{
  // Clear UI sprite
  topuiSprite.fillSprite(TFT_BLACK); // Clear top bar
  botuiSprite.fillSprite(TFT_BLACK); // Clear bottom bar

  // TOP BAR: Status text and icons
  // Draw status text
  topuiSprite.setTextColor(TFT_WHITE);
  topuiSprite.setTextSize(1);
  topuiSprite.setCursor(15, 12);

  // Display connection status
  switch (slave_status)
  {
  case -1:
    topuiSprite.fillSmoothCircle(25, 22, 10, TFT_ORANGE);
    break;
  case 0:
    topuiSprite.fillSmoothCircle(25, 22, 10, TFT_DARKGREY);
    break;
  case 1:
    { // Create a new scope for local variables
      // Blinking effect for recording indicator.
      // A sine wave with a period of about 2 seconds (2*PI / 0.003 ~= 2094 ms)
      float sine_wave = (sin(millis() * 0.003f) + 1.0f) / 2.0f; // Varies between 0.0 and 1.0

      // We'll make it fade from a dim blue to a bright blue.
      uint8_t blue_value = 50 + (uint8_t)(sine_wave * 205); // Varies from 50 to 255
      uint16_t blinking_color = tft.color565(0, 0, blue_value);
      topuiSprite.fillSmoothCircle(25, 22, 8, blinking_color);
    }
    break;
  case 2:
    topuiSprite.setTextColor(TFT_CYAN, TFT_BLACK);
    topuiSprite.print("FACE RECOG");
    break;
  default:
    topuiSprite.setTextColor(TFT_WHITE, TFT_BLACK);
    topuiSprite.print("UNKNOWN");
    break;
  }

  if (slave_status >= 1) // If camera running show time on top
  {
    // Draw Time in the top bar
    topuiSprite.setTextDatum(TC_DATUM);
    topuiSprite.setTextFont(4); // Use Font 4 for the top bar clock
    topuiSprite.setTextColor(TFT_WHITE);
    topuiSprite.drawString(getCurrentTimeAsString(), topuiSprite.width() / 2, 15);
  }
  else
  {
    // Camera is OFF - reuse videoSprite for displaying time
    videoSprite.fillSprite(TFT_BLACK); // Clear the sprite

    struct tm timeinfo;
    if (getLocalTime(&timeinfo))
    {
      // Display a greeting based on the time of day
      videoSprite.setTextColor(TFT_WHITE, TFT_BLACK);
      videoSprite.setTextFont(4);         // Use Font 4 for the greeting
      videoSprite.setTextDatum(TL_DATUM); // Top-Left alignment
      if (timeinfo.tm_hour >= 5 && timeinfo.tm_hour < 12)
        videoSprite.drawString("Good morning!", 10, 20);
      else if (timeinfo.tm_hour >= 12 && timeinfo.tm_hour < 16)
        videoSprite.drawString("Good afternoon!", 10, 20);
      else if (timeinfo.tm_hour >= 16 && timeinfo.tm_hour < 18)
        videoSprite.drawString("Good evening!", 10, 20);
      else
        videoSprite.drawString("Good night", 10, 20);
    }
    else
    {
      // If time is not available, just show "Camera OFF"
      videoSprite.setTextColor(TFT_WHITE, TFT_BLACK);
      videoSprite.setTextSize(2);
      videoSprite.setTextDatum(TL_DATUM); // Top Center
      videoSprite.drawString("Camera OFF", videoSprite.width() / 2, 10);
    }

    // Draw large time
    videoSprite.setTextFont(6);         // Use Font 7 (7-segment) for the large clock
    videoSprite.setTextDatum(TL_DATUM); // Top-Left alignment
    videoSprite.drawString(getCurrentTimeAsString(), 10, 45);

    // Draw date
    videoSprite.setTextFont(4); // Use a smaller font for the date
    videoSprite.setTextDatum(TL_DATUM);
    videoSprite.drawString(getCurrentDateAsString(), 10, 85);

    //TODO Have it pull from api later
    videoSprite.drawString("Rainy 25C", 10, 125);

    // Push to screen
    videoSprite.pushSprite(0, VIDEO_Y_OFFSET + 25);
  }

  // Draw WiFi/connection indicator (right side)
  if (ping_counter > 0 && (millis() - last_pong_time < 6000))
  {
    drawWifiSymbol(tft.width() - 25, 28, 3); // Full strength
  }
  else
  {
    drawWifiSymbol(tft.width() - 25, 28, 0); // No connection
  }

  // Draw grey borders for camera area
  topuiSprite.fillRect(0, topuiSprite.height() - 4, tft.width(), 4, TFT_LIGHTGREY);
  botuiSprite.fillRect(0, 0, tft.width(), 4, TFT_LIGHTGREY);

  // Push UI sprite to screen (top bar)
  topuiSprite.pushSprite(0, 20);
  botuiSprite.pushSprite(0, 265);
}

void drawWifiSymbol(int x, int y, int strength)
{
  // strength: 0=off, 1=weak, 2=medium, 3=strong
  uint16_t color = (strength > 0) ? TFT_GREEN : TFT_RED;

  // Dot
  topuiSprite.fillCircle(x, y, 2, color);

  // Arcs based on strength
  if (strength >= 1)
  {
    topuiSprite.drawArc(x, y, 6, 5, 135, 225, color, color, false); // Smallest arc
  }
  if (strength >= 2)
  {
    topuiSprite.drawArc(x, y, 10, 9, 135, 225, color, color, false); // Middle arc
  }
  if (strength >= 3)
  {
    topuiSprite.drawArc(x, y, 14, 13, 135, 225, color, color, false); // Largest arc
  }
}

String getCurrentTimeAsString()
{
  struct tm timeinfo;
  if (getLocalTime(&timeinfo))
  {
    char time_str[6];
    strftime(time_str, sizeof(time_str), "%H:%M", &timeinfo);
    return String(time_str);
  }
  else
  {
    return String("--:--");
  }
}

String getCurrentDateAsString()
{
  struct tm timeinfo;
  if (getLocalTime(&timeinfo))
  {
    char date_str[10]; // "dd/mm/yy" + null
    strftime(date_str, sizeof(date_str), "%d/%m/%y", &timeinfo);
    return String(date_str);
  }
  else
  {
    return String("--/--/--");
  }
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
  if (tag < 3)
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
    slave_status = -1; // mark as disconnected
    // TODO : Attempt reconnection or something
    last_pong_time = millis() - PONG_TIMEOUT + 3000;
  }
  else if (slave_status == -1)
    slave_status = 0; // back to standby
}


// Task: Handle HTTP requests
void handleHTTPTask()
{
  handleHTTPClient();
}