# Firestore TTL Setup for Automatic Online/Offline Detection

## Overview
This backend uses **Firestore Time-To-Live (TTL)** policies to automatically delete status documents when devices go offline. This eliminates the need for resource-intensive cleanup jobs.

## How It Works

**Key Concept:** Document exists = Online, Document missing = Offline

1. Device sends heartbeat every 60 seconds
2. Backend writes `status/current` with `expireAt` = now + 2 minutes
3. If device stays online → new heartbeat updates `expireAt` (TTL resets)
4. If device goes offline → no new heartbeat, document auto-deletes after 2 minutes
5. Frontend/Backend: **Document exists = Online**, **Document missing = Offline**

## Benefits

- ✅ Zero backend resources (Firestore handles it automatically)
- ✅ Automatic offline detection within 1 minute
- ✅ No explicit `online: false` flag needed
- ✅ 100% reliable (Firestore guarantee)
- ✅ Automatic cleanup of old history data

## Setup Instructions

### Step 1: Install Firebase CLI

```bash
npm install -g firebase-tools
```

### Step 2: Login to Firebase

```bash
firebase login
```

### Step 3: Create TTL Policy for Status (Auto-Offline Detection)

This policy automatically deletes live status documents after 2 minutes of no heartbeat:

```bash
firebase firestore:ttl-policies:create \
  --collection-group=live_status \
  --field=expireAt
```

**Purpose:** When devices go offline, the live_status/heartbeat document is automatically deleted by Firestore after the `expireAt` timestamp passes. This makes online detection as simple as checking if the document exists.

### Step 4: Create TTL Policy for History (Cleanup Old Data)

This policy automatically deletes heartbeat history after 30 days:

```bash
firebase firestore:ttl-policies:create \
  --collection-group=heartbeat_history \
  --field=expireAt
```

**Purpose:** Keeps database size under control by automatically removing old heartbeat history data that's no longer needed.

### Step 5: Verify TTL Policies

List all TTL policies to confirm they were created:

```bash
firebase firestore:ttl-policies:list
```

You should see:
```
Collection Group: live_status
Field: expireAt
Status: Active

Collection Group: heartbeat_history
Field: expireAt
Status: Active
```

## Data Structure

### Heartbeat Document (with TTL)
```
devices/{device_id}/live_status/heartbeat/
├── last_heartbeat: timestamp
├── ip_address: "192.168.1.100"
├── uptime_ms: 123456789
├── free_heap: 45000
├── wifi_rssi: -65
├── updated_at: timestamp
└── expireAt: timestamp (2 min from now) ← AUTO-DELETES when time passes
```

### Device State Document (with TTL)
```
devices/{device_id}/live_status/device_state/
├── camera_active: boolean
├── mic_active: boolean
├── recording: boolean
├── motion_detected: boolean
├── battery_level: number
├── last_updated: timestamp
└── expireAt: timestamp (2 min from now) ← AUTO-DELETES when device offline
```

### History Document (with TTL)
```
devices/{device_id}/heartbeat_history/{auto-id}/
├── timestamp: timestamp
├── ip_address: "192.168.1.100"
├── uptime_ms: 123456789
├── free_heap: 45000
├── wifi_rssi: -65
└── expireAt: timestamp (30 days from now) ← AUTO-DELETES old data
```

## Configuration Constants

In `controllers/devices.js`:

```javascript
const STATUS_TTL_SECONDS = 120; // 2 minutes - device offline detection
const HISTORY_RETENTION_DAYS = 30; // 30 days - history data retention
```

**Rule of thumb:** `STATUS_TTL = heartbeat_interval * 2` (allows 1 missed heartbeat before offline)

## Checking Online Status

### Backend (Node.js)
```javascript
const statusDoc = await db.collection('devices')
  .doc(device_id)
  .collection('live_status')
  .doc('heartbeat')
  .get();

const isOnline = statusDoc.exists; // Simple!
```

### Frontend (JavaScript)
```javascript
const response = await fetch(`/api/v1/devices/${device_id}/status`);
const data = await response.json();
console.log(`Device is ${data.online ? 'online' : 'offline'}`);
```

## Troubleshooting

### TTL Not Working?

1. **Check TTL policies are active:**
   ```bash
   firebase firestore:ttl-policies:list
   ```

2. **Verify expireAt field is set:**
   Check Firestore Console → devices/{device_id}/status/current → should have `expireAt` field

3. **Wait for TTL processing:**
   TTL deletion can take up to 72 hours after expiration (not instant). For testing, use short TTL values.

4. **Check backend logs:**
   ```bash
   fly logs
   ```
   Look for: `[Heartbeat] {device_id} - Writing to Firebase`

### Still Showing Online After 2 Minutes?

- TTL processing is **not real-time** (can take minutes to hours)
- For critical applications, combine TTL with timestamp checks:
  ```javascript
  const isOnline = statusDoc.exists &&
    (Date.now() - statusDoc.data().last_heartbeat.toMillis() < 120000);
  ```

## References

- [Firebase TTL Documentation](https://firebase.google.com/docs/firestore/ttl)
- [Firebase CLI Reference](https://firebase.google.com/docs/cli)
