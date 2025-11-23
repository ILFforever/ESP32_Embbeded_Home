# Battery Life: 10-Minute Reading Intervals

Complete analysis of battery life with 10-minute (600-second) sleep intervals.

---

## 📊 Power Consumption - 10 Minute Intervals

### Configuration 1: DevKit + MICS5524 + AHT25 + VEML7700

**Active Phase (23 seconds per cycle):**
```
ESP32 WiFi mesh:    120mA × 3s  = 0.100 mAh
VEML7700:          0.005mA × 3s = 0.000015 mAh (negligible)
AHT25:              0.3mA × 1s  = 0.0003 mAh
MICS5524 heating:    30mA × 20s = 0.167 mAh
─────────────────────────────────────────
Active subtotal:                 = 0.267 mAh
```

**Sleep Phase (577 seconds per cycle):**
```
ESP32 deep sleep (DevKit): 0.5mA × 577s = 0.080 mAh
Sensors off: 0 mA
─────────────────────────────────────────
Sleep subtotal:                   = 0.080 mAh
```

**Per Cycle Total (600 seconds = 10 minutes):**
```
Total per cycle: 0.267 + 0.080 = 0.347 mAh
Cycles per hour: 6
Power per hour: 6 × 0.347 = 2.08 mAh
```

**Battery Life (400mAh LiPo):**
```
Usable capacity: 400mAh × 0.8 = 320mAh
Battery life: 320 ÷ 2.08 = 153.8 hours

✅ RESULT: 6.4 DAYS
With conditional TX (50% skip): 307 hours = 12.8 DAYS
```

---

### Configuration 2: DevKit + BME680 + VEML7700 (RECOMMENDED)

**Active Phase (5 seconds per cycle):**
```
ESP32 WiFi mesh:    120mA × 3s  = 0.100 mAh
VEML7700:          0.005mA × 3s = 0.000015 mAh
BME680:             3.7mA × 2s  = 0.002 mAh
─────────────────────────────────────────
Active subtotal:                 = 0.102 mAh
```

**Sleep Phase (595 seconds per cycle):**
```
ESP32 deep sleep (DevKit): 0.5mA × 595s = 0.083 mAh
─────────────────────────────────────────
Sleep subtotal:                   = 0.083 mAh
```

**Per Cycle Total (600 seconds = 10 minutes):**
```
Total per cycle: 0.102 + 0.083 = 0.185 mAh
Cycles per hour: 6
Power per hour: 6 × 0.185 = 1.11 mAh
```

**Battery Life (400mAh LiPo):**
```
Usable capacity: 320mAh
Battery life: 320 ÷ 1.11 = 288 hours

✅ RESULT: 12 DAYS
With conditional TX (50% skip): 576 hours = 24 DAYS!
```

---

## 🔋 Complete Battery Life Comparison Table

| Configuration | 60s Interval | 300s (5min) | **600s (10min)** | Improvement |
|---------------|--------------|-------------|------------------|-------------|
| **DevKit + MICS5524** | 19.4 hours | 87 hours (3.6 days) | **154 hours (6.4 days)** | **8× vs 60s** |
| **DevKit + MICS5524 (conditional)** | 38.8 hours | - | **308 hours (12.8 days)** | **16× vs 60s!** |
| **DevKit + BME680** | 48.5 hours | 242 hours (10 days) | **288 hours (12 days)** | **6× vs 60s** |
| **DevKit + BME680 (conditional)** | 97 hours | - | **576 hours (24 days)** | **24× vs 60s!** |

---

## 📈 Visual Comparison

### MICS5524 Setup (400mAh Battery)

```
Sleep Interval Impact:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

60s:    ████ 19 hours
        ████████ 39 hours (with conditional TX)

300s:   ████████████████████ 87 hours (3.6 days)

600s:   ████████████████████████████████ 154 hours (6.4 days)
        ████████████████████████████████████████████████████████████ 308 hours (12.8 days) with conditional TX

        0     50    100   150   200   250   300   350 hours
```

### BME680 Setup (400mAh Battery) ⭐

```
Sleep Interval Impact:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

60s:    ██████████ 48.5 hours
        ████████████████████ 97 hours (with conditional TX)

300s:   ████████████████████████████████████████████████ 242 hours (10 days)

600s:   ██████████████████████████████████████████████████████ 288 hours (12 days)
        ████████████████████████████████████████████████████████████████████████████████████████████████████ 576 hours (24 days!) with conditional TX

        0     100   200   300   400   500   600 hours
```

---

## 💡 Why 10-Minute Intervals Help SO Much

### The Math Behind It

The key insight: **Sleep power << Active power**

**Active power:** ~120-150mA (ESP32 WiFi + sensors)
**Sleep power:** ~0.5mA (DevKit board)

**Ratio:** Active is **240-300× higher** than sleep!

Therefore:
- **More time sleeping** = massive battery savings
- **Less time active** = battery life improves dramatically

### Power Distribution Analysis

#### 60-second intervals:
```
Active:  23s / 60s = 38% of time at high power
Sleep:   37s / 60s = 62% of time at low power
Average: ~17 mAh/hour
```

#### 300-second (5-min) intervals:
```
Active:  23s / 300s = 7.7% of time at high power
Sleep:   277s / 300s = 92.3% of time at low power
Average: ~3.7 mAh/hour (4.6× better!)
```

#### 600-second (10-min) intervals:
```
Active:  23s / 600s = 3.8% of time at high power
Sleep:   577s / 600s = 96.2% of time at low power
Average: ~2.1 mAh/hour (8× better than 60s!)
```

**The longer you sleep, the closer you get to pure sleep current consumption.**

---

## ⚖️ Trade-offs: Update Frequency vs Battery Life

### Is 10 Minutes Too Long?

Depends on your use case:

#### ✅ Good for 10-minute intervals:
- General room monitoring (temperature, humidity)
- Office/bedroom environmental tracking
- Long-term trend analysis
- Low-priority spaces (storage, garage)
- When you have cloud/backend data logging

#### ❌ May be too slow for:
- HVAC control systems (need faster response)
- Air quality alerts (gas leaks, smoke)
- Real-time dashboards
- Rapid environmental changes
- Critical monitoring applications

---

## 🎯 Recommended Configurations

### Option 1: Balanced (5-minute intervals)
```
Configuration: DevKit + BME680 + 300s sleep
Battery life: 10 days (242 hours)
Update frequency: Every 5 minutes
Use case: Most home monitoring scenarios

✅ Good balance of battery life and responsiveness
```

### Option 2: Maximum Battery (10-minute intervals) ⭐
```
Configuration: DevKit + BME680 + 600s sleep + conditional TX
Battery life: 24 DAYS (576 hours)
Update frequency: Every 10 minutes (only when changed)
Use case: Remote locations, minimal maintenance

✅ Nearly a month on 400mAh battery!
✅ Perfect for bedroom, office, closet monitoring
```

### Option 3: Ultra Battery (10-min + 1000mAh battery)
```
Configuration: BME680 + 600s + 1000mAh LiPo
Battery life: 60 DAYS (1440 hours)
Update frequency: Every 10 minutes
Cost: +$10 for larger battery

✅ 2 months on single charge!
✅ Add solar panel → essentially infinite
```

---

## 🔌 Code Changes for 10-Minute Intervals

### Simple Change in main.cpp:

```cpp
// Change this line:
#define SLEEP_DURATION_S     60     // 60 seconds

// To:
#define SLEEP_DURATION_S     600    // 10 minutes (600 seconds)
```

Or use the pre-configured PlatformIO environment:

```bash
# Edit platformio.ini, add:
[env:10min-intervals]
extends = env:esp32-room-sensor
build_flags =
    ${env:esp32-room-sensor.build_flags}
    -D SLEEP_DURATION_S=600        ; 10 minutes
    -D DEVICE_ID=\"room_sensor_bedroom_01\"

# Build and upload:
pio run -e 10min-intervals -t upload
```

---

## 📊 Detailed Hourly Power Consumption

### MICS5524 Setup (10-min intervals):

```
Hour 0-1:  6 cycles × 0.347 mAh = 2.08 mAh
Hour 1-2:  6 cycles × 0.347 mAh = 2.08 mAh
Hour 2-3:  6 cycles × 0.347 mAh = 2.08 mAh
...
Total per day: 24 × 2.08 = 49.9 mAh/day

Battery capacity: 320mAh
Days: 320 ÷ 49.9 = 6.4 days
```

### BME680 Setup (10-min intervals):

```
Hour 0-1:  6 cycles × 0.185 mAh = 1.11 mAh
Hour 1-2:  6 cycles × 0.185 mAh = 1.11 mAh
Hour 2-3:  6 cycles × 0.185 mAh = 1.11 mAh
...
Total per day: 24 × 1.11 = 26.6 mAh/day

Battery capacity: 320mAh
Days: 320 ÷ 26.6 = 12 days

With conditional TX (50% skip):
Per day: 13.3 mAh
Days: 320 ÷ 13.3 = 24 days
```

---

## 🚀 Further Optimizations for 10-Min Setup

### 1. Adaptive Sleep Based on Time of Day

Sleep longer at night when nothing changes:

```cpp
void adaptiveSleep() {
  struct tm timeinfo;
  getLocalTime(&timeinfo);

  int hour = timeinfo.tm_hour;

  if (hour >= 0 && hour < 6) {
    // Night: 30-minute intervals
    enterDeepSleep(1800);
  } else if (hour >= 22) {
    // Late evening: 20-minute intervals
    enterDeepSleep(1200);
  } else {
    // Day: 10-minute intervals
    enterDeepSleep(600);
  }
}
```

**Result:** Could extend to **30+ days** on 400mAh

---

### 2. Event-Based Transmission

Only transmit if ANY sensor exceeds threshold:

```cpp
bool shouldTransmit() {
  return (abs(temp - lastTemp) > TEMP_THRESHOLD) ||
         (abs(humidity - lastHumidity) > HUMIDITY_THRESHOLD) ||
         (abs(light - lastLight) > LIGHT_THRESHOLD) ||
         (abs(gas - lastGas) > GAS_THRESHOLD) ||
         (bootCount % 6 == 0);  // Force transmit every hour
}
```

**In stable environment:** 80-90% of transmissions skipped
**Battery life:** 40-50 days possible!

---

### 3. Solar Panel Addition

With 10-minute intervals, a tiny solar panel becomes viable:

```
Average consumption: 1.11 mAh/hour = 1.11mA average
Tiny 50mA @ 3.7V solar panel in moderate light: 25mA average
Net surplus: 25 - 1.11 = ~24mA charging

Result: INFINITE battery life in lit rooms!
```

**Shopping:**
- 3.7V 50-100mA solar panel: $3-5
- Add to TP4056 charger (has solar input)
- Place near window or under room light

---

## 📱 Real-World Scenarios

### Scenario 1: Bedroom Monitoring
```
Requirement: Track temperature, humidity, light for sleep quality
Update rate: 10 minutes is perfect
Battery: 400mAh LiPo
Expected life: 12 days (BME680 setup)
Maintenance: Charge monthly
```

### Scenario 2: Office Air Quality
```
Requirement: Monitor CO2, VOC, temperature
Update rate: 10 minutes acceptable
Battery: 1000mAh LiPo
Expected life: 30 days
Bonus: Small solar panel → infinite
```

### Scenario 3: Remote Storage Room
```
Requirement: Temperature/humidity logging
Update rate: 10 minutes more than enough
Battery: 2000mAh LiPo
Expected life: 60+ days (2 months!)
Maintenance: Charge quarterly
```

---

## ✅ Summary: 10-Minute Intervals

| Metric | MICS5524 | BME680 | BME680 + Conditional |
|--------|----------|--------|---------------------|
| **Battery Life** | 6.4 days | 12 days | **24 days** |
| **Average Current** | 2.08 mA | 1.11 mA | **0.55 mA** |
| **Daily Power** | 50 mAh | 26.6 mAh | **13.3 mAh** |
| **vs 60s intervals** | 8× better | 6× better | **24× better!** |
| **Updates/day** | 144 | 144 | ~72 actual TX |
| **Suitable for** | Most rooms | All rooms | Critical battery |

---

## 🎯 Final Recommendation

**For 10-minute intervals, use:**

```
✅ ESP32-DevKitC (any)
✅ BME680 sensor (replaces MICS5524 + AHT25)
✅ VEML7700 light sensor
✅ 400mAh LiPo battery
✅ MCP1700 3.3V regulator
✅ TP4056 charger
✅ 600-second sleep interval
✅ Conditional transmission enabled

Expected result: 12-24 DAYS battery life
Cost: ~$45
Perfect for: Bedrooms, offices, living spaces
```

**For maximum battery (1 month+):**
- Use 1000mAh battery (+$10)
- Add solar panel (+$5)
- Expected: 30-90 days or infinite with light

---

**Conclusion:** 10-minute intervals give you **6-24 days** of battery life depending on sensors, which is a **6-24× improvement** over 60-second intervals. This is ideal for most home monitoring scenarios where real-time updates aren't critical.

---

**Last Updated:** November 2025
**Configuration:** 10-minute (600-second) sleep intervals
