# MICS-5524 Gas Sensor Calibration Guide

## Overview

The MICS-5524 CO gas sensor requires a **one-time calibration in clean air** to establish a baseline (R0) before it can accurately measure CO concentrations. This prevents false readings if the sensor starts up during a fire or in contaminated air.

## Two-Step Process

### Step 1: Calibration (One-time, 20 minutes)

**Purpose:** Establish R0 baseline in clean air and store it in RTC memory.

**Requirements:**
- Clean air environment (well-ventilated room, no gas sources)
- 20 minutes of uninterrupted operation
- ESP32 powered and connected

**Instructions:**

1. **Ensure clean air environment:**
   - No cooking, smoking, or gas sources nearby
   - Well-ventilated room
   - Normal ambient air quality

2. **Upload calibration firmware:**
   ```bash
   pio run -e calibrate -t upload
   pio device monitor
   ```

3. **Wait 20 minutes:**
   - Sensor will heat continuously
   - LED will pulse (breathing effect) during warmup
   - Monitor serial output for progress
   - Takes samples every 5 seconds

4. **Verify calibration:**
   - After 20 minutes, R0 value is calculated and stored
   - Check serial output for stability percentage
   - LED will blink rapidly 10 times when complete
   - **EXCELLENT:** <5% variance
   - **GOOD:** <10% variance
   - **FAIR:** <20% variance (consider recalibrating)
   - **POOR:** >20% variance (air not clean, recalibrate!)

5. **R0 is now stored in RTC memory** - survives deep sleep and resets

### Step 2: Normal Operation

**Purpose:** Use stored R0 for accurate CO measurements.

**Instructions:**

1. **Upload main firmware:**
   ```bash
   pio run -e esp32-room-sensor -t upload
   pio device monitor
   ```

2. **Verify calibration loaded:**
   - Serial output should show: `[MICS5524] ✓ Using calibrated R0: XXXX`
   - If not calibrated, you'll see a warning message

3. **Normal operation:**
   - Sensor heats for 20 seconds before each reading
   - Uses stored R0 to calculate CO PPM
   - PPM = (0.425 - RS/R0) / 0.000405
   - Range: 0-1000 PPM

## How It Works

### Calibration Script (calibrate_mics.cpp)

1. **20-minute warmup:** Heats sensor continuously to reach stable operating temperature
2. **Continuous sampling:** Takes ADC readings every 5 seconds
3. **Final averaging:** Last 50 samples averaged for R0 calculation
4. **R0 calculation:** `R0 = 4095 - avgADC` (inverted ADC value)
5. **Storage:** Stores R0 and calibration flag in RTC_DATA_ATTR memory

### Main Code (main_hybrid.cpp)

1. **Checks calibration flag** on startup
2. **Loads stored R0** from RTC memory
3. **For each reading:**
   - Heats sensor for 20 seconds
   - Reads ADC value
   - Inverts: `invertedADC = 4095 - ADC`
   - Calculates ratio: `RS/R0 = invertedADC / R0`
   - Applies formula: `PPM = (0.425 - RS/R0) / 0.000405`
   - Clamps to 0-1000 PPM range

## RTC Memory Persistence

**RTC_DATA_ATTR variables:**
```cpp
RTC_DATA_ATTR bool micsCalibrated = false;
RTC_DATA_ATTR int16_t mics_r0 = 2048;
```

**Survives:**
- Deep sleep cycles ✓
- Software resets ✓
- ESP32 restart command ✓

**Does NOT survive:**
- Power cycle (unplug/replug) ✗
- Hard reset button ✗

**To recalibrate:** Power cycle the ESP32 and run calibration script again.

## Why This Approach?

### Problem: Auto-calibration on startup
- If ESP32 starts during a fire, it would calibrate to contaminated air
- R0 would be wrong, making all subsequent readings inaccurate
- Could show 0 PPM during an actual fire

### Solution: One-time clean air calibration
- ✓ Calibrate once in known clean air
- ✓ Store R0 in persistent memory
- ✓ Always use stored baseline
- ✓ Sensor works correctly even if started during fire
- ✓ Short 20s heat time for each reading (saves battery)

## Troubleshooting

### "SENSOR NOT CALIBRATED" warning
- You haven't run calibration script yet
- Or you power cycled after calibration
- **Solution:** Run `pio run -e calibrate -t upload`

### High variance during calibration
- Air quality may not be clean
- Sensor still warming up
- **Solution:** Ensure clean air and run full 20 minutes

### Unexpected readings
- Check R0 value in serial output
- Typical R0: 1800-2500 (depends on sensor)
- Recalibrate if R0 seems wrong

## Serial Output Examples

### Calibration Mode:
```
========================================
  MICS-5524 CALIBRATION SCRIPT
========================================
Time(s) | ADC  | Inverted | Status
--------|------|----------|--------
      5 | 2034 |     2061 | Warming up...
    ...
   1195 | 2010 |     2085 | Final phase (5s left)
========================================
  CALIBRATION COMPLETE!
========================================
R0 (Baseline): 2078
Stability: 3.2% variance
✓ EXCELLENT - Sensor is very stable
```

### Main Mode (Calibrated):
```
[MICS5524] ✓ Using calibrated R0: 2078
[MICS5524] Heating sensor...
[MICS5524] ✓ ADC: 2012 (R0: 2078), CO: 0.0 PPM
```

### Main Mode (Not Calibrated):
```
========================================
[MICS5524] ✗ SENSOR NOT CALIBRATED!
========================================
Please run calibrate_mics.cpp first
[MICS5524] Using default R0: 2048 (INACCURATE!)
```

## DFRobot CO Formula

From DFRobot_MICS library (lines 208-217):

```cpp
float getCarbonMonoxide(float RS_R0)
{
  if (RS_R0 > 0.425)
    return 0.0;  // Below detection threshold

  float co = (0.425 - RS_R0) / 0.000405;

  if (co > 1000.0) return 1000.0;  // Max reading
  if (co < 1.0) return 0.0;        // Below 1 PPM = 0

  return co;
}
```

**Detection range:** 1-1000 PPM
**Detection threshold:** RS/R0 < 0.425
