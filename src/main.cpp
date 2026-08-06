#include <Arduino.h>
#include <ArduinoJson.h>
#include <HardwareSerial.h>
#include <TFT_eSPI.h>
#include <SPI.h>
#include <WiFi.h>
#include <HTTPClient.h>
// #include "WiFiServer.h"
#include <TaskScheduler.h>
#include "uart_commands.h"
#include "lcd_helper.h"
#include "nfc_controller.h"
#include "nfc_scan_state.h"
// #include "http_control.h"  // DISABLED: HTTP server to save ~10-14KB RAM
#include "SPIMaster.h"
#include "slave_state_manager.h"
#include "weather.h"
#include "heartbeat.h"
#include "doorbell_mqtt.h"
#include "logger.h"
#include "face_detection_sender.h"
#include "network_manager.h"
#include "app_config.h"
#include <TJpg_Decoder.h>
#include <cstring>
#include <esp_system.h>
#include <esp_heap_caps.h>

#define RX2 16
#define TX2 17
#define RX3 32
#define TX3 33

#define Doorbell_bt 34 // Analog pin
#define Call_bt 35     // Analog pin
#define UART_BAUD 115200
#define BUTTON_THRESHOLD 4000 // ADC threshold for button press (0-4095 scale)
#define Warn_led 4
#define Ready_led 2

// Create objects
TFT_eSPI tft = TFT_eSPI();
TFT_eSprite topuiSprite = TFT_eSprite(&tft); // Sprite for UI overlay
TFT_eSprite botuiSprite = TFT_eSprite(&tft); // Sprite for UI overlay

// UI sprite colour depth. 8-bit (RGB332) halves the DRAM cost of the two UI
// sprites (21,600 -> 10,800 bytes) at the price of colour banding on the
// smooth-drawn status dot. Set back to 16 if the banding is not acceptable.
#define UI_SPRITE_COLOR_DEPTH 8

// Mirror the camera feed horizontally (selfie view). Costs one in-place row
// reversal per decoded block - no extra memory, negligible time.
#define VIDEO_MIRROR 1

// Face detection box
#define FACE_BOX_COLOR TFT_BLUE
#define FACE_BOX_THICKNESS 2

// Mutex for TFT/sprite access (thread safety)
SemaphoreHandle_t tftMutex = NULL;

String status_msg = "";
bool status_msg_is_temporary = false; // Flag to indicate temporary status message
int recognition_state = 0;            // 0=none, 1=success, 2=failure
NFCCardScanStatus cardScanStatus = NFC_SCAN_IDLE;
String status_msg_fallback = "";          // Message to display after temporary message is shown once
unsigned long status_msg_last_update = 0; // Timestamp of last status message update

// UI flow timing for upload/welcome screen (non-blocking)
unsigned long upload_screen_start_time = 0;
unsigned long welcome_screen_start_time = 0;
bool show_upload_screen = false;
// Set by anything that draws into the video band other than the clock screen
// (video frames, upload screen). The clock screen does a full clear when it
// sees this, so leftovers cannot show through its per-field redraws.
volatile bool videoBandDirty = true;
bool show_welcome_screen = false;
char welcome_message[64] = "";

Scheduler myscheduler;
HardwareSerial MasterSerial(1); // Use UART1
HardwareSerial AmpSerial(2);    // Use UART2

extern TFT_eSPI tft;          // Your initialized display object
extern uint8_t *g_spiFrame;   // Pointer to SPI-received JPEG frame
extern size_t g_spiFrameSize; // Size of JPEG frame
SPIMaster spiMaster;

// Ping-Pong (Camera/Slave)
uint32_t ping_counter = 0;
unsigned long last_pong_time = 0;
#define PONG_TIMEOUT 10000
int slave_status = 0; // 0 = standby, -1 = disconneccted, 1 = camera_running, 2 = face_recog running

// Ping-Pong (Amp Module)
uint32_t amp_ping_counter = 0;
unsigned long last_amp_pong_time = 0;
#define AMP_PONG_TIMEOUT 10000
int amp_status = 0; // 0 = standby, -1 = disconnected, 1 = playing

// Disconnect Warning Timer (30 seconds)
#define DISCONNECT_WARNING_INTERVAL 30000 // 30 seconds
unsigned long slave_disconnect_start = 0;
unsigned long amp_disconnect_start = 0;
bool slave_disconnect_warning_sent = false;
bool amp_disconnect_warning_sent = false;

// Ready LED timer
unsigned long Ready_led_on_time = 0;
#define READY_LED_DURATION 1000

// Face recognition timeout
unsigned long face_recognition_start_time = 0;
bool face_recognition_active = false;
#define FACE_RECOGNITION_TIMEOUT 10000 // 10 seconds

// Dual button hold detection (for system reboot)
bool both_buttons_hold_handled = false;

// Preview mode state (for two-step doorbell interaction)
bool preview_mode_active = false;

// NFC scan mode state (for backend-triggered scans)
NFCScanState nfcScanState;
bool isNfcAddCardMode = false;

// UI state
bool uiNeedsUpdate = true; // Flag to redraw UI elements
#define VIDEO_Y_OFFSET 40  // Reserve top 20px for status bar
#define VIDEO_HEIGHT 200   // Video area height

// Cached values for optimization
static String cachedTimeStr = "";
static String cachedDateStr = "";
static unsigned long lastTimeUpdate = 0;
static int lastDrawnStatus = -999;

// Face detection bounding box
bool hasFaceDetection = false;
int face_bbox_x = 0;
int face_bbox_y = 0;
int face_bbox_w = 0;
int face_bbox_h = 0;
unsigned long lastFaceDetectionTime = 0;
#define FACE_DETECTION_TIMEOUT 1500 // Clear bbox after 1.5 seconds

// Button state tracking
#define BUTTON_DEBOUNCE_MS 50         // Debounce time in milliseconds
#define BUTTON_HOLD_THRESHOLD_MS 1000 // Time to consider button "held" (1 second)

struct ButtonState
{
  bool currentState;              // Current debounced state
  bool lastRawState;              // Last raw reading
  bool lastDebouncedState;        // Last stable state
  unsigned long lastDebounceTime; // Last time the pin changed
  unsigned long pressStartTime;   // When button was first pressed
  bool pressHandled;              // Flag to prevent repeated triggers
  bool holdHandled;               // Flag to prevent repeated hold triggers
};

ButtonState doorbellButton = {false, false, false, 0, 0, false, false};
ButtonState callButton = {false, false, false, 0, 0, false, false};

// Streaming state tracking
#include "streaming_state.h"
bool isStreaming = false; // Track if camera/audio streaming to backend is active

void checkUARTData();
void checkUART2Data();
void sendPingTask();
void sendAmpPingTask();
void checkPingTimeout();
void checkAmpPingTimeout();
void checkDisconnectWarning();
void ProcessFrame();
void drawUIOverlay();
void lcdhandoff();
void checkButtons();
void checkSlaveSyncTask();
void updateWeather();
void wifiWatchdogTask();
void sendServerHeartbeatTask();
void drawWifiSymbol(int x, int y, int strength);
void reportHeapTask();
void onCardDetected(NFCCardData card);
void checkTimers();
bool tft_jpg_render_callback(int16_t x, int16_t y, uint16_t w, uint16_t h, uint16_t *bitmap);
String getCurrentTimeAsString();
String getCurrentDateAsString();

Task taskCheckUART(20, TASK_FOREVER, &checkUARTData);                         // Check UART buffer every 20ms
Task taskCheckUART2(20, TASK_FOREVER, &checkUART2Data);                       // Check UART2 (Amp) buffer every 20ms
Task taskSendPing(1000, TASK_FOREVER, &sendPingTask);                         // Send ping every 1s
Task taskSendAmpPing(1000, TASK_FOREVER, &sendAmpPingTask);                   // Send ping to Amp every 1s
Task taskCheckTimeout(1000, TASK_FOREVER, &checkPingTimeout);                 // Check timeout every 1s
Task taskCheckAmpTimeout(1000, TASK_FOREVER, &checkAmpPingTimeout);           // Check Amp timeout every 1s
Task taskCheckDisconnectWarning(1000, TASK_FOREVER, &checkDisconnectWarning); // Check for 30s disconnects
Task taskWiFiWatchdog(30000, TASK_FOREVER, &wifiWatchdogTask);                // Check WiFi connection every 30s
Task taskProcessFrame(5, TASK_FOREVER, &ProcessFrame);                        // Check for frames every 5ms
Task taskCheckTimers(100, TASK_FOREVER, &checkTimers);                        // Check LED and face recognition timers
Task taskdrawUIOverlay(10, TASK_FOREVER, &drawUIOverlay);                     // Update UI overlay every 10ms
Task tasklcdhandoff(200, TASK_FOREVER, &lcdhandoff);                          // Check if we need to hand off LCD to ProcessFrame
Task taskCheckButtons(10, TASK_FOREVER, &checkButtons);                       // Check button state every 10ms
Task taskCheckSlaveSync(1000, TASK_FOREVER, &checkSlaveSyncTask);             // Check slave mode sync and recovery every 1s
Task taskUpdateWeather(1800000, TASK_FOREVER, &updateWeather);                // Update weather every 30 minutes (1800000ms)
Task taskSendServerHeartbeat(60000, TASK_FOREVER, &sendServerHeartbeatTask);  // Send heartbeat to server every 60s
Task taskProcessDoorbellMQTT(100, TASK_FOREVER, &processDoorbellMQTT);        // Process MQTT connection every 100ms
Task taskReportHeap(10000, TASK_FOREVER, &reportHeapTask);                    // Report heap/stack/SPI stats every 10s

void setup()
{
  Serial.begin(115200);

  // Setup GPIOs
  pinMode(Warn_led, OUTPUT);
  pinMode(Ready_led, OUTPUT);

  digitalWrite(Warn_led, HIGH);
  digitalWrite(Ready_led, LOW);

  // CRITICAL: Wait for power supply to stabilize before LCD init
  // ST7789 requires ~120ms power-on time, 500ms ensures reliability
  // This fixes the issue where LCD fails to init on external power only
  delay(500);

  Serial.println("\n\n=================================");
  Serial.println("ESP32_Embbeded_Home - Doorbell_lcd");
  Serial.println("=================================\n");

  // Create mutex for TFT/sprite thread safety
  tftMutex = xSemaphoreCreateMutex();
  if (tftMutex == NULL)
  {
    Serial.println("[ERROR] Failed to create TFT mutex");
    while (1)
      delay(100);
  }

  // Initialize LCD with retry logic for power-on reliability
  Serial.println("Initializing TFT_eSPI ST7789 screen...");
  bool lcd_init_success = false;
  for (int retry = 0; retry < 3; retry++)
  {
    if (retry > 0)
    {
      Serial.printf("LCD init attempt %d/3...\n", retry + 1);
      delay(200); // Additional delay between retries
    }

    tft.init();
    tft.setRotation(0);
    tft.setSwapBytes(true); // Match TFT byte order

    // Test if LCD initialized by trying to fill screen
    tft.fillScreen(TFT_BLACK);
    delay(50);

    // If we got here without crashing, consider it successful
    lcd_init_success = true;
    Serial.println("LCD initialized successfully");
    break;
  }

  if (!lcd_init_success)
  {
    Serial.println("[ERROR] LCD initialization failed after 3 attempts");
    // Continue anyway - may recover later
  }

  // Initialize sprites. The video area has no sprite - JPEG blocks are decoded
  // straight to the panel, which saves 96KB of DRAM.
  Serial.println("Creating UI sprites...");
  topuiSprite.setColorDepth(UI_SPRITE_COLOR_DEPTH);
  if (topuiSprite.createSprite(tft.width(), VIDEO_Y_OFFSET + 5) == nullptr)
  {
    Serial.println("[ERROR] Failed to allocate top UI sprite");
  }

  botuiSprite.setColorDepth(UI_SPRITE_COLOR_DEPTH);
  if (botuiSprite.createSprite(tft.width(), VIDEO_Y_OFFSET + 5) == nullptr)
  {
    Serial.println("[ERROR] Failed to allocate bottom UI sprite");
  }

  Serial.println("Sprites initialized successfully");
  Serial.printf("[MEM] After sprites - free: %u, largest 8-bit block: %u\n",
                ESP.getFreeHeap(),
                heap_caps_get_largest_free_block(MALLOC_CAP_8BIT | MALLOC_CAP_INTERNAL));

  // GPIO 34 and 35 are ADC1 channels - will use analogRead()

  Serial.printf("Buttons initialized: Doorbell=GPIO%d, Call=GPIO%d (analog mode, threshold=%d)\n",
                Doorbell_bt, Call_bt, BUTTON_THRESHOLD);

  MasterSerial.begin(UART_BAUD, SERIAL_8N1, RX2, TX2);
  AmpSerial.begin(UART_BAUD, SERIAL_8N1, RX3, TX3);

  Serial.printf("UART initialized: RX=GPIO%d, TX=GPIO%d, Baud=%d\n", RX2, TX2, UART_BAUD);
  Serial.printf("UART2 (Amp) initialized: RX=GPIO%d, TX=GPIO%d, Baud=%d\n", RX3, TX3, UART_BAUD);
  delay(100);

  if (!spiMaster.begin())
  {
    // Non-fatal: the rest of the system (NFC, WiFi, MQTT, UI) still works
    // without video, so never halt the boot here.
    Serial.println("[ERROR] SPI initialization failed - continuing without video");
  }
  Serial.println("SPI initialization started");

  // Start SPI task on Core 1 for dedicated frame reception
  if (!spiMaster.startTask())
  {
    Serial.println("[ERROR] Failed to start SPI task on Core 1 - continuing without video");
  }
  // Start NFC on Core 0
  if (initNFC())
  {
    setNFCCardCallback(onCardDetected);
    Serial.println("[MAIN] NFC initialized");
  }

  // Initialize WiFi (needed for backend communication, weather, heartbeat, MQTT)
  Serial.println("\n=== WiFi Setup ===");
  Serial.printf("Connecting to %s...\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.setAutoConnect(true);
  WiFi.setSleep(false); // Disable WiFi sleep for better stability
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int wifi_timeout = 20; // 20 second timeout
  while (WiFi.status() != WL_CONNECTED && wifi_timeout > 0)
  {
    delay(500);
    Serial.print(".");
    wifi_timeout--;
  }

  if (WiFi.status() == WL_CONNECTED)
  {
    Serial.println("\n✅ WiFi Connected!");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());

    // Configure NTP for Thailand (UTC+7)
    Serial.println("Configuring time for Thailand (UTC+7)...");
    configTime(7 * 3600, 0, "pool.ntp.org");
  }
  else
  {
    Serial.println("\n❌ WiFi Connection Failed!");
    Serial.println("Backend communication will not work");
  }

  // Initialize HTTP server
  // initHTTPServer();  // DISABLED: HTTP server to save ~10-14KB RAM (WiFi init moved above)
  delay(50);

  // Initialize weather module
  initWeather();
  Serial.println("[MAIN] Weather module initialized");

  // Fetch weather immediately on startup (instead of waiting 10 minutes)
  fetchWeatherTask();

  // Initialize heartbeat module
  // TODO: Update device_id and token after registering via POST /api/v1/devices/register
  initHeartbeat(
      BACKEND_URL,          // HTTP (not HTTPS) - ESP32 memory optimization
      DOORBELL_DEVICE_ID,   // Device ID (must match registration)
      DOORBELL_DEVICE_TYPE, // Device type
      DEVICE_AUTH_TOKEN     // API token (from registration response)
  );
  Serial.println("[MAIN] Heartbeat module initialized");

  // Initialize logger module (must be after heartbeat)
  initLogger();
  Serial.println("[MAIN] Logger module initialized");

  // Initialize shared network worker after backend config is available
  initNetworkManager(8192, 1, 0);
  Serial.println("[MAIN] Network manager initialized");

  // Initialize face detection sender (async/non-blocking).
  // Measured peak use during an upload is ~4.3KB. 6144 was tried and left only
  // 1836 bytes free, which is too thin for a task doing network I/O - a longer
  // server response or the JSON fallback path could overflow it. With ~100KB
  // of contiguous DRAM spare there is no reason to run it tight.
  initFaceDetectionSender(8192, 1, 0);
  Serial.println("[MAIN] Face detection sender initialized (async)");

  // Initialize MQTT client (WiFi already initialized by heartbeat module)
  initDoorbellMQTT(DOORBELL_DEVICE_ID); // Same device ID as heartbeat
  connectDoorbellMQTT();
  Serial.println("[MAIN] MQTT client initialized - will publish doorbell rings");

  // Configure TJpg_Decoder
  TJpgDec.setCallback(tft_jpg_render_callback); // Set the callback
  TJpgDec.setJpgScale(1);                       // Full resolution
  // Exactly ONE byte swap must happen between the decoder and the panel.
  // tft.setSwapBytes(true) (in the LCD init above) already swaps inside
  // pushImage, so the decoder must not swap as well - two swaps cancel out and
  // every pixel reaches the panel byte-reversed (right shapes, wrong colours).
  // This used to be true because the callback pushed into videoSprite, which
  // has its own _swapBytes flag defaulting to false. Drawing direct to the
  // panel does not.
  TJpgDec.setSwapBytes(false);

  last_pong_time = millis();
  last_amp_pong_time = millis();

  // Add tasks to scheduler
  myscheduler.addTask(taskCheckUART);
  myscheduler.addTask(taskCheckUART2);
  myscheduler.addTask(taskSendPing);
  myscheduler.addTask(taskSendAmpPing);
  myscheduler.addTask(taskCheckTimeout);
  myscheduler.addTask(taskCheckAmpTimeout);
  myscheduler.addTask(taskCheckDisconnectWarning);
  myscheduler.addTask(taskWiFiWatchdog);
  myscheduler.addTask(taskProcessFrame);
  myscheduler.addTask(taskdrawUIOverlay);
  myscheduler.addTask(tasklcdhandoff);
  myscheduler.addTask(taskCheckButtons);
  myscheduler.addTask(taskCheckSlaveSync);
  myscheduler.addTask(taskUpdateWeather);
  myscheduler.addTask(taskSendServerHeartbeat);
  myscheduler.addTask(taskCheckTimers);
  myscheduler.addTask(taskProcessDoorbellMQTT);
  myscheduler.addTask(taskReportHeap);
  taskCheckUART.enable();
  taskCheckUART2.enable();
  taskSendPing.enable();
  taskSendAmpPing.enable();
  taskCheckTimeout.enable();
  taskCheckAmpTimeout.enable();
  taskCheckDisconnectWarning.enable();
  taskWiFiWatchdog.enable();
  taskProcessFrame.enable();
  taskdrawUIOverlay.enable();
  tasklcdhandoff.enable();
  taskCheckButtons.enable();
  taskCheckSlaveSync.enable();
  taskUpdateWeather.enable();
  taskSendServerHeartbeat.enable();
  taskCheckTimers.enable();
  taskProcessDoorbellMQTT.enable();
  taskReportHeap.enable();

  last_pong_time = millis();
  last_amp_pong_time = millis();
  sendUARTCommand("get_status");

  // Clear screen and show startup message
  Serial.println("Clearing screen...");
  tft.fillScreen(TFT_BLACK);

  // Initial status message
  updateStatusMsg("Starting up...");
  sendUARTCommand("get_status");
  drawUIOverlay();

  // stop warning led
  digitalWrite(Warn_led, LOW);
  digitalWrite(Ready_led, HIGH);
  Ready_led_on_time = millis();
  delay(50);
  updateStatusMsg("Getting ready...", true, "Standing By");
  sendUART2Command("play", "connect_success"); // Play error sound

  Serial.printf("[MEM] Boot complete - free: %u, largest 8-bit block: %u, min free ever: %u\n",
                ESP.getFreeHeap(),
                heap_caps_get_largest_free_block(MALLOC_CAP_8BIT | MALLOC_CAP_INTERNAL),
                ESP.getMinFreeHeap());

  uiNeedsUpdate = true;
}

void loop()
{
  myscheduler.execute();
}

// Face box in screen coordinates, recomputed once per frame by ProcessFrame and
// consumed by the decode callback below.
static int16_t bboxScreenX = 0, bboxScreenY = 0, bboxScreenW = 0, bboxScreenH = 0;
static bool bboxActive = false;

// Paint the face box outline into a decoded block before it is pushed.
// Compositing here (rather than drawing over the panel afterwards) is what
// stops the box flashing: without a framebuffer, a box drawn after the push is
// erased by the next frame's decode and only redrawn milliseconds later, so it
// is missing for a large part of every frame period.
static void overlayFaceBox(int16_t dstX, int16_t dstY, uint16_t stride,
                           int16_t w, int16_t h, uint16_t *bitmap)
{
  const int16_t bx0 = bboxScreenX;
  const int16_t by0 = bboxScreenY;
  const int16_t bx1 = bboxScreenX + bboxScreenW - 1;
  const int16_t by1 = bboxScreenY + bboxScreenH - 1;

  // Reject blocks that cannot touch the box
  if (dstX > bx1 || dstX + w - 1 < bx0 || dstY > by1 || dstY + h - 1 < by0)
    return;

  // pushImage byte-swaps on the way out (tft.setSwapBytes(true)), so store the
  // colour pre-swapped for it to arrive correct.
  const uint16_t colour = (uint16_t)((FACE_BOX_COLOR >> 8) | (FACE_BOX_COLOR << 8));

  for (int16_t row = 0; row < h; row++)
  {
    const int16_t sy = dstY + row;
    if (sy < by0 || sy > by1)
      continue;

    const bool edgeRow = (sy - by0 < FACE_BOX_THICKNESS) || (by1 - sy < FACE_BOX_THICKNESS);
    uint16_t *p = bitmap + (size_t)row * stride;

    for (int16_t col = 0; col < w; col++)
    {
      const int16_t sx = dstX + col;
      if (sx < bx0 || sx > bx1)
        continue;

      const bool edgeCol = (sx - bx0 < FACE_BOX_THICKNESS) || (bx1 - sx < FACE_BOX_THICKNESS);
      if (edgeRow || edgeCol)
        p[col] = colour;
    }
  }
}

// TJpg_Decoder callback: draw a decoded block straight to the panel.
// Coordinates arrive already offset by the drawJpg() origin, so they are
// absolute screen coordinates. No full-frame buffer is involved.
bool tft_jpg_render_callback(int16_t x, int16_t y, uint16_t w, uint16_t h, uint16_t *bitmap)
{
  const int16_t bandBottom = VIDEO_Y + VIDEO_H;
  const int16_t bandRight = VIDEO_X + VIDEO_W;

  // Blocks arrive top-to-bottom, so once we are past the bottom of the band
  // nothing visible remains. Returning false aborts the decode and makes
  // drawJpg() report JDR_INTR (1) - the caller treats that as success.
  if (y >= bandBottom)
    return false;

  // Right of the band: skip this block but keep decoding
  if (x >= bandRight)
    return true;

  int16_t drawHeight = h;
  if (y + drawHeight > bandBottom)
    drawHeight = bandBottom - y;

  int16_t drawWidth = w;
  if (x + drawWidth > bandRight)
    drawWidth = bandRight - x;

  int16_t dstX = x;

#if VIDEO_MIRROR
  // Reverse the visible pixels of each row in place. Source pixel i sits at
  // screen x+i, which mirrors to bandRight-1-(x+i-VIDEO_X), so the block lands
  // at the destination below with its rows reversed.
  for (int16_t row = 0; row < drawHeight; row++)
  {
    uint16_t *p = bitmap + (size_t)row * w;
    for (int16_t a = 0, b = drawWidth - 1; a < b; a++, b--)
    {
      const uint16_t t = p[a];
      p[a] = p[b];
      p[b] = t;
    }
  }
  dstX = VIDEO_X + VIDEO_W - (x - VIDEO_X) - drawWidth;
#endif

  if (bboxActive)
  {
    overlayFaceBox(dstX, y, w, drawWidth, drawHeight, bitmap);
  }

  if (drawWidth == w)
  {
    // Full-width block: rows are contiguous, push in one go
    tft.pushImage(dstX, y, drawWidth, drawHeight, bitmap);
  }
  else
  {
    // Horizontally clipped: the source stride is still w, so pushing a
    // narrower rectangle in one call would shear the block. Push row by row.
    for (int16_t row = 0; row < drawHeight; row++)
    {
      tft.pushImage(dstX, y + row, drawWidth, 1, bitmap + (size_t)row * w);
    }
  }

  return true; // continue decoding
}

// Task: Process SPI frames and display on LCD
void ProcessFrame()
{
  if (!spiMaster.isFrameReady())
    return;

  // Acquire mutex for thread-safe TFT access
  if (xSemaphoreTake(tftMutex, pdMS_TO_TICKS(20)) != pdTRUE)
  {
    // Couldn't acquire mutex - drop this frame to free the buffer
    Serial.println("[FRAME] Mutex timeout - dropping frame");
    spiMaster.ackFrame();
    return;
  }

  static unsigned long lastFrameTime = 0;
  static unsigned long frameCount = 0;
  static float currentFPS = 0.0;

  uint8_t *frame = spiMaster.getFrameData();
  uint32_t frameSize = spiMaster.getFrameSize();
  uint16_t frameId = spiMaster.getFrameId();

  if (!frame || frameSize == 0)
  {
    xSemaphoreGive(tftMutex);
    return;
  }

  // Calculate FPS
  unsigned long now = millis();
  frameCount++;
  if (now - lastFrameTime >= 1000)
  { // Update every second
    currentFPS = frameCount * 1000.0 / (now - lastFrameTime);
    frameCount = 0;
    lastFrameTime = now;
    uiNeedsUpdate = true; // Tri/gger UI update for FPS counter
  }

  // Enhanced JPEG validation
  if (frameSize < 100 || frameSize > 50000)
  {
    Serial.printf("[FRAME] Invalid size: %u bytes\n", frameSize);
    spiMaster.ackFrame();
    xSemaphoreGive(tftMutex);
    return;
  }

  // Validate JPEG SOI (Start of Image: 0xFFD8)
  if (frame[0] != 0xFF || frame[1] != 0xD8)
  {
    // Dump the leading bytes: all-zero means the slave had not queued its data
    // yet (raise SPI_HEADER_TO_DATA_DELAY_MS); an 0xFFD8 further in means the
    // stream is byte-misaligned instead.
    Serial.printf("[FRAME] Bad header, first 8 bytes:");
    for (int i = 0; i < 8 && i < (int)frameSize; i++)
    {
      Serial.printf(" %02X", frame[i]);
    }
    Serial.println();
    spiMaster.ackFrame();
    xSemaphoreGive(tftMutex);
    return;
  }

  // Validate JPEG EOI (End of Image: 0xFFD9) - check last 2 bytes
  if (frame[frameSize - 2] != 0xFF || frame[frameSize - 1] != 0xD9)
  {
    Serial.printf("[FRAME] Incomplete: last=0x%02X%02X (size=%u)\n",
                  frame[frameSize - 2], frame[frameSize - 1], frameSize);
    spiMaster.ackFrame();
    xSemaphoreGive(tftMutex);
    return;
  }

  // Work out the face box before decoding - the callback composites it into
  // the blocks as they are pushed.
  bboxActive = false;
  if (hasFaceDetection)
  {
    // Check if detection has timed out
    if (millis() - lastFaceDetectionTime > FACE_DETECTION_TIMEOUT)
    {
      hasFaceDetection = false;
    }
    else
    {
      // Scale bounding box from camera resolution to the video band
      // Camera appears to be wider, adjust X scale
      // Reduced scale by 0.7 to fix oversized bounding box
      float scaleX = ((float)VIDEO_W / 280.0) * 0.9;
      float scaleY = ((float)VIDEO_H / 240.0) * 0.9;

      bboxScreenX = VIDEO_X + (int16_t)(face_bbox_x * scaleX);
      bboxScreenY = VIDEO_Y + (int16_t)(face_bbox_y * scaleY);
      bboxScreenW = (int16_t)(face_bbox_w * scaleX);
      bboxScreenH = (int16_t)(face_bbox_h * scaleY);

#if VIDEO_MIRROR
      // Mirror the box too, so it keeps tracking the face in the mirrored image
      bboxScreenX = VIDEO_X + VIDEO_W - (bboxScreenX - VIDEO_X) - bboxScreenW;
#endif

      bboxActive = (bboxScreenW > 0 && bboxScreenH > 0);
    }
  }

  // Decode JPEG straight to the panel at the video origin (via callback).
  // Every pixel of the band is overwritten, so no clear is needed first.
  uint16_t result = TJpgDec.drawJpg(VIDEO_X, VIDEO_Y, frame, frameSize);

  // JDR_OK (0) = decoded fully. JDR_INTR (1) = our callback stopped the decode
  // once it passed the bottom of the video band, which is the normal path
  // whenever the camera frame is taller than VIDEO_H. Both are success.
  if (result != 0 && result != 1)
  {
    Serial.printf("[ERROR] JPEG decode failed: %d\n", result);
    // Only clear on decode failure to prevent artifacts
    tft.fillRect(VIDEO_X, VIDEO_Y, VIDEO_W, VIDEO_H, TFT_BLACK);
  }

  // Video content is now on screen - the clock screen must clear before it
  // redraws, or the last frame shows through around its text.
  videoBandDirty = true;

  // Draw UI overlay (optimized - only when needed or during animation)
  // Note: drawUIOverlay() will acquire/release mutex internally
  xSemaphoreGive(tftMutex); // Release before calling drawUIOverlay
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
  // Acquire mutex for thread-safe TFT access
  if (xSemaphoreTake(tftMutex, pdMS_TO_TICKS(10)) != pdTRUE)
  {
    // Couldn't acquire mutex - skip this frame to avoid blocking
    return;
  }

  // Update cached time strings every second
  unsigned long now = millis();
  if (now - lastTimeUpdate >= 1000)
  {
    cachedTimeStr = getCurrentTimeAsString();
    cachedDateStr = getCurrentDateAsString();
    lastTimeUpdate = now;
  }

  // Clear UI sprites
  topuiSprite.fillSprite(TFT_BLACK);
  botuiSprite.fillSprite(TFT_BLACK);

  // Display connection status indicator
  switch (slave_status)
  {
  case -1:
    topuiSprite.fillSmoothCircle(25, 22, 10, TFT_CYAN);
    break;
  case 0:
    topuiSprite.fillSmoothCircle(25, 22, 10, TFT_DARKGREY);
    break;
  case 1:
  {
    // Optimized blinking effect - calculate once
    float sine_wave = (sin(now * 0.003f) + 1.0f) * 0.5f;
    uint8_t blue_value = 50 + (uint8_t)(sine_wave * 205);
    topuiSprite.fillSmoothCircle(25, 22, 8, tft.color565(0, 0, blue_value));
  }
  break;
  }

  if (slave_status >= 1)
  {
    // Camera running - show time in top bar
    topuiSprite.setTextDatum(TC_DATUM);
    topuiSprite.setTextFont(4);
    topuiSprite.setTextColor(TFT_WHITE, TFT_BLACK);
    topuiSprite.drawString(cachedTimeStr, topuiSprite.width() / 2, 15);
  }
  else
  {
    // Camera OFF - show clock screen (only redraw when status changes or time updates).
    // Drawn straight to the panel: text is drawn with an opaque background and
    // padding so each field overwrites its own previous value. Only a state
    // change clears the whole band, which keeps the per-second tick flicker-free.
    static int lastClockUpdate = -1;
    if (lastClockUpdate != (int)(now / 1000) || lastDrawnStatus != slave_status)
    {
      lastClockUpdate = (int)(now / 1000);

      // Full clear when arriving from any other content (video frames, upload
      // screen) or on a state change. Otherwise the per-field padded redraws
      // below are enough, which is what keeps the per-second tick flicker-free.
      if (videoBandDirty || lastDrawnStatus != slave_status)
      {
        tft.fillRect(VIDEO_X, VIDEO_Y, VIDEO_W, VIDEO_H, TFT_BLACK);
        lastDrawnStatus = slave_status;
        videoBandDirty = false;
      }

      tft.setTextColor(TFT_WHITE, TFT_BLACK);
      tft.setTextDatum(TL_DATUM);

      struct tm timeinfo;
      if (getLocalTime(&timeinfo))
      {
        // Greeting
        tft.setTextFont(4);

        const char *greeting;
        if (timeinfo.tm_hour >= 5 && timeinfo.tm_hour < 12)
          greeting = "Good morning!";
        else if (timeinfo.tm_hour >= 12 && timeinfo.tm_hour < 16)
          greeting = "Good afternoon!";
        else if (timeinfo.tm_hour >= 16 && timeinfo.tm_hour < 18)
          greeting = "Good evening!";
        else
          greeting = "Good night";

        tft.setTextPadding(VIDEO_W - 10);
        tft.drawString(greeting, VIDEO_X + 10, VIDEO_Y + 20);
      }
      else
      {
        tft.setTextFont(4);
        tft.setTextPadding(VIDEO_W - 10);
        tft.drawString("Camera OFF", VIDEO_X + 10, VIDEO_Y + 20);
      }

      // Large time
      tft.setTextFont(6);
      tft.setTextPadding(VIDEO_W - 10);
      tft.drawString(cachedTimeStr, VIDEO_X + 10, VIDEO_Y + 45);

      // Date
      tft.setTextFont(4);
      tft.setTextPadding(VIDEO_W - 20);
      tft.drawString(cachedDateStr, VIDEO_X + 20, VIDEO_Y + 85);

      // Weather display
      WeatherData weather = getWeatherData();
      tft.setTextPadding(VIDEO_W - 10);
      if (weather.isValid)
      {
        char weatherStr[48];
        snprintf(weatherStr, sizeof(weatherStr), "%s %dC",
                 weather.description.c_str(), (int)weather.temperature);
        tft.drawString(weatherStr, VIDEO_X + 10, VIDEO_Y + 125);
      }
      else
      {
        tft.drawString(weather.description, VIDEO_X + 10, VIDEO_Y + 125); // Error/loading message
      }

      tft.setTextPadding(0);
    }
  }

  // WiFi indicator: Calculate strength based on RSSI
  int wifiStrength = 0;
  if (WiFi.status() == WL_CONNECTED)
  {
    int32_t rssi = WiFi.RSSI();
    // RSSI to bars conversion:
    // > -50 dBm = Excellent (3 bars)
    // -50 to -60 dBm = Good (3 bars)
    // -60 to -70 dBm = Fair (2 bars)
    // -70 to -80 dBm = Weak (1 bar)
    // < -80 dBm = Very weak (0 bars)
    if (rssi > -60)
    {
      wifiStrength = 3;
    }
    else if (rssi > -70)
    {
      wifiStrength = 2;
    }
    else if (rssi > -80)
    {
      wifiStrength = 1;
    }
    else
    {
      wifiStrength = 0;
    }
  }
  drawWifiSymbol(tft.width() - 25, 28, wifiStrength);

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
  static String lastStatusMsg = ""; // Track previous message to detect changes

  // Initialize timing on first run
  if (firstRun)
  {
    stateStartTime = millis();
    firstRun = false;
  }

  // Detect status message change - trigger immediate animation if showing label
  if (status_msg != lastStatusMsg && status_msg.length() > 0)
  {
    lastStatusMsg = status_msg;

    // If currently showing "STATUS" label, immediately start animation to show new message
    if (animState == SHOWING_LABEL)
    {
      animState = ANIM_TO_MSG;
      stateStartTime = millis();
      animProgress = 0.0f;
      Serial.printf("[UI] Status message changed to '%s' - triggering immediate animation\n", status_msg.c_str());
    }
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
    // Show only status message64
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
  static int recognition_state_timer = 0;
  static int card_scan_timer = 0; // Renamed from card_success_timer

  // Handle recognition state (0=none, 1=success, 2=failure) and NFC scan status
  if (recognition_state == 1 && cardScanStatus == NFC_SCAN_SUCCESS)
  {
    statusColor = TFT_GREEN; // Both success - show green
    recognition_state_timer++;
    card_scan_timer++;
  }
  else if (recognition_state == 1)
  {
    statusColor = TFT_GREEN; // Recognition success - show green
    recognition_state_timer++;
  }
  else if (recognition_state == 2)
  {
    statusColor = TFT_RED; // Recognition failure - show red
    recognition_state_timer++;
  }
  else if (cardScanStatus == NFC_SCAN_SUCCESS)
  {
    statusColor = TFT_GREEN; // NFC scan success - show green
    card_scan_timer++;
  }
  else if (cardScanStatus == NFC_SCAN_DENIED)
  {
    statusColor = TFT_BLUE; // NFC scan denied - show red
    card_scan_timer++;
  }
  else
    statusColor = TFT_LIGHTGREY; // Default - grey border

  // Handle recognition state timer
  if (recognition_state_timer > 25) // Show border for ~2.5 seconds (100 * 25ms)
  {
    sendUARTCommand("camera_control", "camera_stop");
    recognition_state = 0; // Reset to none
    recognition_state_timer = 0;
    preview_mode_active = false; // Exit preview mode after recognition completes
  }

  if (card_scan_timer > 100) // Show border for NFC scan status for a duration
  {
    cardScanStatus = NFC_SCAN_IDLE; // Reset to idle
    card_scan_timer = 0;
  }

  topuiSprite.fillRect(0, topuiSprite.height() - 4, tft.width(), 4, statusColor);
  botuiSprite.fillRect(0, 0, tft.width(), 4, statusColor);

  // Push UI sprite to screen (top bar)
  topuiSprite.pushSprite(0, 20);
  botuiSprite.pushSprite(0, 265);

  // Release mutex
  xSemaphoreGive(tftMutex);
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
  while (MasterSerial.available())
  {
    String line = MasterSerial.readStringUntil('\n');
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
    Serial.println("!!! WARNING: No pong response for 10 seconds !!!");
    Serial.println("Connection to slave may be lost.\n");
    if (slave_status != -1)
    {
      slave_status = -1; // mark as disconnected
      updateActualMode(-1);
      updateStatusMsg("Connection issue");
    }
    // Keep checking - stay in disconnected state
  }
  else if (slave_status == -1 && ping_counter > 0 && (millis() - last_pong_time < PONG_TIMEOUT))
  {
    // Only recover from disconnected state if we're receiving pongs again
    Serial.println("Connection restored!");
    slave_status = 0; // back to standby
    updateActualMode(0);
    updateStatusMsg("Connection restored", true, "On Stand By");
    sendDoorbellStatus(false, false); // Camera inactive (standby)
  }
}

// Task: Check for incoming UART2 (Amp) data
void checkUART2Data()
{
  while (AmpSerial.available())
  {
    String line = AmpSerial.readStringUntil('\n');
    if (line.length() > 0)
    {
      handleUART2Response(line);
    }
  }
}

// Task: Send periodic ping to Amp
void sendAmpPingTask()
{
  sendUART2Ping();
}

// Task: Check for Amp ping timeout
void checkAmpPingTimeout()
{
  if (amp_ping_counter > 0 && (millis() - last_amp_pong_time > AMP_PONG_TIMEOUT))
  {
    if (amp_status != -1)
    {
      Serial.println("!!! WARNING: No pong response from Amp for 10 seconds !!!");
      Serial.println("Connection to Amp may be lost.\n");
      amp_status = -1; // mark as disconnected
    }
    // Keep checking - stay in disconnected state
  }
  else if (amp_status == -1 && amp_ping_counter > 0 && (millis() - last_amp_pong_time < AMP_PONG_TIMEOUT))
  {
    // Recover from disconnected state if we're receiving pongs again
    Serial.println("Amp connection restored!");
    amp_status = 0; // back to standby
  }
}

// Task: Check for 30-second disconnections and log warnings
void checkDisconnectWarning()
{
  unsigned long currentTime = millis();

  if (slave_status == -1)
  {
    // If this is a new disconnection, record start time
    if (slave_disconnect_start == 0)
    {
      slave_disconnect_start = currentTime;
      slave_disconnect_warning_sent = false;
    }
    // 30 seconds passed since disconnection
    else if (!slave_disconnect_warning_sent && (currentTime - slave_disconnect_start >= DISCONNECT_WARNING_INTERVAL))
    {
      Serial.println("========================================");
      Serial.println("!!! CAMERA MODULE DISCONNECTED FOR 30+ SECONDS !!!");
      Serial.println("========================================");
      sendDisconnectWarning("camera", true); // Send warning to server
      slave_disconnect_warning_sent = true;
    }
  }
  else
  {
    slave_disconnect_start = 0;
    slave_disconnect_warning_sent = false;
  }

  if (amp_status == -1)
  {
    if (amp_disconnect_start == 0)
    {
      amp_disconnect_start = currentTime;
      amp_disconnect_warning_sent = false;
    }
    else if (!amp_disconnect_warning_sent && (currentTime - amp_disconnect_start >= DISCONNECT_WARNING_INTERVAL))
    {
      Serial.println("========================================");
      Serial.println("!!! AMP MODULE DISCONNECTED FOR 30+ SECONDS !!!");
      Serial.println("========================================");
      sendDisconnectWarning("amp", true); // Send warning to server
      amp_disconnect_warning_sent = true;
    }
  }
  else
  {
    amp_disconnect_start = 0;
    amp_disconnect_warning_sent = false;
  }
}

String uidToString(const uint8_t *uid, uint8_t uidLength)
{

  String result = "";

  for (byte i = 0; i < uidLength; i++)
  {

    if (uid[i] < 0x10)
    {

      result += "0";
    }

    result += String(uid[i], HEX);
  }

  result.toUpperCase();

  return result;
}

void onCardDetected(NFCCardData card)
{

  Serial.print("Card ID: ");

  Serial.println(uidToString(card.uid, card.uidLength));

  if (nfcScanState.active)
  {
    Serial.println("Scan and add to db");

    if (WiFi.status() != WL_CONNECTED)
    {
      Serial.println("[NFC] WiFi not connected, cannot send scan.");
      updateStatusMsg("WiFi disconnected", true, "Error");
      nfcScanState.active = false;
      nfcScanState.sessionId = "";
      return;
    }

    HTTPClient http;
    String backendUrl = String(BACKEND_SERVER_URL) + "/api/v1/devices/nfc/register/scan";
    http.begin(backendUrl);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Authorization", "Bearer " + String(DEVICE_API_TOKEN));
    http.setTimeout(5000);

    String cardUidHex = uidToString(card.uid, card.uidLength);

    String httpRequestData = "{\"card_id\": \"" + cardUidHex + "\", \"sessionId\": \"" + nfcScanState.sessionId + "\", \"device_id\": \"" + String(DEVICE_ID) + "\"}";

    Serial.printf("[NFC] Sending card scan to backend: %s\n", httpRequestData.c_str());
    updateStatusMsg("Sending card data...", true, "Sending");

    int httpResponseCode = http.POST(httpRequestData);

    if (httpResponseCode == 200)
    {
      Serial.println("[NFC] Card scan sent successfully.");
      updateStatusMsg("Card sent!", true, "Ready");
      cardScanStatus = NFC_SCAN_SUCCESS; // Registration success
    }
    else
    {
      Serial.printf("[NFC] Error sending card scan. HTTP code: %d\n", httpResponseCode);
      String response = http.getString();
      Serial.printf("[NFC] Backend response: %s\n", response.c_str());
      updateStatusMsg("Send failed", true, "Error");
      cardScanStatus = NFC_SCAN_DENIED; // Registration failed
    }

    http.end();

    nfcScanState.active = false;
    nfcScanState.sessionId = ""; // Clear session ID and state after use
    return;
  }

  // If not in registration mode, send a normal access scan
  else
  {
    String cardUidHex = uidToString(card.uid, card.uidLength);
    Serial.printf("[NFC] Sending access scan for card: %s\n", cardUidHex.c_str());

    if (WiFi.status() != WL_CONNECTED)
    {
      Serial.println("[NFC] WiFi not connected, cannot send access scan.");
      updateStatusMsg("WiFi disconnected", true, "Error");
      return;
    }

    HTTPClient http;
    String backendUrl = String(BACKEND_SERVER_URL) + "/api/v1/devices/nfc/scan/access";
    http.begin(backendUrl);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Authorization", "Bearer " + String(DEVICE_API_TOKEN));
    http.setTimeout(5000);

    String httpRequestData = "{\"device_id\": \"" + String(DEVICE_ID) + "\", \"card_id\": \"" + cardUidHex + "\"}";

    Serial.printf("[NFC] Sending access scan to backend: %s\n", httpRequestData.c_str());
    updateStatusMsg("Checking access...", true, "Standing By");

    int httpResponseCode = http.POST(httpRequestData);

    if (httpResponseCode == 200)
    {
      Serial.println("[NFC] Access granted!");
      sendUART2Command("play", "success"); // Play access granted sound
      updateStatusMsg("Access Granted!", true, "Standing By");
      cardScanStatus = NFC_SCAN_SUCCESS; // Access granted
    }
    else if (httpResponseCode == 403)
    {
      Serial.println("[NFC] Access denied (card not registered or unauthorized).");
      sendUART2Command("play", "error"); // Play error sound
      updateStatusMsg("Access Denied", true, "Standing By");
      cardScanStatus = NFC_SCAN_DENIED; // Access denied
    }
    else
    {
      Serial.printf("[NFC] Error sending access scan. HTTP code: %d\n", httpResponseCode);
      String response = http.getString();
      Serial.printf("[NFC] Backend response: %s\n", response.c_str());
      updateStatusMsg("Access Check Failed", true, "Standing By");
      cardScanStatus = NFC_SCAN_DENIED; // Other error
    }

    http.end();
  }
}

// Task: WiFi Watchdog - check connection health
void wifiWatchdogTask()
{
  static bool wasConnected = true;

  // Check WiFi connection (HTTP server disabled, but WiFi needed for backend communication)
  if (WiFi.status() != WL_CONNECTED)
  {
    Serial.println("⚠️ WiFi disconnected! Attempting reconnect...");
    WiFi.reconnect();

    // Log WiFi disconnection (only once per disconnect event)
    if (wasConnected)
    {
      StaticJsonDocument<256> meta;
      JsonObject metadata = meta.to<JsonObject>();
      metadata["rssi"] = WiFi.RSSI();
      metadata["uptime_ms"] = millis();
      logError("network", "WiFi connection lost - attempting reconnect", metadata);
      wasConnected = false;
    }
  }
  else if (!wasConnected)
  {
    // WiFi reconnected
    StaticJsonDocument<256> meta;
    JsonObject metadata = meta.to<JsonObject>();
    metadata["rssi"] = WiFi.RSSI();
    metadata["ip_address"] = WiFi.localIP().toString();
    logInfo("network", "WiFi reconnected successfully", metadata);
    wasConnected = true;
  }
}

// Helper function to update button state with debouncing
void updateButtonState(ButtonState &btn, int pin, const char *buttonName)
{
  // Read analog value from pin (12 bit 0-4095 on ESP32)
  int analogValue = analogRead(pin);

  // Button is pressed if analog value is above threshold (HIGH = pressed)
  bool rawState = (analogValue > BUTTON_THRESHOLD);
  unsigned long currentTime = millis();

  // Detect state change
  if (rawState != btn.lastRawState)
  {
    btn.lastDebounceTime = currentTime;
  }
  btn.lastRawState = rawState;

  // Check if debounce period has passed
  if ((currentTime - btn.lastDebounceTime) > BUTTON_DEBOUNCE_MS)
  {
    // State is stable, update current state
    bool previousState = btn.currentState;
    btn.currentState = rawState;

    // Detect button press (transition from released to pressed)
    if (btn.currentState && !previousState)
    {
      btn.pressStartTime = currentTime;
      btn.pressHandled = false;
      btn.holdHandled = false;

      Serial.printf("[BTN] %s pressed\n", buttonName);

      // Don't handle action here - wait for release to determine if press or hold
    }

    // Detect button hold (held down for BUTTON_HOLD_THRESHOLD_MS)
    if (btn.currentState && !btn.holdHandled)
    {
      if ((currentTime - btn.pressStartTime) >= BUTTON_HOLD_THRESHOLD_MS)
      {
        // Check if BOTH buttons are held (for system reboot - takes priority)
        bool bothButtonsHeld = doorbellButton.currentState && callButton.currentState;

        if (bothButtonsHeld && !both_buttons_hold_handled)
        {
          // Check if both have been held long enough (3 seconds from the later press)
          unsigned long bothHeldDuration = currentTime - max(doorbellButton.pressStartTime, callButton.pressStartTime);

          if (bothHeldDuration >= 3000)
          {
            both_buttons_hold_handled = true;
            doorbellButton.holdHandled = true;
            callButton.holdHandled = true;
            sendUART2Command("play", "error");
            Serial.println("[BTN] Both buttons held - rebooting system!");
            updateStatusMsg("Rebooting system...");

            // Log critical system restart event
            StaticJsonDocument<256> meta;
            JsonObject metadata = meta.to<JsonObject>();
            metadata["reason"] = "button_hold";
            metadata["uptime_ms"] = millis();
            metadata["free_heap"] = ESP.getFreeHeap();
            logCritical("system", "System restart via button hold", metadata);

            // Reboot Camera Slave
            Serial.println("[REBOOT] Sending reboot command to Camera...");
            sendUARTCommand("reboot");
            delay(500);

            // Reboot Amp Slave
            Serial.println("[REBOOT] Sending reboot command to Amp...");
            sendUART2Command("restart", "");
            delay(500);

            // Reboot LCD ESP32 (this device)
            Serial.println("[REBOOT] Rebooting LCD ESP32...");
            delay(1000);
            ESP.restart();
          }
        }
        else
        {
          // Only one button held - handle individual button action
          btn.holdHandled = true;

          Serial.printf("[BTN] %s held\n", buttonName);

          // Handle button hold action
          if (strcmp(buttonName, "Doorbell") == 0)
          {
            // Step 1: Start preview mode (camera + detection, no recognition yet)
            updateStatusMsg("Preview mode - Press again to recognize", true, "Standing By");
            sendUARTCommand("camera_control", "camera_start");
            delay(100);
            sendUARTCommand("resume_detection");

            // Enter preview mode
            preview_mode_active = true;
            Serial.println("[BTN] Entered preview mode - waiting for second press to recognize");
          }
          else if (strcmp(buttonName, "Call") == 0)
          {
            // Call button held - stop camera and exit preview mode
            updateStatusMsg("End call", true, "On Stand By");
            sendUARTCommand("camera_control", "camera_stop");
            preview_mode_active = false; // Exit preview mode if active
          }
        }
      }
    }

    // Detect button release
    if (!btn.currentState && previousState)
    {
      unsigned long pressDuration = currentTime - btn.pressStartTime;
      Serial.printf("[BTN] %s released (held for %lu ms)\n", buttonName, pressDuration);

      // Reset dual-button flag when either button is released
      if (!doorbellButton.currentState || !callButton.currentState)
      {
        both_buttons_hold_handled = false;
      }

      // Only trigger press action if button was released before hold threshold
      // and press hasn't been handled yet
      if (!btn.holdHandled && !btn.pressHandled && pressDuration < BUTTON_HOLD_THRESHOLD_MS)
      {
        btn.pressHandled = true;

        // Handle button press action (short press)
        if (strcmp(buttonName, "Doorbell") == 0)
        {
          // Check if in preview mode - if so, trigger recognition
          if (preview_mode_active)
          {
            // Step 2: Trigger face recognition
            updateStatusMsg("Recognizing face...", true, "Standing By");
            sendUARTCommand("recognize_face");

            // Start face recognition timeout timer
            face_recognition_start_time = millis();
            face_recognition_active = true;

            // Exit preview mode
            preview_mode_active = false;
            Serial.println("[BTN] Triggered recognition from preview mode");
          }
          else
          {
            // Not in preview mode - play doorbell audio and send ring event
            String oldStatus = status_msg;
            updateStatusMsg("Ringing...", true, oldStatus.c_str());
            sendUART2Command("play", "doorbell");

            // Send doorbell ring event to backend (for logging to Firebase)
            sendDoorbellRing();

            // Publish to MQTT for instant hub notification
            publishDoorbellRing();
          }
        }
        else if (strcmp(buttonName, "Call") == 0)
        {
          // Call button pressed - toggle streaming to backend
          if (!isStreaming)
          {
            // Start streaming
            updateStatusMsg("Starting stream...", true, "Ready");
            Serial.println("[BTN] Starting stream to backend");

            // Send stream control commands (action in params.name, id=0)
            //sendUARTCommand("stream_control", "mic_start", 0);
            //sendUARTCommand("mic_gain", "gain", 6);

            sendUARTCommand("stream_control", "camera_start", 0);
            delay(100);

            // Set desired camera state to running
            setDesiredMode(1);

            isStreaming = true;
            updateStatusMsg("Streaming active", true, "Streaming");
          }
          else
          {
            // Stop streaming
            updateStatusMsg("Stopping stream...", true, "Ready");
            Serial.println("[BTN] Stopping stream");

            // Stop streaming (action in params.name, id=0)
            sendUARTCommand("stream_control", "stop_stream", 0);

            // Set desired camera state to standby
            setDesiredMode(0);

            isStreaming = false;
            updateStatusMsg("Stream stopped", true, "Ready");
          }
        }
      }
    }
  }
}

// Task: Check button states with debouncing and hold detection
void checkButtons()
{
  updateButtonState(doorbellButton, Doorbell_bt, "Doorbell");
  updateButtonState(callButton, Call_bt, "Call");
}

// Task: Check if slave mode is synchronized and recover if needed
void checkSlaveSyncTask()
{
  // Send get_status command to slave
  sendUARTCommand("get_status");

  // Check synchronization and recover if needed
  checkSlaveSync();

  // Update slave_status from actual_slave_mode (for backward compatibility)
  slave_status = actual_slave_mode;

  checkStatusMessageExpiration();
}

void checkTimers()
{
  // Check Ready LED timeout
  if (Ready_led_on_time != 0 && (millis() - Ready_led_on_time > READY_LED_DURATION))
  {
    digitalWrite(Ready_led, LOW); // Turn the LED off
    Ready_led_on_time = 0;        // Stop the timer
  }

  // Check face recognition timeout (10 seconds)
  if (face_recognition_active && (millis() - face_recognition_start_time > FACE_RECOGNITION_TIMEOUT))
  {
    Serial.println("[TIMEOUT] Face recognition timeout - no face detected in 10 seconds");
    updateStatusMsg("Recognition timeout", true, "Standing By");
    sendUARTCommand("camera_control", "camera_stop");
    face_recognition_active = false;
    preview_mode_active = false; // Exit preview mode on timeout
  }

  // Manage UI flow for upload/welcome screen (non-blocking)
  if (show_upload_screen)
  {
    // After 1.5 seconds, hide upload screen and show welcome message
    if (millis() - upload_screen_start_time > 1500)
    {
      Serial.println("[UIFlow] Upload screen timeout - switching to clock mode");
      show_upload_screen = false;
      slave_status = 0; // Switch to clock mode

      // Show welcome/error message
      updateStatusMsg(welcome_message, true, "Ready");
      show_welcome_screen = true;
      welcome_screen_start_time = millis();
    }
  }

  if (show_welcome_screen)
  {
    // After 2.5 seconds, clear welcome message flag
    if (millis() - welcome_screen_start_time > 2500)
    {
      Serial.println("[UIFlow] Welcome screen timeout - returning to normal");
      show_welcome_screen = false;
    }
  }
}

// Task: Update weather data
void updateWeather()
{
  fetchWeatherTask();
}

// Task: Send heartbeat to server
void sendServerHeartbeatTask()
{
  sendHeartbeat();
}

// Periodic memory report.
// "free" counts all internal RAM including 32-bit-only IRAM, which cannot back
// a byte buffer - so it can look healthy while a large malloc still fails.
// "largest8" is the number that actually decides whether a big allocation or a
// task stack will succeed. "stack free" is the low-water mark in bytes: the
// closest that task has ever come to overflowing, so it is the only safe basis
// for shrinking a stack size.
void reportHeapTask()
{
  Serial.printf("[MEM] free=%u largest8=%u free8=%u minEver=%u\n",
                ESP.getFreeHeap(),
                heap_caps_get_largest_free_block(MALLOC_CAP_8BIT | MALLOC_CAP_INTERNAL),
                heap_caps_get_free_size(MALLOC_CAP_8BIT | MALLOC_CAP_INTERNAL),
                ESP.getMinFreeHeap());

  Serial.printf("[MEM] spi buffer=%u frames rx=%lu dropped=%lu\n",
                spiMaster.getBufferCapacity(),
                (unsigned long)spiMaster.getFramesReceived(),
                (unsigned long)spiMaster.getFramesDropped());

  // Names must be the truncated form FreeRTOS actually stored: it copies at
  // most configMAX_TASK_NAME_LEN-1 (15) chars, and xTaskGetHandle asserts if
  // asked for anything longer. "FaceDetectionSender" is stored as
  // "FaceDetectionSe".
  static const char *taskNames[] = {"spi_master", "NetworkManager",
                                    "FaceDetectionSe", "NFC_Reader", "loopTask"};
  Serial.print("[MEM] stack free:");
  for (size_t i = 0; i < sizeof(taskNames) / sizeof(taskNames[0]); i++)
  {
    TaskHandle_t handle = xTaskGetHandle(taskNames[i]);
    if (handle != NULL)
    {
      // ESP-IDF returns the high water mark in bytes already (not words)
      Serial.printf(" %s=%u", taskNames[i],
                    (unsigned)uxTaskGetStackHighWaterMark(handle));
    }
    else
    {
      Serial.printf(" %s=absent", taskNames[i]);
    }
  }
  Serial.println();
}
