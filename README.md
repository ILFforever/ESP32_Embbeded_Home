# Main Amp

Audio amplifier module for the ESP32 smart home system. This is the main audio output controller for the home control center.

## Hardware
- **Board**: Adafruit Feather ESP32-S3
- **Framework**: Arduino (PlatformIO)

## Features
- I2S audio output for notifications and alerts
- NeoPixel LED indicator
- Task scheduling for audio playback
- UART communication with Main LCD hub
- Ping-pong heartbeat protocol

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
