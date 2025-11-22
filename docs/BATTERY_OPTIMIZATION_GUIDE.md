# ESP32 Battery Optimization Guide
## 400mAh LiPo Battery Life Analysis

### Quick Answer
**Current setup (always-on): 2-3 hours**
**With optimizations: 24-48 hours (1-2 days)**
**Aggressive optimization: 3-7 days**

---

## Power Consumption by Component

### Your Sensor Setup

| Component | Idle | Active | Average | Notes |
|-----------|------|--------|---------|-------|
| **ESP32** | 80mA | 160mA | 120mA | WiFi mesh active |
| **VEML7700** | 5µA | 300µA | 0.3mA | Light sensor |
| **AHT25** | 200µA | 550µA | 0.4mA | Temp/humidity |
| **MICS5524** | 20mA | 40mA | 30mA | ⚠️ **GAS HEATER** |
| **Total** | | | **~151mA** | Always-on mode |

### ⚠️ The MICS5524 is Your Biggest Problem

The gas sensor requires a heated element that consumes 20-40mA continuously. This is where optimization is most critical.

---

## Battery Life Calculations

### Scenario 1: Always-On (Current)
```
Average current: 151mA
Battery capacity: 400mAh × 0.8 (usable) = 320mAh
Battery life: 320mAh ÷ 151mA = 2.1 hours
```

### Scenario 2: Basic Deep Sleep (60s intervals)
```
Active phase (3s):
  - ESP32: 120mA × 3s = 0.1mAh
  - Sensors: 31mA × 3s = 0.026mAh
  - Gas heater: 30mA × 20s = 0.167mAh
  - Total: 0.293mAh

Sleep phase (57s):
  - ESP32 deep sleep: 0.05mA × 57s = 0.0008mAh
  - Sensors off: 0mA

Per cycle (60s): 0.294mAh
Per hour (60 cycles): 17.6mAh
Battery life: 320mAh ÷ 17.6mAh = 18.2 hours
```

### Scenario 3: Optimized (conditional transmission)
```
Only transmit on significant changes (50% reduction)
Per hour: 17.6mAh × 0.5 = 8.8mAh
Battery life: 320mAh ÷ 8.8mAh = 36.4 hours (~1.5 days)
```

### Scenario 4: Aggressive (5min intervals)
```
Active cycles: 12 per hour (instead of 60)
Per hour: 0.294mAh × 12 = 3.5mAh
Battery life: 320mAh ÷ 3.5mAh = 91 hours (~3.8 days)
```

### Scenario 5: Ultra-Low (replace gas sensor)
```
Replace MICS5524 with BME680 (includes gas, temp, humidity, pressure)
BME680 active: 3.7mA (vs 30mA)
Per cycle: 0.1 + 0.004 + 0.0008 = 0.105mAh
Per hour (60 cycles): 6.3mAh
Battery life: 320mAh ÷ 6.3mAh = 50.8 hours (~2.1 days)

With 5min intervals: 320 ÷ 1.26 = 254 hours (~10.6 days)
```

---

## Optimization Strategies (Ranked by Impact)

### 🥇 #1: Control Gas Sensor Heating (30mA savings)
**Impact: 2 hours → 18 hours**

```cpp
// Only heat when measuring
void readGasSensor() {
  digitalWrite(HEATER_PIN, HIGH);
  delay(20000);  // Stabilize for 20 seconds
  uint16_t value = analogRead(GAS_PIN);
  digitalWrite(HEATER_PIN, LOW);  // Turn off immediately
  return value;
}
```

### 🥈 #2: Implement Deep Sleep (120mA savings)
**Impact: 18 hours → 36 hours**

```cpp
void loop() {
  readSensors();
  if (hasChangedSignificantly()) {
    transmitToMesh();
  }
  esp_deep_sleep_start();  // Wake on timer
}
```

### 🥉 #3: Conditional Transmission (30-50% savings)
**Impact: 36 hours → 48 hours**

```cpp
bool hasChangedSignificantly() {
  return (abs(temp - lastTemp) > 0.5) ||
         (abs(humidity - lastHumidity) > 2.0) ||
         (abs(light - lastLight) > 50);
}
```

### #4: Increase Sleep Intervals (proportional savings)
**Impact: 48 hours → 91 hours (with 5min intervals)**

```cpp
#define SLEEP_DURATION_S 300  // 5 minutes
esp_sleep_enable_timer_wakeup(SLEEP_DURATION_S * 1000000ULL);
```

### #5: Replace MICS5524 with BME680 (27mA savings)
**Impact: 91 hours → 254 hours (10+ days)**

The Bosch BME680 includes:
- Gas sensor (VOC)
- Temperature
- Humidity
- Barometric pressure
- **Only 3.7mA peak consumption**

---

## Sensor-Specific Recommendations

### VEML7700 (Ambient Light) - ✅ Already Efficient
- Current: 300µA active, 5µA standby
- **Recommendation:** Keep as-is
- Can use `veml.powerSaveEnable(true)` between readings

### AHT25 (Temp/Humidity) - ✅ Already Efficient
- Current: 200µA idle, 550µA measuring
- **Recommendation:** Keep as-is
- Already low power

### MICS5524 (Gas Sensor) - ⚠️ POWER HOG
- Current: 20-40mA continuous
- **Problem:** Requires heated element for accurate readings
- **Solutions:**
  1. **Intermittent heating:** Only heat for 20-30s before reading
  2. **Replace with BME680:** Similar functionality, 10× lower power
  3. **Replace with CCS811:** Digital I2C sensor, has sleep modes

---

## Alternative Gas Sensors (Power Comparison)

| Sensor | Current | Features | Cost | Notes |
|--------|---------|----------|------|-------|
| **MICS5524** | 20-40mA | CO, alcohol, acetone | $5 | Your current choice |
| **BME680** | 3.7mA | VOC, temp, humidity, pressure | $20 | **Best choice** |
| **CCS811** | 1.2-46mA | eCO2, TVOC, has sleep mode | $10 | Good middle ground |
| **SGP30** | 48mA | eCO2, TVOC | $15 | Higher power |
| **BME688** | 3.7mA | AI gas sensing, 4 heater profiles | $25 | Latest from Bosch |

### Recommendation: **BME680**
- Replaces MICS5524 **AND** AHT25
- 10× lower power consumption
- Higher accuracy
- Includes barometric pressure (bonus!)

---

## PainlessMesh-Specific Optimizations

### Current Issue
PainlessMesh keeps WiFi active constantly (~80-120mA base consumption).

### Solutions

#### Option 1: Reduce Mesh TX Power
```cpp
mesh.init(MESH_PREFIX, MESH_PASSWORD, &userScheduler, MESH_PORT);
WiFi.setTxPower(WIFI_POWER_MINUS_1dBm);  // Reduce from 20dBm to 19dBm
// Options: WIFI_POWER_19_5dBm, WIFI_POWER_19dBm, ..., WIFI_POWER_MINUS_1dBm
```
Savings: ~10-20mA (if nodes are close)

#### Option 2: Quick Connect & Disconnect
```cpp
void transmitData() {
  mesh.update();  // Process mesh

  unsigned long start = millis();
  while (millis() - start < 5000) {  // Try for 5s
    mesh.update();
    if (mesh.getNodeList().size() > 0) {
      mesh.sendBroadcast(jsonData);
      delay(500);  // Ensure transmission
      break;
    }
  }
  // Mesh will disconnect during deep sleep
}
```

#### Option 3: Use ESP-NOW Instead
ESP-NOW is more power-efficient than mesh for simple hub-spoke topologies:
- Active: ~120mA for <100ms
- Can sleep immediately after transmission
- **Battery life improvement: 2-3×**

---

## Hardware Additions for Better Battery Life

### 1. Battery Voltage Monitoring
**Why:** Prevent over-discharge, track remaining capacity

```cpp
#define BATTERY_PIN 35

float readBatteryVoltage() {
  uint16_t adc = analogRead(BATTERY_PIN);
  // Voltage divider: 100k + 100k (÷2)
  float voltage = (adc / 4095.0) * 3.3 * 2.0;
  return voltage;
}

uint8_t batteryPercent(float v) {
  // LiPo: 3.0V (empty) to 4.2V (full)
  return constrain((v - 3.0) / 1.2 * 100, 0, 100);
}
```

**Wiring:**
```
Battery+ ──┬──── 100kΩ ───┬──── 100kΩ ───┬──── GND
           │              │              │
           │          GPIO 35        LiPo Charger
           │
        ESP32 VCC
```

### 2. Low-Power Voltage Regulator
**Why:** Standard regulators waste 5-10mA in quiescent current

Recommended: **MCP1700** (1.6µA quiescent) or **XC6220** (1µA)

### 3. Load Switch for Sensors
**Why:** Completely cut power to sensors during sleep

```cpp
#define SENSOR_POWER_PIN 26

void enableSensors() {
  digitalWrite(SENSOR_POWER_PIN, HIGH);
  delay(100);  // Stabilization time
}

void disableSensors() {
  digitalWrite(SENSOR_POWER_PIN, LOW);
}
```

---

## Complete Optimization Roadmap

### Phase 1: Quick Wins (1 hour)
- [ ] Add intermittent gas heater control → **18 hours**
- [ ] Implement basic deep sleep → **36 hours**
- [ ] Add conditional transmission → **48 hours**

### Phase 2: Code Optimization (2-3 hours)
- [ ] Increase sleep intervals to 2-5 minutes → **72-91 hours**
- [ ] Reduce mesh TX power → **+10% battery life**
- [ ] Add battery voltage monitoring → **Prevent over-discharge**

### Phase 3: Hardware Changes (1 day)
- [ ] Replace MICS5524 with BME680 → **5-10 days**
- [ ] Add load switch for sensors → **+15% battery life**
- [ ] Upgrade to low-power regulator → **+20% battery life**

### Phase 4: Advanced (2-3 days)
- [ ] Replace PainlessMesh with ESP-NOW → **10-14 days**
- [ ] Add solar panel (3.7V 100mA) → **Indefinite**

---

## Expected Battery Life Summary

| Configuration | Battery Life | Implementation Time |
|---------------|--------------|---------------------|
| Current (always-on) | **2-3 hours** | N/A |
| + Intermittent heating | **18 hours** | 30 min |
| + Deep sleep | **36 hours** | 1 hour |
| + Conditional TX | **48 hours** | 1.5 hours |
| + 5min intervals | **3-4 days** | 2 hours |
| + BME680 replacement | **7-10 days** | 1 day |
| + ESP-NOW | **10-14 days** | 2-3 days |
| + Solar panel | **Indefinite** | 1 day |

---

## Testing Your Battery Life

### Method 1: Measure Current Draw
Use a multimeter in series with battery:

```
Battery+ ───→ [Multimeter] ───→ ESP32 VCC
Battery- ───→ ESP32 GND
```

Expected readings:
- Active: 120-160mA
- Deep sleep: 0.05-1mA
- Sensor heating: +30mA spike

### Method 2: Voltage Tracking
Log battery voltage every wake cycle:

```cpp
void logBatteryData() {
  float v = readBatteryVoltage();
  Serial.printf("Boot: %d | Voltage: %.2fV | Percent: %d%%\n",
                bootCount, v, batteryPercent(v));
}
```

Calculate rate of discharge:
```
Drop per hour = (V_start - V_current) / hours_elapsed
Estimated remaining = (V_current - 3.0V) / drop_per_hour
```

### Method 3: RTC Counter
Track total wake cycles to estimate usage:

```cpp
RTC_DATA_ATTR uint32_t wakeCount = 0;

void setup() {
  wakeCount++;
  float hoursRunning = (wakeCount * SLEEP_DURATION_S) / 3600.0;
  Serial.printf("Running for %.2f hours (%d wake cycles)\n",
                hoursRunning, wakeCount);
}
```

---

## Real-World Considerations

### Temperature Effects
- **Cold (<0°C):** Capacity drops 20-40%
- **Hot (>40°C):** Accelerated aging, reduced capacity
- **Optimal:** 20-25°C

### Battery Aging
- LiPo batteries lose ~20% capacity per year
- Deep discharge cycles reduce lifespan
- Keep voltage above 3.2V for longevity

### WiFi Environment
- High noise/interference → Higher retry power
- Long distances → Higher TX power needed
- Multiple walls → Mesh hops increase power

### Sensor Placement
- Direct sunlight on VEML7700 → More frequent readings
- High pollution → Gas sensor works harder
- Humid environments → Condensation risk

---

## Recommended Starting Configuration

For **24-48 hours** battery life with your 400mAh LiPo:

```cpp
#define SLEEP_DURATION_S     60      // 1-minute intervals
#define GAS_HEAT_TIME_MS     20000   // 20-second heating
#define TEMP_THRESHOLD       0.5     // 0.5°C change
#define HUMIDITY_THRESHOLD   2.0     // 2% change
#define LIGHT_THRESHOLD      50      // 50 lux change
#define LOW_BATTERY_WARNING  20      // 20% battery
#define CRITICAL_BATTERY     5       // 5% battery
```

This balances:
- ✅ Reasonable update frequency (1 min)
- ✅ Good sensor accuracy
- ✅ 1-2 days battery life
- ✅ Low implementation complexity

---

## Need More Battery Life?

### Larger Battery
- **1000mAh:** 2-5 days (2.5× improvement)
- **2000mAh:** 4-10 days (5× improvement)
- **3000mAh:** 6-15 days (7.5× improvement)

### Solar Charging
- **100mA @ 5V panel:** ~12mAh/hour (sunny)
- **Average consumption:** 6-17mAh/hour
- **Result:** Near-indefinite operation in sunny climates

---

## Questions?

For more details, see:
- `examples/battery_optimized_sensor.cpp` - Full implementation
- `docs/POWER_PROFILING.md` - Detailed power analysis
- ESP32 Deep Sleep: https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/system/sleep_modes.html

**Need help?** Open an issue or check the project README.
