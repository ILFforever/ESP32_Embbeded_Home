# Real-Time Camera & Audio Streaming API

Lightweight in-memory streaming solution for ESP32 doorbell camera and microphone.

## Overview

This streaming system provides:
- **No Firebase storage** - frames/audio kept in RAM only
- **Audio-video sync** - timestamps for synchronized playback
- **Low latency** - direct pass-through with minimal buffering
- **Multiple clients** - supports frontend browsers and ESP32 Wroover devices
- **MJPEG streaming** - standard format, works in browsers without WebRTC

## Architecture

```
ESP32 Camera → POST /devices/doorbell/camera-stream → In-Memory Buffer → GET /stream/camera → Frontend/ESP32
ESP32 Mic    → POST /devices/doorbell/mic-stream    → In-Memory Buffer → GET /stream/audio  → Frontend/ESP32
```

## Endpoints

### 📥 Receive Streams (ESP32 → Backend)

#### POST `/api/v1/devices/doorbell/camera-stream`
Receive JPEG frames from ESP32 camera.

**Auth:** Device token required
**Content-Type:** `multipart/form-data`
**Body:**
- `frame` (file): JPEG image (~9KB)
- `device_id` (string): Device identifier
- `frame_id` (number): Frame sequence number
- `timestamp` (number): Capture timestamp

**Response:**
```json
{
  "success": true,
  "frame_id": 123,
  "size": 9245,
  "clients": 2
}
```

#### POST `/api/v1/devices/doorbell/mic-stream`
Receive PCM audio chunks from ESP32 microphone.

**Auth:** Device token required
**Content-Type:** `application/octet-stream`
**Headers:**
- `X-Sequence`: Chunk sequence number
- `Authorization`: Bearer token

**Body:** Raw PCM audio data (16kHz, 16-bit, mono, 2KB chunks)

**Response:**
```json
{
  "success": true,
  "chunk_id": 456,
  "sequence": 123,
  "size": 2048,
  "clients": 1
}
```

---

### 📤 Stream to Clients (Backend → Frontend/ESP32)

#### GET `/api/v1/stream/camera`
Stream camera frames as MJPEG to frontend/ESP32 Wroover.

**Auth:** Public (add auth if needed)
**Response:** MJPEG stream (`multipart/x-mixed-replace`)

**Usage in HTML:**
```html
<img src="http://backend-url/api/v1/stream/camera" alt="Live Camera" />
```

**Usage in ESP32:**
```cpp
HTTPClient http;
http.begin("http://backend-url/api/v1/stream/camera");
int httpCode = http.GET();
if (httpCode == HTTP_CODE_OK) {
  WiFiClient* stream = http.getStreamPtr();
  // Read MJPEG frames...
}
```

#### GET `/api/v1/stream/audio`
Stream audio as raw PCM to frontend/ESP32 Wroover.

**Auth:** Public (add auth if needed)
**Response:** PCM audio stream (`audio/pcm`)
**Headers:**
- `X-Sample-Rate`: 16000
- `X-Channels`: 1
- `X-Bit-Depth`: 16

**Usage in Web Audio API:**
```javascript
const audio = new Audio('http://backend-url/api/v1/stream/audio');
audio.play();
```

#### GET `/api/v1/stream/camera/snapshot`
Get latest camera frame as single JPEG image.

**Auth:** Public
**Response:** JPEG image

**Usage:**
```bash
curl http://backend-url/api/v1/stream/camera/snapshot > snapshot.jpg
```

#### GET `/api/v1/stream/stats`
Get streaming statistics (frames received, clients connected, etc.).

**Auth:** Public
**Response:**
```json
{
  "success": true,
  "stats": {
    "framesReceived": 1234,
    "audioChunksReceived": 5678,
    "framesDropped": 12,
    "audioChunksDropped": 3,
    "videoClientsConnected": 2,
    "audioClientsConnected": 1,
    "currentFrames": 30,
    "currentAudioChunks": 100,
    "bufferUsage": {
      "frames": "30/30",
      "audio": "100/100"
    },
    "streamActive": {
      "video": true,
      "audio": true
    }
  }
}
```

---

## Buffer Configuration

### Memory Limits
- **Camera frames:** 30 frames max (~270KB at 9KB/frame)
- **Audio chunks:** 100 chunks max (~200KB at 2KB/chunk)
- **Total RAM usage:** ~500KB for streaming buffers

### Sync Window
- Frames and audio matched within **500ms** window
- Use `streamBuffer.getSyncedFrame(audioTimestamp)` for sync

### Frame Rate
- ESP32 sends at **5 FPS** (200ms interval)
- Buffer keeps last **30 frames** (6 seconds of video)

### Audio Buffering
- ESP32 sends **2KB chunks** (1024 samples @ 16kHz = 64ms audio)
- Buffer keeps last **100 chunks** (6.4 seconds of audio)

---

## Audio Sync Example

```javascript
// Frontend: Sync video and audio playback
const audioContext = new AudioContext({ sampleRate: 16000 });
const videoElement = document.querySelector('img');

// Get initial timestamp offset
fetch('/api/v1/stream/stats')
  .then(res => res.json())
  .then(data => {
    const videoLatency = Date.now() - data.stats.lastFrameTime;
    const audioLatency = Date.now() - data.stats.lastAudioTime;
    const syncOffset = videoLatency - audioLatency;

    // Adjust audio playback to match video
    if (syncOffset > 100) {
      // Audio ahead, delay it
      setTimeout(() => playAudio(), syncOffset);
    }
  });
```

---

## Deployment Notes

### Fly.io Configuration
- Increase memory limit if needed: `fly scale memory 512` (default 256MB)
- Stream buffers use ~500KB RAM
- Each connected client adds minimal overhead

### Performance
- **Latency:** ~100-300ms end-to-end (ESP32 → Backend → Frontend)
- **Bandwidth:** ~45 KB/s video (5 FPS × 9KB) + ~32 KB/s audio (16kHz PCM)
- **Total:** ~77 KB/s per streaming session

### Scaling
- Single backend instance supports **10-20 concurrent clients**
- For more clients, consider:
  - Multiple backend instances with load balancer
  - WebRTC for peer-to-peer streaming
  - CDN for static snapshots

---

## ESP32 Wroover Integration (Future)

To stream to ESP32 Wroover display:

```cpp
// In Doorbell_lcd/src/comm/video_client.cpp
HTTPClient http;
http.begin("http://embedded-smarthome.fly.dev/api/v1/stream/camera");
int httpCode = http.GET();

if (httpCode == HTTP_CODE_OK) {
  WiFiClient* stream = http.getStreamPtr();

  while (http.connected()) {
    // Read MJPEG boundary
    String line = stream->readStringUntil('\n');
    if (line.startsWith("Content-Length:")) {
      int frameSize = line.substring(16).toInt();

      // Read JPEG frame
      uint8_t* frameBuffer = (uint8_t*)malloc(frameSize);
      stream->readBytes(frameBuffer, frameSize);

      // Display on LCD
      TJpgDec.drawJpg(0, 0, frameBuffer, frameSize);

      free(frameBuffer);
    }
  }
}
```

---

## Troubleshooting

### No frames received
- Check ESP32 WiFi connection
- Verify device token authentication
- Check backend logs: `fly logs`

### Choppy video
- Increase frame rate on ESP32 (max 10 FPS recommended)
- Check network latency
- Reduce JPEG quality if bandwidth limited

### Audio-video desync
- Check timestamps in `/stream/stats`
- Adjust sync window (default 500ms)
- Ensure consistent network latency

### Buffer overflow
- Increase buffer sizes in `services/streamBuffer.js`
- Add more clients → buffer fills faster
- Consider dropping frames for slow clients

---

## Security Considerations

- **Device endpoints** require authentication (device token)
- **Client endpoints** currently public - add auth for production
- Consider rate limiting for `/stream/*` endpoints
- Use HTTPS in production (Fly.io provides SSL)
