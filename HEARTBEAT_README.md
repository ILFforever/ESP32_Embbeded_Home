# Device Heartbeat System - Cost-Optimized Implementation

## Overview
This implementation provides a **smart throttling** heartbeat system that reduces Firebase writes by **95%** while maintaining responsive device monitoring.

## Security - Device Authentication

**⚠️ IMPORTANT**: All device endpoints are protected with API token authentication.

### Why Authentication?
Without authentication, anyone could:
- Send fake heartbeat data
- Impersonate your devices
- Spam your API and increase costs
- Inject false sensor readings

### How It Works
1. Each device has a unique **device_id** + **API token** (64-character hex string)
2. ESP32 sends token in `Authorization: Bearer <token>` header
3. Backend validates token matches device_id in Firestore
4. Invalid/missing token → 401/403 error

### Setup Process

**Step 1: Register Device**

Call the registration endpoint to create a new device and generate its token:

```bash
curl -X POST https://embedded-smarthome.fly.dev/api/v1/devices/register \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "doorbell_001",
    "device_type": "doorbell",
    "name": "Front Doorbell"
  }'
```

**Response:**
```json
{
  "status": "ok",
  "message": "Device registered successfully",
  "device_id": "doorbell_001",
  "api_token": "a1b2c3d4e5f6...64chars",
  "warning": "Save this token securely! It will not be shown again."
}
```

**⚠️ SAVE THE TOKEN!** It's only shown once during registration.

**Step 2: Configure ESP32**

Update `src/main.cpp` with your device credentials:

```cpp
initHeartbeat(
  "https://embedded-smarthome.fly.dev",  // Your backend URL
  "doorbell_001",                         // Device ID (same as registration)
  "doorbell",                              // Device type
  "a1b2c3d4e5f6...64chars"               // API token from Step 1
);
```

**Step 3: Flash and Test**

Upload to ESP32 and check serial output:
```
[Heartbeat] Initialized
  Server: https://embedded-smarthome.fly.dev
  Device: doorbell_001 (doorbell)
  Token: ***configured***
[Heartbeat] ✓ Sent (code: 200)
```

### Token Security Features

- **64-character hex** (256-bit entropy)
- **Device-specific** (each device has unique token)
- **Revocable** (set `disabled: true` in Firestore)
- **Firebase-stored** (not hardcoded in backend)

### Revoking a Device

If a device is compromised:

```javascript
// In Firebase Console or via Admin SDK
db.collection('devices').doc('doorbell_001').update({
  disabled: true
});
```

The device will receive `403 Forbidden` on next heartbeat.

## Architecture

### Flow
```
ESP32 → POST every 60s → Backend (always responds OK)
                            ↓
                    Smart Throttling:
                    - 5min elapsed? ✓ Write
                    - Status changed? ✓ Write
                    - Sensor delta > 5%? ✓ Write
                    - Otherwise: Cache only
                            ↓
                    Firebase (only when needed)
```

## Cost Analysis

### Without Throttling (Naive Approach)
- **Devices**: 2 (doorbell + hub)
- **Heartbeat**: Every 60s = 1,440/device/day
- **Writes per heartbeat**: 2 (status + device doc)
- **Total heartbeat writes**: 5,760/day
- **Sensor writes**: ~2,880/day (5 sensors, every 5 min)
- **TOTAL**: ~8,640 writes/day (43% of free tier)

### With Smart Throttling ✅
- **Heartbeat writes**: 288/device/day (every 5 min) = 576/day
- **Sensor writes**: ~500/day (only significant changes)
- **TOTAL**: ~1,076 writes/day (5% of free tier)
- **Headroom**: 95% free for scaling!

## Firebase Free Tier Limits
- **20,000 writes/day** ✅
- **50,000 reads/day** ✅
- **1GB storage** ✅

## Backend Endpoints

### 1. POST /api/v1/devices/heartbeat
**Purpose**: Receive device heartbeat (ESP32 → Backend)

**Payload**:
```json
{
  "device_id": "doorbell_001",
  "device_type": "doorbell",
  "uptime_ms": 123456789,
  "free_heap": 45000,
  "wifi_rssi": -65,
  "ip_address": "192.168.1.100"
}
```

**Response**:
```json
{
  "status": "ok",
  "message": "Heartbeat received",
  "written": false,
  "next_write_in": 120000
}
```

### 2. POST /api/v1/devices/sensor
**Purpose**: Receive sensor data

**Payload**:
```json
{
  "device_id": "doorbell_001",
  "sensors": {
    "temperature": 25.5,
    "humidity": 60.2,
    "motion": 1
  }
}
```

### 3. GET /api/v1/devices/:device_id/status
**Purpose**: Get current device status

**Response**:
```json
{
  "status": "ok",
  "device_id": "doorbell_001",
  "online": true,
  "last_seen": "2025-11-16T14:45:00.000Z",
  "uptime_ms": 123456789,
  "free_heap": 45000,
  "wifi_rssi": -65
}
```

## Firestore Data Structure

```
firestore/
├── devices/
│   ├── doorbell_001/
│   │   ├── type: "doorbell"
│   │   ├── last_seen: timestamp
│   │   ├── status/
│   │   │   └── current/
│   │   │       ├── online: true
│   │   │       ├── last_heartbeat: timestamp
│   │   │       ├── ip_address: "192.168.1.100"
│   │   │       ├── uptime_ms: 123456789
│   │   │       ├── free_heap: 45000
│   │   │       └── wifi_rssi: -65
│   │   └── sensors/
│   │       └── current/
│   │           ├── temperature: 25.5
│   │           ├── humidity: 60.2
│   │           └── last_updated: timestamp
```

## ESP32 Implementation

### Configuration
Update in `main.cpp` setup():
```cpp
// Update server URL to your deployed backend
initHeartbeat("http://your-server.fly.dev", "doorbell_001", "doorbell");
```

### Heartbeat Task
Runs every 60 seconds:
```cpp
Task taskSendServerHeartbeat(60000, TASK_FOREVER, &sendServerHeartbeatTask);
```

### Disconnect Warnings
Automatically sends warnings when modules disconnect for 30+ seconds:
```cpp
sendDisconnectWarning("camera", true);  // Module disconnected
sendDisconnectWarning("amp", true);     // Module disconnected
```

## Features

### 1. Smart Throttling
- **Time-based**: Write every 5 minutes minimum
- **Status-based**: Write immediately when online/offline status changes
- **Value-based**: Write when sensor values change by >5%

### 2. Always Responsive
- ESP32 **always gets OK response** (backend health check)
- Backend caches in memory
- Firebase only written when needed

### 3. Cost Efficient
- 95% reduction in Firebase writes
- Well within free tier limits
- Scalable to 10+ devices

### 4. Auto-Recovery
- Detects WiFi disconnections
- Detects module disconnections (camera, amp)
- Sends alerts to server

## Deployment

### Backend (Fly.io)
1. Ensure Firebase credentials are set in `.env`:
   ```
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_PRIVATE_KEY=your-private-key
   FIREBASE_CLIENT_EMAIL=your-client-email
   ```

2. Deploy to Fly.io:
   ```bash
   fly deploy
   ```

### ESP32
1. Update server URL in `main.cpp`:
   ```cpp
   initHeartbeat("http://your-app.fly.dev", "doorbell_001", "doorbell");
   ```

2. Build and upload:
   ```bash
   pio run --target upload
   ```

## Monitoring

### Check Device Status
```bash
curl http://your-server.fly.dev/api/v1/devices/doorbell_001/status
```

### Backend Logs
```bash
fly logs
```

Look for:
- `[Heartbeat] doorbell_001 - Writing to Firebase` (every 5 min)
- `[Heartbeat] doorbell_001 - Throttled (no Firebase write)` (every 60s)

## Scaling

Current implementation supports:
- **10+ devices** within free tier
- **100+ sensors** with smart throttling
- **Minimal backend CPU** (simple caching)

## Future Enhancements

1. **Cloud Functions**: Add offline detection alerts
2. **Dashboard**: Real-time device status monitoring
3. **Analytics**: Historical sensor data tracking
4. **Alerts**: Email/SMS when devices go offline

## Troubleshooting

### ESP32 not sending heartbeats?
- Check WiFi connection: `WiFi.status() == WL_CONNECTED`
- Check server URL in `initHeartbeat()`
- Check serial output for `[Heartbeat]` messages

### Backend not writing to Firebase?
- Check Firebase credentials in `.env`
- Check `initializeFirebase()` in server logs
- Check Firestore rules allow writes

### High Firebase write count?
- Check backend logs for throttling messages
- Verify `WRITE_INTERVAL_MS = 5 * 60 * 1000` (5 minutes)
- Check if multiple devices have same `device_id`

## License
MIT
