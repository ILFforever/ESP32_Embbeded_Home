#include <Arduino.h>
#include <ArduinoJson.h>
#include <WiFi.h>
#include <esp_wifi.h>
#include <TaskScheduler.h>
#include <SPIFFS.h>
#include <Preferences.h>
#include "Audio.h"                   // ESP32-audioI2S for streaming
#include "AudioFileSourceSPIFFS.h"   // ESP8266Audio for SPIFFS playback
#include "AudioFileSourceBuffer.h"
#include "AudioGeneratorMP3.h"
#include "AudioOutputI2S.h"

// WiFi credentials (defaults, can be changed via UART)
String ssid = "ILFforever2";
String password = "19283746";

// MAX98357A I2S pins
#define I2S_DOUT 9 // DIN on MAX98357A
#define I2S_BCLK 8 // BCLK on MAX98357A
#define I2S_LRC 7  // LRC on MAX98357A

#define UART_BAUD 115200
#define RX2 17
#define TX2 18

// LED pin
#define LED_PIN 6

// Audio objects
Audio audio; // ESP32-audioI2S for streaming

// ESP8266Audio objects for SPIFFS playback
AudioGeneratorMP3 *mp3 = nullptr;
AudioFileSourceSPIFFS *fileSource = nullptr;
AudioFileSourceBuffer *fileBuffer = nullptr;
AudioOutputI2S *out = nullptr;

String currentStation_url = "";
bool isPlaying = false;
bool isPlayingFromFS = false; // Track if we're playing from filesystem

// Task scheduler and tasks
Scheduler taskScheduler;
HardwareSerial MasterSerial(2); // Use UART2

// Forward declarations for task callbacks
void audioLoopTask();
void checkUARTData();
void handleUARTResponse(String line);
bool playFromFS(const char *filename);
void stopAllPlayback();
void ensureWiFiConnected();

// Define tasks
Task tAudioLoop(1, TASK_FOREVER, &audioLoopTask);     // Run audio loop as fast as possible
Task taskCheckUART(20, TASK_FOREVER, &checkUARTData); // Check UART buffer every 20ms

// Lazy WiFi initialization - only connect when needed
void ensureWiFiConnected()
{
  if (WiFi.status() == WL_CONNECTED)
  {
    return; // Already connected
  }

  Serial.println("📶 Initializing WiFi for streaming...");
  Serial.printf("   Connecting to: %s\n", ssid.c_str());

  // Set WiFi to maximum power
  WiFi.setTxPower(WIFI_POWER_19_5dBm);
  WiFi.setSleep(false);

  WiFi.begin(ssid.c_str(), password.c_str());

  // Wait for connection with smooth pulsing LED
  int attempts = 0;
  int brightness = 0;
  int fadeDirection = 5;

  while (WiFi.status() != WL_CONNECTED && attempts < 40)
  {
    // Smooth brightness pulse
    analogWrite(LED_PIN, brightness);
    brightness += fadeDirection;

    if (brightness >= 255 || brightness <= 0)
    {
      fadeDirection = -fadeDirection;
    }

    delay(125);

    if (attempts % 4 == 0)
    {
      Serial.print(".");
    }
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED)
  {
    Serial.println("\n✅ WiFi connected");
    digitalWrite(LED_PIN, LOW); // Turn off LED after connecting

    // Optimize for streaming
    esp_wifi_set_ps(WIFI_PS_NONE);
    WiFi.setAutoReconnect(true);

    Serial.printf("   IP: %s\n", WiFi.localIP().toString().c_str());
    Serial.printf("   Signal: %d dBm\n", WiFi.RSSI());
  }
  else
  {
    Serial.println("\n❌ WiFi connection failed");
    digitalWrite(LED_PIN, LOW); // Turn off LED on failure
  }
}

// Handle volume up
void handleVolumeUp()
{
  audio.setVolume(audio.getVolume() + 1);
  Serial.printf("Volume: %d\n", audio.getVolume());
}

// Handle volume down
void handleVolumeDown()
{
  audio.setVolume(audio.getVolume() - 1);
  Serial.printf("Volume: %d\n", audio.getVolume());
}

void setup()
{
  Serial.begin(115200);
  delay(2000); // Wait for serial monitor to open
  Serial.println("\n\nESP32 Audio Amp - UART Controlled");
  Serial.println("===================================");

  // Load WiFi credentials from preferences (if saved)
  Preferences prefs;
  prefs.begin("wifi", true); // Read-only
  if (prefs.isKey("ssid"))
  {
    ssid = prefs.getString("ssid", ssid);
    password = prefs.getString("password", password);
    Serial.printf("📶 Loaded WiFi credentials from storage\n");
    Serial.printf("   SSID: %s\n", ssid.c_str());
  }
  else
  {
    Serial.println("📶 Using default WiFi credentials");
  }
  prefs.end();

  // Setup LED pin
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW); // Start with LED off

  // WiFi will be initialized on-demand when streaming is needed
  Serial.println("WiFi: Lazy init (will connect when streaming)");

  // Initialize SPIFFS
  Serial.println("Initializing SPIFFS...");

  // Simple SPIFFS.begin(true) - format on fail
  if (!SPIFFS.begin(true))
  {
    Serial.println("❌ SPIFFS Mount Failed");
  }
  else
  {
    Serial.println("✅ SPIFFS Mounted");

    // Show filesystem info
    size_t total = SPIFFS.totalBytes();
    size_t used = SPIFFS.usedBytes();
    Serial.printf("   Total: %.2f KB | Used: %.2f KB | Free: %.2f KB\n",
                  total / 1024.0, used / 1024.0, (total - used) / 1024.0);

    // List all files
    File root = SPIFFS.open("/");
    if (root)
    {
      Serial.println("   Files:");
      File file = root.openNextFile();
      while (file)
      {
        Serial.printf("     %s (%d bytes)\n", file.name(), file.size());
        file = root.openNextFile();
      }
    }
  }

  // Initialize ESP8266Audio objects for filesystem playback
  out = new AudioOutputI2S();
  out->SetPinout(I2S_BCLK, I2S_LRC, I2S_DOUT);
  out->SetGain(1.0); // 0.0 to 4.0
  mp3 = new AudioGeneratorMP3();

  Serial.println("✅ ESP8266Audio initialized for SPIFFS playback");

  MasterSerial.begin(UART_BAUD, SERIAL_8N1, RX2, TX2);
  // Setup I2S audio output for streaming (ESP32-audioI2S)
  audio.setPinout(I2S_BCLK, I2S_LRC, I2S_DOUT);
  audio.setVolume(21); // 0-21, 21 = max volume

  // Set connection timeout to prevent slow stream warnings
  audio.setConnectionTimeout(500, 2700); // 500ms connection, 2700ms data timeout

  // Initialize and enable tasks
  taskScheduler.init();
  taskScheduler.addTask(tAudioLoop);
  taskScheduler.addTask(taskCheckUART);

  tAudioLoop.enable();
  taskCheckUART.enable();

  Serial.println("✅ Ready - waiting for UART commands from LCD");
}


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

void handleUARTResponse(String line)
{
  if (line.length() == 0)
  {
    return;
  }

  StaticJsonDocument<2048> doc;
  DeserializationError error = deserializeJson(doc, line);
  if (error)
  {
    Serial.print("📥 RX received: ");
    Serial.println(line);
    Serial.print("❌ JSON parse error: ");
    Serial.println(error.c_str());
    return;
  }

  // Handle ping request - respond with pong (silently)
  if (doc.containsKey("type") && doc["type"] == "ping")
  {
    StaticJsonDocument<256> response;
    response["type"] = "pong";
    response["seq"] = doc["seq"];
    response["timestamp"] = millis();

    String output;
    serializeJson(response, output);
    MasterSerial.println(output);
    return;
  }

  Serial.print("📥 RX received: ");
  Serial.println(line);

  if (doc.containsKey("cmd"))
  {
    if (strcmp(doc["cmd"], "play") == 0)
    {
      String url = doc["url"];
      Serial.printf("🎵 Play command - URL length: %d\n", url.length());

      if (url.length() > 0)
      {
        Serial.printf("   Current URL: '%s'\n", currentStation_url.c_str());
        Serial.printf("   New URL: '%s'\n", url.c_str());
        Serial.printf("   isPlaying: %s\n", isPlaying ? "true" : "false");

        // If URL doesn't start with http, treat it as a filesystem path
        if (!url.startsWith("http"))
        {
          Serial.println("   🎵 Playing from SPIFFS...");
          // Add .mp3 extension if not present
          String filename = url;
          if (!filename.endsWith(".mp3"))
          {
            filename += ".mp3";
          }
          // Add leading slash if not present
          if (!filename.startsWith("/"))
          {
            filename = "/" + filename;
          }
          playFromFS(filename.c_str());
          return;
        }

        // URL starts with http - use it directly for streaming
        String finalURL = url;

        // If different URL or not currently playing, connect
        if (finalURL != currentStation_url || !isPlaying)
        {
          // Ensure WiFi is connected before streaming
          ensureWiFiConnected();

          if (WiFi.status() != WL_CONNECTED)
          {
            Serial.println("❌ Cannot stream - WiFi not connected");
            return;
          }

          // Stop all playback (both libraries)
          stopAllPlayback();

          currentStation_url = finalURL;
          Serial.printf("▶️ Connecting to: %s\n", finalURL.c_str());
          audio.connecttohost(finalURL.c_str());
          isPlaying = true;
          isPlayingFromFS = false;
          digitalWrite(LED_PIN, HIGH); // Turn on LED when playing
        }
        else
        {
          Serial.println("   ⏭️ Already playing this URL");
        }
      }
      else
      {
        Serial.println("❌ No URL provided in play command");
      }
    }
    else if (strcmp(doc["cmd"], "stop") == 0)
    {
      stopAllPlayback();
      Serial.println("⏹ Stopped playback");
    }
    else if (strcmp(doc["cmd"], "volume") == 0)
    {
      if (doc.containsKey("level"))
      {
        int vol = doc["level"];
        vol = constrain(vol, 0, 21);
        audio.setVolume(vol);
        Serial.printf("🔊 Volume set to: %d\n", vol);
      }
      else
      {
        Serial.printf("🔊 Current volume: %d\n", audio.getVolume());
      }
    }
    else if (strcmp(doc["cmd"], "wifi") == 0)
    {
      if (doc.containsKey("ssid") && doc.containsKey("password"))
      {
        // Disconnect current WiFi
        WiFi.disconnect();

        // Update credentials
        const char* newSsid = doc["ssid"];
        const char* newPass = doc["password"];

        Serial.printf("📶 Updating WiFi credentials...\n");
        Serial.printf("   SSID: %s\n", newSsid);

        // Store in preferences (persistent across reboots)
        Preferences prefs;
        prefs.begin("wifi", false);
        prefs.putString("ssid", newSsid);
        prefs.putString("password", newPass);
        prefs.end();

        Serial.println("✅ WiFi credentials saved - will use on next stream");
      }
      else
      {
        Serial.printf("📶 Current SSID: %s\n", ssid);
        Serial.printf("   Status: %s\n", WiFi.status() == WL_CONNECTED ? "Connected" : "Disconnected");
      }
    }
    else if (strcmp(doc["cmd"], "status") == 0)
    {
      StaticJsonDocument<512> response;
      response["type"] = "status";
      response["playing"] = isPlaying;
      response["source"] = isPlayingFromFS ? "spiffs" : "stream";
      response["url"] = currentStation_url;
      response["volume"] = audio.getVolume();
      response["wifi_connected"] = WiFi.status() == WL_CONNECTED;
      response["wifi_ssid"] = ssid;
      response["wifi_rssi"] = WiFi.RSSI();
      response["uptime"] = millis() / 1000;
      response["free_heap"] = ESP.getFreeHeap();
      response["spiffs_total"] = SPIFFS.totalBytes();
      response["spiffs_used"] = SPIFFS.usedBytes();

      String output;
      serializeJson(response, output);
      MasterSerial.println(output);
      Serial.println("📊 Status sent");
    }
    else if (strcmp(doc["cmd"], "list") == 0)
    {
      Serial.println("📁 Files in SPIFFS:");
      File root = SPIFFS.open("/");
      if (root)
      {
        File file = root.openNextFile();
        while (file)
        {
          Serial.printf("   %s (%d bytes)\n", file.name(), file.size());
          file = root.openNextFile();
        }
      }
    }
    else if (strcmp(doc["cmd"], "restart") == 0)
    {
      Serial.println("🔄 Restarting ESP32...");
      delay(500);
      ESP.restart();
    }
    else
    {
      Serial.printf("❌ Unknown command: %s\n", doc["cmd"].as<const char*>());
    }
  }

  return;
}

void loop()
{
  // Execute all scheduled tasks
  taskScheduler.execute();
}

// Task callback: Audio processing
void audioLoopTask()
{
  // Handle ESP32-audioI2S streaming
  if (!isPlayingFromFS)
  {
    audio.loop();

    // Check if audio has stopped playing (for streams that don't trigger eof callback)
    static bool wasPlaying = false;
    bool nowPlaying = audio.isRunning();

    if (wasPlaying && !nowPlaying && isPlaying)
    {
      // Audio was playing but stopped
      Serial.println("🔚 Audio stopped - returning to standby");
      isPlaying = false;
      currentStation_url = "";
      digitalWrite(LED_PIN, LOW); // Turn off LED when stopped
    }

    wasPlaying = nowPlaying;
  }

  // Handle ESP8266Audio filesystem playback
  if (isPlayingFromFS && mp3 != nullptr && mp3->isRunning())
  {
    if (!mp3->loop())
    {
      // Audio finished or error occurred
      mp3->stop();
      if (fileBuffer != nullptr)
      {
        delete fileBuffer;
        fileBuffer = nullptr;
      }
      if (fileSource != nullptr)
      {
        delete fileSource;
        fileSource = nullptr;
      }
      Serial.println("🔚 Filesystem playback finished - returning to standby");
      isPlaying = false;
      isPlayingFromFS = false;
      currentStation_url = "";
      digitalWrite(LED_PIN, LOW); // Turn off LED when stopped
    }
  }
}

// Optional audio library callbacks for debugging
void audio_info(const char *info)
{
  Serial.print("info        ");
  Serial.println(info);
}

void audio_id3data(const char *info)
{
  Serial.print("id3data     ");
  Serial.println(info);
}

void audio_eof_mp3(const char *info)
{
  Serial.print("eof_mp3     ");
  Serial.println(info);

  // Return to standby when audio finishes
  Serial.println("🔚 Playback finished - returning to standby");
  isPlaying = false;
  currentStation_url = "";
  digitalWrite(LED_PIN, LOW); // Turn off LED when stopped
}

void audio_showstation(const char *info)
{
  Serial.print("station     ");
  Serial.println(info);
}

void audio_showstreamtitle(const char *info)
{
  Serial.print("streamtitle ");
  Serial.println(info);
}

void audio_bitrate(const char *info)
{
  Serial.print("bitrate     ");
  Serial.println(info);
}

void audio_commercial(const char *info)
{
  Serial.print("commercial  ");
  Serial.println(info);
}

void audio_icyurl(const char *info)
{
  Serial.print("icyurl      ");
  Serial.println(info);
}

void audio_lasthost(const char *info)
{
  Serial.print("lasthost    ");
  Serial.println(info);
}

// Play audio from SPIFFS using ESP8266Audio library
bool playFromFS(const char *filename)
{
  if (mp3 == nullptr || out == nullptr)
  {
    Serial.println("❌ ESP8266Audio not initialized");
    return false;
  }

  // Check if file exists
  if (!SPIFFS.exists(filename))
  {
    Serial.printf("❌ File not found: %s\n", filename);
    return false;
  }

  Serial.printf("▶️ Playing from SPIFFS: %s\n", filename);

  // Stop all playback first
  stopAllPlayback();

  // Create file source from SPIFFS
  fileSource = new AudioFileSourceSPIFFS(filename);
  if (fileSource == nullptr)
  {
    Serial.println("❌ Failed to create AudioFileSourceSPIFFS");
    return false;
  }

  // Add buffer for smooth playback
  fileBuffer = new AudioFileSourceBuffer(fileSource, 2048);
  if (fileBuffer == nullptr)
  {
    Serial.println("❌ Failed to create buffer");
    delete fileSource;
    fileSource = nullptr;
    return false;
  }

  // Start playback
  bool success = mp3->begin(fileBuffer, out);

  if (success)
  {
    isPlaying = true;
    isPlayingFromFS = true;
    currentStation_url = String("fs://") + filename;
    digitalWrite(LED_PIN, HIGH); // Turn on LED when playing
    Serial.println("✅ SPIFFS playback started");
  }
  else
  {
    Serial.println("❌ Failed to start SPIFFS playback");
    delete fileBuffer;
    delete fileSource;
    fileBuffer = nullptr;
    fileSource = nullptr;
  }

  return success;
}

// Stop all audio playback (both libraries)
void stopAllPlayback()
{
  // Stop ESP32-audioI2S streaming
  if (isPlaying && !isPlayingFromFS)
  {
    Serial.println("   Stopping ESP32-audioI2S playback...");
    audio.stopSong();
    delay(100);
  }

  // Stop ESP8266Audio filesystem playback
  if (isPlayingFromFS && mp3 != nullptr)
  {
    Serial.println("   Stopping ESP8266Audio playback...");
    if (mp3->isRunning())
    {
      mp3->stop();
    }
    if (fileBuffer != nullptr)
    {
      delete fileBuffer;
      fileBuffer = nullptr;
    }
    if (fileSource != nullptr)
    {
      delete fileSource;
      fileSource = nullptr;
    }
  }

  // Reset state
  isPlaying = false;
  isPlayingFromFS = false;
  currentStation_url = "";
  digitalWrite(LED_PIN, LOW); // Turn off LED when stopped
}