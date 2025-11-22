# ESP32 Battery-Optimized Room Sensor

Battery-powered environmental sensor node for ESP32 smart home mesh network.

## 🎯 Quick Start

### Features
- ✅ **24-48 hours** battery life on 400mAh LiPo
- ✅ **PainlessMesh** integration with Main_mesh hub
- ✅ **Multi-sensor** support (light, temp, humidity, gas)
- ✅ **Deep sleep** power optimization
- ✅ **Battery monitoring** with low-power warnings
- ✅ **Conditional transmission** (only on changes)

### Hardware Requirements
- ESP32-DevKitC or ESP32-S3-DevKitC
- VEML7700 Ambient Light Sensor (I2C)
- AHT25 Temperature/Humidity Sensor (I2C)
- MICS5524 Gas Sensor (Analog)
- 400mAh LiPo Battery
- TP4056 Charger Module

**See [WIRING_DIAGRAM.md](WIRING_DIAGRAM.md) for complete wiring instructions.**

---

## 🚀 Installation

### 1. Install PlatformIO
```bash
# Install PlatformIO Core
pip install platformio

# Or use VS Code extension
# Search for "PlatformIO IDE" in VS Code extensions
```

### 2. Clone Repository
```bash
git clone https://github.com/ILFforever/ESP32_Embbeded_Home.git
cd ESP32_Embbeded_Home
git checkout room_sensor
cd Room_Sensor
```

### 3. Configure Device
Edit `platformio.ini` or modify build flags:
```ini
build_flags =
    -D DEVICE_ID=\"room_sensor_bedroom_01\"  # Change this
    -D DEVICE_TYPE=\"environmental_sensor\"
    -D ROOM_NAME=\"Bedroom\"                 # Change this
```

### 4. Build and Upload
```bash
# Build for default ESP32
pio run -e esp32-room-sensor

# Upload to ESP32
pio run -e esp32-room-sensor -t upload

# Monitor serial output
pio device monitor -b 115200
```

---

## 📊 Expected Performance

### Battery Life

| Configuration | Interval | Battery Life | Use Case |
|---------------|----------|--------------|----------|
| **Standard** | 60s | 24-48 hours | Normal monitoring |
| **Extended** | 300s (5min) | 3-5 days | Low-priority areas |
| **Fast** | 30s | 12-24 hours | Critical monitoring |
| **Ultra-low** | 60s + BME680 | 7-10 days | Maximum efficiency |

### Power Consumption

| Phase | Duration | Current | Energy |
|-------|----------|---------|--------|
| **Sensor Read** | 1s | 1-2mA | 0.0003 mAh |
| **Gas Heating** | 20s | 30mA | 0.167 mAh |
| **WiFi Mesh TX** | 2s | 120mA | 0.067 mAh |
| **Deep Sleep** | 57s | 0.05mA | 0.0008 mAh |
| **Total/Cycle** | 60s | - | 0.235 mAh |
| **Per Hour** | - | ~14mAh | - |

---

## 🔧 Configuration

### PlatformIO Environments

#### Standard Configurations
```bash
# Default - 240MHz, normal logging
pio run -e esp32-room-sensor

# Ultra low power - 80MHz CPU
pio run -e esp32-ultra-low-power

# Debug - verbose logging
pio run -e esp32-debug

# ESP32-S3 support
pio run -e esp32s3-room-sensor

# BME680 version (replaces MICS5524 + AHT25)
pio run -e esp32-bme680
```

#### Room-Specific Builds
```bash
# Pre-configured for specific rooms
pio run -e room-bedroom
pio run -e room-living
pio run -e room-kitchen
pio run -e room-bathroom
pio run -e room-office
```

#### Power Optimization
```bash
# Extended sleep (5 minutes)
pio run -e extended-sleep

# Fast updates (30 seconds)
pio run -e fast-updates

# No sleep (debugging only)
pio run -e no-sleep
```

### Code Configuration

Edit `src/main.cpp` to customize:

```cpp
// Mesh Network (must match Main_mesh)
#define MESH_PREFIX     "Arduino_888_home"
#define MESH_PASSWORD   "19283746"
#define MESH_PORT       5555

// Device Identification
const char* DEVICE_ID = "room_sensor_bedroom_01";
const char* DEVICE_TYPE = "environmental_sensor";
const char* ROOM_NAME = "Bedroom";

// Power Settings
#define SLEEP_DURATION_S     60     // Sleep interval
#define GAS_HEAT_TIME_MS     20000  // Gas sensor heating time

// Sensor Thresholds
#define TEMP_THRESHOLD       0.5    // °C
#define HUMIDITY_THRESHOLD   2.0    // %
#define LIGHT_THRESHOLD      50.0   // lux
#define GAS_THRESHOLD        100    // ADC units
```

---

## 📡 Mesh Network Integration

### Message Format

The sensor sends JSON messages to the mesh network:

```json
{
  "device_id": "room_sensor_bedroom_01",
  "device_type": "environmental_sensor",
  "room": "Bedroom",
  "boot_count": 42,
  "data": {
    "temperature": "24.5",
    "humidity": "60.2",
    "light_lux": "320.5",
    "gas_level": 1250,
    "battery_voltage": "3.95",
    "battery_percent": 85
  }
}
```

### Network Topology

```
Room Sensors ──┐
Room Sensors ──┼──► PainlessMesh Network ──► Main_mesh Hub ──► Main_lcd ──► Backend
Room Sensors ──┘
```

### Mesh Configuration

| Parameter | Value | Notes |
|-----------|-------|-------|
| **Network Name** | Arduino_888_home | Must match Main_mesh |
| **Password** | 19283746 | Mesh security |
| **Port** | 5555 | UDP communication |
| **Max Hops** | 5 | Mesh routing depth |
| **Connection Timeout** | 5s | Retry period |

---

## 🔋 Battery Optimization Guide

### Level 1: Basic Optimization (Included)
✅ Deep sleep between readings (60s)
✅ Intermittent gas sensor heating
✅ Conditional transmission
✅ Battery monitoring

**Result:** 24-48 hours on 400mAh

### Level 2: Extended Battery Life
1. Increase sleep interval to 5 minutes:
   ```cpp
   #define SLEEP_DURATION_S 300
   ```
2. Build with: `pio run -e extended-sleep`

**Result:** 3-5 days on 400mAh

### Level 3: Maximum Efficiency
1. Replace MICS5524 + AHT25 with BME680
2. Use lower CPU frequency:
   ```bash
   pio run -e esp32-ultra-low-power
   ```
3. Larger battery (1000mAh)

**Result:** 7-14 days

### Level 4: Solar Powered
1. Add 3.7V 100mA solar panel
2. TP4056 with solar input
3. 1000mAh+ battery

**Result:** Indefinite (sunny climates)

---

## 🧪 Testing & Troubleshooting

### First Boot Checklist

1. **Power On**
   ```
   ========================================
     room_sensor_bedroom_01 - Boot #1
     Battery-Optimized Room Sensor
   ========================================
   [SETUP] Configuring GPIO pins...
   [SETUP] ✓ GPIO configured
   ```

2. **Sensor Initialization**
   ```
   [SETUP] Initializing sensors...
   [AHT25] ✓ Initialized
   [VEML7700] ✓ Initialized
   [SETUP] ✓ Sensors ready
   ```

3. **Mesh Connection**
   ```
   [SETUP] Initializing PainlessMesh...
   [MESH] ✓ Node ID: 1234567890
   [MESH] ✓ Device: room_sensor_bedroom_01
   ```

4. **Sensor Readings**
   ```
   [SENSORS] Reading all sensors...
   [AHT25] ✓ Temp: 24.50°C | Humidity: 60.20%
   [VEML7700] ✓ Light: 320.50 lux
   [MICS5524] Heating sensor...
   [MICS5524] ✓ Gas level: 1250 (ADC)
   [BATTERY] ✓ 3.95V (85%)
   ```

5. **Transmission**
   ```
   [MESH] Attempting transmission...
   [MESH] ✓ Connected to 1 nodes
   [MESH] Payload (245 bytes): {...}
   [MESH] ✓ Data transmitted successfully
   ```

### Common Issues

#### Sensors Not Found
```
[AHT25] ✗ Failed to initialize!
```
**Solution:**
- Check I2C wiring (GPIO21=SDA, GPIO22=SCL)
- Verify 3.3V power
- Run I2C scanner to detect address

#### Mesh Not Connecting
```
[MESH] ✗ No mesh nodes found
```
**Solution:**
- Verify MESH_PREFIX matches Main_mesh
- Check WiFi environment (interference)
- Ensure Main_mesh is powered and running
- Move closer to Main_mesh hub

#### Battery Voltage Incorrect
```
[BATTERY] ✓ 0.00V (0%)
```
**Solution:**
- Check voltage divider wiring
- Verify 100kΩ resistors are equal
- Test battery voltage with multimeter
- Adjust VOLTAGE_DIVIDER_RATIO in code

#### Gas Sensor Not Heating
```
[MICS5524] ✓ Gas level: 0 (ADC)
```
**Solution:**
- Check MOSFET wiring
- Verify GPIO25 controls heater
- Test with multimeter (should be ~5V at heater)
- Check heater element continuity

#### Crashes After Wake
```
Guru Meditation Error: Core 0 panic'ed
```
**Solution:**
- Reduce logging level (use CORE_DEBUG_LEVEL=1)
- Check for stack overflow
- Verify sensor initialization
- Test with no-sleep mode first

---

## 📈 Monitoring & Statistics

### Serial Output

The sensor logs detailed statistics every cycle:

```
========================================
CYCLE STATISTICS:
  Total boots: 42
  Successful TX: 40
  Failed TX: 2
  Success rate: 95.2%
  Battery: 3.95V (85%)
========================================
```

### Data Collection

Monitor performance over time:

```bash
# Save serial output to file
pio device monitor -b 115200 > sensor_log.txt

# Extract battery data
grep "BATTERY" sensor_log.txt

# Extract transmission stats
grep "Success rate" sensor_log.txt
```

### Expected Behavior

| Metric | Expected | Action if Outside Range |
|--------|----------|-------------------------|
| **Boot time** | 1-2s | Check sensor init |
| **Sensor read** | 1s | Verify I2C |
| **Gas heating** | 20s | Check heater control |
| **Mesh connect** | 1-5s | Check network |
| **Success rate** | >90% | Improve mesh coverage |
| **Battery drop** | ~0.1V/hour | Check power consumption |

---

## 🛠️ Hardware Variants

### Option 1: Standard Build (VEML7700 + AHT25 + MICS5524)
- **Cost:** ~$15-20
- **Battery:** 24-48 hours
- **Complexity:** Medium (requires MOSFET)

### Option 2: BME680 Build (VEML7700 + BME680)
- **Cost:** ~$25-30
- **Battery:** 7-10 days
- **Complexity:** Low (all I2C)
- **Recommended!**

### Option 3: Minimal Build (AHT25 only)
- **Cost:** ~$8-10
- **Battery:** 50-100 hours
- **Complexity:** Very low
- Use for basic temp/humidity monitoring

### Option 4: Solar Powered
- **Cost:** ~$35-45
- **Battery:** Indefinite
- **Complexity:** Medium
- Add solar panel + larger battery

---

## 📚 Project Structure

```
Room_Sensor/
├── src/
│   └── main.cpp              # Main application code
├── platformio.ini            # Build configurations
├── WIRING_DIAGRAM.md         # Complete wiring guide
├── README.md                 # This file
└── .gitignore
```

---

## 🔗 Related Documentation

- **Main Project:** [ESP32_Embbeded_Home](../)
- **Main Mesh Hub:** [Main_mesh](../Main_mesh/)
- **Main LCD Display:** [Main_lcd](../Main_lcd/)
- **Battery Guide:** [docs/BATTERY_OPTIMIZATION_GUIDE.md](../docs/BATTERY_OPTIMIZATION_GUIDE.md)
- **Wiring:** [WIRING_DIAGRAM.md](WIRING_DIAGRAM.md)

---

## 🐛 Known Issues

1. **First boot may fail mesh connection** - Retry after 1-2 minutes
2. **Battery percentage inaccurate initially** - Calibrates after several cycles
3. **Gas sensor readings vary** - Normal, requires 24-48h burn-in period
4. **Occasional mesh timeouts** - Implement retry logic (already included)

---

## 🎯 Future Improvements

- [ ] Add OTA (Over-The-Air) firmware updates
- [ ] Implement mesh time synchronization
- [ ] Add data buffering for failed transmissions
- [ ] Support for external RTC (DS3231) for better sleep accuracy
- [ ] Add MQTT direct connection as fallback
- [ ] Implement adaptive sleep intervals based on battery level

---

## 📝 Changelog

### v1.0.0 (2025-11-22)
- Initial release
- Battery-optimized deep sleep
- PainlessMesh integration
- VEML7700, AHT25, MICS5524 support
- Battery voltage monitoring
- Conditional transmission
- Multi-room configurations

---

## 🤝 Contributing

This project is part of Chulalongkorn University's embedded systems class. Feel free to:
- Report bugs via GitHub issues
- Submit pull requests for improvements
- Share your sensor configurations
- Document your builds with photos

---

## 📄 License

See main project [LICENSE](../LICENSE)

---

## 👥 Authors

- **ILFforever** - Main project
- Battery optimization by Claude Code

---

## 🙏 Acknowledgments

- Adafruit for excellent sensor libraries
- PainlessMesh project for mesh networking
- ESP32 community for power management tips
- Chulalongkorn University Embedded Systems Class

---

## 📞 Support

- **GitHub Issues:** https://github.com/ILFforever/ESP32_Embbeded_Home/issues
- **Main Project:** https://github.com/ILFforever/ESP32_Embbeded_Home
- **Documentation:** See [docs/](../docs/) folder

---

**Happy Building! 🎉**

Last updated: November 2025
