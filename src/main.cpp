#include <Arduino.h>
#include <ArduinoJson.h>
#include <WiFi.h>
#include <esp_wifi.h>
#include <TaskScheduler.h>
#include <Adafruit_NeoPixel.h>
#include "Audio.h"
#include "firebase_config.h"

// WiFi credentials
const char *ssid = "ILFforever2";
const char *password = "19283746";

// MAX98357A I2S pins
#define I2S_DOUT 9 // DIN on MAX98357A
#define I2S_BCLK 8 // BCLK on MAX98357A
#define I2S_LRC 7  // LRC on MAX98357A

#define UART_BAUD 115200
#define RX2 17
#define TX2 18

#define LED_COUNT 1
#define LED_PIN 39
Adafruit_NeoPixel strip = Adafruit_NeoPixel(LED_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800);

// Audio object
Audio audio;

String currentStation_url = "";
bool isPlaying = false;

// LED animation variables
uint16_t rainbowHue = 0;
uint8_t pulseBrightness = 0;
int8_t pulseDirection = 1;

// Task scheduler and tasks
Scheduler taskScheduler;
HardwareSerial MasterSerial(2); // Use UART2

// Forward declarations for task callbacks
void audioLoopTask();
void checkUARTData();
void handleUARTResponse(String line);
void updateLED();
String getFirebaseDownloadURL(String filePath);
String getFirebasePublicURL(String filePath);

// Define tasks
Task tAudioLoop(1, TASK_FOREVER, &audioLoopTask);     // Run audio loop as fast as possible
Task taskCheckUART(20, TASK_FOREVER, &checkUARTData); // Check UART buffer every 20ms
Task taskUpdateLED(50, TASK_FOREVER, &updateLED);      // Update LED every 50ms

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

  Serial.println("\n\nESP32 Audio Amp - UART Controlled");
  Serial.println("===================================");

  //setup the led on the board
  strip.begin();
  strip.setBrightness(255);
  strip.setPixelColor(0, strip.Color(255, 0, 0)); // Red on boot
  strip.show();


  // Connect to WiFi for audio streaming
  Serial.printf("Connecting to WiFi: %s\n", ssid);

  // Set WiFi to maximum power for better performance with ceramic antenna
  WiFi.setTxPower(WIFI_POWER_19_5dBm); // Max power for ESP32-S3

  WiFi.begin(ssid, password);

  // Disable WiFi sleep mode to prevent stream dropouts
  WiFi.setSleep(false);

  while (WiFi.status() != WL_CONNECTED)
  {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n✅ WiFi connected");

  // Optimize WiFi for streaming performance
  esp_wifi_set_ps(WIFI_PS_NONE); // Disable power saving completely
  WiFi.setAutoReconnect(true);    // Auto-reconnect if connection drops

  Serial.printf("IP: %s\n", WiFi.localIP().toString().c_str());
  Serial.printf("WiFi Signal: %d dBm\n", WiFi.RSSI());
  Serial.printf("WiFi Channel: %d\n", WiFi.channel());

  Serial.println("✅ Firebase Storage ready (using public URLs)");

  // Change LED to green when WiFi connected
  strip.setPixelColor(0, strip.Color(0, 255, 0)); // Green
  strip.show();

  MasterSerial.begin(UART_BAUD, SERIAL_8N1, RX2, TX2);
  // Setup I2S audio output
  audio.setPinout(I2S_BCLK, I2S_LRC, I2S_DOUT);
  audio.setVolume(21); // 0-21, 21 = max volume

  // Set connection timeout to prevent slow stream warnings
  audio.setConnectionTimeout(500, 2700); // 500ms connection, 2700ms data timeout

  // Initialize and enable tasks
  taskScheduler.init();
  taskScheduler.addTask(tAudioLoop);
  taskScheduler.addTask(taskCheckUART);
  taskScheduler.addTask(taskUpdateLED);

  tAudioLoop.enable();
  taskCheckUART.enable();
  taskUpdateLED.enable();

  Serial.println("✅ Ready - waiting for UART commands from LCD");
}

void updateLED()
{
  if (isPlaying)
  {
    // Rainbow pulse effect when playing
    // Update hue for rainbow effect (0-65535)
    rainbowHue += 256;
    if (rainbowHue >= 65536)
    {
      rainbowHue = 0;
    }

    // Update brightness for pulse effect (30-255)
    pulseBrightness += pulseDirection * 5;
    if (pulseBrightness >= 255)
    {
      pulseBrightness = 255;
      pulseDirection = -1;
    }
    else if (pulseBrightness <= 30)
    {
      pulseBrightness = 30;
      pulseDirection = 1;
    }

    // Convert HSV to RGB and set the pixel
    uint32_t color = strip.gamma32(strip.ColorHSV(rainbowHue));
    strip.setBrightness(pulseBrightness);
    strip.setPixelColor(0, color);
    strip.show();
  }
  else
  {
    // Solid green when on standby
    strip.setBrightness(255);
    strip.setPixelColor(0, strip.Color(0, 255, 0));
    strip.show();
  }
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

        // Check if this is a Firebase path (doesn't start with http)
        String finalURL = url;
        if (!url.startsWith("http"))
        {
          Serial.println("   🔥 Detected Firebase path, getting download URL...");

          // Check if there's a "public:" prefix for large files
          // Usage: {"cmd": "play", "url": "public:large_audio.mp3"}
          if (url.startsWith("public:"))
          {
            String filePath = url.substring(7); // Remove "public:" prefix
            finalURL = getFirebasePublicURL(filePath);
          }
          else
          {
            finalURL = getFirebaseDownloadURL(url);
          }

          if (finalURL.length() == 0)
          {
            Serial.println("❌ Failed to get Firebase download URL");
            return;
          }
        }

        // If different URL or not currently playing, connect
        if (finalURL != currentStation_url || !isPlaying)
        {
          // Stop current playback if any
          if (isPlaying)
          {
            Serial.println("   Stopping current playback...");
            audio.stopSong();
            delay(100); // Give time for cleanup
          }

          currentStation_url = finalURL;
          Serial.printf("▶️ Connecting to: %s\n", finalURL.c_str());
          audio.connecttohost(finalURL.c_str());
          isPlaying = true; // Enable rainbow pulse effect
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
      audio.stopSong();
      Serial.println("⏹ Stopped playback");
      isPlaying = false; // Return to green standby
      currentStation_url = ""; // Clear current station to allow replay
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
  }

  wasPlaying = nowPlaying;
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

// Get Firebase Storage public URL for a file
// filePath example: "doorbell.mp3" or "sounds/doorbell.mp3"
// Using public URL method (requires public read access in Firebase Storage rules)
String getFirebaseDownloadURL(String filePath)
{
  Serial.printf("🔥 Getting Firebase public URL for: %s\n", filePath.c_str());
  return getFirebasePublicURL(filePath);
}

// Construct Firebase Storage public URL
// Requires Firebase Storage rules to allow public read access
// Format: https://firebasestorage.googleapis.com/v0/b/BUCKET/o/FILE?alt=media
String getFirebasePublicURL(String filePath)
{
  // URL encode the file path
  String encodedPath = filePath;
  encodedPath.replace("/", "%2F");
  encodedPath.replace(" ", "%20");

  // Extract bucket name without gs:// prefix
  String bucket = String(FIREBASE_STORAGE_BUCKET);
  bucket.replace("gs://", "");

  // Build URL using concatenation to avoid operator ambiguity
  String publicURL = "https://firebasestorage.googleapis.com/v0/b/";
  publicURL += bucket;
  publicURL += "/o/";
  publicURL += encodedPath;
  publicURL += "?alt=media";

  Serial.printf("🔥 Public URL (no token, requires public read rules): %s\n", publicURL.c_str());
  return publicURL;
}
