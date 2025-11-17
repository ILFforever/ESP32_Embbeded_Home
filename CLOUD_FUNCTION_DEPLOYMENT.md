# Firebase Cloud Functions Deployment Guide

## Prerequisites

1. **Firebase Project**
   - You need a Firebase project with Blaze plan (pay-as-you-go)
   - Get your project ID from Firebase Console

2. **Firebase CLI**
   ```bash
   npm install -g firebase-tools
   firebase login
   ```

## Step-by-Step Deployment

### 1. Configure Firebase Project

Create `.firebaserc` file in the root directory:

```json
{
  "projects": {
    "default": "YOUR_FIREBASE_PROJECT_ID"
  }
}
```

Replace `YOUR_FIREBASE_PROJECT_ID` with your actual Firebase project ID.

### 2. Install Dependencies

```bash
cd functions
npm install
cd ..
```

### 3. Deploy Functions

```bash
# Deploy all functions
firebase deploy --only functions

# Or deploy specific function
firebase deploy --only functions:cleanupDeviceStatus
```

### 4. Verify Deployment

```bash
# List all deployed functions
firebase functions:list

# Expected output:
# ✔ cleanupDeviceStatus(us-central1) - Scheduled (every 1 minutes)
# ✔ cleanupDeviceStatusManual(us-central1) - HTTP Trigger
```

### 5. Test Deployment

```bash
# Test manual trigger
curl https://YOUR_REGION-YOUR_PROJECT_ID.cloudfunctions.net/cleanupDeviceStatusManual

# View logs
firebase functions:log --only cleanupDeviceStatus
```

## Configuration

### Change Cleanup Schedule

Edit `functions/cleanupDeviceStatus.js`:

```javascript
.schedule('every 2 minutes')  // Change interval
.timeZone('America/New_York') // Change timezone
```

### Change Thresholds

```javascript
const OFFLINE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes
const DELETE_OLD_RECORDS_AFTER_DAYS = 7;    // 7 days
```

## Monitoring

### View Logs

```bash
# All logs
firebase functions:log

# Specific function
firebase functions:log --only cleanupDeviceStatus

# Follow logs (real-time)
firebase functions:log --only cleanupDeviceStatus --tail
```

### Firebase Console

1. Go to Firebase Console → Functions
2. View execution logs, errors, and stats
3. Monitor costs under Usage tab

## Cost Estimate

**Scheduled Function:**
- Runs every 1 minute = 43,200 invocations/month
- Average execution: ~2 seconds per run
- Cost: ~$0.40/month (usually within free tier)

**Free Tier Includes:**
- 2 million invocations/month
- 400,000 GB-seconds compute time
- 200,000 CPU-seconds compute time

**Your usage:** Well within free tier limits

## Troubleshooting

### Function not deploying?

1. Check Firebase project has Blaze plan:
   ```bash
   firebase projects:list
   ```

2. Verify authentication:
   ```bash
   firebase login:list
   firebase login --reauth
   ```

3. Check for errors:
   ```bash
   npm run deploy 2>&1 | tee deploy.log
   ```

### Function not running?

1. Check Cloud Scheduler is enabled:
   - Go to Google Cloud Console
   - Enable Cloud Scheduler API

2. Verify schedule:
   ```bash
   gcloud scheduler jobs list
   ```

3. Manually trigger:
   ```bash
   gcloud scheduler jobs run cleanupDeviceStatus
   ```

### High costs?

1. Reduce frequency:
   ```javascript
   .schedule('every 5 minutes') // Instead of every 1 minute
   ```

2. Check execution time in Firebase Console
3. Optimize batch size if processing many devices

## Disable Express Cleanup (Optional)

Since you're using Cloud Functions, you can disable the Express cleanup:

Edit `server.js`:

```javascript
// Comment out these lines:
// const statusCleanupService = require('./services/statusCleanup');
// statusCleanupService.start();

// And remove from shutdown handlers
```

## Rollback

To remove the deployed functions:

```bash
firebase functions:delete cleanupDeviceStatus
firebase functions:delete cleanupDeviceStatusManual
```

## Next Steps

1. **Create `.firebaserc`** with your project ID
2. **Run `npm install`** in functions directory
3. **Deploy:** `firebase deploy --only functions`
4. **Monitor:** Check Firebase Console → Functions

## Support

- [Firebase Functions Documentation](https://firebase.google.com/docs/functions)
- [Cloud Scheduler Documentation](https://cloud.google.com/scheduler/docs)
- [Firebase Pricing](https://firebase.google.com/pricing)
