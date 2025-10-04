#include <Arduino.h>
#include <ArduinoJson.h>
#include <HardwareSerial.h>
#include <TFT_eSPI.h>
#include <SPI.h>
#include <TaskScheduler.h>

#define RX2 16
#define TX2 17
#define UART_BAUD 115200

// Create objects
TFT_eSPI tft = TFT_eSPI();
Scheduler myscheduler;
HardwareSerial SlaveSerial(2); // Use UART2

// Ping-Pong
uint32_t ping_counter = 0;
unsigned long last_pong_time = 0;
#define PONG_TIMEOUT 10000
int slave_status = 0; // 0 = standby, -1 = disconneccted, 1 = camera_running, 2 = face_recog running

void checkUARTData();
void sendPingTask();
void checkPingTimeout();
void sendCommand(const char *cmd, const char *param = nullptr, int value = -1);
void sendPing();
void handleResponse(String line);
void LCDhandler();

Task taskCheckUART(20, TASK_FOREVER, &checkUARTData);         // Check UART buffer every 20ms
Task taskSendPing(2500, TASK_FOREVER, &sendPingTask);         // Send ping every 3s
Task taskCheckTimeout(1000, TASK_FOREVER, &checkPingTimeout); // Check timeout every 1s
Task taskLCDhandler(50, TASK_FOREVER, &LCDhandler);           // handle display updates every 50ms (around 20 fps)

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

  last_pong_time = millis();

  // Add tasks to scheduler
  myscheduler.addTask(taskCheckUART);
  myscheduler.addTask(taskSendPing);
  myscheduler.addTask(taskCheckTimeout);
  myscheduler.addTask(taskLCDhandler);

  taskCheckUART.enable();
  taskSendPing.enable();
  taskCheckTimeout.enable();
  taskLCDhandler.enable();

  last_pong_time = millis();
  sendCommand("get_status");

  // Clear screen
  Serial.println("Clearing screen...");
  tft.fillScreen(TFT_RED);
}

void loop()
{
  myscheduler.execute();
}

// Task: Check for incoming UART data
void checkUARTData()
{
  while (SlaveSerial.available())
  {
    String line = SlaveSerial.readStringUntil('\n');
    if (line.length() > 0)
    {
      handleResponse(line);
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
    sendPing();
  }
  else
  {
    sendCommand("get_status");
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

// Send command to Slave
void sendCommand(const char *cmd, const char *param, int value)
{
  StaticJsonDocument<256> doc;
  doc["cmd"] = cmd;

  if (param != nullptr)
  {
    doc["name"] = param;
  }

  if (value >= 0)
  {
    doc["id"] = value;
  }

  String output;
  serializeJson(doc, output);

  SlaveSerial.println(output);
  Serial.print("📤 TX→Slave: ");
  Serial.println(output);
}

// Send ping message
void sendPing()
{
  StaticJsonDocument<128> doc;
  doc["type"] = "ping";
  doc["seq"] = ping_counter++;
  doc["timestamp"] = millis();

  String output;
  serializeJson(doc, output);

  SlaveSerial.println(output);
  // Serial.print("PING → ");
  // Serial.println(ping_counter - 1);
}

// Handle response from Slave
void handleResponse(String line)
{
  Serial.print("📥 RX←Slave: ");
  Serial.println(line);

  StaticJsonDocument<512> doc;
  DeserializationError error = deserializeJson(doc, line);
  if (error)
  {
    Serial.print("❌ JSON parse error: ");
    Serial.println(error.c_str());
    return;
  }

  // Handle pong response
  if (doc.containsKey("type") && doc["type"] == "pong")
  {
    uint32_t seq = doc["seq"];
    last_pong_time = millis();

    Serial.printf("PONG ← seq=%u, uptime=%ds\n",
                  seq, (int)doc["uptime"]);
    return;
  }

  // Handle status response
  if (doc.containsKey("status"))
  {
    const char *status = doc["status"];
    Serial.printf("✅ Status: %s", status);

    if (doc.containsKey("msg"))
    {
      Serial.printf(" - %s", (const char *)doc["msg"]);
    }

    if (doc.containsKey("free_heap"))
    {
      int heap = doc["free_heap"];
      Serial.printf(" (Free heap: %d KB)", heap / 1024);
    }

    Serial.println();
  }
}

void LCDhandler()
{
  static bool firstRun = true;
  static unsigned long lastPingTime = 0;
  static unsigned long lastPongTime = 0;
  static uint32_t lastSeq = 0;

  unsigned long currentTime = millis();
  uint32_t currentSeq = ping_counter - 1;

  // Track ping/pong times
  if (currentSeq != lastSeq)
  {
    lastPingTime = currentTime;
    lastSeq = currentSeq;
  }
  if (last_pong_time > lastPongTime)
  {
    lastPongTime = last_pong_time;
  }

  // Clear background only once
  if (firstRun)
  {
    tft.fillScreen(TFT_BLACK);
    firstRun = false;
  }

  // Redraw all text every frame - the second parameter erases old text
  tft.setCursor(60, 70);
  tft.setTextSize(1);
  tft.setTextColor(TFT_WHITE, TFT_BLACK); // Text color, background color

  tft.println("UART Monitor    "); // Extra spaces overwrite old text
  tft.println("=============   ");
  tft.println();

  // Connection status
  if (slave_status == -1)
  {
    tft.setTextColor(TFT_RED, TFT_BLACK);
    tft.println("Status: OFFLINE   ");
  }
  else
  {
    tft.setTextColor(TFT_GREEN, TFT_BLACK);
    tft.println("Status: ONLINE    ");
  }
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.println();

  tft.printf("Ping Count: %u    \n", ping_counter);
  tft.println();

  tft.printf("Last PING:        \n");
  tft.printf("  %lu ms ago      \n", currentTime - lastPingTime);
  tft.println();

  tft.printf("Last PONG:        \n");
  if (lastPongTime > 0)
  {
    tft.printf("  %lu ms ago      \n", currentTime - lastPongTime);
  }
  else
  {
    tft.println("  Never           ");
  }
}