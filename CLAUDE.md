# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ESP32-S3 doorbell camera system with facial recognition capabilities. Built using ESP-IDF framework targeting XIAO ESP32-S3 Sense hardware with DVP camera interface. Uses ESP-WHO library for face detection/recognition and stores face database in SPI flash.

## Build System

### Prerequisites
- ESP-IDF v5.5.1 (required in PATH)
- Must run `idf.py` commands from ESP-IDF shell environment
- Dependencies managed via IDF Component Manager

### Common Build Commands

```bash
# Configure and build for ESP32-S3 target
idf.py set-target esp32s3
idf.py build

# Flash to device
idf.py flash

# Monitor serial output
idf.py monitor

# Build and flash in one command
idf.py -p <PORT> flash monitor

# Clean build artifacts
idf.py fullclean

# Configure menuconfig (for changing sdkconfig options)
idf.py menuconfig
```

## Architecture

### Component Structure

The project uses ESP-WHO framework components integrated via `EXTRA_COMPONENT_DIRS` in CMakeLists.txt. Key components:

- **WhoFrameCap**: Camera frame capture pipeline (`frame_cap_pipeline.cpp/hpp`)
- **WhoRecognition**: Face detection + recognition orchestration (from ESP-WHO, **modified with power management API**)
- **WhoDetect**: Face detection task (from ESP-WHO)
- **WhoRecognitionCore**: Recognition task (from ESP-WHO)

### ESP-WHO Library Modifications

Custom modifications to `C:\Users\paeki\esp\v5.5.1\esp-idf\components\esp-who`:

1. **who_recognition.hpp/cpp** - Added power management API:
   - `shutdown()` - Stops recognition tasks without deleting objects
   - `restart()` - Restarts stopped tasks with saved parameters
   - `mark_running()` - Tracks running state
   - Stores task stack/priority/core parameters for restart

2. **who_s3_cam.cpp** - Added NULL frame handling:
   - `cam_fb_get()` now checks for NULL frames from camera timeout
   - Returns nullptr instead of crashing on dereference
   - Calling code gracefully skips NULL frames

### Application-Level Components

Custom implementations in `main/`:

1. **XiaoRecognitionButton** (`xiao_recognition_button.cpp/hpp`)
   - Control interface for triggering recognition actions
   - Manages detection pause/resume
   - Integrates with standby control
   - Provides one-shot operations: `trigger_recognize()`, `trigger_enroll()`, `trigger_delete()`

2. **XiaoStandbyControl** (`xiao_standby_control.cpp/hpp`)
   - Complete power management system for maximum power savings
   - Methods: `enter_standby()`, `exit_standby()`, `is_standby()`, `print_power_stats()`
   - **Enter standby:** Pauses frame capture, stops WhoYield2Idle, shuts down recognition tasks, stops frame capture nodes (camera fully deinits)
   - **Exit standby:** Restarts WhoYield2Idle, restarts frame capture nodes (camera reinits), restarts recognition tasks
   - Camera hardware is fully powered down in standby (DMA, I2C, clocks all disabled)
   - Uses modified ESP-WHO library with `shutdown()`/`restart()` API for clean task lifecycle management

3. **Frame Capture Pipeline** (`frame_cap_pipeline.cpp/hpp`)
   - Platform-specific camera initialization
   - ESP32-S3: DVP interface via `get_term_dvp_frame_cap_pipeline()`
   - ESP32-P4: MIPI CSI/UVC variants available

### Main Application Flow

`main.cpp` (`app_main()`):
1. Mount storage (FATFS flash/SPIFFS/SD card based on CONFIG)
2. Initialize camera pipeline for target platform
3. Create `WhoRecognitionAppTerm` (terminal-based, no LCD)
4. Initialize standby control
5. Initialize button handler with all task references
6. Run recognition app (blocks)

### Key Dependencies

Managed components (from `idf_component.yml`):
- `espressif/esp32-camera`: Camera driver (v2.0.13+)
- `espressif/human_face_detect`: Face detection models
- `espressif/esp_new_jpeg`: JPEG encoding
- `espressif/usb_host_uvc`: UVC camera support
- `espressif/button`: Button handling utilities
- `espressif/esp-dl`: Deep learning inference library

### Face Database Storage

Configured via menuconfig options:
- `CONFIG_DB_FATFS_FLASH`: Store in SPI flash FAT partition
- `CONFIG_DB_SPIFFS`: Store in SPIFFS
- `CONFIG_DB_FATFS_SDCARD`: Store on SD card

Partition table (`partitions.csv`) includes 1MB storage partition for face data.

## Development Notes

### C++ Standard
Project uses C++17 (`CMAKE_CXX_STANDARD 17` in CMakeLists.txt). Main component forces `gnu++17` compilation.

### Target Hardware
- Primary: XIAO ESP32-S3 Sense (DVP camera)
- Also supports: ESP32-P4 Function EV Board (MIPI CSI/UVC)

### Power Optimization
Compile options include `-O0` (no optimization) for debugging. Change via `idf_build_set_property(COMPILE_OPTIONS "-O2" APPEND)` for production builds.

### Example Workflows
`main.cpp` includes commented-out example tasks demonstrating:
- Enrollment workflows
- Detection control
- Standby/power-saving patterns
- Serial command interface

Uncomment `xTaskCreate()` calls in `app_main()` to enable.

### API Functions
Public API available (defined in `main.cpp`):
- `enroll_new_face()`, `recognize_face()`, `delete_last_face()`
- `pause_face_detection()`, `resume_face_detection()`
- `enter_standby_mode()`, `exit_standby_mode()`, `is_in_standby()`

These can be called from external tasks/components.

## Power Management

### Standby Mode

**What gets shut down:**
- All recognition tasks (detection + recognition) - FreeRTOS tasks deleted
- Frame capture nodes stopped
- Camera hardware fully deinitialized (DMA, I2C, clocks disabled)
- Frame buffers deallocated from PSRAM

**What stays running:**
- System idle task
- Any other application tasks (e.g., WiFi/networking if enabled)

**Expected power savings:**
- Active (with camera): 150-250 mA
- Standby (camera off): 50-100 mA
- Task count reduces by ~3-4 tasks in standby

**Monitoring:**
- Call `g_standby_control->print_power_stats()` for detailed power statistics (logs to serial)
- Use external multimeter on 3.3V power pin for accurate current measurement
