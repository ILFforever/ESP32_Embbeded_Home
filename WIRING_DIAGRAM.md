# Wiring Diagram - ESP32-S3 Main Mesh Hub

Complete wiring guide for connecting sensors and Main LCD to the ESP32-S3 Main Mesh hub.

## 📋 Component Overview

| Component | Quantity | Purpose |
|-----------|----------|---------|
| ESP32-S3-DevKit-C-1-N16R8V | 1 | Main mesh hub controller |
| PMS5003 | 1 | Particulate matter (air quality) sensor |
| DHT11 | 1 | Temperature and humidity sensor |
| Main LCD ESP32 | 1 | Display and backend gateway (UART connection) |
| 10kΩ Resistor | 1 | Pull-up resistor for DHT11 |
| Breadboard | 1 | For prototyping connections |
| Jumper Wires | ~15 | Various connections |
| 5V Power Supply | 1 | For PMS5003 (1A minimum) |

---

## 🔌 Complete Wiring Schematic

### DHT11 Temperature/Humidity Sensor

```
DHT11                    ESP32-S3
┌────────┐              ┌─────────┐
│        │              │         │
│  VCC ──┼──────────────┼── 3.3V  │
│        │              │         │
│  DATA ─┼──────────────┼── GPIO4 │
│    │   │    10kΩ      │    ▲    │
│    └───┼────/\/\/─────┼────┘    │
│        │    (pull-up) │         │
│  GND ──┼──────────────┼── GND   │
│        │              │         │
└────────┘              └─────────┘

Note: 10kΩ pull-up resistor between DATA and VCC
```

**Pin Connections:**
| DHT11 Pin | Wire Color (suggested) | ESP32-S3 Pin |
|-----------|------------------------|--------------|
| VCC | Red | 3.3V |
| DATA | Yellow | GPIO4 |
| GND | Black | GND |

**Important Notes:**
- DHT11 operates on 3.3V (NOT 5V for ESP32-S3)
- 10kΩ pull-up resistor is REQUIRED between DATA and VCC
- Some DHT11 modules have built-in pull-up resistor
- Keep wire length under 20cm for reliable readings

---

### PMS5003 Particulate Matter Sensor

```
PMS5003 (8-pin)          ESP32-S3
┌────────────┐          ┌─────────┐
│ Pin Layout │          │         │
│ 1. VCC  ───┼──────────┼── 5V    │ (External 5V supply recommended)
│ 2. GND  ───┼──────────┼── GND   │
│ 3. SET     │          │         │ (Not used - leave floating)
│ 4. TX   ───┼──────────┼── GPIO16│ (RX1 - Hardware Serial 1)
│ 5. RX   ───┼──────────┼── GPIO17│ (TX1 - Hardware Serial 1)
│ 6. RESET   │          │         │ (Not used - leave floating)
│ 7. NC      │          │         │ (Not connected)
│ 8. NC      │          │         │ (Not connected)
└────────────┘          └─────────┘

Note: PMS5003 TX → ESP32-S3 RX (GPIO16)
      PMS5003 RX → ESP32-S3 TX (GPIO17)
```

**Pin Connections:**
| PMS5003 Pin | Function | Wire Color (suggested) | ESP32-S3 Pin |
|-------------|----------|------------------------|--------------|
| 1 - VCC | Power 5V | Red | 5V (external supply) |
| 2 - GND | Ground | Black | GND |
| 3 - SET | Sleep mode | - | Not connected |
| 4 - TX | Serial transmit | Green | GPIO16 (RX1) |
| 5 - RX | Serial receive | Blue | GPIO17 (TX1) |
| 6 - RESET | Reset | - | Not connected |
| 7 - NC | Not connected | - | - |
| 8 - NC | Not connected | - | - |

**Power Requirements:**
| Parameter | Specification |
|-----------|---------------|
| Operating Voltage | 5V DC |
| Current (standby) | < 100mA |
| Current (active) | ~100-200mA |
| Peak Current | ~300mA |

**Important Notes:**
- PMS5003 requires 5V power (NOT 3.3V)
- Use external 5V supply if USB power is insufficient
- ESP32-S3 GPIOs are 3.3V but are 5V tolerant for this sensor
- Baud rate: 9600 bps (configured in code)
- Allow 30 seconds warmup time after power-on
- Keep wire length under 30cm for UART reliability

**PMS5003 Connector:**
```
Front view of PMS5003 connector (8-pin, 1.27mm pitch):
┌──┬──┬──┬──┬──┬──┬──┬──┐
│1 │2 │3 │4 │5 │6 │7 │8 │
└──┴──┴──┴──┴──┴──┴──┴──┘
```

---

### Main LCD UART Connection

```
Main Mesh Hub            Main LCD ESP32
(ESP32-S3)              (ESP32)
┌─────────┐             ┌─────────┐
│         │             │         │
│ GPIO19 ─┼─────────────┼─ RX     │ (TX from Main Mesh → RX on Main LCD)
│   (TX2) │             │         │
│         │             │         │
│ GPIO18 ─┼─────────────┼─ TX     │ (RX from Main Mesh ← TX from Main LCD)
│   (RX2) │             │         │
│         │             │         │
│  GND ───┼─────────────┼─ GND    │ (Common ground)
│         │             │         │
└─────────┘             └─────────┘

Note: TX → RX crossover, common ground required
```

**Pin Connections:**
| Main Mesh (ESP32-S3) | Wire Color (suggested) | Main LCD (ESP32) |
|----------------------|------------------------|------------------|
| GPIO19 (TX2) | Orange | RX pin |
| GPIO18 (RX2) | Yellow | TX pin |
| GND | Black | GND |

**Communication Settings:**
| Parameter | Value |
|-----------|-------|
| Baud Rate | 115200 |
| Data Bits | 8 |
| Parity | None |
| Stop Bits | 1 |
| Protocol | UART (Hardware Serial 2) |

**Important Notes:**
- TX on Main Mesh connects to RX on Main LCD (crossover)
- RX on Main Mesh connects to TX on Main LCD (crossover)
- Common ground is essential for UART communication
- Do NOT connect VCC between devices (power separately)
- Maximum reliable distance: ~1 meter without level shifters

---

### Status LED

```
ESP32-S3
┌─────────┐
│         │
│ GPIO48 ─┼─── Built-in RGB LED
│         │
└─────────┘

Note: GPIO48 is the built-in addressable RGB LED on ESP32-S3-DevKit
```

**LED Behavior:**
| Pattern | Meaning |
|---------|---------|
| 3 quick blinks | System startup complete |
| 1 blink | Data sent to Main LCD |
| Solid on | Error or stuck |

---

## 🔋 Power Supply Recommendations

### Option 1: USB Power Only (Simple Setup)
```
                ┌────────────────────┐
USB 5V ─────────┤ ESP32-S3 DevKit    │
                │                    │
                │ 3.3V ──→ DHT11     │
                │                    │
                │ 5V ────→ PMS5003   │ ⚠️ May be unstable under load
                │                    │
                └────────────────────┘
```
**Limitations:**
- USB provides max ~500mA
- PMS5003 can draw 300mA peak
- May cause brownouts or resets

### Option 2: External 5V Supply (Recommended)
```
External 5V ────┬─────→ PMS5003 VCC
(1A minimum)    │
                ├─────→ ESP32-S3 VIN (or USB)
                │
                └─────→ Common GND
```
**Advantages:**
- Stable power for PMS5003
- No brownout risk
- Better sensor accuracy

### Option 3: Separate Power Rails (Best)
```
5V Supply A ────────→ PMS5003 VCC
(500mA min)         │
                    └──→ Common GND ←──┐
                                       │
USB or 5V Supply B ─→ ESP32-S3 VIN ───┤
                      │                │
                      └──→ DHT11 3.3V  │
                                       │
                          Common GND ──┘
```
**Advantages:**
- Isolated power for sensor
- Eliminates noise
- Most reliable

---

## 📏 Physical Layout Recommendations

### Breadboard Layout Example
```
                    ESP32-S3 DevKit
                    ┌─────────────┐
                    │             │
                    │   [USB]     │
                    │             │
         GPIO4 ◄────┤ 4          48├────► LED (built-in)
         GPIO16 ◄───┤16          17├────► GPIO17
         GPIO18 ◄───┤18          19├────► GPIO19
                    │             │
        3.3V ◄──────┤3V3        5V├────► 5V
        GND ◄───────┤GND       GND├────► GND
                    │             │
                    └─────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
    ┌───▼────┐        ┌────▼─────┐      ┌────▼────────┐
    │ DHT11  │        │ PMS5003  │      │  Main LCD   │
    │        │        │          │      │  (UART)     │
    │ GPIO4  │        │ GPIO16/17│      │ GPIO18/19   │
    └────────┘        └──────────┘      └─────────────┘
```

### Wire Length Guidelines
| Connection | Max Recommended Length | Notes |
|------------|------------------------|-------|
| DHT11 DATA | 20cm | Digital signal, sensitive to interference |
| PMS5003 UART | 30cm | UART communication, keep short |
| Main LCD UART | 100cm | Can use twisted pair for longer distances |
| Power wires | Keep as short as possible | Minimizes voltage drop |

---

## 🧪 Testing Procedure

### Step 1: Power Test
```
1. Connect ONLY power (VCC, GND) to each component
2. Check voltages with multimeter:
   - DHT11: Should read 3.3V ±0.1V
   - PMS5003: Should read 5.0V ±0.2V
3. If voltages incorrect, STOP and fix before continuing
```

### Step 2: Individual Sensor Test
```
1. Connect DHT11 only → Upload code → Verify temperature readings
2. Disconnect DHT11
3. Connect PMS5003 only → Upload code → Verify PM readings
4. If both work individually, connect both together
```

### Step 3: UART Communication Test
```
1. Upload code to Main Mesh
2. Open serial monitor on Main Mesh (115200 baud)
3. Verify sensor readings displayed
4. Connect UART to Main LCD
5. Check Main LCD receives data (check its serial monitor)
```

### Step 4: Mesh Network Test
```
1. Power on Main Mesh hub
2. Check serial output shows: "Mesh initialized"
3. Note the Node ID
4. Power on a mesh sensor node
5. Wait 10-30 seconds for connection
6. Verify "New connection: Node XXXXXX" message
7. Check mesh_sensors array in UART output
```

---

## ⚠️ Common Wiring Mistakes

| Mistake | Symptom | Solution |
|---------|---------|----------|
| **TX connected to TX** | No UART data | Swap TX/RX (TX→RX crossover) |
| **Missing common ground** | Garbled UART data | Connect all GND pins together |
| **DHT11 no pull-up resistor** | DHT read errors | Add 10kΩ resistor DATA to VCC |
| **PMS5003 on 3.3V** | Sensor won't start | Use 5V power supply |
| **Wrong GPIO pins** | No sensor data | Verify pin numbers match code |
| **Reversed PMS5003 TX/RX** | Timeout errors | PMS TX → GPIO16, PMS RX → GPIO17 |
| **No external power for PMS** | Random resets | Use external 5V supply |
| **Long wire lengths** | Intermittent errors | Keep wires under recommended lengths |

---

## 🔍 Debugging with Multimeter

### Voltage Check Points
```
Point              Expected Voltage    Tolerance
─────────────────────────────────────────────────
ESP32-S3 3.3V     3.3V                ±0.1V
ESP32-S3 5V       5.0V                ±0.2V
DHT11 VCC         3.3V                ±0.1V
DHT11 DATA        3.3V (idle)         ±0.5V
PMS5003 VCC       5.0V                ±0.2V
GPIO4 (input)     Varies              0-3.3V
GPIO16/17         Varies              0-3.3V
GPIO18/19         Varies              0-3.3V
```

### Continuity Tests
```
Test: ESP32-S3 GND ↔ DHT11 GND        Should beep
Test: ESP32-S3 GND ↔ PMS5003 GND      Should beep
Test: ESP32-S3 GND ↔ Main LCD GND     Should beep
Test: GPIO4 ↔ DHT11 DATA              Should beep
Test: GPIO16 ↔ PMS5003 TX             Should beep
Test: GPIO17 ↔ PMS5003 RX             Should beep
```

---

## 📊 Signal Monitoring (Oscilloscope/Logic Analyzer)

### UART Signals (PMS5003)
```
Channel 1: GPIO16 (PMS TX → ESP RX)
Expected: 9600 baud, 8N1, 3.3V logic levels
Pattern: Periodic data bursts every 10 seconds

Channel 2: GPIO17 (ESP TX → PMS RX)
Expected: Short command bursts (wake/sleep/request)
```

### UART Signals (Main LCD)
```
Channel 1: GPIO19 (ESP TX → LCD RX)
Expected: 115200 baud, 8N1, 3.3V logic levels
Pattern: JSON data every 15 seconds (~2KB)

Channel 2: GPIO18 (LCD TX → ESP RX)
Expected: Mostly idle (no return data expected)
```

### DHT11 Signal
```
Channel 1: GPIO4 (DHT DATA)
Expected: Complex timing pattern (see DHT11 datasheet)
Duration: ~20ms per reading
Frequency: Every 5 seconds
```

---

## 📚 Reference Documents

- [ESP32-S3 DevKit Pinout](https://docs.espressif.com/projects/esp-idf/en/latest/esp32s3/hw-reference/esp32s3/user-guide-devkitc-1.html)
- [PMS5003 Datasheet](https://www.aqmd.gov/docs/default-source/aq-spec/resources-page/plantower-pms5003-manual_v2-3.pdf)
- [DHT11 Datasheet](https://www.mouser.com/datasheet/2/758/DHT11-Technical-Data-Sheet-Translated-Version-1143054.pdf)
- [ESP32 UART Documentation](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/peripherals/uart.html)

---

## 🛠️ Tools Needed

- Multimeter (voltage and continuity testing)
- Wire strippers
- Soldering iron (for permanent connections)
- Heat shrink tubing (for insulation)
- Logic analyzer (optional, for debugging)
- Oscilloscope (optional, for signal analysis)

---

## ✅ Pre-Flight Checklist

Before powering on:
- [ ] All VCC connections verified (3.3V for DHT11, 5V for PMS5003)
- [ ] All GND connections connected to common ground
- [ ] TX/RX crossover verified (TX→RX, RX→TX)
- [ ] 10kΩ pull-up resistor on DHT11 DATA line
- [ ] No short circuits (check with multimeter)
- [ ] Power supply adequate (1A minimum for 5V rail)
- [ ] USB cable connected securely
- [ ] Code uploaded to ESP32-S3
- [ ] Serial monitor ready (115200 baud)

---

**Last Updated**: November 2025
**Revision**: 1.0
