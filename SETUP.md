# Project Setup Guide

## Hardware Requirements
- **Board**: XIAO ESP32-S3 Sense
- **Microphone**: MSM261S4030H0 or MP34DT06JTR (onboard)
- **Camera**: DVP camera (onboard on XIAO ESP32-S3 Sense)

## Software Prerequisites

### 1. ESP-IDF Installation
- **Version**: ESP-IDF v5.5.1 (CRITICAL - this exact version)
- **Download**: https://docs.espressif.com/projects/esp-idf/en/v5.5.1/esp32s3/get-started/index.html

### 2. ESP-WHO Library Setup
**IMPORTANT**: This project uses a MODIFIED version of ESP-WHO library.

#### Modified ESP-WHO Repository:
- **GitHub**: https://github.com/ILFforever/esp-who
- **Install Location**: `C:\Users\<YOUR_USERNAME>\esp\v5.5.1\esp-idf\components\esp-who`

#### Modifications Include:
1. **who_recognition.hpp/cpp** - Added power management API (`shutdown()`, `restart()`, `mark_running()`)
2. **who_s3_cam.cpp** - Added NULL frame handling for camera timeout

#### Installation:
```bash
# After installing ESP-IDF v5.5.1
cd C:\Users\<YOUR_USERNAME>\esp\v5.5.1\esp-idf\components
git clone https://github.com/ILFforever/esp-who.git
```

## Initial Setup Steps

### 1. Install ESP-IDF v5.5.1
Follow official Espressif installation guide for Windows:
https://docs.espressif.com/projects/esp-idf/en/v5.5.1/esp32s3/get-started/windows-setup.html

### 2. Install Modified ESP-WHO Components
```bash
cd C:\Users\<YOUR_USERNAME>\esp\v5.5.1\esp-idf\components
git clone https://github.com/ILFforever/esp-who.git
```

### 3. Clone This Repository
```bash
git clone <YOUR_REPO_URL>
cd Doorbell_Camera
```

### 4. Install Arduino Components
**CRITICAL**: This project requires Arduino-ESP32 and ArduinoWebsockets libraries in the `components/` directory.

**IMPORTANT**: These components are in `.gitignore` and NOT tracked in the repository. You MUST install them manually after cloning.

```bash
# Navigate to the components directory
cd components

# Install Arduino-ESP32 (version 3.3.4)
# Use --depth 1 to avoid downloading 2GB+ of history
git clone --depth 1 --branch 3.3.4 https://github.com/espressif/arduino-esp32.git arduino

# Install ArduinoWebsockets
# Option 1: Clone from ESP32_Embbeded_Home and extract
git clone --depth 1 https://github.com/ILFforever/ESP32_Embbeded_Home.git temp
cp -r temp/ArduinoWebsockets ./
rm -rf temp

# Option 2: If standalone repo exists, clone directly
# git clone --depth 1 <ARDUINO_WEBSOCKETS_STANDALONE_REPO> ArduinoWebsockets

cd ..
```

**Notes**:
- The ArduinoWebsockets component is required for camera streaming via WebSocket
- Using `--depth 1` (shallow clone) reduces Arduino download from **2GB+ to ~200MB**
- See `components/README.md` for detailed installation instructions
- Verify both `components/arduino/` and `components/ArduinoWebsockets/` exist before building

### 5. Set Target and Build
Open ESP-IDF PowerShell/CMD environment:
```bash
idf.py set-target esp32s3
idf.py build
```

### 6. Flash to Device
```bash
idf.py -p COM<X> flash monitor
```

## Environment Activation

Every time you work on this project:
1. Open ESP-IDF PowerShell (installed with ESP-IDF)
2. Or manually activate: `%USERPROFILE%\esp\v5.5.1\esp-idf\export.bat`
3. Navigate to project directory
4. Run `idf.py` commands

## Verification Checklist

After setup, verify:
- [ ] ESP-IDF version: `idf.py --version` shows v5.5.1
- [ ] Modified ESP-WHO present: Check `esp-idf/components/esp-who/who_recognition.hpp` contains `shutdown()` and `restart()` methods
- [ ] Arduino components present: Check `components/arduino/` and `components/ArduinoWebsockets/` exist
- [ ] Build succeeds: `idf.py build` completes without errors
- [ ] Camera initializes: Monitor output shows "Camera initialized successfully"
- [ ] Standby works: `enter_standby` command reduces power consumption

## Common Issues

### "esp-who components not found"
- Ensure modified ESP-WHO is cloned to `esp-idf/components/esp-who`
- Check `EXTRA_COMPONENT_DIRS` in root `CMakeLists.txt` points to valid path

### "idf.py command not found"
- ESP-IDF environment not activated
- Run ESP-IDF PowerShell or `export.bat`

### Build fails with component errors
- Dependencies may need updating: `idf.py reconfigure`
- Try clean build: `idf.py fullclean && idf.py build`

### "arduino component not found"
- Ensure `components/arduino/` exists and contains arduino-esp32 repository
- Check Arduino version: `cd components/arduino && git describe --tags`
- Should show `3.3.4` or similar

### "ArduinoWebsockets not found"
- Ensure `components/ArduinoWebsockets/` exists with CMakeLists.txt
- This component is needed for camera streaming via WebSocket

## Network Configuration (Optional)

If using WiFi features, update credentials in `network/http_server.cpp`:
- SSID: Currently `ILFforever2`
- Password: Currently `19283746`
- Static IP: `192.168.1.100`

## Repository Structure
```
Doorbell_Camera/
├── main/                    # Application code
│   ├── main.cpp            # Entry point
│   ├── xiao_standby_control.cpp/hpp
│   ├── xiao_recognition_button.cpp/hpp
│   ├── frame_cap_pipeline.cpp/hpp
│   └── audio/              # I2S microphone driver
├── network/                # WiFi and HTTP server
├── components/             # External component dependencies
│   ├── arduino/           # Arduino-ESP32 framework (v3.3.4)
│   └── ArduinoWebsockets/ # WebSocket library for streaming
├── partitions.csv          # Flash partition table
├── CMakeLists.txt          # Build configuration
├── CLAUDE.md              # AI assistant instructions
└── SETUP.md               # This file
```

## Contact/Reference
- ESP-IDF Documentation: https://docs.espressif.com/projects/esp-idf/
- Modified ESP-WHO: https://github.com/ILFforever/esp-who
- Original ESP-WHO: https://github.com/espressif/esp-who
- Project created: December 2025
