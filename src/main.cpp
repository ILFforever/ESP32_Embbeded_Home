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
String status_msg = "";
bool status_msg_is_temporary = false; // Flag to indicate temporary status message
bool recognition_success = false;
String status_msg_fallback = ""; // Message to display after temporary message is shown once

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
#define FACE_DETECTION_TIMEOUT 1500 // Clear bbox after 1.5 seconds

void checkUARTData();
void sendPingTask();
void checkPingTimeout();
void handleHTTPTask();
void UpdateSPI();
void ProcessFrame();
void drawUIOverlay();
void lcdhandoff();
void getCameraStatus();
void drawWifiSymbol(int x, int y, int strength);
bool tft_jpg_render_callback(int16_t x, int16_t y, uint16_t w, uint16_t h, uint16_t *bitmap);
String getCurrentTimeAsString();
String getCurrentDateAsString();

Task taskCheckUART(20, TASK_FOREVER, &checkUARTData);           // Check UART buffer every 20ms
Task taskSendPing(1000, TASK_FOREVER, &sendPingTask);           // Send ping every 1s
Task taskCheckTimeout(1000, TASK_FOREVER, &checkPingTimeout);   // Check timeout every 1s
Task taskHTTPHandler(10, TASK_FOREVER, &handleHTTPTask);        // Handle HTTP requests every 10ms
Task taskUpdateSPI(10, TASK_FOREVER, &UpdateSPI);               // Update SPI every 10ms
Task taskProcessFrame(5, TASK_FOREVER, &ProcessFrame);          // Check for frames every 5ms
Task taskdrawUIOverlay(25, TASK_FOREVER, &drawUIOverlay);       // Update UI overlay every 10ms
Task tasklcdhandoff(200, TASK_FOREVER, &lcdhandoff);            // Check if we need to hand off LCD to ProcessFrame
Task taskGetCameraStatus(1000, TASK_FOREVER, &getCameraStatus); // Get camera status every 0.5s

void setup()
{
  Serial.begin(115200);
  Serial.println("\n\n=================================");
  Serial.println("ESP32_Embbeded_Home - Doorbell_lcd");
  Serial.println("=================================\n");
  delay(100);

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
  myscheduler.addTask(taskdrawUIOverlay);
  myscheduler.addTask(tasklcdhandoff);
  myscheduler.addTask(taskGetCameraStatus);
  taskCheckUART.enable();
  taskSendPing.enable();
  taskCheckTimeout.enable();
  taskHTTPHandler.enable();
  taskUpdateSPI.enable();
  taskProcessFrame.enable();
  taskdrawUIOverlay.enable();
  tasklcdhandoff.enable();
  taskGetCameraStatus.enable();

  last_pong_time = millis();
  sendUARTCommand("get_status");

  // Clear screen and show startup message
  Serial.println("Clearing screen...");
  tft.fillScreen(TFT_BLACK);

  // Initial status message
  updateStatusMsg("Starting up...");
  getCameraStatus();
  drawUIOverlay();

  delay(100);
  updateStatusMsg("Getting ready...", true, "Standing By");
  uiNeedsUpdate = true;
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
    static unsigned long lastErrorMsg = 0;
    if (millis() - lastErrorMsg > 3000)
    {
      updateStatusMsg("video Error");
      lastErrorMsg = millis();
    }
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

  // Keep it here for now
  // if (currentFPS > 0)
  // {
  //   int16_t textY = VIDEO_HEIGHT - 20;
  //   videoSprite.fillRect(40, textY - 2, 80, 12, TFT_BLACK);
  //   videoSprite.setTextColor(TFT_GREEN, TFT_BLACK);
  //   videoSprite.setCursor(40, textY);
  //   videoSprite.setTextSize(1);
  //   videoSprite.printf("FPS: %.1f", currentFPS);
  // }

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
      float scaleX = (float)videoSprite.width() / 280.0; // Adjusted for wider camera FOV
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

  // Always draw UI overlay to keep animations smooth
  drawUIOverlay();

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
    topuiSprite.fillSmoothCircle(25, 22, 10, TFT_CYAN);
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
    videoSprite.drawString(getCurrentDateAsString(), 20, 85);

    // TODO Have it pull from api later
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

  // Display status message with smooth vertical scroll animation
  botuiSprite.setTextDatum(TC_DATUM); // Top Center alignment

  // Animation state machine
  enum AnimState
  {
    SHOWING_LABEL,
    ANIM_TO_MSG,
    SHOWING_MSG,
    ANIM_TO_LABEL
  };
  static AnimState animState = SHOWING_LABEL;
  static unsigned long stateStartTime = millis(); // Initialize with current time
  static float animProgress = 0.0f;
  static bool firstRun = true;
  static bool tempMsgShownOnce = false;

  // Initialize timing on first run
  if (firstRun)
  {
    stateStartTime = millis();
    firstRun = false;
  }

  // Check if temporary message has been shown once, then replace with fallback message
  if (status_msg_is_temporary && tempMsgShownOnce && animState == ANIM_TO_LABEL)
  {
    // After showing temporary message once, switch to fallback
    if (status_msg_fallback.length() > 0)
    {
      status_msg = status_msg_fallback;
    }
    else
    {
      status_msg = "On Stand By"; // Default if no fallback specified
    }
    status_msg_is_temporary = false;
    status_msg_fallback = "";
    tempMsgShownOnce = false;
  }

  // Track when temporary message cycle completes
  if (status_msg_is_temporary && animState == SHOWING_MSG)
  {
    tempMsgShownOnce = true;
  }

  // Reset flag when message changes to non-temporary
  if (!status_msg_is_temporary)
  {
    tempMsgShownOnce = false;
  }

  const unsigned long DISPLAY_TIME = 3000; // Show each state for 2 seconds
  const unsigned long ANIM_TIME = 600;     // Animation takes 300ms (faster, smoother)

  unsigned long currentTime = millis();
  unsigned long elapsed = currentTime - stateStartTime;

  // State machine transitions
  switch (animState)
  {
  case SHOWING_LABEL:
    if (elapsed > DISPLAY_TIME)
    {
      animState = ANIM_TO_MSG;
      stateStartTime = currentTime;
      animProgress = 0.0f;
    }
    break;

  case ANIM_TO_MSG:
    animProgress = (float)elapsed / ANIM_TIME;
    if (animProgress >= 1.0f)
    {
      animProgress = 1.0f;
      animState = SHOWING_MSG;
      stateStartTime = currentTime;
    }
    break;

  case SHOWING_MSG:
    if (elapsed > DISPLAY_TIME)
    {
      animState = ANIM_TO_LABEL;
      stateStartTime = currentTime;
      animProgress = 0.0f;
    }
    break;

  case ANIM_TO_LABEL:
    animProgress = (float)elapsed / ANIM_TIME;
    if (animProgress >= 1.0f)
    {
      animProgress = 1.0f;
      animState = SHOWING_LABEL;
      stateStartTime = currentTime;
    }
    break;
  }

  // Easing function for smooth animation (ease-in-out)
  auto easeInOutQuad = [](float t) -> float
  {
    return t < 0.5f ? 2.0f * t * t : 1.0f - 2.0f * (1.0f - t) * (1.0f - t);
  };

  float easedProgress = easeInOutQuad(animProgress);

  // Color coded based on slave_status
  uint16_t statusColor = TFT_GREEN;
  if (slave_status == -1) // disconnected
  {
    statusColor = TFT_BLUE;
  }
  else if (slave_status == 0)
  {
    statusColor = TFT_YELLOW;
  }
  else if (slave_status == 2)
  {
    statusColor = TFT_CYAN;
  }

  botuiSprite.setTextFont(2); // Smaller font like before

  // Calculate Y positions for animation
  const int centerY = 18;
  const int textHeight = 16; // Approximate height for font 2
  const int offscreenTop = -textHeight;
  const int offscreenBottom = botuiSprite.height();

  // Draw based on animation state
  if (animState == SHOWING_LABEL)
  {
    // Show only "STATUS" label
    botuiSprite.setTextColor(TFT_LIGHTGREY, TFT_BLACK);
    botuiSprite.drawString("STATUS", tft.width() / 2, centerY);
  }
  else if (animState == ANIM_TO_MSG)
  {
    // "STATUS" scrolls up and out, status_msg scrolls up into view
    int labelY = centerY - (int)((centerY - offscreenTop) * easedProgress);
    int msgY = offscreenBottom - (int)((offscreenBottom - centerY) * easedProgress);

    // Draw STATUS moving up
    botuiSprite.setTextColor(TFT_LIGHTGREY, TFT_BLACK);
    botuiSprite.drawString("STATUS", tft.width() / 2, labelY);

    // Draw message moving up from bottom
    botuiSprite.setTextColor(statusColor, TFT_BLACK);
    botuiSprite.drawString(status_msg, tft.width() / 2, msgY);
  }
  else if (animState == SHOWING_MSG)
  {
    // Show only status message
    botuiSprite.setTextColor(statusColor, TFT_BLACK);
    botuiSprite.drawString(status_msg, tft.width() / 2, centerY);
  }
  else if (animState == ANIM_TO_LABEL)
  {
    // status_msg scrolls up and out, "STATUS" scrolls up into view
    int msgY = centerY - (int)((centerY - offscreenTop) * easedProgress);
    int labelY = offscreenBottom - (int)((offscreenBottom - centerY) * easedProgress);

    // Draw message moving up
    botuiSprite.setTextColor(statusColor, TFT_BLACK);
    botuiSprite.drawString(status_msg, tft.width() / 2, msgY);

    // Draw STATUS moving up from bottom
    botuiSprite.setTextColor(TFT_LIGHTGREY, TFT_BLACK);
    botuiSprite.drawString("STATUS", tft.width() / 2, labelY);
  }

  // No need to set uiNeedsUpdate since drawUIOverlay is called frequently

  // Draw borders for camera area
  static int recognition_success_timer = 0;
  if (recognition_success)
  {
    statusColor = TFT_GREEN;
    recognition_success_timer++;
  }
  else
    statusColor = TFT_LIGHTGREY;

  if (recognition_success_timer > 100) // Show green border
  {
    recognition_success = false;
    recognition_success_timer = 0;
  }

  topuiSprite.fillRect(0, topuiSprite.height() - 4, tft.width(), 4, statusColor);
  botuiSprite.fillRect(0, 0, tft.width(), 4, statusColor);

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
  sendUARTPing();
}

// Task: Check for ping timeout
void checkPingTimeout()
{
  if (ping_counter > 0 && (millis() - last_pong_time > PONG_TIMEOUT))
  {
    Serial.println("!!! WARNING: No pong response for 5 seconds !!!");
    Serial.println("Connection to slave may be lost.\n");
    if (slave_status != -1)
    {
      if (taskGetCameraStatus.isEnabled())
        taskGetCameraStatus.disable();
      slave_status = -1; // mark as disconnected
      updateStatusMsg("Connection issue");
    }
    // Keep checking - stay in disconnected state
  }
  else if (slave_status == -1 && ping_counter > 0)
  {
    // Only recover from disconnected state if we're receiving pongs again
    Serial.println("Connection restored!");
    if (!taskGetCameraStatus.isEnabled())
      taskGetCameraStatus.enable();
    slave_status = 0; // back to standby
    updateStatusMsg("On Stand By");
  }
}

void getCameraStatus()
{
  sendUARTCommand("get_status");

  // Update status message based on current state if no recent update
  static unsigned long lastStatusUpdate = 0;
  static int lastKnownStatus = -999;

  // Only update if status changed and no message in last 5 seconds
  if (slave_status != lastKnownStatus && (millis() - lastStatusUpdate > 5000))
  {
    lastKnownStatus = slave_status;
    lastStatusUpdate = millis();

    if (status_msg == "" || status_msg.length() == 0)
    {
      if (slave_status == -1)
      {
        updateStatusMsg("Not connected");
      }
      else if (slave_status == 0)
      {
        updateStatusMsg("On Stand By");
      }
      else if (slave_status == 1)
      {
        updateStatusMsg("Doorbell Active");
      }
      else if (slave_status == 2)
      {
        updateStatusMsg("Looking for faces");
      }
    }
  }
}

// Task: Handle HTTP requests
void handleHTTPTask()
{
  handleHTTPClient();
}