# Claude Project Knowledge - Doorbell LCD

This document contains architectural knowledge and important context for the ESP32 Doorbell LCD project.

## Project Overview

**Name:** ESP32_Embedded_Home - Doorbell LCD
**Platform:** ESP32 DOIT DevKit V1
**Framework:** Arduino
**Purpose:** Smart doorbell system with LCD display, camera streaming, face recognition, and NFC card reading

Part of Chulalongkorn's 2110356 Embedded System class project simulating a smart home ecosystem.

## Hardware Architecture

### Main Components
- **ESP32 DOIT DevKit V1** - Main controller
- **ST7789 TFT Display** (240x240) - Visual interface
- **PN532 NFC Reader** - Card authentication via I2C + IRQ
- **Slave ESP32** - Connected via UART and SPI (handles camera and face recognition)

### Communication Channels
1. **UART (RX2/TX2)** - Command/control with slave ESP32
2. **SPI** - High-speed JPEG frame transfer from slave
3. **I2C** - NFC reader communication
4. **WiFi** - HTTP web server for remote control (Only for testing, removed in production )

### Pin Configuration
- **UART:** RX2=16, TX2=17 @ 115200 baud
- **SPI:** SCK=25, MISO=26, MOSI=27, CS=14 @ 20MHz
- **NFC:** SDA=21, SCL=22, IRQ=4 //Not final 

## Software Architecture

### Core System State

**Slave Status Values:**
- `-1` = Disconnected (no communication with slave)
- `0` = Standby (slave connected, camera off)
- `1` = Camera Running (doorbell active, streaming video)
- `2` = Face Recognition Active (analyzing faces)

### Project Structure

```
src/
├── main.cpp                 # Main program, UI rendering, task scheduler
├── lcd_helper.cpp          # LCD status message management
├── http_control.cpp        # HTTP web server for remote control
├── comm/
│   ├── uart_commands.cpp   # UART protocol with slave (commands, responses)
│   └── SPIMaster.cpp       # SPI frame reception (non-blocking, RTOS task)
└── nfc/
    └── nfc_controller.cpp  # NFC card reading (RTOS task on Core 0)

include/
├── lcd_helper.h            # LCD helper function declarations
├── uart_commands.h         # UART protocol interface
├── http_control.h          # HTTP server interface
├── SPIMaster.h             # SPI master class
└── nfc_controller.h        # NFC controller interface
```

### Key Modules

#### 1. LCD Helper (`lcd_helper.cpp/h`)
**Purpose:** Manages LCD status messages and UI state

**Key Function:**
- `updateStatusMsg(msg, temporary, fallback)` - Updates status text with automatic fallback system

**Design Pattern:**
- Temporary messages auto-revert to contextual fallback based on `slave_status`
- Sets `uiNeedsUpdate` flag to trigger UI redraw
- Separated from UART module (refactored from uart_commands for better separation of concerns)

**Global State:**
- `status_msg` - Current displayed message
- `status_msg_is_temporary` - Whether message will auto-revert
- `status_msg_fallback` - Message to show after temporary expires
- `uiNeedsUpdate` - Flag for UI redraw trigger

#### 2. UART Commands (`uart_commands.cpp/h`)
**Purpose:** Communication protocol with slave ESP32

**Commands Sent:**
- `start_camera` - Begin video streaming
- `stop_camera` - Stop video streaming
- `start_recognition` - Start face recognition
- `stop_recognition` - Stop face recognition
- `resume_detection` - Resume after failed recognition
- `enroll_face` - Enroll new face
- `list_faces` - Get enrolled faces list

**Events Received:**
- `face_detected` - Face found in frame (with bbox coordinates)
- `face_recognized` - Face matched (with ID, name, confidence)
- `status` - Slave status updates (camera started/stopped, etc.)
- `pong` - Ping response for connection monitoring

**Protocol:**
- JSON-based messaging
- Ping/pong heartbeat (1s interval, 10s timeout)
- Filters ESP-IDF log messages automatically

**Global State:**
- `slave_status` - Current slave operational state
- `recognition_success` - Last recognition result
- `hasFaceDetection` - Whether face bbox should be drawn
- `face_bbox_x/y/w/h` - Face bounding box coordinates
- `lastFaceDetectionTime` - For bbox timeout (1.5s)

#### 3. SPI Master (`SPIMaster.cpp/h`)
**Purpose:** High-speed JPEG frame reception from slave

**Architecture:**
- Runs on dedicated RTOS task (Core 1) for consistent FPS
- Non-blocking state machine design
- Frame header protocol: magic bytes (0x55, 0xAA) + frame_id + size + timestamp

**States:**
- `SPI_IDLE` - Waiting for new frame
- `SPI_RECEIVING_HEADER` - Reading 12-byte header
- `SPI_RECEIVING_DATA` - Streaming JPEG data
- `SPI_COMPLETE` - Frame ready for display
- `SPI_ERROR` - Transfer failed

**Frame Flow:**
1. Receive header (12 bytes, big-endian)
2. Allocate buffer for frame_size
3. Stream JPEG data in chunks
4. Signal completion
5. Main app decodes and displays

#### 4. NFC Controller (`nfc_controller.cpp/h`)
**Purpose:** Background NFC card reading

**Features:**
- Runs on RTOS task (Core 0)
- IRQ-based detection for efficiency
- Debounce protection (500ms)
- Callback system for card events

**API:**
- `initNFC()` - Initialize and start task
- `setNFCCardCallback(callback)` - Register detection handler
- `getLastCardData()` - Get last read card

**Data Structure:**
```cpp
struct NFCCardData {
    uint8_t uid[7];      // Card UID
    uint8_t uidLength;   // UID length (4 or 7 bytes)
    uint32_t cardId;     // Decimal ID (for 4-byte UIDs)
    bool isValid;        // Read success flag
}
```

#### 5. HTTP Control (`http_control.cpp/h`)
**Purpose:** Web-based remote control

**Endpoints:**
- Camera control (start/stop)
- Face recognition control
- Face enrollment
- System status queries

#### 6. Main Program (`main.cpp`)
**Purpose:** UI rendering, task orchestration

**UI Layout:**
```
┌─────────────────────┐
│  [WiFi] [Time]      │ ← Top UI (topuiSprite)
├─────────────────────┤
│                     │
│   Video Stream      │ ← Video (videoSprite - JPEG decode)
│   (w/ face bbox)    │
│                     │
├─────────────────────┤
│  [Status Message]   │ ← Mid UI (miduiSprite)
├─────────────────────┤
│  [Date]             │ ← Bottom UI (botuiSprite)
└─────────────────────┘
```

**Sprite System:**
- 4 separate sprites for independent updates
- Only redraws changed sections (optimization)
- Video sprite updates on new frames
- UI sprites update on `uiNeedsUpdate` flag

**Tasks (TaskScheduler):**
- `taskCheckUART` (20ms) - Poll UART buffer
- `taskSendPing` (1000ms) - Send ping to slave
- `taskCheckTimeout` (1000ms) - Monitor connection
- `taskHTTPHandler` (10ms) - Handle HTTP requests
- `taskProcessFrame` (5ms) - Check for new SPI frames
- `taskdrawUIOverlay` (25ms) - Update UI sprites
- `tasklcdhandoff` (200ms) - Manage LCD arbitration
- `taskGetCameraStatus` (1000ms) - Poll camera status

**Performance:**
- RAM: 16.7% (54,752 bytes)
- Flash: 72.7% (952,557 bytes)

## Libraries Used

- **TaskScheduler** (4.0.0) - Cooperative multitasking
- **ArduinoJson** (7.4.2) - JSON parsing for UART protocol
- **TFT_eSPI** (2.5.43) - Display driver
- **TJpg_Decoder** (1.1.0) - Hardware-accelerated JPEG decoding
- **Adafruit PN532** (1.3.4) - NFC reader library
- **WiFi** - ESP32 WiFi
- **WebServer** - HTTP server

## Design Decisions & Patterns

### Separation of Concerns
- **LCD functions** in `lcd_helper` (NOT in uart_commands)
- **UART protocol** isolated from display logic
- **SPI transfer** runs independently on dedicated task
- **NFC reading** runs on separate core to avoid blocking

### State Management
- Global state with careful extern declarations
- Flags for inter-module communication (`uiNeedsUpdate`)
- Status enumeration for clear state tracking

### Performance Optimization
- **Sprite-based rendering** - Only redraw changed areas
- **Cached values** - Time/date strings cached to reduce redraws
- **Non-blocking I/O** - All comm channels use async patterns
- **RTOS tasks** - SPI and NFC on dedicated tasks for consistency
- **Hardware JPEG decoder** - Fast frame display

### Communication Protocol
- **JSON over UART** - Human-readable, flexible
- **Binary SPI protocol** - High-speed frame transfer
- **Ping/pong heartbeat** - Connection monitoring
- **Event-driven** - Callback patterns for async events

## Important Notes

### Recent Refactoring (2025-10-19)
Moved `updateStatusMsg` from `uart_commands.cpp` to new `lcd_helper.cpp` module to improve separation of concerns. UART module now only handles communication protocol.

### Build System
- **PlatformIO** project
- Build command: `C:\Users\Asus\.platformio\penv\Scripts\platformio.exe run`
- Upload to serial port via PlatformIO

### Git Workflow
- Main branch: `main`
- Current branch: `Doorbell_lcd`
- Recent changes: LCD optimizations, face recognition improvements, NFC system addition

### Development Context
- Multi-ESP32 system (this is the LCD/display unit)
- Works in conjunction with separate camera/AI ESP32 (slave)
- Part of larger smart home ecosystem project

## Common Workflows

### Adding New Status Message
```cpp
#include "lcd_helper.h"

// Permanent status
updateStatusMsg("New Status");

// Temporary status (auto-reverts based on slave_status)
updateStatusMsg("Temporary Msg", true);

// Temporary with custom fallback
updateStatusMsg("Scanning...", true, "Ready");
```

### Sending Command to Slave
```cpp
#include "uart_commands.h"

// Simple command
sendUARTCommand("start_camera");

// Command with string parameter
sendUARTCommand("enroll_face", "John Doe");

// Command with ID parameter
sendUARTCommand("delete_face", nullptr, 5);
```

### Handling NFC Card Detection
```cpp
#include "nfc_controller.h"

void onCardDetected(NFCCardData card) {
    Serial.printf("Card ID: %lu\n", card.cardId);
    updateStatusMsg("Card Scanned", true);
    card_success = true;
}

// In setup()
initNFC();
setNFCCardCallback(onCardDetected);
```

## Future Considerations

- Memory usage is at 72.7% flash - consider optimization if adding more features
- SPI transfer at 20MHz - can potentially increase if needed
- Face detection bbox timeout at 1.5s - adjustable in main.cpp
- Consider adding persistent storage for settings/faces
- Potential for adding more authentication methods

## References

- [PlatformIO Docs](https://docs.platformio.org/)
- [TFT_eSPI Library](https://github.com/Bodmer/TFT_eSPI)
- [ESP32 Arduino Core](https://github.com/espressif/arduino-esp32)
