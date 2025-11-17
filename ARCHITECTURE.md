# System Architecture - ESP32 Smart Home Mesh Network

Comprehensive architecture documentation for the ESP32 Smart Home mesh networking system.

---

## 📊 High-Level System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SMART HOME ECOSYSTEM                         │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────────────┐
│  Sensor Layer        │  ← Room sensors, door sensors, environmental
│  (Mesh Nodes)        │    sensors distributed throughout home
└──────────┬───────────┘
           │ Painless Mesh
           │ (Self-healing, auto-routing)
           ▼
┌──────────────────────┐
│  Aggregation Layer   │  ← Main Mesh Hub (this project)
│  (Main Mesh Hub)     │    - Collects sensor data
└──────────┬───────────┘    - Reads local sensors
           │ UART            - Aggregates all data
           │ (115200 baud)
           ▼
┌──────────────────────┐
│  Gateway Layer       │  ← Main LCD
│  (Main LCD)          │    - Display interface
└──────────┬───────────┘    - WiFi/MQTT gateway
           │ WiFi + MQTT
           │
           ▼
┌──────────────────────┐
│  Cloud Layer         │  ← Backend API
│  (Backend Server)    │    - Firebase Firestore
└──────────┬───────────┘    - Express.js REST API
           │ HTTPS
           ▼
┌──────────────────────┐
│  Presentation Layer  │  ← Web Dashboard
│  (Frontend)          │    - Next.js 16
└──────────────────────┘    - Real-time monitoring
```

---

## 🔄 Data Flow Architecture

### 1. Sensor → Main Mesh Hub (Painless Mesh)

**Protocol**: Painless Mesh (ESP-NOW based)
**Format**: JSON over mesh network
**Frequency**: Event-driven + periodic (varies by sensor type)

```
Room Sensor Node                Main Mesh Hub
┌──────────────────┐           ┌──────────────────┐
│ DHT22 Sensor     │           │                  │
│ ↓                │           │  Mesh Receiver   │
│ Read Temp/Humid  │           │  ↓               │
│ ↓                │ ─────────→│  Parse JSON      │
│ Create JSON      │ Mesh Net  │  ↓               │
│ {                │           │  Store in RAM    │
│   "device_id":   │           │  ↓               │
│   "temp": 24.5,  │           │  Add timestamp   │
│   "humidity": 60 │           │  ↓               │
│ }                │           │  Update array    │
│ ↓                │           │                  │
│ mesh.sendSingle()│           │  meshNodes[]     │
└──────────────────┘           └──────────────────┘
```

**Example Message from Mesh Node:**
```json
{
  "device_id": "room_sensor_bedroom",
  "device_type": "temperature_humidity",
  "temperature": 24.5,
  "humidity": 60.2,
  "battery": 85
}
```

---

### 2. Main Mesh Hub → Main LCD (UART)

**Protocol**: UART (Hardware Serial)
**Baud Rate**: 115200
**Format**: JSON (newline-delimited)
**Frequency**: Every 15 seconds

```
Main Mesh Hub                  Main LCD
┌──────────────────┐          ┌──────────────────┐
│ Scheduler        │          │ UART Receiver    │
│ ↓                │          │ ↓                │
│ Every 15s:       │          │ readline()       │
│ ↓                │          │ ↓                │
│ Aggregate:       │          │ Parse JSON       │
│ - Local sensors  │ ───────→ │ ↓                │
│ - Mesh data      │ UART TX  │ Validate schema  │
│ ↓                │ GPIO19   │ ↓                │
│ Create JSON      │          │ Display on LCD   │
│ ↓                │          │ ↓                │
│ Serial.println() │          │ Forward to WiFi  │
└──────────────────┘          └──────────────────┘
```

**Example Aggregated Message to Main LCD:**
```json
{
  "source": "main_mesh",
  "device_id": "main_mesh_001",
  "device_type": "mesh_hub",
  "timestamp": 1700000000,
  "mesh_node_id": 3482719283,
  "mesh_node_count": 5,
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
      "device_id": "room_sensor_bedroom",
      "device_type": "temperature_humidity",
      "age_ms": 2500,
      "data": {
        "temperature": 24.0,
        "humidity": 55.0,
        "battery": 85
      }
    },
    {
      "node_id": 2345678901,
      "device_id": "door_sensor_main",
      "device_type": "door_sensor",
      "age_ms": 1200,
      "data": {
        "state": "closed",
        "battery": 92
      }
    }
  ]
}
```

---

### 3. Main LCD → Backend (WiFi + MQTT/HTTP)

**Protocol**: WiFi → HTTPS/MQTT
**Format**: JSON
**Endpoint**: `https://embedded-smarthome.fly.dev/api/v1/devices/sensor`

```
Main LCD                       Backend Server
┌──────────────────┐          ┌──────────────────┐
│ Receive UART     │          │ Express.js       │
│ ↓                │          │ ↓                │
│ Parse JSON       │          │ POST /api/v1/... │
│ ↓                │          │ ↓                │
│ Add metadata:    │ ───────→ │ Validate JWT     │
│ - API token      │ WiFi     │ ↓                │
│ - Timestamp      │ HTTPS    │ Parse payload    │
│ ↓                │          │ ↓                │
│ HTTP POST        │          │ Store Firestore  │
│ ↓                │          │ ↓                │
│ Retry on fail    │          │ Publish MQTT     │
└──────────────────┘          └──────────────────┘
```

---

### 4. Backend → Frontend (WebSocket/Polling)

**Protocol**: HTTPS + WebSocket (future)
**Format**: JSON REST API
**Polling**: Every 5 seconds (current implementation)

```
Backend Server                 Frontend Dashboard
┌──────────────────┐          ┌──────────────────┐
│ Firestore DB     │          │ Next.js App      │
│ ↓                │          │ ↓                │
│ Query devices    │ ←─────── │ GET /api/status  │
│ ↓                │ HTTPS    │ ↓                │
│ Aggregate status │ ───────→ │ Render cards     │
│ ↓                │ JSON     │ - Temperature    │
│ Return JSON      │          │ - Air Quality    │
│                  │          │ - Door Status    │
└──────────────────┘          └──────────────────┘
```

---

## 🏗️ Main Mesh Hub Internal Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    ESP32-S3 Main Mesh Hub                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌────────────────┐         ┌────────────────┐                 │
│  │  DHT11 Driver  │         │  PMS5003 Driver│                 │
│  └───────┬────────┘         └───────┬────────┘                 │
│          │                          │                           │
│          │ GPIO4                    │ GPIO16/17 (UART1)         │
│          ▼                          ▼                           │
│  ┌────────────────────────────────────────────┐                │
│  │         Local Sensor Manager               │                │
│  │  - Read DHT11 every 5s                     │                │
│  │  - Read PMS5003 every 10s                  │                │
│  │  - Validate readings                       │                │
│  │  - Store in localSensors struct            │                │
│  └────────────────────┬───────────────────────┘                │
│                       │                                         │
│  ┌────────────────────────────────────────────┐                │
│  │      Painless Mesh Network Manager         │                │
│  │  - Auto-discovery of mesh nodes            │                │
│  │  - Receive sensor data from nodes          │                │
│  │  - Store in meshNodes[] array (max 10)     │                │
│  │  - Cleanup stale data (>2min old)          │                │
│  └────────────────────┬───────────────────────┘                │
│                       │                                         │
│                       ▼                                         │
│  ┌────────────────────────────────────────────┐                │
│  │        Data Aggregation Engine             │                │
│  │  - Combine local + mesh sensor data        │                │
│  │  - Create unified JSON structure           │                │
│  │  - Add metadata (timestamps, node IDs)     │                │
│  │  - Serialize to JSON string                │                │
│  └────────────────────┬───────────────────────┘                │
│                       │                                         │
│                       │ Every 15s                               │
│                       ▼                                         │
│  ┌────────────────────────────────────────────┐                │
│  │         UART Communication Manager         │                │
│  │  - Hardware Serial 2 (GPIO18/19)           │                │
│  │  - 115200 baud, 8N1                        │                │
│  │  - Send JSON with newline delimiter        │                │
│  │  - LED blink on successful send            │                │
│  └────────────────────────────────────────────┘                │
│                       │                                         │
│                       │ GPIO19 (TX)                             │
│                       ▼                                         │
│                  To Main LCD                                    │
│                                                                 │
│  ┌────────────────────────────────────────────┐                │
│  │            Task Scheduler                  │                │
│  │  - taskReadDHT (5s interval)               │                │
│  │  - taskReadPMS (10s interval)              │                │
│  │  - taskSendData (15s interval)             │                │
│  │  - taskCleanup (60s interval)              │                │
│  │  - mesh.update() (continuous)              │                │
│  └────────────────────────────────────────────┘                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🧵 Task Scheduling Architecture

### Scheduler Overview

```
Time (seconds)  →
0    5    10   15   20   25   30   35   40   45   50   55   60
│    │    │    │    │    │    │    │    │    │    │    │    │
├────┼────┼────┼────┼────┼────┼────┼────┼────┼────┼────┼────┤
│    ↓    │    ↓    │    ↓    │    ↓    │    ↓    │    ↓    │  DHT11 (every 5s)
├─────────┼─────────┼─────────┼─────────┼─────────┼─────────┤
│         ↓         ↓         ↓         ↓         ↓         │  PMS5003 (every 10s)
├──────────────────┼──────────────────┼──────────────────┼──┤
│                  ↓                  ↓                  ↓  │  Send UART (every 15s)
├─────────────────────────────────────────────────────────┼──┤
│                                                          ↓  │  Cleanup (every 60s)
└──────────────────────────────────────────────────────────┘
```

### Task Definitions

| Task | Interval | Priority | Function | CPU Time |
|------|----------|----------|----------|----------|
| `mesh.update()` | Continuous | Highest | Process mesh messages | ~5ms/call |
| `taskReadDHT` | 5000ms | High | Read DHT11 sensor | ~250ms |
| `taskReadPMS` | 10000ms | High | Read PMS5003 sensor | ~50ms |
| `taskSendData` | 15000ms | Medium | Send aggregated data via UART | ~20ms |
| `taskCleanup` | 60000ms | Low | Remove stale mesh data | ~5ms |

**Total CPU Usage**: ~8-12% (typical operation)

---

## 💾 Memory Architecture

### RAM Usage Breakdown

```
┌─────────────────────────────────────┐
│        ESP32-S3 RAM (512KB)         │
├─────────────────────────────────────┤
│                                     │
│  ┌────────────────────────────┐    │
│  │ System Reserved (~200KB)   │    │  System, WiFi stack, etc.
│  └────────────────────────────┘    │
│                                     │
│  ┌────────────────────────────┐    │
│  │ Painless Mesh (~80KB)      │    │  Mesh routing tables
│  └────────────────────────────┘    │
│                                     │
│  ┌────────────────────────────┐    │
│  │ Local Sensor Data (~1KB)   │    │  localSensors struct
│  └────────────────────────────┘    │
│                                     │
│  ┌────────────────────────────┐    │
│  │ Mesh Node Array (~20KB)    │    │  meshNodes[10] with JSON
│  │ - 10 nodes × 2KB each      │    │
│  └────────────────────────────┘    │
│                                     │
│  ┌────────────────────────────┐    │
│  │ JSON Buffers (~3KB)        │    │  Serialization buffers
│  └────────────────────────────┘    │
│                                     │
│  ┌────────────────────────────┐    │
│  │ Stack & Heap (~100KB)      │    │  Runtime allocation
│  └────────────────────────────┘    │
│                                     │
│  ┌────────────────────────────┐    │
│  │ Free RAM (~108KB)          │    │  Available
│  └────────────────────────────┘    │
│                                     │
└─────────────────────────────────────┘
```

### Data Structures

**localSensors struct** (56 bytes):
```cpp
struct LocalSensorData {
  float temperature;      // 4 bytes
  float humidity;         // 4 bytes
  uint16_t pm1_0;         // 2 bytes
  uint16_t pm2_5;         // 2 bytes
  uint16_t pm10;          // 2 bytes
  bool dhtValid;          // 1 byte
  bool pmsValid;          // 1 byte
  unsigned long lastDhtRead;  // 4 bytes
  unsigned long lastPmsRead;  // 4 bytes
} // Total: 24 bytes + padding
```

**MeshNodeData struct** (~2KB per node):
```cpp
struct MeshNodeData {
  uint32_t nodeId;              // 4 bytes
  String deviceId;              // ~20 bytes (avg)
  String deviceType;            // ~15 bytes (avg)
  JsonDocument data;            // ~1500 bytes (512 capacity + overhead)
  unsigned long lastUpdate;     // 4 bytes
} // Total: ~1543 bytes per node
```

**meshNodes array**: 10 nodes × 1543 bytes = ~15KB

---

## 🌐 Painless Mesh Network Architecture

### Mesh Topology (Self-Organizing)

```
Example network with 8 nodes:

        ┌─────────┐
        │ Node 1  │ ─────┐
        │ (Room)  │      │
        └─────────┘      │
             │           │
             │           ▼
        ┌─────────┐  ┌──────────┐
        │ Node 2  │──│ Main Hub │ ← This project
        │ (Door)  │  │ (Master) │
        └─────────┘  └──────────┘
                        │    │
           ┌────────────┘    └────────────┐
           │                              │
        ┌─────────┐                  ┌─────────┐
        │ Node 3  │                  │ Node 4  │
        │ (Window)│                  │ (Gas)   │
        └─────────┘                  └─────────┘
           │                              │
           │                              │
        ┌─────────┐                  ┌─────────┐
        │ Node 5  │                  │ Node 6  │
        │ (Motion)│                  │ (Smoke) │
        └─────────┘                  └─────────┘

Note: Mesh automatically routes around failed nodes
```

### Mesh Message Protocol

**Broadcast Message** (from sensor node):
```cpp
// On sensor node
String msg = "{\"device_id\":\"room_001\",\"temp\":24.5}";
mesh.sendBroadcast(msg);
```

**Reception** (on Main Mesh Hub):
```cpp
void receivedCallback(uint32_t from, String &msg) {
  // from = sender's node ID
  // msg = JSON string
  storeMeshNodeData(from, parsedJson);
}
```

**Mesh Network Parameters**:
| Parameter | Value | Notes |
|-----------|-------|-------|
| Network Name | `ESP32_SmartHome_Mesh` | Must match all nodes |
| Password | `smarthome2024` | WPA2 encryption |
| Port | 5555 | UDP port for mesh |
| Channel | Auto | Mesh selects best channel |
| Max Nodes | ~20 | Practical limit |
| Max Hops | 5 | Max routing hops |
| Latency | 50-200ms | Node-to-hub delay |

---

## 🔒 Security Architecture

### Network Layers Security

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 5: Application                                        │
│ - JWT tokens for API authentication                         │
│ - Firebase Admin SDK for backend                            │
└─────────────────────────────────────────────────────────────┘
                           ▲
                           │ HTTPS (TLS 1.3)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 4: Gateway (Main LCD)                                 │
│ - WiFi WPA2 encryption                                      │
│ - API token validation                                      │
└─────────────────────────────────────────────────────────────┘
                           ▲
                           │ UART (physical security)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: Aggregation (Main Mesh Hub)                        │
│ - Mesh network password                                     │
│ - Input validation (JSON schema)                            │
└─────────────────────────────────────────────────────────────┘
                           ▲
                           │ Painless Mesh (WPA2)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: Sensors (Mesh Nodes)                               │
│ - Mesh authentication                                       │
│ - Device ID whitelisting (optional)                         │
└─────────────────────────────────────────────────────────────┘
```

### Current Security Limitations

⚠️ **Not Production-Ready Security**
- Mesh password is hardcoded (should use encrypted storage)
- No message signing (mesh messages can be spoofed)
- No replay attack protection
- UART is unencrypted (physical access = full access)

### Security Recommendations for Production

1. **Mesh Network**:
   - Store mesh password in encrypted flash
   - Implement message signing (HMAC-SHA256)
   - Add message sequence numbers (prevent replay)
   - Whitelist known node IDs

2. **UART Communication**:
   - Add message authentication codes
   - Encrypt sensitive payloads
   - Implement challenge-response protocol

3. **Backend Communication**:
   - Rotate API tokens regularly
   - Implement rate limiting
   - Add anomaly detection

---

## ⚡ Performance Characteristics

### Latency Breakdown (Sensor to Dashboard)

```
Event: Room sensor detects temperature change

│
├─ Sensor reading         ~250ms
│  (DHT22 sensor acquisition time)
│
├─ Mesh transmission      ~50-200ms
│  (depends on hop count and network congestion)
│
├─ Main Mesh aggregation  ~0-15000ms ⚠️ Buffering!
│  (waits for next 15s interval)
│
├─ UART transmission      ~20ms
│  (115200 baud, ~2KB payload)
│
├─ Main LCD processing    ~100ms
│  (parse, validate, prepare HTTP)
│
├─ WiFi + HTTP POST       ~200-500ms
│  (network latency + backend processing)
│
├─ Backend → Firestore    ~100-300ms
│  (database write + indexing)
│
├─ Frontend polling       ~0-5000ms ⚠️ Polling interval!
│  (Next.js polls every 5s)
│
└─ Frontend render        ~50ms
   (React state update + DOM)

Total Latency: 770ms to 21.5s
Average: ~10-12 seconds
```

**Bottlenecks**:
1. ⚠️ **15s aggregation interval** - Largest contributor
2. ⚠️ **5s frontend polling** - Could use WebSocket
3. Mesh network congestion (with many nodes)

---

## 🔄 Error Handling & Recovery

### Fault Tolerance Matrix

| Failure Scenario | Detection | Recovery | Data Loss |
|------------------|-----------|----------|-----------|
| **Mesh node offline** | No messages for 2min | Remove from array | Loses that node's data |
| **Sensor read failure** | NaN values returned | Mark invalid, continue | Skips that reading |
| **UART transmission error** | Send timeout | Retry next cycle | Loses one 15s update |
| **Main LCD offline** | N/A (one-way UART) | Continue buffering | Data lost if LCD down |
| **Mesh network split** | Node list changes | Auto-reconnect | Brief data gap |
| **Power loss** | N/A | Cold boot, rejoin | Loses in-RAM data |
| **Memory overflow** | Heap check (optional) | Cleanup old data | Oldest mesh nodes dropped |

### Automatic Recovery Mechanisms

1. **Mesh Network**:
   ```cpp
   // Painless Mesh automatically:
   - Discovers new nodes
   - Routes around failures
   - Heals network topology
   - No manual intervention needed
   ```

2. **Sensor Failures**:
   ```cpp
   if (isnan(temperature)) {
     localSensors.dhtValid = false;
     // Continue operating with other sensors
   }
   ```

3. **Stale Data Cleanup**:
   ```cpp
   // Every 60s, remove mesh data older than 2min
   if (now - lastUpdate > 120000) {
     removeMeshNode(i);
   }
   ```

---

## 📈 Scalability Limits

### Current Architecture Limits

| Resource | Limit | Reason |
|----------|-------|--------|
| **Max Mesh Nodes** | 10 | RAM limitation (meshNodes array) |
| **Mesh Network Size** | ~20 nodes | Painless Mesh practical limit |
| **Data Rate** | ~133 bytes/s | UART 115200 baud / 15s interval |
| **Sensor Types** | Unlimited | JSON flexible schema |
| **Message Size** | 2KB | StaticJsonDocument<2048> |

### Scaling Recommendations

**To support 50+ sensors**:
1. Increase `MAX_MESH_NODES` to 20
2. Use PSRAM for `meshNodes` array
3. Reduce aggregation interval to 5s
4. Upgrade to ESP32-S3 with 8MB PSRAM

**To support 100+ sensors**:
1. Deploy multiple Main Mesh Hubs (zone-based)
2. Each hub handles 20 sensors
3. Multiple UART connections to Main LCD
4. Main LCD multiplexes data streams

---

## 🛠️ Debugging Architecture

### Serial Output Structure

```
[COMPONENT] Level Message

Examples:
[SETUP] ✓ DHT11 initialized
[MESH] ← Received from node 123456
[DHT11] ✓ Temp: 24.5°C
[PMS5003] ✗ Read timeout
[UART] ✓ Sent 1847 bytes
```

**Log Levels** (future implementation):
- ✓ Success (green in terminal)
- ⚠ Warning (yellow)
- ✗ Error (red)
- ℹ Info (white)

### Debug Points

| Location | Method | Purpose |
|----------|--------|---------|
| **Mesh RX** | `receivedCallback()` | Print incoming messages |
| **Sensor Read** | `readDHT11()`, `readPMS5003()` | Validate readings |
| **Aggregation** | `sendAggregatedDataToLCD()` | Check JSON structure |
| **UART TX** | `LcdSerial.println()` | Confirm transmission |
| **Memory** | `ESP.getFreeHeap()` | Monitor RAM usage |

---

## 📚 Related Architecture Documents

- [Backend API Architecture](../Backend/ARCHITECTURE.md) - Backend server design
- [Frontend Architecture](../Frontend/ARCHITECTURE.md) - Dashboard design
- [Mesh Protocol Specification](./MESH_PROTOCOL.md) - Detailed mesh message format (future)

---

**Last Updated**: November 2025
**Architecture Version**: 2.0 (Mesh-based)
**Previous Version**: 1.0 (WiFi-based) - Deprecated
