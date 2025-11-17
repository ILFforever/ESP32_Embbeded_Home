# ESP32-S3 Main Mesh Hub

Central mesh networking hub for ESP32 Smart Home ecosystem. This node aggregates sensor data from mesh network nodes and forwards it to the Main LCD via UART.

## 🏗️ Architecture

```
┌─────────────────┐
│  Room Sensors   │ ─┐
│   (Mesh Nodes)  │  │
└─────────────────┘  │
                      │
┌─────────────────┐  │  Painless
│  Door Sensors   │ ─┤   Mesh
│   (Mesh Nodes)  │  │  Network
└─────────────────┘  │
                      │
┌─────────────────┐  │
│  Other Sensors  │ ─┤
│   (Mesh Nodes)  │  │
└─────────────────┘  │
                      ▼
              ┌──────────────┐
              │  Main Mesh   │ ◄─── PMS5003, DHT11
              │   (This Hub) │      (Local Sensors)
              └──────────────┘
                      │
                      │ UART
                      ▼
              ┌──────────────┐
              │   Main LCD   │
              └──────────────┘
                      │
                      │ WiFi/MQTT
                      ▼
              ┌──────────────┐
              │   Backend    │
              │     API      │
              └──────────────┘
```

## 🎯 Features

- **Painless Mesh Networking**: Automatically forms self-healing mesh network
- **Local Sensor Reading**: Reads PMS5003 air quality and DHT11 temperature/humidity
- **Data Aggregation**: Collects and organizes data from all mesh nodes
- **UART Communication**: Sends aggregated JSON data to Main LCD
- **Real-time Updates**: 15-second transmission interval
- **Automatic Cleanup**: Removes stale data from disconnected nodes

## 🔌 Hardware Requirements

### Main Components
- **ESP32-S3-DevKit-C-1-N16R8V** (this hub)
- **PMS5003** Particulate Matter Sensor
- **DHT11** Temperature/Humidity Sensor
- **Main LCD ESP32** (connected via UART)

### Pin Configuration

| Component | ESP32-S3 Pin | Connection |
|-----------|--------------|------------|
| **DHT11** |
| Data | GPIO4 | DHT11 DATA |
| VCC | 3.3V | DHT11 VCC |
| GND | GND | DHT11 GND |
| **PMS5003** |
| TX → RX | GPIO16 | PMS5003 TX (Pin 4) |
| RX → TX | GPIO17 | PMS5003 RX (Pin 5) |
| VCC | 5V | PMS5003 VCC (Pin 1) |
| GND | GND | PMS5003 GND (Pin 2) |
| **Main LCD UART** |
| TX → RX | GPIO19 | Main LCD RX |
| RX → TX | GPIO18 | Main LCD TX |
| GND | GND | Main LCD GND |
| **Status LED** |
| LED | GPIO48 | Built-in RGB LED |

## 📡 Mesh Network Configuration

### Network Settings
```cpp
#define MESH_PREFIX       "ESP32_SmartHome_Mesh"
#define MESH_PASSWORD     "smarthome2024"
#define MESH_PORT         5555
```

### Supported Mesh Nodes
- Room temperature/humidity sensors
- Door/window sensors
- Motion sensors
- Gas/smoke detectors
- Any ESP32 device running compatible firmware

## 📊 Data Format

### UART Output to Main LCD
```json
{
  "source": "main_mesh",
  "device_id": "main_mesh_001",
  "device_type": "mesh_hub",
  "timestamp": 123456789,
  "mesh_node_id": 3482719283,
  "mesh_node_count": 3,
  "local_sensors": {
    "temperature": 25.5,
    "humidity": 60.2,
    "pm1_0": 8,
    "pm2_5": 15,
    "pm10": 20
  },
  "mesh_sensors": [
    {
      "node_id": 1234567890,
      "device_id": "room_sensor_001",
      "device_type": "room_sensor",
      "age_ms": 2500,
      "data": {
        "temperature": 24.0,
        "humidity": 55.0
      }
    },
    {
      "node_id": 9876543210,
      "device_id": "door_sensor_001",
      "device_type": "door_sensor",
      "age_ms": 1200,
      "data": {
        "door_state": "closed"
      }
    }
  ]
}
```

### Expected Input from Mesh Nodes
Each mesh node should send JSON formatted as:
```json
{
  "device_id": "room_sensor_001",
  "device_type": "room_sensor",
  "temperature": 24.0,
  "humidity": 55.0
}
```

## 🚀 Quick Start

### 1. Install PlatformIO
```bash
# Install PlatformIO Core
pip install platformio

# Or use PlatformIO IDE extension in VS Code
```

### 2. Clone and Configure
```bash
# Clone the repository
git clone <repo-url>
cd ESP32_Embbeded_Home

# Switch to Main_mesh branch
git checkout Main_mesh
```

### 3. Update Configuration (Optional)
Edit `src/main.cpp` to customize:
- `MESH_PREFIX` - Your mesh network name
- `MESH_PASSWORD` - Your mesh network password
- `DEVICE_ID` - This hub's unique identifier
- Pin assignments if needed

### 4. Build and Upload
```bash
# Build the project
pio run

# Upload to ESP32-S3
pio run --target upload

# Monitor serial output
pio device monitor
```

### 5. Verify Operation
Check serial monitor for:
```
========================================
  ESP32-S3 Main Mesh Node Starting
========================================
[SETUP] Configuring GPIO pins...
[SETUP] ✓ GPIO pins configured
[SETUP] Initializing sensors...
[SETUP] ✓ DHT11 initialized on GPIO4
[SETUP] ✓ PMS5003 initialized on GPIO16/17
[SETUP] ✓ All sensors ready
[SETUP] Initializing UART to Main LCD...
[SETUP] ✓ UART2 initialized on GPIO18/19
[SETUP] ✓ Main LCD communication ready
[SETUP] Initializing Painless Mesh...
[SETUP] ✓ Mesh initialized
[SETUP]   - Network: ESP32_SmartHome_Mesh
[SETUP]   - Node ID: 3482719283
[SETUP]   - Port: 5555
[SETUP] ✓ All systems initialized
========================================
```

## ⚙️ Configuration Options

### Timing Intervals
```cpp
#define DHT_INTERVAL      5000   // Read DHT11 every 5 seconds
#define PMS_INTERVAL      10000  // Read PMS5003 every 10 seconds
#define SEND_INTERVAL     15000  // Send data every 15 seconds
#define MESH_CLEANUP      60000  // Clean stale data every 60 seconds
```

### Mesh Node Capacity
```cpp
const int MAX_MESH_NODES = 10;  // Maximum mesh nodes to track
```

### Data Expiry
```cpp
const unsigned long MAX_AGE = 120000; // 2 minutes (in cleanupOldMeshData)
```

## 🔍 Troubleshooting

### DHT11 Not Reading
- Check wiring: Data → GPIO4, VCC → 3.3V, GND → GND
- Verify 10kΩ pull-up resistor between DATA and VCC
- Try different DHT11 sensor (some are faulty)

### PMS5003 Timeout
- Confirm TX/RX connections: PMS TX → GPIO16, PMS RX → GPIO17
- Check 5V power supply (PMS5003 needs 5V, not 3.3V)
- Verify baud rate is 9600
- Wait 30 seconds after power-on for sensor warmup

### No Mesh Connections
- Verify mesh password matches on all nodes
- Check `MESH_PREFIX` is identical across all devices
- Ensure nodes are within WiFi range
- Check serial output for connection messages

### UART Communication Issues
- Verify baud rate matches Main LCD (115200)
- Check TX/RX crossover: Main Mesh TX → Main LCD RX
- Test with serial monitor: `pio device monitor -p /dev/ttyUSB1` (for UART2)
- Ensure common ground between devices

### Serial Monitor Shows Nothing
- Wrong USB port selected
- Driver issues (install CP210x or CH340 drivers)
- Check `monitor_speed = 115200` in platformio.ini
- Press reset button on ESP32-S3

## 📈 Performance Metrics

### Typical Operation
- **CPU Usage**: ~15% (idle mesh network)
- **Memory**: ~120KB RAM used
- **Mesh Latency**: 50-200ms node-to-hub
- **Data Throughput**: ~2KB every 15 seconds to Main LCD
- **Power Consumption**: ~150mA @ 5V (with sensors)

### Air Quality Index (PM2.5)
| PM2.5 (µg/m³) | Air Quality | Health Impact |
|---------------|-------------|---------------|
| 0-12 | Good | Minimal |
| 13-35 | Moderate | Acceptable |
| 36-55 | Unhealthy | Sensitive groups affected |
| 56-150 | Very Unhealthy | Everyone affected |
| 151+ | Hazardous | Health alert |

## 📚 Related Documentation

- [WIRING_DIAGRAM.md](./WIRING_DIAGRAM.md) - Detailed wiring schematics
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture details
- [Painless Mesh Documentation](https://gitlab.com/painlessMesh/painlessMesh)
- [PMS5003 Datasheet](https://www.aqmd.gov/docs/default-source/aq-spec/resources-page/plantower-pms5003-manual_v2-3.pdf)

## 🛠️ Development

### Adding New Sensor Types
1. Include sensor library in `platformio.ini`
2. Add sensor initialization in `setupSensors()`
3. Create task function for reading sensor
4. Add sensor data to JSON in `sendAggregatedDataToLCD()`

### Extending Mesh Protocol
Modify `receivedCallback()` to handle new message types:
```cpp
void receivedCallback(uint32_t from, String &msg) {
  StaticJsonDocument<512> doc;
  deserializeJson(doc, msg);

  // Handle different message types
  const char* msgType = doc["type"] | "sensor_data";
  if (strcmp(msgType, "sensor_data") == 0) {
    // Handle sensor data
  } else if (strcmp(msgType, "command") == 0) {
    // Handle commands
  }
}
```

## 📄 License

This project is part of Chulalongkorn University's 2110356 Embedded Systems course.

## 🤝 Contributing

This is a course project. For issues or suggestions, contact the development team.

---

**Device ID**: `main_mesh_001`
**Device Type**: `mesh_hub`
**Firmware Version**: 1.0.0
**Last Updated**: November 2025
