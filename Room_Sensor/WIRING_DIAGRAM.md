# Room Sensor Wiring Diagram

Complete hardware wiring guide for battery-optimized ESP32 room sensor with VEML7700, MICS5524, and AHT25 sensors.

---

## 🔌 Component List

### Required Components

| Component | Quantity | Description | Approximate Cost |
|-----------|----------|-------------|------------------|
| **ESP32-DevKitC** | 1 | Main microcontroller | $5-10 |
| **VEML7700** | 1 | Ambient light sensor (I2C) | $5-8 |
| **MICS5524** | 1 | Gas sensor (CO, alcohol, acetone) | $5-7 |
| **AHT25** | 1 | Temperature & humidity sensor (I2C) | $3-5 |
| **400mAh LiPo Battery** | 1 | 3.7V rechargeable | $5-8 |
| **TP4056 Charger Module** | 1 | LiPo charging circuit | $1-2 |
| **Voltage Divider Resistors** | 2 | 100kΩ (for battery monitoring) | $0.50 |
| **Status LED** | 1 | 3mm or 5mm LED (optional) | $0.20 |
| **220Ω Resistor** | 1 | For status LED | $0.10 |
| **Breadboard/PCB** | 1 | For prototyping | $2-5 |
| **Jumper Wires** | ~20 | Male-to-male, male-to-female | $2-3 |

**Total Cost: ~$30-50**

---

## 📐 Pin Configuration

### ESP32 Pin Assignments

```
ESP32-DevKitC
┌─────────────────────────────────────┐
│                                     │
│  EN                          GPIO23 │
│  GPIO36                      GPIO22 │◄── I2C SCL (VEML7700, AHT25)
│  GPIO39                      GPIO1  │
│  GPIO34 ◄── MICS5524 Analog  GPIO3  │
│  GPIO35 ◄── Battery Monitor  GPIO21 │◄── I2C SDA (VEML7700, AHT25)
│  GPIO32                      GPIO19 │
│  GPIO33                      GPIO18 │
│  GPIO25 ──► MICS5524 Heater  GPIO5  │
│  GPIO26                      GPIO17 │
│  GPIO27                      GPIO16 │
│  GPIO14                      GPIO4  │
│  GPIO12                      GPIO0  │
│  GPIO13                      GPIO2  │◄─► Status LED
│  GND                         GPIO15 │
│  VIN (5V)                    GND    │
│  3V3                         3V3    │
│                                     │
└─────────────────────────────────────┘
```

### Pin Mapping Table

| Function | ESP32 Pin | Connection | Notes |
|----------|-----------|------------|-------|
| **I2C SDA** | GPIO 21 | VEML7700 SDA, AHT25 SDA | Connect both sensors to same SDA |
| **I2C SCL** | GPIO 22 | VEML7700 SCL, AHT25 SCL | Connect both sensors to same SCL |
| **Gas Sensor Analog** | GPIO 34 | MICS5524 VOUT | ADC1_CH6 (analog input only) |
| **Gas Heater Control** | GPIO 25 | MICS5524 Heater via MOSFET | Digital output to control heater |
| **Battery Monitor** | GPIO 35 | Voltage divider midpoint | ADC1_CH7 (analog input only) |
| **Status LED** | GPIO 2 | LED anode via 220Ω resistor | Built-in LED on most ESP32 boards |
| **Power (3.3V)** | 3V3 | Sensor VCC pins | Power for I2C sensors |
| **Ground** | GND | All component grounds | Common ground |

---

## 🔧 Detailed Wiring Instructions

### 1. VEML7700 Ambient Light Sensor (I2C)

```
VEML7700 Breakout Board
┌──────────────┐
│   VEML7700   │
│              │
│  VIN  ●──────┼──── ESP32 3V3
│  GND  ●──────┼──── ESP32 GND
│  SCL  ●──────┼──── ESP32 GPIO22 (I2C SCL)
│  SDA  ●──────┼──── ESP32 GPIO21 (I2C SDA)
│              │
└──────────────┘
```

**Notes:**
- VEML7700 supports 3.3V operation
- I2C address: 0x10 (default)
- Very low power: ~300µA active, 5µA standby
- No external pull-up resistors needed (internal pull-ups on ESP32)

---

### 2. AHT25 Temperature & Humidity Sensor (I2C)

```
AHT25 Sensor
┌──────────────┐
│    AHT25     │
│              │
│  VDD  ●──────┼──── ESP32 3V3
│  GND  ●──────┼──── ESP32 GND
│  SCL  ●──────┼──── ESP32 GPIO22 (I2C SCL)
│  SDA  ●──────┼──── ESP32 GPIO21 (I2C SDA)
│              │
└──────────────┘
```

**Notes:**
- AHT25 operates at 3.3V
- I2C address: 0x38 (default)
- Power consumption: 200µA idle, 550µA measuring
- Share I2C bus with VEML7700

**I2C Bus Wiring (Both Sensors):**
```
ESP32 GPIO21 (SDA) ────┬──── VEML7700 SDA
                       │
                       └──── AHT25 SDA

ESP32 GPIO22 (SCL) ────┬──── VEML7700 SCL
                       │
                       └──── AHT25 SCL
```

---

### 3. MICS5524 Gas Sensor (Analog + Heater Control)

The MICS5524 requires two connections:
1. **Analog output** - Read gas concentration
2. **Heater control** - Power management for the heating element

#### Option A: Direct Connection (Not Recommended - High Power)

```
MICS5524 Sensor
┌────────────────┐
│   MICS5524     │
│                │
│  VCC  ●────────┼──── ESP32 5V (from USB or battery boost)
│  GND  ●────────┼──── ESP32 GND
│  VOUT ●────────┼──── ESP32 GPIO34 (Analog read)
│                │
└────────────────┘
```

#### Option B: MOSFET-Controlled Heater (Recommended for Battery)

This allows software control of heater power to save battery.

```
MICS5524 with MOSFET Heater Control
═══════════════════════════════════════════════════════════

ESP32 GPIO25 ───── 10kΩ ─────┬──── MOSFET Gate (2N7000 or similar)
                              │
                              ├──── 10kΩ Pull-down to GND

MOSFET Source ────────────────┴──── GND

MOSFET Drain ─────────────────┬──── MICS5524 Heater -

ESP32 5V ─────────────────────┴──── MICS5524 Heater +

MICS5524 VOUT ────────────────────── ESP32 GPIO34 (Analog)

MICS5524 GND ─────────────────────── ESP32 GND
```

**Component Details:**
- **MOSFET:** N-channel (2N7000, BS170, or similar)
- **Pull-down resistor:** 10kΩ (prevents floating gate)
- **Gate resistor:** 10kΩ (current limiting)

**Wiring Steps:**
1. Connect MOSFET source to ESP32 GND
2. Connect MOSFET drain to MICS5524 heater negative (-)
3. Connect ESP32 GPIO25 → 10kΩ resistor → MOSFET gate
4. Connect MOSFET gate → 10kΩ resistor → GND (pull-down)
5. Connect MICS5524 heater positive (+) → ESP32 5V or VIN
6. Connect MICS5524 VOUT → ESP32 GPIO34
7. Connect MICS5524 GND → ESP32 GND

**Power Requirements:**
- Heater: 20-40mA @ 5V when active
- Logic: ~1mA
- GPIO25 HIGH = Heater ON
- GPIO25 LOW = Heater OFF (saves 30mA!)

---

### 4. Battery System (LiPo + Charger + Monitoring)

#### Battery Charger Module (TP4056)

```
TP4056 LiPo Charger Module
═══════════════════════════════════════

USB Mini/Micro ──► [TP4056 Module]
                         │
                         ├── BAT+ ──► 400mAh LiPo Battery (+)
                         ├── BAT- ──► 400mAh LiPo Battery (-)
                         │
                         ├── OUT+ ──► ESP32 VIN or 5V
                         └── OUT- ──► ESP32 GND
```

**TP4056 Module Features:**
- Input: 5V USB (for charging)
- Output: 3.7-4.2V (LiPo voltage)
- Charging current: 1A (adjustable via resistor)
- Protection: Over-charge, over-discharge, short-circuit
- LED indicators: Charging (red), Fully charged (blue/green)

#### Battery Voltage Monitoring Circuit

To measure battery voltage, we need a voltage divider since ESP32 ADC max is 3.3V, but LiPo can be up to 4.2V.

```
Battery Voltage Divider
═══════════════════════════════════════════

Battery+ (3.0-4.2V)
    │
    ├──── 100kΩ Resistor ────┬──── ESP32 GPIO35 (ADC)
    │                        │
    │                    100kΩ Resistor
    │                        │
    └────────────────────────┴──── GND

Voltage at GPIO35 = Battery Voltage ÷ 2
Example: 4.2V battery → 2.1V at GPIO35 ✓ Safe for ESP32
```

**Resistor Selection:**
- Use 1% tolerance resistors for accuracy
- 100kΩ values minimize current draw (≈20µA)
- Can also use 47kΩ + 47kΩ or 220kΩ + 220kΩ

**Calculation:**
```
ADC Reading = Battery Voltage × (R2 / (R1 + R2))
Battery Voltage = ADC Reading × ((R1 + R2) / R2)

With R1 = R2 = 100kΩ:
Battery Voltage = ADC Reading × 2
```

---

### 5. Status LED (Optional)

```
Status LED Circuit
═══════════════════

ESP32 GPIO2 ────┬──── 220Ω Resistor ──── LED Anode (+)
                │
                └──────────────────────── LED Cathode (-) to GND
```

**Notes:**
- Most ESP32 boards have a built-in LED on GPIO2
- External LED is optional
- LED blinks indicate:
  - 2 quick blinks = Successful transmission
  - 5 fast blinks = Transmission failed
  - 10 slow blinks = Critical battery warning

---

## 🔋 Complete System Wiring Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Battery-Optimized Room Sensor                        │
│                              Complete Wiring                             │
└─────────────────────────────────────────────────────────────────────────┘

    USB Power                 ┌──────────────┐
       (5V)                   │   TP4056     │
        │                     │   Charger    │
        ├─────────────────────┤ IN+ │  BAT+  ├────┐
        │                     │     │        │    │
        │                     │ IN- │  BAT-  ├──┐ │
        │                     │     │        │  │ │   ┌─────────────┐
        │                     │OUT+ │        │  │ └───┤ 400mAh LiPo │
        │                     │OUT- │        │  │     │   Battery   │
        │                     └──┬──┴────────┘  └─────┤   3.7V      │
        │                        │                     └─────────────┘
        │                        │
        │        ┌───────────────┴───────────────┐
        │        │         ESP32-DevKitC          │
        │        │                                │
        └────────┤ VIN                            │
                 │ GND ───────────────────────────┼──── Common Ground
                 │                                │          │
                 │ 3V3 ────┬───────┬──────┬──────┤          │
                 │         │       │      │      │          │
                 │     ┌───┴───┐ ┌─┴────┐ │      │          │
                 │     │VEML   │ │ AHT25│ │      │          │
                 │     │7700   │ │      │ │      │          │
                 │     │       │ │      │ │   ┌──┴──────┐   │
                 │     │ VIN●  │ │ VDD● │ │   │MICS5524 │   │
                 │     │ GND●──┼─┼─GND●─┼─┼───┤ GND     │   │
                 │     │ SDA●  │ │ SDA● │ │   │         │   │
                 │     │ SCL●  │ │ SCL● │ │   │ VOUT    │   │
                 │     └──┬┴───┘ └──┬┴──┘ │   │         │   │
                 │        │         │     │   │ H+ ●────┼───┼──5V
                 │        │         │     │   │ H- ●    │   │
                 │        │         │     │   └────┬────┘   │
                 │        │         │     │        │        │
Battery+ ────┐   │ GPIO35 ●         │     │        │        │
             │   │ GPIO34 ●─────────┼─────┼────────┘        │
         100kΩ   │                  │     │                 │
             │   │ GPIO25 ●─────────┼─────┼───[MOSFET]      │
             ├───┤ GPIO22 ●─────────┼─────┘   Drain         │
         100kΩ   │                  │             │         │
             │   │ GPIO21 ●─────────┴─────────────┼─────────┘
             │   │                                 │
             └───┤ GND ───────────────────────────┴─── Common Ground
                 │
                 │ GPIO2 ●──── 220Ω ──── LED ──── GND
                 │
                 └────────────────────────────────┘

Legend:
───  Wire connection
●    Connection point
┬┴   Junction/Split
├┤   T-junction
```

---

## 📊 Power Distribution Summary

| Component | Voltage | Current (Active) | Current (Sleep) |
|-----------|---------|------------------|-----------------|
| **ESP32** | 3.3V | 80-160mA (WiFi) | 0.01-0.05mA (deep sleep) |
| **VEML7700** | 3.3V | 0.3mA | 0.005mA |
| **AHT25** | 3.3V | 0.55mA | 0.2mA |
| **MICS5524** | 5V | 30mA (heater ON) | <0.1mA (heater OFF) |
| **LED** | 3.3V | 10-20mA | 0mA (off) |
| **Total** | - | **111-210mA** | **0.2-0.3mA** |

**Battery Life Calculation:**
```
Active phase (3s): ~150mA average
Sleep phase (57s): ~0.05mA average

Per cycle (60s): 0.125 mAh + 0.0008 mAh = 0.126 mAh
Per hour: 7.56 mAh
Battery life (400mAh × 0.8): 320 ÷ 7.56 = 42.3 hours
```

---

## 🛠️ Assembly Instructions

### Step 1: Prepare Components
1. Lay out all components on breadboard or PCB
2. Test each sensor individually before integration
3. Ensure proper polarity for battery and LEDs

### Step 2: Power System (First!)
1. Connect TP4056 module to LiPo battery
2. **DO NOT connect to ESP32 yet**
3. Charge battery fully (blue/green LED on TP4056)
4. Test battery voltage with multimeter (should be 4.1-4.2V)

### Step 3: Voltage Divider for Battery Monitoring
1. Solder two 100kΩ resistors in series
2. Connect one end to Battery+
3. Connect middle junction to ESP32 GPIO35
4. Connect other end to GND

### Step 4: I2C Sensors (VEML7700 + AHT25)
1. Connect both sensors' VCC/VDD to ESP32 3V3
2. Connect both sensors' GND to common ground
3. Connect both sensors' SDA to ESP32 GPIO21
4. Connect both sensors' SCL to ESP32 GPIO22
5. No pull-up resistors needed (ESP32 has internal pull-ups)

### Step 5: MICS5524 Gas Sensor
1. Build MOSFET heater control circuit:
   - Connect MOSFET source to GND
   - Connect 10kΩ from ESP32 GPIO25 to MOSFET gate
   - Connect 10kΩ from MOSFET gate to GND (pull-down)
   - Connect MOSFET drain to MICS5524 heater (-)
2. Connect MICS5524 heater (+) to 5V
3. Connect MICS5524 VOUT to ESP32 GPIO34
4. Connect MICS5524 GND to common ground

### Step 6: Status LED (Optional)
1. Connect 220Ω resistor to ESP32 GPIO2
2. Connect resistor to LED anode (+)
3. Connect LED cathode (-) to GND

### Step 7: Final Power Connection
1. Connect TP4056 OUT+ to ESP32 VIN
2. Connect TP4056 OUT- to ESP32 GND
3. Verify all grounds are connected together

### Step 8: Testing
1. Power on the system
2. Monitor Serial output at 115200 baud
3. Verify all sensors initialize correctly
4. Test battery voltage reading
5. Test gas sensor heater control (should turn on/off)

---

## 🧪 Testing & Troubleshooting

### Sensor Testing

#### VEML7700 Test
```cpp
// Should read 0-100,000 lux
float lux = veml.readLux();
Serial.printf("Light: %.2f lux\n", lux);
```
**Troubleshooting:**
- No reading → Check I2C wiring (SDA/SCL)
- Always 0 → Sensor may be covered
- Wrong I2C address → Run I2C scanner

#### AHT25 Test
```cpp
// Should read 0-100% humidity, -40 to 85°C
sensors_event_t humidity, temp;
aht.getEvent(&humidity, &temp);
Serial.printf("Temp: %.2f°C, Humidity: %.2f%%\n",
              temp.temperature, humidity.relative_humidity);
```
**Troubleshooting:**
- No response → Check I2C wiring
- NaN values → Sensor not initialized
- Incorrect readings → Check 3.3V power

#### MICS5524 Test
```cpp
// Should read 0-4095 (12-bit ADC)
uint16_t gas = analogRead(34);
Serial.printf("Gas ADC: %d\n", gas);
```
**Troubleshooting:**
- Always 0 → Check VOUT connection
- No change when heating → Heater not working, check MOSFET
- Erratic readings → Add 0.1µF capacitor across VOUT and GND

#### Battery Monitor Test
```cpp
// Should read 3.0-4.2V for LiPo
uint16_t adc = analogRead(35);
float voltage = (adc / 4095.0) * 3.3 * 2.0;
Serial.printf("Battery: %.2fV (ADC: %d)\n", voltage, adc);
```
**Troubleshooting:**
- Reads 0V → Check voltage divider wiring
- Wrong voltage → Verify resistor values (should be equal)
- Fluctuating → Add 1µF capacitor to GPIO35

---

## 🔌 Alternative Components

### Replace MICS5524 with BME680 (Recommended)

**Benefits:**
- Single sensor for gas, temp, humidity, pressure
- Much lower power: 3.7mA vs 30mA
- I2C interface (no heater control needed)
- Better accuracy

**Wiring:**
```
BME680 Sensor (I2C)
┌──────────────┐
│    BME680    │
│              │
│  VCC  ●──────┼──── ESP32 3V3
│  GND  ●──────┼──── ESP32 GND
│  SCL  ●──────┼──── ESP32 GPIO22 (shared with other I2C)
│  SDA  ●──────┼──── ESP32 GPIO21 (shared with other I2C)
│              │
└──────────────┘
```

**Code Changes:**
- Remove GPIO25 (heater control)
- Remove GPIO34 (analog read)
- Add BME680 library
- I2C address: 0x76 or 0x77

**Battery Life Improvement:** 19 hours → 60+ hours!

---

## 📦 Recommended Breakout Boards

### Option 1: Pre-made Sensor Breakouts
- **Adafruit VEML7700** - $7.95 - Includes pull-ups, level shifters
- **Adafruit AHT20** - $4.95 - Drop-in compatible with AHT25
- **Adafruit BME680** - $22.50 - Replaces MICS5524 + AHT25

### Option 2: Generic Breakouts (Cheaper)
- **DFRobot VEML7700** - $5.90
- **Generic AHT25 module** - $2-3 on AliExpress
- **Generic MICS5524** - $4-5 on Amazon/AliExpress

---

## 🧰 Tools Required

- Soldering iron and solder
- Wire strippers
- Multimeter (for testing voltage and continuity)
- Breadboard (for prototyping)
- Small screwdriver set
- Heat shrink tubing (optional, for wire protection)

---

## ⚠️ Safety Notes

### Battery Safety
1. **Never** short circuit LiPo battery terminals
2. **Always** use TP4056 or similar protection circuit
3. **Stop using** if battery swells or gets hot
4. **Dispose** properly at battery recycling center
5. **Monitor** voltage - do not discharge below 3.0V

### ESP32 Safety
1. Use 3.3V for I2C sensors (not 5V!)
2. GPIO34-39 are input-only on ESP32 (use for ADC only)
3. Do not exceed 3.3V on any GPIO pin
4. Maximum GPIO current: 12mA per pin

### Gas Sensor Safety
1. MICS5524 heater can get hot (60-80°C)
2. Do not touch heater element when powered
3. Ensure adequate ventilation
4. Use MOSFET for heater control (not direct GPIO)

---

## 📸 Assembly Photos

(Add your own photos here during assembly)

### Recommended Photo Checklist:
- [ ] Complete system overview
- [ ] I2C sensor connections
- [ ] MOSFET heater control circuit
- [ ] Battery voltage divider
- [ ] TP4056 charger module connection
- [ ] Final assembled unit

---

## 📚 Additional Resources

- **ESP32 Pinout:** https://randomnerdtutorials.com/esp32-pinout-reference-gpios/
- **VEML7700 Datasheet:** https://www.vishay.com/docs/84286/veml7700.pdf
- **AHT25 Datasheet:** http://www.aosong.com/en/products-40.html
- **MICS5524 Datasheet:** https://www.sgxsensortech.com/content/uploads/2014/08/1143_Datasheet-MiCS-5524-rev-16.pdf
- **TP4056 Module Guide:** https://www.best-microcontroller-projects.com/tp4056.html

---

## ✅ Pre-Flight Checklist

Before first power-on:

- [ ] Battery fully charged (4.1-4.2V)
- [ ] All grounds connected together
- [ ] No short circuits between VCC and GND
- [ ] I2C sensors connected to GPIO21/22
- [ ] MICS5524 heater connected via MOSFET (not direct)
- [ ] Voltage divider resistors correct values (100kΩ each)
- [ ] LED has current-limiting resistor (220Ω)
- [ ] Code uploaded and compiles without errors
- [ ] Serial monitor ready at 115200 baud

**If all checked, power on and monitor serial output!**

---

**Document Version:** 1.0
**Last Updated:** November 2025
**Compatible With:** ESP32-DevKitC, ESP32-S3-DevKitC
