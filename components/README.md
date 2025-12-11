# Components Directory

This directory contains external library dependencies required for the project. These components are **NOT** tracked in git (see `.gitignore`).

## Required Components

### 1. arduino/
**Source**: https://github.com/espressif/arduino-esp32.git
**Version**: 3.3.4
**Purpose**: Arduino framework for ESP32-S3, provides Arduino-compatible APIs

**Installation**:
```bash
# Shallow clone to avoid 2GB+ download (reduces to ~200MB)
git clone --depth 1 --branch 3.3.4 https://github.com/espressif/arduino-esp32.git arduino
```

### 2. ArduinoWebsockets/
**Source**: https://github.com/ILFforever/ESP32_Embbeded_Home.git
**Purpose**: WebSocket library for camera streaming functionality
**Dependencies**: Requires `arduino` component

**Installation**:
```bash
# Clone the parent repository and extract ArduinoWebsockets
git clone --depth 1 https://github.com/ILFforever/ESP32_Embbeded_Home.git temp
cp -r temp/ArduinoWebsockets ./
rm -rf temp
```

**OR** if ArduinoWebsockets is available as a standalone repo:
```bash
git clone --depth 1 <STANDALONE_REPO_URL> ArduinoWebsockets
```

## Setup Instructions

When setting up this project on a new machine, you MUST install these components before building. See the main [SETUP.md](../SETUP.md) for complete setup instructions.

## Verification

After installation, verify:
```bash
# Check arduino is installed
ls arduino/cores/esp32/

# Check ArduinoWebsockets is installed
cat ArduinoWebsockets/CMakeLists.txt
```

Both directories should exist and contain source files before running `idf.py build`.
