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
