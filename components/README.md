# Components Directory

This directory contains external library dependencies required for the project. These components are **NOW TRACKED** in git for easier setup.

## Required Components

### 1. arduino/
**Source**: https://github.com/espressif/arduino-esp32.git
**Version**: 3.3.4
**Purpose**: Arduino framework for ESP32-S3, provides Arduino-compatible APIs

**Installation**:
Already included in repository (git history removed, only 68MB)

### 2. ArduinoWebsockets/
**Source**: https://github.com/ILFforever/ESP32_Embbeded_Home.git
**Purpose**: WebSocket library for camera streaming functionality
**Dependencies**: Requires `arduino` component

**Installation**:
Already included in repository (~164KB)

## Setup Instructions

**As of the latest update**, these components are tracked in git and will be automatically downloaded when you clone the repository. No manual installation needed!

See the main [SETUP.md](../SETUP.md) for complete setup instructions.

## Verification

After installation, verify:
```bash
# Check arduino is installed
ls arduino/cores/esp32/

# Check ArduinoWebsockets is installed
cat ArduinoWebsockets/CMakeLists.txt
```

Both directories should exist and contain source files before running `idf.py build`.
