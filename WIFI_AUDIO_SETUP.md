# WiFi Audio Streaming Setup

## Overview

The camera now supports streaming audio over WiFi HTTP. Audio is streamed as raw PCM data (16kHz, 16-bit mono) that can be fetched by any HTTP client.

## Architecture

- **Camera Side**: HTTP server with `/audio/stream` endpoint that provides chunked audio streaming
- **LCD Side**: HTTP client that fetches audio from camera's IP address
- **Microphone Control**: UART commands (`mic_start`, `mic_stop`, `mic_status`)

## Enabling WiFi on Camera

To enable the HTTP server on the camera, add these lines to `app_main()` in `main.cpp`:

```cpp
// After creating all components (around line 101)

// Initialize WiFi and HTTP server
init_wifi_and_server();

// Set HTTP server references (pass microphone pointer)
set_http_server_refs(g_standby_control,
                     g_recognition_app->get_recognition(),
                     g_face_db_reader,
                     g_microphone);
```

**Network Configuration**: Update in `network/http_server.cpp`:
```cpp
#define WIFI_SSID "YourSSID"
#define WIFI_PASS "YourPassword"

// Static IP configuration (already set to 192.168.1.100)
#define CAMERA_STATIC_IP      "192.168.1.100"
#define CAMERA_GATEWAY        "192.168.1.1"
#define CAMERA_SUBNET         "255.255.255.0"
#define CAMERA_DNS            "192.168.1.1"
```

**Note**: Camera uses static IP `192.168.1.100` to ensure LCD can always find it. Adjust gateway/subnet if your network uses different values.

## Using Audio Streaming

### 1. Start Microphone via UART

Send from LCD to Camera:
```json
{"command": "mic_start"}
```

Camera responds:
```json
{"status": "ok", "message": "Microphone started"}
```

### 2. Access Audio Stream

Once microphone is running, access the audio stream at:
```
http://<CAMERA_IP>/audio/stream
```

The endpoint returns:
- **Content-Type**: `audio/pcm`
- **Format**: 16-bit signed little-endian PCM
- **Sample Rate**: 16000 Hz
- **Channels**: 1 (mono)
- **Chunk Size**: 1024 samples (64ms chunks, 2048 bytes each)

### 3. Stop Microphone

Send from LCD to Camera:
```json
{"command": "mic_stop"}
```

## HTTP Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Status page (auto-refresh every 5s) |
| `/audio/stream` | GET | Audio streaming (chunked PCM) |
| `/standby` | GET | Enter standby mode |
| `/wake` | GET | Exit standby mode |
| `/enroll` | GET | Trigger face enrollment |
| `/recognize` | GET | Trigger face recognition |
| `/face_count` | GET | Get enrolled face count |
| `/face_list` | GET | List all face IDs |
| `/db_status` | GET | Database status |

## Performance Impact

Audio streaming over WiFi is independent of SPI video transmission:
- **No SPI bandwidth impact** - SPI remains dedicated to video
- **Minimal CPU overhead** - HTTP server runs on separate task
- **AI performance** - Face recognition unaffected by audio streaming

## Implementation Details

### Camera Side

1. **HTTP Server**: `network/http_server.cpp`
   - `audio_stream_handler()` - Streams PCM audio chunks
   - Runs in separate task, handles client disconnections gracefully

2. **Microphone**: `audio/i2s_microphone.cpp`
   - `read_audio()` - Provides audio samples for streaming
   - Configured for PDM microphone on GPIO 42 (CLK) and GPIO 41 (DATA)

### LCD Side

LCD will fetch audio from `http://<CAMERA_IP>/audio/stream` using HTTP client. See LCD implementation for details.

## Troubleshooting

### Camera not connecting to WiFi
- Check WiFi credentials in `http_server.cpp`
- Ensure WiFi network is 2.4 GHz (ESP32-S3 doesn't support 5 GHz)
- Check serial output for connection status
- Verify static IP doesn't conflict with other devices

### No audio stream
- Verify microphone started: send `mic_status` command
- Camera always at `192.168.1.100` (static IP)
- Test endpoint with browser: `http://192.168.1.100/audio/stream`

### Audio stuttering
- Check WiFi signal strength
- Reduce other WiFi traffic
- Increase chunk size in `audio_stream_handler()` if needed
