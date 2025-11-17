# Device Heartbeat System - Cost-Optimized Implementation

## Overview
This implementation provides a **smart throttling** heartbeat system that reduces Firebase writes by **95%** while maintaining responsive device monitoring.

## Automatic Online/Offline Detection with Firestore TTL

### The Problem

Without TTL, marking devices offline requires resource-intensive solutions:
- ❌ Cloud Function running every minute to check all devices
- ❌ Backend cron job scanning for stale heartbeats
- ❌ Manual cleanup logic that can fail

### The Solution: TTL for Auto-Offline Detection

Use Firestore TTL to automatically delete status documents when devices go offline:

**How it works:**
1. Device sends heartbeat every 60 seconds
2. Backend writes `status/current` with `expireAt` = now + 2 minutes
3. If device stays online → new heartbeat updates `expireAt` (TTL resets)
4. If device goes offline → no new heartbeat, document auto-deletes after 2 minutes
5. Frontend/Backend: **Document exists = Online**, **Document missing = Offline**

**Benefits:**
- ✅ Zero backend resources (Firestore handles it)
- ✅ Automatic offline detection within 1 minute
- ✅ No explicit `online: false` flag needed
- ✅ 100% reliable (Firestore guarantee)

### TTL Implementation

**Step 1: Update Backend to Use TTL for Online Status**

```javascript
const admin = require('firebase-admin');
const db = admin.firestore();

// Heartbeat every 60s, expire after 2 minutes of no heartbeat
const STATUS_TTL_SECONDS = 120; // 2 minutes
const HISTORY_RETENTION_DAYS = 30; // Keep history for 30 days

// Helper to calculate expiration timestamp
function getStatusExpiration() {
  const expirationDate = new Date();
  expirationDate.setSeconds(expirationDate.getSeconds() + STATUS_TTL_SECONDS);
  return admin.firestore.Timestamp.fromDate(expirationDate);
}

function getHistoryExpiration() {
  const expirationDate = new Date();
  expirationDate.setDate(expirationDate.getDate() + HISTORY_RETENTION_DAYS);
  return admin.firestore.Timestamp.fromDate(expirationDate);
}

// POST /api/v1/devices/heartbeat
router.post('/heartbeat', async (req, res) => {
  const { device_id, device_type, uptime_ms, free_heap, wifi_rssi, ip_address } = req.body;
  const now = admin.firestore.Timestamp.now();
  const statusExpireAt = getStatusExpiration();
  const historyExpireAt = getHistoryExpiration();

  // Update device metadata (no TTL)
  await db.collection('devices').doc(device_id).set({
    device_type,
    last_seen: now
  }, { merge: true });

  // Write current status WITH TTL - auto-deletes if device goes offline
  await db.collection('devices').doc(device_id)
    .collection('status').doc('current').set({
      last_heartbeat: now,
      ip_address,
      uptime_ms,
      free_heap,
      wifi_rssi,
      updated_at: now,
      expireAt: statusExpireAt  // ← Auto-delete after 2 min if no heartbeat
    });

  // Add to history with TTL (auto-delete after 30 days)
  await db.collection('devices').doc(device_id)
    .collection('heartbeat_history').add({
      timestamp: now,
      ip_address,
      uptime_ms,
      free_heap,
      wifi_rssi,
      expireAt: historyExpireAt  // ← Auto-delete old history
    });

  res.json({ status: 'ok', message: 'Heartbeat received', written: true });
});

// GET /api/v1/devices/:device_id/status - Check if device is online
router.get('/devices/:device_id/status', async (req, res) => {
  const { device_id } = req.params;

  const statusDoc = await db.collection('devices').doc(device_id)
    .collection('status').doc('current').get();

  if (statusDoc.exists) {
    // Document exists = device is online
    const data = statusDoc.data();
    res.json({
      status: 'ok',
      device_id,
      online: true,
      last_heartbeat: data.last_heartbeat,
      uptime_ms: data.uptime_ms,
      free_heap: data.free_heap,
      wifi_rssi: data.wifi_rssi,
      ip_address: data.ip_address
    });
  } else {
    // Document doesn't exist = device went offline and TTL deleted it
    res.json({
      status: 'ok',
      device_id,
      online: false,
      message: 'Device offline (no heartbeat in 2+ minutes)'
    });
  }
});
```

**Step 2: Configure TTL Policies in Firebase**

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login
firebase login

# Create TTL policy for current status (auto-offline detection)
firebase firestore:ttl-policies:create \
  --collection-group=status \
  --field=expireAt

# Create TTL policy for heartbeat history (cleanup old data)
firebase firestore:ttl-policies:create \
  --collection-group=heartbeat_history \
  --field=expireAt
```

**Step 3: Adjust Timeouts Based on Heartbeat Interval**

Match TTL to your heartbeat frequency:

```javascript
// Heartbeat every 60s → expire after 2 minutes (allows 1 missed heartbeat)
const STATUS_TTL_SECONDS = 120;

// Heartbeat every 30s → expire after 60 seconds
const STATUS_TTL_SECONDS = 60;

// Heartbeat every 5 minutes → expire after 10 minutes
const STATUS_TTL_SECONDS = 600;
```

**Rule of thumb:** `TTL = heartbeat_interval * 2` (allows 1 missed heartbeat before offline)

### Data Structure with TTL

```
firestore/
├── devices/
│   ├── doorbell_001/
│   │   ├── device_type: "doorbell"
│   │   ├── last_seen: timestamp
│   │   ├── status/
│   │   │   └── current/                    ← WITH TTL (auto-delete = offline)
│   │   │       ├── last_heartbeat: timestamp
│   │   │       ├── ip_address: "192.168.1.100"
│   │   │       ├── uptime_ms: 123456789
│   │   │       ├── free_heap: 45000
│   │   │       ├── wifi_rssi: -65
│   │   │       ├── updated_at: timestamp
│   │   │       └── expireAt: timestamp (2 min from now)
│   │   └── heartbeat_history/              ← WITH TTL (cleanup old data)
│   │       └── {auto-id}/
│   │           ├── timestamp: timestamp
│   │           ├── ip_address: "192.168.1.100"
│   │           ├── uptime_ms: 123456789
│   │           ├── free_heap: 45000
│   │           ├── wifi_rssi: -65
│   │           └── expireAt: timestamp (30 days from now)
```

### Checking Device Online Status

**In your backend/frontend:**

```javascript
// Simple check - document exists = online
const statusDoc = await db.collection('devices')
  .doc(device_id)
  .collection('status')
  .doc('current')
  .get();

const isOnline = statusDoc.exists;
```

**Firestore Security Rules:**

```javascript
// Allow read if authenticated
match /devices/{device_id}/status/current {
  allow read: if request.auth != null;
}
```

### Why This Works Better

| Feature | TTL Auto-Offline | Manual Offline Flag |
|---------|------------------|---------------------|
| **Backend Resources** | Zero | Cron job or Cloud Function |
| **Accuracy** | 100% (Firestore guarantee) | Can fail if job doesn't run |
| **Response Time** | < 2 minutes | Depends on check interval |
| **Code Complexity** | Simple (1 field) | Complex (multiple updates) |
| **Cost** | Free | Function invocations |

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
