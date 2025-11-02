# Doorbell Amp

Audio amplifier module for the ESP32 smart home doorbell system.

## Hardware
- **Board**: Adafruit Feather ESP32-S3
- **Framework**: Arduino (PlatformIO)

## Features
- I2S audio output for doorbell chime
- NeoPixel LED indicator
- Task scheduling for audio playback

## Dependencies
- TaskScheduler
- ESP32-audioI2S
- ArduinoJson
- Adafruit NeoPixel

## Build & Upload
```bash
pio run --target upload
```

## Monitor
```bash
pio device monitor
```
