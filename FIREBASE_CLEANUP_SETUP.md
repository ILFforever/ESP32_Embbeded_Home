# Firebase Status Cleanup - Setup Guide

## Problem
Firebase status records were never expiring or being marked offline. Devices stayed "online" forever even after disconnecting.

## Solution
Two implementation options provided:

---

## ✅ Option 1: Express Server Background Job (ACTIVE)

**Status:** ✅ Implemented and integrated into `server.js`

### What it does:
- Runs every 60 seconds as part of your Express server
- Marks devices offline if no heartbeat for 2 minutes
- Deletes status records older than 7 days

### Files:
- `services/statusCleanup.js` - Cleanup service
- `server.js` - Integrated with server startup/shutdown

### Usage:
```bash
# Service starts automatically with server
npm start

# Check cleanup stats
curl http://localhost:5000/api/v1/status-cleanup/stats
```

### Monitoring:
```javascript
// Response from /api/v1/status-cleanup/stats
{
  "status": "ok",
  "cleanup_service": {
    "totalChecks": 150,
    "devicesMarkedOffline": 12,
    "recordsDeleted": 3,
    "lastRunTime": "2025-11-17T10:30:00.000Z",
    "errors": 0,
    "isRunning": true,
    "uptimeSeconds": 9000
  }
}
```

### Configuration:
Edit `services/statusCleanup.js`:
```javascript
const OFFLINE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000;      // 60 seconds
const DELETE_OLD_RECORDS_AFTER_DAYS = 7;    // 7 days
```

### Pros:
- ✅ Simple - no additional services
- ✅ No extra costs
- ✅ Easy to debug and monitor

### Cons:
- ❌ Only runs when Express server is running
- ❌ Stops during server restarts

---

## Option 2: Firebase Cloud Functions (Alternative)

**Status:** 📁 Code provided but not deployed

### What it does:
- Runs independently on Firebase serverless infrastructure
- Scheduled via Cloud Scheduler (every 1 minute)
- Same cleanup logic as Option 1

### Files:
- `functions/cleanupDeviceStatus.js` - Cloud Function
- `functions/package.json` - Dependencies

### Setup:

#### 1. Install Firebase CLI
```bash
npm install -g firebase-tools
firebase login
```

#### 2. Initialize Firebase Functions
```bash
cd /path/to/ESP32_Embbeded_Home
firebase init functions

# Select:
# - Use existing project: YOUR_PROJECT_ID
# - Language: JavaScript
# - Install dependencies: Yes
```

#### 3. Copy function file
```bash
# The function is already in functions/cleanupDeviceStatus.js
# Just need to update functions/index.js:

# functions/index.js
const { cleanupDeviceStatus, cleanupDeviceStatusManual } = require('./cleanupDeviceStatus');
exports.cleanupDeviceStatus = cleanupDeviceStatus;
exports.cleanupDeviceStatusManual = cleanupDeviceStatusManual;
```

#### 4. Deploy
```bash
firebase deploy --only functions
```

#### 5. Verify
```bash
# Check deployment
firebase functions:list

# View logs
firebase functions:log --only cleanupDeviceStatus

# Manual trigger (for testing)
curl https://YOUR_PROJECT.cloudfunctions.net/cleanupDeviceStatusManual
```

### Configuration:
Edit `functions/cleanupDeviceStatus.js`:
```javascript
const OFFLINE_THRESHOLD_MS = 2 * 60 * 1000;
const DELETE_OLD_RECORDS_AFTER_DAYS = 7;

// Change schedule
.schedule('every 1 minutes') // Cron syntax: '* * * * *'
.timeZone('America/New_York')
```

### Pros:
- ✅ Runs independently (serverless)
- ✅ More reliable - doesn't depend on Express server
- ✅ Auto-scales
- ✅ Firebase manages scheduling

### Cons:
- ❌ Requires Firebase Blaze plan (pay-as-you-go)
- ❌ ~$0.40/million invocations + compute time
- ❌ Additional deployment complexity

### Cost Estimate (Cloud Functions):
```
Schedule: Every 1 minute = 43,200 invocations/month
Cost: ~$0.40/month (free tier covers ~2 million/month)
```

---

## Comparison

| Feature | Express Job (Option 1) | Cloud Functions (Option 2) |
|---------|------------------------|---------------------------|
| Reliability | Depends on server | Independent |
| Cost | Free | ~$0.40/month |
| Setup | ✅ Done | Needs deployment |
| Monitoring | `/api/v1/status-cleanup/stats` | Firebase Console |
| Scalability | Single server | Auto-scales |
| Dependencies | Express must run | None |

---

## Recommendation

**For Development:** Use **Option 1** (Express Job) ✅
- Already integrated and working
- No additional costs or setup
- Easy to monitor and debug

**For Production:** Consider **Option 2** (Cloud Functions)
- More reliable for mission-critical systems
- Independent of server health
- Better for distributed deployments

---

## Testing

### Test Option 1 (Express Job):
```bash
# Start server
npm start

# Check stats
curl http://localhost:5000/api/v1/status-cleanup/stats

# Watch logs
# Look for: [StatusCleanup] messages in server logs
```

### Test Option 2 (Cloud Functions):
```bash
# Deploy
firebase deploy --only functions:cleanupDeviceStatusManual

# Manual trigger
curl https://YOUR_PROJECT.cloudfunctions.net/cleanupDeviceStatusManual

# Check logs
firebase functions:log --only cleanupDeviceStatus
```

---

## Troubleshooting

### Devices still showing online after 2 minutes?

1. Check if cleanup service is running:
   ```bash
   curl http://localhost:5000/api/v1/status-cleanup/stats
   ```

2. Verify `last_heartbeat` timestamps in Firebase:
   ```javascript
   // Firebase Console → Firestore
   // Navigate to: devices/{device_id}/status/current
   // Check: last_heartbeat timestamp
   ```

3. Check server logs for cleanup messages:
   ```
   [StatusCleanup] Marking device_123 as OFFLINE (last seen 130s ago)
   ```

### Service not starting?

1. Check for errors in server logs
2. Verify Firebase is initialized before cleanup service starts
3. Check Firebase permissions

### High Firebase costs?

The cleanup service uses **batched writes** to minimize costs:
- Max 400 operations per batch
- Only writes when status changes
- Deletes old records to save storage

---

## Alternative: Firebase Security Rules

You can also add TTL (Time To Live) to auto-delete old documents:

```javascript
// firestore.rules
match /devices/{deviceId}/status/{statusId} {
  // Auto-delete documents older than 1 hour
  allow read;
  allow write: if request.auth != null;

  // Note: TTL requires Cloud Functions extension
  // See: https://firebase.google.com/products/extensions/delete-user-data
}
```

---

## Questions?

- **Which option should I use?**
  - Start with Option 1 (Express Job) - already implemented
  - Upgrade to Option 2 (Cloud Functions) if you need higher reliability

- **Can I use both?**
  - Not recommended - they would conflict
  - Choose one based on your needs

- **How much does this cost?**
  - Option 1: Free
  - Option 2: ~$0.40/month (usually within free tier)
