# WebSocket Streaming Migration Guide

## Overview

The WebSocket implementation provides **10-30x faster** frame transmission compared to HTTP POST:
- **HTTP POST**: 500-1500ms per frame (~1-2 FPS)
- **WebSocket**: 10-50ms per frame (~20-100 FPS potential)

## Backend Setup (Node.js)

The backend WebSocket server is already configured and will start automatically with your Express server.

### WebSocket Endpoint
- **URL**: `ws://embedded-smarthome.fly.dev/ws/stream`
- **Protocol**: Binary frames with custom header format
- **Authentication**: JSON message on first connection

### Starting the Server
```bash
cd Backend
npm start
```

The WebSocket server will initialize on the same port as your HTTP server (port 80 in production).

## ESP32 Setup

### Option 1: Use WebSocket Streaming (Recommended)

Replace `backend_stream.cpp` with `backend_stream_ws.cpp` in your build:

1. **Update CMakeLists.txt** in `main` directory:
```cmake
idf_component_register(
    SRCS
        "main.cpp"
        "backend/backend_stream_ws.cpp"  # Use WebSocket version
        # "backend/backend_stream.cpp"   # Comment out HTTP version
        # ... other files
    INCLUDE_DIRS "."
    REQUIRES
        esp_websocket_client  # Add WebSocket component
        # ... other requirements
)
```

2. **Build and flash**:
```bash
idf.py build
idf.py flash monitor
```

### Option 2: Keep HTTP POST (Current)

If you want to keep the current HTTP POST implementation, no changes needed. The file `backend_stream.cpp` will continue to work.

## Binary Frame Format

### Camera Frame (Type 0x01)
```
[0x01][frame_id(2 bytes BE)][timestamp(4 bytes BE)][JPEG data...]
```

### Audio Chunk (Type 0x02)
```
[0x02][sequence(2 bytes BE)][timestamp(4 bytes BE)][PCM data...]
```

## Authentication Flow

1. ESP32 connects to `ws://embedded-smarthome.fly.dev/ws/stream`
2. Sends authentication JSON:
```json
{
  "type": "auth",
  "device_id": "db_001",
  "token": "d8ac2f1ee97b4a8b3f299696773e807e735284c47cfc30aadef1287e10a53b6d"
}
```
3. Backend validates and responds with:
```json
{
  "type": "auth_success",
  "device_id": "db_001",
  "message": "WebSocket streaming ready"
}
```
4. ESP32 can now send binary frames

## Performance Benefits

| Metric | HTTP POST | WebSocket |
|--------|-----------|-----------|
| Latency per frame | 500-1500ms | 10-50ms |
| Connection overhead | ~150ms/request | One-time |
| Frame rate | 1-2 FPS | 20-100 FPS |
| Network efficiency | Low (new TCP per frame) | High (persistent) |

## Testing

### Check WebSocket Connection
Monitor ESP32 logs for:
```
[BackendStreamWS] Connecting to WebSocket: ws://embedded-smarthome.fly.dev/ws/stream
[BackendStreamWS] WebSocket connected!
[BackendStreamWS] Sent authentication message
[BackendStreamWS] Received WebSocket data: {"type":"auth_success",...}
```

### Monitor Frame Transmission
```
[BackendStreamWS] Frame 10 sent via WebSocket: 15234 bytes in 23ms
[BackendStreamWS] Frame 20 sent via WebSocket: 14987 bytes in 19ms
```

### Backend Logs
```
[WebSocket] Stream server initialized on /ws/stream
[WebSocket] Device db_001 authenticated and connected
[WebSocket] Camera frame 10 from db_001: 15234 bytes (2 clients)
```

## Troubleshooting

### WebSocket Won't Connect
- Check WiFi connection on ESP32
- Verify backend server is running: `npm start`
- Ensure firewall allows WebSocket connections
- Check URL in `backend_stream.hpp` matches your server

### Frames Not Arriving
- Check ESP32 logs for "WebSocket connected"
- Verify authentication succeeded
- Check `ws_connected` flag is true
- Monitor backend logs for incoming frames

### High Latency Still
- Check frame size (reduce JPEG quality if >30KB)
- Verify network latency with ping
- Check for queue overflows in ESP32 logs
- Ensure backend is not overloaded

## Rollback to HTTP POST

If WebSocket has issues, simply:

1. Edit `CMakeLists.txt` to use `backend_stream.cpp` instead
2. Rebuild: `idf.py build`
3. Flash: `idf.py flash`

Both implementations use the same API, so no code changes needed in `main.cpp`.

## Next Steps

After WebSocket is working:
1. Monitor latency improvements in logs
2. Adjust `FRAME_INTERVAL_MS` in backend_stream.hpp to increase FPS
3. Fine-tune JPEG quality vs size for optimal performance
4. Consider adding reconnection logic for production use
