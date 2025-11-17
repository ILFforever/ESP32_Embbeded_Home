# ESP32-S3 Main Mesh Node

Environmental monitoring node for ESP32 Smart Home ecosystem with PM2.5 air quality and climate sensing.

## 📋 Features

- **Air Quality Monitoring:** PMS5003 particulate matter sensor
  - PM1.0, PM2.5, PM10 measurements
  - Air quality assessment (Good/Moderate/Unhealthy)
  - Real-time particle count

- **Climate Monitoring:** DHT11 temperature & humidity sensor
  - Temperature measurement (±2°C accuracy)
  - Humidity measurement (±5% accuracy)
  - 5-second refresh rate

- **Connectivity:**
  - WiFi connection to backend API
  - Automatic reconnection on network loss
  - Data transmission every 60 seconds

- **Status Indicators:**
  - LED blink patterns for system events
  - Serial debug output (115200 baud)
  - Real-time air quality assessment

## 🔌 Hardware

- **ESP32-S3 DevKit-C** - Main microcontroller
- **PMS5003** - Laser particulate matter sensor
- **DHT11** - Digital temperature & humidity sensor

## 📊 Pin Configuration

| Component | Pin        | ESP32-S3 GPIO |
|-----------|------------|---------------|
| DHT11     | Data       | GPIO4         |
| PMS5003   | TX → ESP   | GPIO16 (RX1)  |
| PMS5003   | RX ← ESP   | GPIO17 (TX1)  |
| Status LED| RGB LED    | GPIO48        |

**Power:**
- DHT11: 3.3V
- PMS5003: 5V (important!)
- Total: ~180mA typical, 1A max

See [WIRING_DIAGRAM.md](WIRING_DIAGRAM.md) for detailed wiring instructions.

## 🚀 Quick Start

### 1. Hardware Setup

```
ESP32-S3        DHT11          PMS5003
┌─────┐        ┌────┐         ┌──────┐
│3.3V │────────│VCC │         │      │
│GPIO4│────────│DATA│         │      │
│GND  │────────│GND │────┬────│GND   │
│     │        └────┘    │    │      │
│5V   │─────────────────┴────│VCC   │
│RX1  │──────────────────────│TX    │
│TX1  │──────────────────────│RX    │
└─────┘                       └──────┘
```

### 2. Software Setup

```bash
# Install PlatformIO
pip install platformio

# Clone repository (if not already)
git clone <repo-url>
cd ESP32_Embbeded_Home
git checkout Main_mesh

# Build and upload
pio run --target upload

# Monitor serial output
pio device monitor
```

### 3. Configure WiFi & API

Edit `src/main.cpp` lines 42-47:

```cpp
const char* WIFI_SSID     = "YourWiFiSSID";
const char* WIFI_PASSWORD = "YourWiFiPassword";
const char* API_URL       = "https://your-backend.fly.dev/api/v1/devices/sensor";
const char* DEVICE_ID     = "main_mesh_001";
const char* API_TOKEN     = "your_device_api_token_here";
```

## 📡 Data Format

### Sent to Backend (JSON)

```json
{
  "device_id": "main_mesh_001",
  "sensors": {
    "temperature": 25.3,
    "humidity": 60.5,
    "pm1_0": 8,
    "pm2_5": 12,
    "pm10": 15
  }
}
```

### Reading Intervals

- **DHT11:** Every 5 seconds
- **PMS5003:** Every 30 seconds
- **Server Upload:** Every 60 seconds

## 📈 Air Quality Index

Based on PM2.5 levels (µg/m³):

| PM2.5 Range | AQI Category                    | Color  |
|-------------|---------------------------------|--------|
| 0-12        | Good                            | Green  |
| 12-35       | Moderate                        | Yellow |
| 35-55       | Unhealthy (Sensitive Groups)    | Orange |
| 55+         | Unhealthy                       | Red    |

## 🔧 Troubleshooting

**DHT11 returns NaN:**
- Check 3.3V power connection
- Verify GPIO4 connection
- Ensure 10kΩ pull-up resistor (if not built-in)
- Wait 2 seconds after power-on

**PMS5003 no data:**
- Wait 30 seconds for sensor warm-up
- Verify 5V power (not 3.3V!)
- Check TX/RX connections (TX → RX, RX → TX)
- Listen for fan noise
- Baud rate must be 9600

**WiFi not connecting:**
- Verify 2.4GHz network (ESP32 doesn't support 5GHz)
- Check SSID/password are correct
- Ensure WiFi is in range

**Server upload fails:**
- Verify API URL is correct and accessible
- Check device is registered with valid API token
- Ensure backend is running

## 🛠️ Development

### Project Structure

```
ESP32_Embbeded_Home/
├── platformio.ini          # PlatformIO configuration
├── src/
│   └── main.cpp            # Main application code
├── WIRING_DIAGRAM.md       # Detailed wiring guide
└── README.md               # This file
```

### Libraries Used

- **DHT sensor library** (Adafruit) - DHT11/DHT22 sensors
- **PMS Library** (fu-hsi) - PMS5003/PMS7003 sensors
- **ArduinoJson** - JSON serialization
- **WiFi** (ESP32 built-in) - Network connectivity
- **HTTPClient** (ESP32 built-in) - REST API calls

### Building for Production

```bash
# Build release version
pio run -e esp32-s3-devkitc-1

# Upload via USB
pio run --target upload

# Upload via OTA (if configured)
pio run --target upload --upload-port 192.168.1.100
```

## 📊 Serial Monitor Output

```
========================================
ESP32-S3 Main Mesh Node
PMS5003 + DHT11 Sensors
========================================

[WiFi] Connecting to MyNetwork.... Connected!
[WiFi] IP Address: 192.168.1.100
[WiFi] Signal Strength: -45 dBm

[DHT11] Temperature: 25.3°C | Humidity: 60.5%
[PMS5003] ✓ PM1.0: 8 µg/m³ | PM2.5: 12 µg/m³ | PM10: 15 µg/m³
[PMS5003] Air Quality: GOOD

[Server] ✓ Response code: 200
```

## 🔗 Related Projects

- **Backend** - Express/Firebase API server
- **Frontend** - Next.js dashboard
- **Main_lcd** - Central hub LCD display
- **Doorbell_Camera** - Face recognition doorbell

## 📝 License

MIT License - See [LICENSE](LICENSE) file

## 🎓 Course Project

Developed for Chulalongkorn University's **2110356 Embedded Systems** course.

