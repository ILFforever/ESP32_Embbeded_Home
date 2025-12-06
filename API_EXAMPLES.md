# Camera Streaming API - Usage Examples

Complete guide for testing and using the multi-device camera streaming endpoints.

## 📋 Table of Contents
- [ESP32 Upload Examples](#esp32-upload-examples)
- [Frontend Consumption Examples](#frontend-consumption-examples)
- [Testing with cURL](#testing-with-curl)
- [Testing with Postman](#testing-with-postman)
- [Browser Testing](#browser-testing)

---

## 🎥 ESP32 Upload Examples

### ESP32 Firmware Configuration

```cpp
// config.h or main.cpp
#define BACKEND_SERVER_HOST "embedded-smarthome.fly.dev"
#define BACKEND_SERVER_PORT 80
#define DEVICE_ID "db_001"  // Change for each doorbell: db_001, db_002, db_003
#define API_TOKEN "d8ac2f1ee97b4a8b3f299696773e807e735284c47cfc30aadef1287e10a53b6d"

// Streaming endpoint paths
#define CAMERA_UPLOAD_PATH "/api/v1/devices/" DEVICE_ID "/stream/camera"
#define AUDIO_UPLOAD_PATH "/api/v1/devices/" DEVICE_ID "/stream/audio"
```

### Upload Camera Frame (ESP32)

```cpp
#include <HTTPClient.h>

void sendCameraFrame(camera_fb_t *fb, int frameId) {
  HTTPClient http;

  // Build URL: http://embedded-smarthome.fly.dev/api/v1/devices/db_001/stream/camera
  String url = "http://" + String(BACKEND_SERVER_HOST) + CAMERA_UPLOAD_PATH;

  http.begin(url);
  http.addHeader("Authorization", "Bearer " + String(API_TOKEN));

  // Create multipart form data
  String boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW";
  http.addHeader("Content-Type", "multipart/form-data; boundary=" + boundary);

  String bodyStart = "--" + boundary + "\r\n";
  bodyStart += "Content-Disposition: form-data; name=\"frame\"; filename=\"frame.jpg\"\r\n";
  bodyStart += "Content-Type: image/jpeg\r\n\r\n";

  String bodyEnd = "\r\n--" + boundary + "\r\n";
  bodyEnd += "Content-Disposition: form-data; name=\"frame_id\"\r\n\r\n";
  bodyEnd += String(frameId) + "\r\n";
  bodyEnd += "--" + boundary + "\r\n";
  bodyEnd += "Content-Disposition: form-data; name=\"timestamp\"\r\n\r\n";
  bodyEnd += String(millis()) + "\r\n";
  bodyEnd += "--" + boundary + "--\r\n";

  int totalLen = bodyStart.length() + fb->len + bodyEnd.length();

  // Send request
  http.addHeader("Content-Length", String(totalLen));

  WiFiClient *stream = http.getStreamPtr();
  stream->print(bodyStart);
  stream->write(fb->buf, fb->len);
  stream->print(bodyEnd);

  int httpCode = http.POST("");

  if (httpCode == 200) {
    String response = http.getString();
    Serial.println("[Camera] Frame uploaded: " + response);
  } else {
    Serial.printf("[Camera] Upload failed: %d\n", httpCode);
  }

  http.end();
}

// Usage in loop
void loop() {
  camera_fb_t *fb = esp_camera_fb_get();
  if (fb) {
    static int frameId = 0;
    sendCameraFrame(fb, frameId++);
    esp_camera_fb_return(fb);
    delay(200); // 5 FPS
  }
}
```

### Upload Audio Chunk (ESP32)

```cpp
void sendAudioChunk(uint8_t *audioData, size_t length, int sequence) {
  HTTPClient http;

  // Build URL: http://embedded-smarthome.fly.dev/api/v1/devices/db_001/stream/audio
  String url = "http://" + String(BACKEND_SERVER_HOST) + AUDIO_UPLOAD_PATH;

  http.begin(url);
  http.addHeader("Authorization", "Bearer " + String(API_TOKEN));
  http.addHeader("Content-Type", "application/octet-stream");
  http.addHeader("X-Sequence", String(sequence));

  int httpCode = http.POST(audioData, length);

  if (httpCode == 200) {
    Serial.printf("[Audio] Chunk %d uploaded\n", sequence);
  } else {
    Serial.printf("[Audio] Upload failed: %d\n", httpCode);
  }

  http.end();
}
```

---

## 🌐 Frontend Consumption Examples

### HTML - View Single Doorbell

```html
<!DOCTYPE html>
<html>
<head>
  <title>Front Door Camera</title>
  <style>
    .camera-feed {
      width: 640px;
      height: 480px;
      border: 2px solid #333;
      border-radius: 8px;
    }
    .stats {
      margin-top: 10px;
      font-family: monospace;
    }
  </style>
</head>
<body>
  <h1>Front Door Camera (db_001)</h1>

  <!-- Live MJPEG stream -->
  <img
    src="http://embedded-smarthome.fly.dev/api/v1/stream/camera/db_001"
    alt="Front Door Camera"
    class="camera-feed"
  />

  <!-- Stats -->
  <div class="stats" id="stats">Loading stats...</div>

  <script>
    // Fetch stats every second
    setInterval(async () => {
      const res = await fetch('http://embedded-smarthome.fly.dev/api/v1/stream/stats/db_001');
      const data = await res.json();

      document.getElementById('stats').innerHTML = `
        <strong>Stats for db_001:</strong><br>
        Frames Received: ${data.stats.framesReceived}<br>
        Current Buffer: ${data.stats.currentFrames} frames<br>
        Connected Clients: ${data.stats.videoClientsConnected}<br>
        Stream Active: ${data.stats.streamActive.video ? 'Yes' : 'No'}
      `;
    }, 1000);
  </script>
</body>
</html>
```

### HTML - Multi-Camera Grid View

```html
<!DOCTYPE html>
<html>
<head>
  <title>All Doorbell Cameras</title>
  <style>
    .camera-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 20px;
      padding: 20px;
    }
    .camera-card {
      border: 2px solid #ddd;
      border-radius: 8px;
      padding: 15px;
      background: #f9f9f9;
    }
    .camera-card.active {
      border-color: #4CAF50;
    }
    .camera-feed {
      width: 100%;
      height: auto;
      border-radius: 4px;
    }
    .camera-title {
      font-size: 18px;
      font-weight: bold;
      margin-bottom: 10px;
    }
    .camera-stats {
      font-family: monospace;
      font-size: 12px;
      margin-top: 10px;
    }
  </style>
</head>
<body>
  <h1>Security Camera Dashboard</h1>

  <div class="camera-grid" id="camera-grid">
    <!-- Dynamically populated -->
  </div>

  <script>
    const doorbells = ['db_001', 'db_002', 'db_003'];
    const grid = document.getElementById('camera-grid');

    // Create camera cards
    doorbells.forEach(deviceId => {
      const card = document.createElement('div');
      card.className = 'camera-card';
      card.id = `card-${deviceId}`;

      card.innerHTML = `
        <div class="camera-title">${deviceId.toUpperCase()} - Front Door</div>
        <img
          src="http://embedded-smarthome.fly.dev/api/v1/stream/camera/${deviceId}"
          alt="${deviceId}"
          class="camera-feed"
          onerror="this.style.display='none'"
          onload="this.style.display='block'"
        />
        <div class="camera-stats" id="stats-${deviceId}">
          Connecting...
        </div>
      `;

      grid.appendChild(card);
    });

    // Update stats for all cameras
    async function updateStats() {
      const res = await fetch('http://embedded-smarthome.fly.dev/api/v1/stream/stats');
      const data = await res.json();

      doorbells.forEach(deviceId => {
        const stats = data.devices[deviceId];
        const card = document.getElementById(`card-${deviceId}`);
        const statsDiv = document.getElementById(`stats-${deviceId}`);

        if (stats && stats.streamActive.video) {
          card.classList.add('active');
          statsDiv.innerHTML = `
            ✓ Active | Frames: ${stats.framesReceived} | Clients: ${stats.videoClientsConnected}
          `;
        } else {
          card.classList.remove('active');
          statsDiv.innerHTML = '✗ Offline';
        }
      });
    }

    setInterval(updateStats, 1000);
    updateStats();
  </script>
</body>
</html>
```

### React Component

```jsx
import React, { useState, useEffect } from 'react';

function DoorbellCamera({ deviceId }) {
  const [stats, setStats] = useState(null);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/v1/stream/stats/${deviceId}`);
        const data = await res.json();
        setStats(data.stats);
        setIsActive(data.stats.streamActive.video);
      } catch (error) {
        console.error('Failed to fetch stats:', error);
        setIsActive(false);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [deviceId]);

  return (
    <div className={`camera-card ${isActive ? 'active' : 'inactive'}`}>
      <h3>{deviceId.toUpperCase()}</h3>

      <img
        src={`/api/v1/stream/camera/${deviceId}`}
        alt={`Camera ${deviceId}`}
        className="camera-stream"
      />

      {stats && (
        <div className="stats">
          <p>Status: {isActive ? '🟢 Active' : '🔴 Offline'}</p>
          <p>Frames: {stats.framesReceived}</p>
          <p>Clients: {stats.videoClientsConnected}</p>
          <p>Buffer: {stats.currentFrames}/{stats.bufferUsage.frames}</p>
        </div>
      )}
    </div>
  );
}

function Dashboard() {
  return (
    <div className="dashboard">
      <h1>Security Camera Dashboard</h1>
      <div className="camera-grid">
        <DoorbellCamera deviceId="db_001" />
        <DoorbellCamera deviceId="db_002" />
        <DoorbellCamera deviceId="db_003" />
      </div>
    </div>
  );
}

export default Dashboard;
```

---

## 💻 Testing with cURL

### Test Camera Upload (ESP32 simulation)

```bash
# Simulate ESP32 uploading a camera frame
curl -X POST http://embedded-smarthome.fly.dev/api/v1/devices/db_001/stream/camera \
  -H "Authorization: Bearer d8ac2f1ee97b4a8b3f299696773e807e735284c47cfc30aadef1287e10a53b6d" \
  -F "frame=@test-frame.jpg" \
  -F "frame_id=123" \
  -F "timestamp=1732800000000"
```

**Expected Response:**
```json
{
  "success": true,
  "device_id": "db_001",
  "frame_id": 0,
  "size": 9245,
  "clients": 0
}
```

### Test Audio Upload

```bash
# Simulate ESP32 uploading audio chunk
curl -X POST http://embedded-smarthome.fly.dev/api/v1/devices/db_001/stream/audio \
  -H "Authorization: Bearer d8ac2f1ee97b4a8b3f299696773e807e735284c47cfc30aadef1287e10a53b6d" \
  -H "Content-Type: application/octet-stream" \
  -H "X-Sequence: 1" \
  --data-binary "@audio-chunk.pcm"
```

### Get Snapshot from Specific Device

```bash
# Download latest snapshot from db_001
curl http://embedded-smarthome.fly.dev/api/v1/stream/snapshot/db_001 > snapshot-db001.jpg

# Download from any active device
curl http://embedded-smarthome.fly.dev/api/v1/stream/snapshot > snapshot-latest.jpg
```

### Get Stats for Specific Device

```bash
# Stats for db_001
curl http://embedded-smarthome.fly.dev/api/v1/stream/stats/db_001

# Stats for all devices
curl http://embedded-smarthome.fly.dev/api/v1/stream/stats
```

**Response (all devices):**
```json
{
  "success": true,
  "summary": {
    "totalDevices": 3,
    "activeDevices": 2,
    "totalVideoClients": 5,
    "totalAudioClients": 2
  },
  "devices": {
    "db_001": {
      "deviceId": "db_001",
      "framesReceived": 1234,
      "videoClientsConnected": 2,
      "streamActive": { "video": true, "audio": false }
    },
    "db_002": {
      "deviceId": "db_002",
      "framesReceived": 567,
      "videoClientsConnected": 3,
      "streamActive": { "video": true, "audio": true }
    }
  },
  "activeDevicesList": [
    { "deviceId": "db_001", "videoActive": true, "audioActive": false },
    { "deviceId": "db_002", "videoActive": true, "audioActive": true }
  ]
}
```

### Stream Camera to Terminal (View MJPEG frames)

```bash
# Stream frames from db_001 (will show MJPEG headers)
curl http://embedded-smarthome.fly.dev/api/v1/stream/camera/db_001

# Stream from all devices
curl http://embedded-smarthome.fly.dev/api/v1/stream/camera
```

### Clear Buffers (Debug)

```bash
# Clear buffer for specific device
curl -X DELETE http://embedded-smarthome.fly.dev/api/v1/stream/clear/db_001

# Clear all buffers
curl -X DELETE http://embedded-smarthome.fly.dev/api/v1/stream/clear
```

---

## 📮 Testing with Postman

### 1. Upload Camera Frame

- **Method:** POST
- **URL:** `http://embedded-smarthome.fly.dev/api/v1/devices/db_001/stream/camera`
- **Headers:**
  - `Authorization: Bearer d8ac2f1ee97b4a8b3f299696773e807e735284c47cfc30aadef1287e10a53b6d`
- **Body:** (form-data)
  - `frame`: [File] Select a JPEG image
  - `frame_id`: 123
  - `timestamp`: 1732800000000

### 2. View Stream

- **Method:** GET
- **URL:** `http://embedded-smarthome.fly.dev/api/v1/stream/camera/db_001`
- Click **Send**
- In the response, click **Preview** to see the MJPEG stream

### 3. Get Snapshot

- **Method:** GET
- **URL:** `http://embedded-smarthome.fly.dev/api/v1/stream/snapshot/db_001`
- Click **Send**
- Click **Preview** to view the image

### 4. Get Stats

- **Method:** GET
- **URL:** `http://embedded-smarthome.fly.dev/api/v1/stream/stats/db_001`
- Click **Send** to see JSON stats

---

## 🌐 Browser Testing

### Quick Test URLs

Open these in your browser:

#### Single Device Streams
```
http://embedded-smarthome.fly.dev/api/v1/stream/camera/db_001
http://embedded-smarthome.fly.dev/api/v1/stream/camera/db_002
http://embedded-smarthome.fly.dev/api/v1/stream/camera/db_003
```

#### Snapshots
```
http://embedded-smarthome.fly.dev/api/v1/stream/snapshot/db_001
http://embedded-smarthome.fly.dev/api/v1/stream/snapshot
```

#### Stats
```
http://embedded-smarthome.fly.dev/api/v1/stream/stats/db_001
http://embedded-smarthome.fly.dev/api/v1/stream/stats
```

---

## 🔍 Troubleshooting

### ESP32 Getting 404 Error

**Problem:** ESP32 receives 404 when uploading frames

**Solution:** Verify the path includes the device_id:
```cpp
// ❌ WRONG
#define CAMERA_PATH "/api/v1/doorbell/camera-stream"

// ✅ CORRECT
#define CAMERA_PATH "/api/v1/devices/db_001/stream/camera"
```

### ESP32 Getting 403 Forbidden

**Problem:** Device ID in URL doesn't match authenticated device

**Solution:** Ensure device_id in URL matches the device token:
- Token for `db_001` can ONLY POST to `/devices/db_001/stream/camera`
- Cannot post to `/devices/db_002/stream/camera`

### No Frames Showing in Browser

**Checklist:**
1. ✅ ESP32 is uploading frames (check backend logs)
2. ✅ Device is authenticated correctly
3. ✅ Stream is active (check `/stream/stats/db_001`)
4. ✅ Browser can reach backend (try `/stream/snapshot/db_001` first)

### Stream Shows Old/Stale Frames

**Solution:** Clear the buffer:
```bash
curl -X DELETE http://embedded-smarthome.fly.dev/api/v1/stream/clear/db_001
```

---

## 📊 Performance Tips

### For ESP32
- Upload at 5 FPS (200ms interval) for smooth streaming
- Use JPEG quality 12-15 for balance of size/quality
- Keep frames under 10KB for best performance

### For Frontend
- Use `<img>` tag for MJPEG (simplest, works everywhere)
- For advanced control, use `fetch()` with ReadableStream
- Monitor stats to detect connectivity issues

### For Backend
- Each device buffer holds 30 frames (~270KB per device)
- Supports 10-20 concurrent clients per device
- Clear inactive buffers periodically to save memory

---

## 🚀 Quick Start Checklist

1. ✅ Update ESP32 firmware with new paths:
   - `/api/v1/devices/{device_id}/stream/camera`
   - `/api/v1/devices/{device_id}/stream/audio`

2. ✅ Test upload with cURL or Postman

3. ✅ Verify frames in buffer: `GET /api/v1/stream/stats/db_001`

4. ✅ View stream in browser: Open `GET /api/v1/stream/camera/db_001`

5. ✅ Build frontend dashboard with multiple camera feeds

---

## 📝 API Endpoint Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/devices/:device_id/stream/camera` | Upload frame from ESP32 |
| POST | `/api/v1/devices/:device_id/stream/audio` | Upload audio from ESP32 |
| GET | `/api/v1/stream/camera/:device_id` | View specific camera stream |
| GET | `/api/v1/stream/camera` | View all cameras (mixed) |
| GET | `/api/v1/stream/snapshot/:device_id` | Get snapshot from device |
| GET | `/api/v1/stream/snapshot` | Get snapshot from any device |
| GET | `/api/v1/stream/stats/:device_id` | Get stats for device |
| GET | `/api/v1/stream/stats` | Get stats for all devices |
| DELETE | `/api/v1/stream/clear/:device_id` | Clear device buffer |
| DELETE | `/api/v1/stream/clear` | Clear all buffers |

