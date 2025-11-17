# ESP32-S3 Main Mesh - Wiring Diagram

## Hardware Components

- **Microcontroller:** ESP32-S3 DevKit-C
- **Sensor 1:** PMS5003 Particulate Matter Sensor
- **Sensor 2:** DHT11 Temperature & Humidity Sensor
- **Power:** 5V USB-C or External Power Supply

---

## Pin Assignments

### DHT11 Temperature & Humidity Sensor

| DHT11 Pin | ESP32-S3 Pin | Wire Color (Suggested) |
|-----------|--------------|------------------------|
| VCC       | 3.3V         | Red                    |
| DATA      | GPIO4        | Yellow/Orange          |
| GND       | GND          | Black                  |

**Notes:**
- DHT11 requires a 10kΩ pull-up resistor between DATA and VCC
- Some DHT11 modules have built-in pull-up resistor
- Operating voltage: 3.3V-5V (3.3V recommended for ESP32-S3)

---

### PMS5003 PM Sensor

| PMS5003 Pin | ESP32-S3 Pin | Wire Color (Suggested) | Function        |
|-------------|--------------|------------------------|-----------------|
| VCC         | 5V           | Red                    | Power (5V)      |
| GND         | GND          | Black                  | Ground          |
| TX          | GPIO16 (RX1) | Green                  | Data Out → ESP  |
| RX          | GPIO17 (TX1) | Blue                   | Data In ← ESP   |
| SET         | Not Used     | -                      | Sleep Control   |
| RESET       | Not Used     | -                      | Reset (optional)|

**Notes:**
- PMS5003 requires **5V** power (500mA max)
- Serial communication at 9600 baud
- TX/RX are 3.3V logic compatible (no level shifter needed)
- SET pin can be used for sleep mode (connect to GPIO if needed)
- RESET pin for manual sensor reset (usually not needed)

---

### Built-in LED (Status Indicator)

| Function | ESP32-S3 Pin |
|----------|--------------|
| RGB LED  | GPIO48       |

---

## Complete Wiring Diagram (Text)

```
ESP32-S3 DevKit-C
┌─────────────────────────────┐
│                             │
│  3.3V ──────────── VCC (DHT11)
│  GPIO4 ─────────── DATA (DHT11)
│  GND ───────────── GND (DHT11)
│                             │
│  5V ────────────── VCC (PMS5003)
│  GPIO16 (RX1) ──── TX (PMS5003)
│  GPIO17 (TX1) ──── RX (PMS5003)
│  GND ───────────── GND (PMS5003)
│                             │
│  GPIO48 = Built-in RGB LED  │
│                             │
└─────────────────────────────┘
```

---

## Physical Layout Recommendations

### Breadboard Setup

```
DHT11 Sensor Module
┌─────────────┐
│    DHT11    │
│   ┌─────┐   │
│   │  □  │   │ ← Sensor Grid
│   └─────┘   │
└──┬──┬───┬───┘
   │  │   │
   V  D   G
   C  A   N
   C  T   D
   │  A   │
   │  │   │
   └──┼───┘
      │
   GPIO4
```

```
PMS5003 Sensor
┌──────────────────┐
│    PMS5003       │
│  ┌──────────┐    │
│  │   FAN    │    │ ← Internal Fan
│  └──────────┘    │
│                  │
│  [Air Inlet]     │
└─┬─┬──┬──┬──┬─────┘
  V G  T  R  S  R
  C N  X  X  E  E
  C D     ←  T  S
  │ │     →     E
  5 G  GPIO   GPIO T
  V N  16    17
  D D
```

---

## Power Considerations

### Power Requirements

| Component    | Voltage | Current (Typical) | Current (Max) |
|-------------|---------|-------------------|---------------|
| ESP32-S3    | 3.3V    | 80mA              | 500mA         |
| DHT11       | 3.3V    | 0.5mA             | 2.5mA         |
| PMS5003     | 5V      | 100mA             | 500mA         |
| **Total**   | -       | ~180mA            | ~1000mA       |

### Power Supply Options

**Option 1: USB-C (Recommended)**
- ESP32-S3 DevKit-C has onboard 5V → 3.3V regulator
- Connect USB-C for both 5V and 3.3V rails
- Sufficient for all components

**Option 2: External 5V Power**
- Use 5V 1A+ power adapter
- Connect to 5V and GND pins on ESP32-S3
- Onboard regulator provides 3.3V for DHT11 and ESP32

**⚠️ Warning:**
- Do NOT power PMS5003 from 3.3V pin
- PMS5003 needs 5V for fan operation
- ESP32-S3's 3.3V pin can only supply ~500mA

---

## Sensor Placement

### DHT11 Placement
- Keep away from heat sources (including ESP32-S3 chip)
- Allow airflow around sensor for accurate readings
- Mount at least 10cm away from ESP32-S3 board

### PMS5003 Placement
- Orient horizontally (fan facing down)
- Ensure air inlet is unobstructed
- Place in area with representative air quality
- Avoid direct sunlight or heat sources
- Keep away from strong airflow (fans, AC vents)

---

## Troubleshooting

### DHT11 Not Reading

**Symptom:** `[DHT11] ✗ Read failed - Check wiring!`

**Solutions:**
1. Check VCC is connected to 3.3V (not 5V)
2. Verify DATA pin connected to GPIO4
3. Ensure GND is connected
4. Check if pull-up resistor is present (10kΩ between DATA and VCC)
5. Try replacing DHT11 module (common failure mode)

### PMS5003 Not Reading

**Symptom:** `[PMS5003] ✗ No data - Sensor warming up or check wiring`

**Solutions:**
1. **Wait 30 seconds** - PMS5003 needs warm-up time
2. Check VCC is connected to **5V** (not 3.3V)
3. Verify TX (PMS) → GPIO16 (ESP)
4. Verify RX (PMS) → GPIO17 (ESP)
5. Check GND connection
6. Listen for fan noise (should be audible)
7. Try resetting ESP32-S3

### Serial Monitor Shows Garbage

**Symptom:** Unreadable characters in serial monitor

**Solutions:**
1. Set baud rate to **115200** in serial monitor
2. Check USB cable is data-capable (not charge-only)
3. Try different USB port

### WiFi Not Connecting

**Symptom:** `[WiFi] Not connected`

**Solutions:**
1. Update WiFi credentials in `main.cpp`:
   ```cpp
   const char* WIFI_SSID = "YourActualSSID";
   const char* WIFI_PASSWORD = "YourActualPassword";
   ```
2. Ensure 2.4GHz WiFi (ESP32 doesn't support 5GHz)
3. Check WiFi signal strength in location

---

## Serial Monitor Output Example

```
========================================
ESP32-S3 Main Mesh Node
PMS5003 + DHT11 Sensors
========================================

[WiFi] Connecting to MyWiFi..... Connected!
[WiFi] IP Address: 192.168.1.100
[WiFi] Signal Strength: -45 dBm

[Sensors] Initializing...
[DHT11] Starting sensor...
[DHT11] ✓ Ready
[PMS5003] Starting sensor...
[PMS5003] ✓ Ready
[PMS5003] Note: First readings may take 30s to stabilize

[Setup] Complete! Starting sensor readings...

[DHT11] Temperature: 25.3°C | Humidity: 60.5%
[PMS5003] Requesting data...
[PMS5003] ✓ PM1.0: 8 µg/m³ | PM2.5: 12 µg/m³ | PM10: 15 µg/m³
[PMS5003] Air Quality: GOOD

========== SENSOR READINGS ==========
Temperature: 25.3°C
Humidity:    60.5%
PM1.0:       8 µg/m³
PM2.5:       12 µg/m³
PM10:        15 µg/m³
====================================

[Server] Sending data...
[Server] Payload: {"device_id":"main_mesh_001","sensors":{"temperature":25.3,"humidity":60.5,"pm1_0":8,"pm2_5":12,"pm10":15}}
[Server] ✓ Response code: 200
[Server] Response: {"status":"ok","message":"Sensor data received"}
```

---

## Next Steps

1. **Flash the code:**
   ```bash
   pio run --target upload
   ```

2. **Open serial monitor:**
   ```bash
   pio device monitor
   ```

3. **Update configuration in `src/main.cpp`:**
   - WiFi SSID and password
   - Backend API URL
   - Device ID and API token

4. **Test sensors individually:**
   - Cover DHT11 with hand to see temperature rise
   - Blow on PMS5003 or use incense to see PM levels increase

5. **Verify data on backend:**
   - Check Firebase Console → Firestore
   - Look for `devices/main_mesh_001/sensors/current`
