# Doorbell LCD Module
ESP32 LCD display module for doorbell system with NFC authentication and live video display.

## Overview
This module provides the user interface for the smart doorbell system, displaying live video from the camera module, managing NFC card authentication, handling button inputs, and communicating with the camera slave via UART/SPI.

## Hardware
- **Board:** ESP32 DOIT DevKit V1
- **Display:** ST7789 TFT LCD (240x240)
- **NFC Reader:** PN532 (I2C interface)
- **Communication:** UART + SPI to camera module
- **Buttons:** 2x tactile buttons (Doorbell, Call)

## Features
- **Real-time video streaming** - JPEG frame display from camera module
- **NFC card authentication** - PN532 reader with IRQ-based detection
- **Face detection overlay** - Bounding box display on detected faces
- **Button controls** - Doorbell press, call button, hold actions
- **WiFi backend integration** - Heartbeat, command polling, logging, NFC access checks, weather, and doorbell events
- **MQTT notifications** - Doorbell ring publish and command notification subscription
- **Status animations** - Smooth scrolling status messages
- **Auto-expiring messages** - Temporary status with fallback to system state
- **Multi-core processing** - RTOS tasks on dual cores for responsive UI

## Pin Configuration

### Display (ST7789)
- `TFT_MOSI`: GPIO 23 (SDA)
- `TFT_SCLK`: GPIO 22 (SCK)
- `TFT_CS`: GPIO 21
- `TFT_DC`: GPIO 19
- `TFT_RST`: GPIO 18

### NFC Reader (PN532)
- `NFC_SDA`: GPIO 13 (I2C + 2kΩ pull-up to 3.3V)
- `NFC_SCL`: GPIO 15 (I2C + 2kΩ pull-up to 3.3V)
- `NFC_IRQ`: GPIO 5
- `NFC_RESET`: NC

### Communication with Camera Module
- **UART:** RX2=GPIO16, TX2=GPIO17 @ 115200 baud
- **SPI:** SCK=GPIO25, MISO=GPIO26, MOSI=GPIO27, CS=GPIO14 @ 20MHz

### Buttons
- `Doorbell_bt`: GPIO 34 (analog input, requires external 10kΩ pull-down)
- `Call_bt`: GPIO 35 (analog input, requires external 10kΩ pull-down)

## Software Architecture

### Active Network Model

The current firmware uses outbound network connections only. The previous local
HTTP control server is disabled to save RAM/flash, so `doorbell-control.html`
and the old `/camera/start`, `/camera/stop`, `/snapshot`, `/status`, and
`/face/*` endpoints are legacy/debug references unless the HTTP server
dependency is restored.

Active network paths include:
- Backend HTTP over plain HTTP (intentional ESP32 memory tradeoff; HTTPS caused
  no-memory failures in this firmware profile)
- OpenWeatherMap HTTP weather fetch
- HiveMQ MQTT broker for doorbell ring and command notifications
- Background multipart face-image upload through `face_detection_sender`

Local secrets and deployment values can be overridden through
`include/local_config.h`; copy `include/local_config.h.example` and fill in
local values. The fallback constants in `include/app_config.h` are placeholders
for non-secret builds.

### Core Modules
- `main.cpp` - Main program, UI rendering, task orchestration
- `lcd_helper.cpp/h` - Status message management with auto-expiration
- `uart_commands.cpp/h` - UART protocol with camera slave
- `SPIMaster.cpp/h` - High-speed JPEG frame reception
- `nfc_controller.cpp/h` - NFC card reading (RTOS task on Core 0)
- `network_manager.cpp/h` - Queued backend network worker for non-critical HTTP jobs
- `heartbeat.cpp/h` - Backend heartbeat, commands, status, warnings, and device events
- `doorbell_mqtt.cpp/h` - MQTT doorbell ring and command notification path
- `slave_state_manager.cpp/h` - Synchronization with camera module state

### State Management
**Slave Status Values:**
- `-1` = Disconnected (no UART communication)
- `0` = Standby (camera off)
- `1` = Camera Running (streaming video)
- `2` = Face Recognition Active

### Communication Protocols

#### UART (JSON-based)
Commands sent to camera:
- `{"cmd":"camera_control","params":"camera_start"}`
- `{"cmd":"camera_control","params":"camera_stop"}`
- `{"cmd":"start_recognition"}`
- `{"cmd":"stop_recognition"}`
- `{"cmd":"enroll_face"}`
- `{"cmd":"recognize_face"}`

Events received from camera:
- `{"event":"face_detected","bbox":{x,y,w,h}}`
- `{"event":"face_recognized","id":N,"name":"...","confidence":X}`
- `{"event":"status","mode":N}`
- `{"event":"pong","counter":N}`

#### SPI (Binary Frame Transfer)
- **Frame Header:** Magic bytes (0x55, 0xAA) + frame_id + size + timestamp
- **Frame Data:** JPEG compressed image
- **Transfer Rate:** 20MHz SPI clock
- **Processing:** Hardware-accelerated JPEG decoding (TJpg_Decoder)

## Project Context
Part of **ESP32_Embedded_Home** smart home ecosystem developed for Chulalongkorn University's 2110356 Embedded Systems course. This module works in conjunction with:
- **Doorbell Camera Module** (XIAO ESP32-S3 Sense) - Face recognition slave
- **Central Hub** - IoT gateway and control center

## Authors
Developed as part of embedded systems coursework
