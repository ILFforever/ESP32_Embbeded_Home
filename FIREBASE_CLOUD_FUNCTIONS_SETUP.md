# Firebase Cloud Functions Setup Guide
Complete step-by-step guide to deploy device status cleanup using Firebase Cloud Functions

---

## 📋 Table of Contents
1. [Prerequisites](#prerequisites)
2. [Problem Statement](#problem-statement)
3. [Solution Overview](#solution-overview)
4. [Step-by-Step Setup](#step-by-step-setup)
5. [Configuration](#configuration)
6. [Deployment](#deployment)
7. [Verification](#verification)
8. [Monitoring](#monitoring)
9. [Troubleshooting](#troubleshooting)
10. [Cost Analysis](#cost-analysis)

---

## Prerequisites

### Required:
- ✅ Firebase project created (https://console.firebase.google.com)
- ✅ Firebase project on **Blaze (Pay as you go)** plan
- ✅ Node.js v18 or higher installed
- ✅ Firebase CLI installed globally
- ✅ Git repository cloned

### Check Your Setup:
```bash
# Check Node.js version (should be 18+)
node --version

# Check if Firebase CLI is installed
firebase --version

# If not installed, install Firebase CLI
npm install -g firebase-tools
```

---

## Problem Statement

### What Was Wrong?

**Issue:** Device status records in Firebase never expired or were marked offline.

**Symptoms:**
- Devices showed "online" forever, even after disconnecting
- No automatic cleanup of stale status records
- Status only computed on-demand when API queried
- Old records accumulated, wasting storage

**Example:**
```
Device "doorbell_001" disconnects at 10:00 AM
↓
Status in Firebase: { online: true, last_heartbeat: 10:00 AM }
↓
2 hours later...
↓
Still shows: { online: true, last_heartbeat: 10:00 AM }  ❌ Wrong!
```

---

## Solution Overview

### What We're Building

**Firebase Cloud Function:** A serverless scheduled function that:
- Runs automatically every 60 seconds
- Checks all devices in Firestore
- Marks devices offline if no heartbeat for 2+ minutes
- Deletes very old records (7+ days)
- Works independently of Express server
- Scales automatically

### Why Cloud Functions?

| Feature | Cloud Functions | Express Server |
|---------|----------------|----------------|
| **Runs 24/7** | ✅ Always | ❌ Only when server awake |
| **Reliability** | ✅ Firebase managed | ⚠️ Depends on Fly.io |
| **Scaling** | ✅ Automatic | ❌ Manual |
| **Maintenance** | ✅ Minimal | ⚠️ Requires monitoring |
| **Cost** | ~$0.40/month | Free (but unreliable) |

---

## Step-by-Step Setup

### Step 1: Install Firebase CLI

```bash
# Install Firebase CLI globally
npm install -g firebase-tools

# Verify installation
firebase --version
# Expected output: 13.x.x or higher

# Login to Firebase
firebase login
# This will open a browser for authentication
```

**Troubleshooting Step 1:**
- If `npm install -g` fails with permissions error, use: `sudo npm install -g firebase-tools`
- If login fails, try: `firebase login --reauth`

---

### Step 2: Configure Your Firebase Project

#### 2a. Get Your Firebase Project ID

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click on your project
3. Click the gear icon ⚙️ → Project Settings
4. Copy your **Project ID** (e.g., `esp32-smarthome-12345`)

#### 2b. Create `.firebaserc` File

**Location:** Root of your Backend directory (same level as `server.js`)

```bash
# Navigate to your Backend directory
cd /path/to/ESP32_Embbeded_Home

# Create .firebaserc file
cat > .firebaserc << 'EOF'
{
  "projects": {
    "default": "YOUR_FIREBASE_PROJECT_ID"
  }
}
EOF
```

**Replace `YOUR_FIREBASE_PROJECT_ID`** with your actual project ID from step 2a.

**Example `.firebaserc`:**
```json
{
  "projects": {
    "default": "esp32-smarthome-12345"
  }
}
```

---

### Step 3: Verify Firebase Configuration

```bash
# Check if firebase.json exists (should already be in repo)
cat firebase.json

# Expected output:
# {
#   "functions": {
#     "source": "functions",
#     "runtime": "nodejs18",
#     ...
#   }
# }

# List files in functions directory
ls -la functions/

# Expected files:
# - index.js (entry point)
# - cleanupDeviceStatus.js (cleanup function)
# - package.json (dependencies)
```

---

### Step 4: Install Function Dependencies

```bash
# Navigate to functions directory
cd functions

# Install dependencies
npm install

# Expected packages installed:
# - firebase-admin
# - firebase-functions

# Verify package.json
cat package.json
```

**Expected `functions/package.json`:**
```json
{
  "name": "esp32-smarthome-functions",
  "engines": {
    "node": "18"
  },
  "dependencies": {
    "firebase-admin": "^12.0.0",
    "firebase-functions": "^4.5.0"
  }
}
```

---

### Step 5: Review Function Code

#### Review `functions/index.js` (Entry Point)
```bash
cat functions/index.js
```

**Should export:**
```javascript
const { cleanupDeviceStatus, cleanupDeviceStatusManual } = require('./cleanupDeviceStatus');

exports.cleanupDeviceStatus = cleanupDeviceStatus;
exports.cleanupDeviceStatusManual = cleanupDeviceStatusManual;
```

#### Review `functions/cleanupDeviceStatus.js` (Main Logic)
```bash
# View first 50 lines
head -n 50 functions/cleanupDeviceStatus.js
```

**Key components:**
- `cleanupDeviceStatus` - Scheduled function (runs every 1 minute)
- `cleanupDeviceStatusManual` - HTTP trigger (for manual testing)
- `OFFLINE_THRESHOLD_MS = 2 * 60 * 1000` - 2 minutes
- `DELETE_OLD_RECORDS_AFTER_DAYS = 7` - Delete after 7 days

---

### Step 6: Enable Required Firebase Services

#### 6a. Enable Cloud Scheduler API

**Option A: Via Firebase Console**
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your Firebase project
3. Go to **APIs & Services** → **Library**
4. Search for "Cloud Scheduler API"
5. Click **Enable**

**Option B: Via Command Line**
```bash
# Enable Cloud Scheduler API
gcloud services enable cloudscheduler.googleapis.com --project=YOUR_PROJECT_ID
```

#### 6b. Verify Firestore Database

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click **Firestore Database**
3. Ensure database is created (should already exist)
4. Check that you have a `devices` collection

---

### Step 7: Deploy to Firebase

```bash
# Navigate back to project root
cd ..

# Deploy ONLY functions (not hosting, storage, etc.)
firebase deploy --only functions

# This will:
# 1. Upload function code
# 2. Create scheduled job in Cloud Scheduler
# 3. Deploy HTTP endpoint for manual trigger
```

**Expected Output:**
```
✔  functions: Finished running predeploy script.
i  functions: ensuring required API cloudfunctions.googleapis.com is enabled...
i  functions: ensuring required API cloudbuild.googleapis.com is enabled...
✔  functions: required API cloudfunctions.googleapis.com is enabled
✔  functions: required API cloudbuild.googleapis.com is enabled
i  functions: preparing functions directory for uploading...
i  functions: packaged functions (X.XX KB) for uploading
✔  functions: functions folder uploaded successfully
i  functions: creating Node.js 18 function cleanupDeviceStatus(us-central1)...
i  functions: creating Node.js 18 function cleanupDeviceStatusManual(us-central1)...
✔  functions[cleanupDeviceStatus(us-central1)]: Successful create operation.
✔  functions[cleanupDeviceStatusManual(us-central1)]: Successful create operation.
```

**⏱️ Deployment takes ~2-5 minutes**

---

## Configuration

### Changing Cleanup Schedule

Edit `functions/cleanupDeviceStatus.js`:

```javascript
// Line ~27
exports.cleanupDeviceStatus = functions
  .runWith({
    timeoutSeconds: 300,
    memory: '256MB'
  })
  .pubsub
  .schedule('every 1 minutes')  // ← Change this
  .timeZone('America/New_York') // ← Change timezone
  .onRun(async (context) => {
    // ...
  });
```

**Schedule Examples:**
- `'every 1 minutes'` - Every minute (default)
- `'every 5 minutes'` - Every 5 minutes
- `'*/10 * * * *'` - Every 10 minutes (cron syntax)
- `'0 */1 * * *'` - Every hour at minute 0

**After changing, redeploy:**
```bash
firebase deploy --only functions:cleanupDeviceStatus
```

---

### Changing Offline Threshold

Edit `functions/cleanupDeviceStatus.js`:

```javascript
// Line ~19
const OFFLINE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

// Change to 5 minutes:
const OFFLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
```

**After changing, redeploy:**
```bash
firebase deploy --only functions:cleanupDeviceStatus
```

---

### Changing Record Deletion Age

Edit `functions/cleanupDeviceStatus.js`:

```javascript
// Line ~20
const DELETE_OLD_RECORDS_AFTER_DAYS = 7; // 7 days

// Change to 30 days:
const DELETE_OLD_RECORDS_AFTER_DAYS = 30; // 30 days
```

---

## Verification

### Step 1: List Deployed Functions

```bash
firebase functions:list
```

**Expected Output:**
```
✔ Preparing the list of your Cloud Functions...
┌───────────────────────────────────────────────────────────────────────┐
│ Function Name                │ Trigger       │ Region       │ State  │
├──────────────────────────────┼───────────────┼──────────────┼────────┤
│ cleanupDeviceStatus          │ Scheduled     │ us-central1  │ ACTIVE │
│ cleanupDeviceStatusManual    │ HTTP Trigger  │ us-central1  │ ACTIVE │
└───────────────────────────────────────────────────────────────────────┘
```

---

### Step 2: Check Cloud Scheduler

```bash
# List scheduled jobs
gcloud scheduler jobs list --project=YOUR_PROJECT_ID
```

**Expected Output:**
```
ID                                                      LOCATION      SCHEDULE
firebase-schedule-cleanupDeviceStatus-us-central1      us-central1   every 1 minutes
```

---

### Step 3: Manual Test

#### Option A: Via cURL

```bash
# Get function URL
firebase functions:config:get

# Trigger manual cleanup
curl https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/cleanupDeviceStatusManual
```

**Expected Response:**
```json
{
  "status": "ok",
  "result": {
    "success": true,
    "markedOffline": 2,
    "deleted": 0,
    "timestamp": "2025-11-17T10:30:00.000Z"
  }
}
```

#### Option B: Via Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click **Functions**
3. Find `cleanupDeviceStatusManual`
4. Click the **URL** to trigger it
5. Check the response in browser

---

### Step 4: View Logs

```bash
# View all function logs
firebase functions:log

# View specific function logs
firebase functions:log --only cleanupDeviceStatus

# Follow logs in real-time
firebase functions:log --only cleanupDeviceStatus --tail
```

**Expected Log Output:**
```
[CleanupFunction] Starting device status cleanup...
[CleanupFunction] Marking doorbell_001 as OFFLINE (135s ago)
[CleanupFunction] Marking esp32_hub as OFFLINE (180s ago)
[CleanupFunction] Complete: 2 marked offline, 0 deleted
```

---

## Monitoring

### Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click **Functions**
3. View metrics:
   - **Invocations** - How many times function ran
   - **Execution time** - Average duration
   - **Memory usage** - RAM consumption
   - **Errors** - Failed executions

---

### Check Function Health

```bash
# View function details
firebase functions:describe cleanupDeviceStatus

# Check for errors
firebase functions:log --only cleanupDeviceStatus | grep -i error
```

---

### Verify Cleanup Is Working

#### Check in Firestore:

1. Go to Firebase Console → Firestore Database
2. Navigate to: `devices/{device_id}/status/current`
3. Disconnect a device (stop sending heartbeats)
4. Wait 2 minutes
5. Refresh Firestore - device should show:
   ```javascript
   {
     online: false,
     marked_offline_at: Timestamp(2025-11-17 10:32:00),
     offline_reason: "heartbeat_timeout"
   }
   ```

---

## Troubleshooting

### Issue: Deployment Fails with "billing not enabled"

**Error:**
```
Error: HTTP Error: 403, Billing account for project 'YOUR_PROJECT_ID' is not found.
Cloud Functions deployment requires the Blaze (pay-as-you-go) billing plan.
```

**Solution:**
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click **Upgrade** in top-right
3. Choose **Blaze (Pay as you go)** plan
4. Add payment method
5. Retry deployment

---

### Issue: Function Not Scheduling

**Error:**
```
Function deployed but not running on schedule
```

**Solution:**
1. Check Cloud Scheduler API is enabled:
   ```bash
   gcloud services list --project=YOUR_PROJECT_ID | grep cloudscheduler
   ```

2. If not enabled:
   ```bash
   gcloud services enable cloudscheduler.googleapis.com --project=YOUR_PROJECT_ID
   ```

3. Redeploy:
   ```bash
   firebase deploy --only functions:cleanupDeviceStatus
   ```

---

### Issue: Permission Denied Errors

**Error:**
```
Error: Permission denied. Cloud Functions deployment requires Owner or Editor role
```

**Solution:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/iam-admin/iam)
2. Ensure your account has **Editor** or **Owner** role
3. Or add specific permissions:
   - Cloud Functions Developer
   - Cloud Scheduler Admin
   - Service Account User

---

### Issue: Function Times Out

**Error:**
```
Function execution took 60000 ms, finished with status: 'timeout'
```

**Solution:**
Increase timeout in `functions/cleanupDeviceStatus.js`:

```javascript
.runWith({
  timeoutSeconds: 540, // Increase to 9 minutes (max)
  memory: '512MB'      // Increase memory if needed
})
```

---

### Issue: High Costs

**Symptom:**
Firebase billing higher than expected

**Solution:**
1. Check function invocations:
   ```bash
   firebase functions:log --only cleanupDeviceStatus | wc -l
   ```

2. Reduce frequency:
   ```javascript
   .schedule('every 5 minutes') // Instead of every 1 minute
   ```

3. Check for infinite loops in logs

---

## Cost Analysis

### Free Tier Limits (per month)

- **Invocations:** 2,000,000
- **Compute Time:** 400,000 GB-seconds
- **Outbound Networking:** 5 GB

### Your Expected Usage

**With `every 1 minutes` schedule:**
- **Invocations:** 43,200/month (1 per minute × 60 min × 24 hours × 30 days)
- **Compute Time:** ~86,400 GB-seconds (2 seconds per invocation × 43,200)
- **Cost:** **$0.00** (well within free tier)

**With `every 5 minutes` schedule:**
- **Invocations:** 8,640/month
- **Compute Time:** ~17,280 GB-seconds
- **Cost:** **$0.00** (even more headroom)

### Cost Breakdown (if exceeding free tier)

**Pricing:**
- **Invocations:** $0.40 per million
- **Compute:** $0.0000025 per GB-second
- **Networking:** $0.12 per GB

**Example (100 devices, every 1 minute):**
- Invocations: 43,200/month = **$0.02**
- Compute: 86,400 GB-seconds = **$0.22**
- **Total:** **~$0.24/month**

---

## Disabling/Deleting Functions

### Temporary Disable

**Option 1: Delete Scheduled Job**
```bash
gcloud scheduler jobs delete firebase-schedule-cleanupDeviceStatus-us-central1 \
  --project=YOUR_PROJECT_ID
```

**Option 2: Pause Schedule (via Console)**
1. Go to [Cloud Console](https://console.cloud.google.com/cloudscheduler)
2. Find `firebase-schedule-cleanupDeviceStatus`
3. Click **Pause**

---

### Permanently Delete

```bash
# Delete both functions
firebase functions:delete cleanupDeviceStatus
firebase functions:delete cleanupDeviceStatusManual

# Confirm deletion when prompted
```

---

## Next Steps

### ✅ Your Function is Now:
- Running every 60 seconds
- Checking all devices
- Marking offline devices automatically
- Deleting old records
- Working independently of Express server

### 📊 Monitor Your Setup:
```bash
# Quick health check
firebase functions:log --only cleanupDeviceStatus --limit 10

# Check recent activity
curl https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/cleanupDeviceStatusManual
```

### 🎯 Optimization Tips:
1. **Reduce frequency** if not needed (every 5 minutes is fine for most use cases)
2. **Adjust thresholds** based on your heartbeat interval
3. **Monitor logs** for errors or unexpected behavior
4. **Set up alerts** in Firebase Console for errors

---

## Additional Resources

- [Firebase Functions Documentation](https://firebase.google.com/docs/functions)
- [Cloud Scheduler Documentation](https://cloud.google.com/scheduler/docs)
- [Firebase Pricing Calculator](https://firebase.google.com/pricing)
- [Cron Expression Generator](https://crontab.guru/)

---

## Support

If you encounter issues:
1. Check [Troubleshooting](#troubleshooting) section
2. View function logs: `firebase functions:log`
3. Check Firebase Console for errors
4. Review Firestore rules and permissions

---

**🎉 Congratulations!** Your Firebase Cloud Function is now handling device status cleanup automatically.
