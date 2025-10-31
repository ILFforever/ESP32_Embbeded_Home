#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include "Audio.h"

// WiFi credentials
const char *ssid = "ILFforever2";
const char *password = "19283746";

// MAX98357A I2S pins
#define I2S_DOUT 11 // DIN on MAX98357A
#define I2S_BCLK 12 // BCLK on MAX98357A
#define I2S_LRC 13  // LRC on MAX98357A

// Audio object
Audio audio;

// Web server on port 80
WebServer server(80);\

// Internet radio stations
const char *radioStations[] = {
    "http://stream.live.vc.bbcmedia.co.uk/bbc_world_service",          // BBC World Service
    "http://listen.shoutcast.com/SmoothJazzNewYorkCity",                      // SomaFM Groove Salad
    "https://play.streamafrica.net/japancitypop", // The 90s Button
    "http://us2.internet-radio.com:8046/",                             // Classic Rock
};

const char *stationNames[] = {
    "BBC World Service",
    "Smooth Jazz New York City",
    "Japanese City Pop 90s",
    "Classic Rock"
};

int currentStation = 0;
const int numStations = sizeof(radioStations) / sizeof(radioStations[0]);

// HTML page
const char htmlPage[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ESP32 Internet Radio</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 600px;
            margin: 50px auto;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        .container {
            background: rgba(255, 255, 255, 0.1);
            border-radius: 20px;
            padding: 30px;
            backdrop-filter: blur(10px);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }
        h1 {
            text-align: center;
            margin-bottom: 30px;
            font-size: 2em;
        }
        .station-info {
            text-align: center;
            margin: 20px 0;
            padding: 20px;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 10px;
        }
        .station-name {
            font-size: 1.5em;
            font-weight: bold;
            margin-bottom: 10px;
        }
        .station-number {
            font-size: 1em;
            opacity: 0.8;
        }
        .controls {
            display: flex;
            justify-content: center;
            gap: 15px;
            margin: 30px 0;
        }
        button {
            padding: 15px 30px;
            font-size: 1.2em;
            border: none;
            border-radius: 10px;
            cursor: pointer;
            background: white;
            color: #667eea;
            font-weight: bold;
            transition: all 0.3s;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
        }
        button:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
        }
        button:active {
            transform: translateY(0);
        }
        .volume-control {
            text-align: center;
            margin: 20px 0;
        }
        .volume-display {
            font-size: 1.2em;
            margin: 15px 0;
            padding: 10px;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 8px;
        }
        .station-list {
            margin-top: 30px;
        }
        .station-item {
            padding: 15px;
            margin: 10px 0;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 10px;
            cursor: pointer;
            transition: all 0.3s;
        }
        .station-item:hover {
            background: rgba(255, 255, 255, 0.3);
            transform: translateX(5px);
        }
        .station-item.active {
            background: rgba(255, 255, 255, 0.4);
            border-left: 4px solid white;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎵 Internet Radio</h1>

        <div class="station-info">
            <div class="station-name" id="stationName">Loading...</div>
            <div class="station-number" id="stationNumber">Station 1 of 4</div>
        </div>

        <div class="controls">
            <button onclick="previousStation()">⏮️ Previous</button>
            <button onclick="nextStation()">Next ⏭️</button>
        </div>

        <div class="volume-control">
            <div class="volume-display">Volume: <span id="volume">15</span></div>
            <div class="controls">
                <button onclick="volumeDown()">🔉 -</button>
                <button onclick="volumeUp()">🔊 +</button>
            </div>
        </div>

        <div class="station-list" id="stationList">
            <h3>Available Stations</h3>
        </div>
    </div>

    <script>
        function updateStatus() {
            fetch('/status')
                .then(response => response.json())
                .then(data => {
                    document.getElementById('stationName').textContent = data.stationName;
                    document.getElementById('stationNumber').textContent =
                        'Station ' + (data.currentStation + 1) + ' of ' + data.totalStations;
                    document.getElementById('volume').textContent = data.volume;
                    updateStationList(data.currentStation, data.stations);
                });
        }

        function updateStationList(current, stations) {
            const list = document.getElementById('stationList');
            let html = '<h3>Available Stations</h3>';
            stations.forEach((station, index) => {
                const active = index === current ? 'active' : '';
                html += `<div class="station-item ${active}" onclick="selectStation(${index})">
                    ${index + 1}. ${station}
                </div>`;
            });
            list.innerHTML = html;
        }

        function nextStation() {
            fetch('/next').then(() => setTimeout(updateStatus, 500));
        }

        function previousStation() {
            fetch('/previous').then(() => setTimeout(updateStatus, 500));
        }

        function volumeUp() {
            fetch('/volume/up').then(() => updateStatus());
        }

        function volumeDown() {
            fetch('/volume/down').then(() => updateStatus());
        }

        function selectStation(index) {
            fetch('/station/' + index).then(() => setTimeout(updateStatus, 500));
        }

        // Update status every 5 seconds
        setInterval(updateStatus, 5000);
        updateStatus();
    </script>
</body>
</html>
)rawliteral";

// Handle root page
void handleRoot() {
  server.send(200, "text/html", htmlPage);
}

// Handle status request
void handleStatus() {
  String json = "{";
  json += "\"currentStation\":" + String(currentStation) + ",";
  json += "\"totalStations\":" + String(numStations) + ",";
  json += "\"volume\":" + String(audio.getVolume()) + ",";
  json += "\"stationName\":\"" + String(stationNames[currentStation]) + "\",";
  json += "\"stations\":[";
  for (int i = 0; i < numStations; i++) {
    json += "\"" + String(stationNames[i]) + "\"";
    if (i < numStations - 1) json += ",";
  }
  json += "]}";
  server.send(200, "application/json", json);
}

// Handle next station
void handleNext() {
  currentStation = (currentStation + 1) % numStations;
  audio.connecttohost(radioStations[currentStation]);
  Serial.printf("Switched to station %d: %s\n", currentStation + 1, stationNames[currentStation]);
  server.send(200, "text/plain", "OK");
}

// Handle previous station
void handlePrevious() {
  currentStation = (currentStation - 1 + numStations) % numStations;
  audio.connecttohost(radioStations[currentStation]);
  Serial.printf("Switched to station %d: %s\n", currentStation + 1, stationNames[currentStation]);
  server.send(200, "text/plain", "OK");
}

// Handle volume up
void handleVolumeUp() {
  audio.setVolume(audio.getVolume() + 1);
  Serial.printf("Volume: %d\n", audio.getVolume());
  server.send(200, "text/plain", "OK");
}

// Handle volume down
void handleVolumeDown() {
  audio.setVolume(audio.getVolume() - 1);
  Serial.printf("Volume: %d\n", audio.getVolume());
  server.send(200, "text/plain", "OK");
}

// Handle station selection
void handleStationSelect() {
  if (server.hasArg("station")) {
    int station = server.arg("station").toInt();
    if (station >= 0 && station < numStations) {
      currentStation = station;
      audio.connecttohost(radioStations[currentStation]);
      Serial.printf("Switched to station %d: %s\n", currentStation + 1, stationNames[currentStation]);
      server.send(200, "text/plain", "OK");
      return;
    }
  }

  // Handle path parameter like /station/0
  String path = server.uri();
  int lastSlash = path.lastIndexOf('/');
  if (lastSlash != -1) {
    int station = path.substring(lastSlash + 1).toInt();
    if (station >= 0 && station < numStations) {
      currentStation = station;
      audio.connecttohost(radioStations[currentStation]);
      Serial.printf("Switched to station %d: %s\n", currentStation + 1, stationNames[currentStation]);
      server.send(200, "text/plain", "OK");
      return;
    }
  }

  server.send(400, "text/plain", "Invalid station");
}

void setup()
{
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n\nESP32 Internet Radio with MAX98357A");
  Serial.println("=====================================");

  // Configure static IP
  IPAddress local_IP(192, 168, 1, 100);      // Set your desired static IP
  IPAddress gateway(192, 168, 1, 1);         // Your router's gateway
  IPAddress subnet(255, 255, 255, 0);        // Subnet mask
  IPAddress primaryDNS(8, 8, 8, 8);          // Google DNS (optional)
  IPAddress secondaryDNS(8, 8, 4, 4);        // Google DNS (optional)

  if (!WiFi.config(local_IP, gateway, subnet, primaryDNS, secondaryDNS)) {
    Serial.println("Failed to configure static IP");
  }

  // Connect to WiFi
  Serial.printf("Connecting to WiFi: %s ", ssid);
  WiFi.begin(ssid, password);
  WiFi.setSleep(false);

  while (WiFi.status() != WL_CONNECTED)
  {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWiFi connected!");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());

  // Setup web server routes
  server.on("/", handleRoot);
  server.on("/status", handleStatus);
  server.on("/next", handleNext);
  server.on("/previous", handlePrevious);
  server.on("/volume/up", handleVolumeUp);
  server.on("/volume/down", handleVolumeDown);
  server.on("/station", handleStationSelect);
  server.onNotFound([]() {
    String path = server.uri();
    if (path.startsWith("/station/")) {
      handleStationSelect();
    } else {
      server.send(404, "text/plain", "Not found");
    }
  });

  server.begin();
  Serial.println("Web server started!");
  Serial.printf("Open http://%s in your browser\n", WiFi.localIP().toString().c_str());

  // Setup I2S audio output
  audio.setPinout(I2S_BCLK, I2S_LRC, I2S_DOUT);
  audio.setVolume(15); // 0-21, adjust as needed

  // Start playing the first station
  Serial.printf("\nConnecting to station %d: %s\n", currentStation + 1, stationNames[currentStation]);
  audio.connecttohost(radioStations[currentStation]);

  Serial.println("\nRadio is now playing!");
  Serial.println("Commands:");
  Serial.println("  n - Next station");
  Serial.println("  p - Previous station");
  Serial.println("  + - Volume up");
  Serial.println("  - - Volume down");
}

void loop()
{
  audio.loop();
  server.handleClient();

  // Handle serial commands (still available)
  if (Serial.available())
  {
    char cmd = Serial.read();

    switch (cmd)
    {
    case 'n': // Next station
    case 'N':
      currentStation = (currentStation + 1) % numStations;
      Serial.printf("\nSwitching to station %d: %s\n", currentStation + 1, stationNames[currentStation]);
      audio.connecttohost(radioStations[currentStation]);
      break;

    case 'p': // Previous station
    case 'P':
      currentStation = (currentStation - 1 + numStations) % numStations;
      Serial.printf("\nSwitching to station %d: %s\n", currentStation + 1, stationNames[currentStation]);
      audio.connecttohost(radioStations[currentStation]);
      break;

    case '+': // Volume up
      audio.setVolume(audio.getVolume() + 1);
      Serial.printf("Volume: %d\n", audio.getVolume());
      break;

    case '-': // Volume down
      audio.setVolume(audio.getVolume() - 1);
      Serial.printf("Volume: %d\n", audio.getVolume());
      break;
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
