/**
 * Firebase Cloud Function: Cleanup Device Status
 *
 * Scheduled function that runs every minute to mark devices offline
 * if they haven't sent a heartbeat within the threshold
 *
 * DEPLOYMENT:
 * 1. Install Firebase CLI: npm install -g firebase-tools
 * 2. Initialize: firebase init functions
 * 3. Deploy: firebase deploy --only functions:cleanupDeviceStatus
 *
 * SCHEDULE:
 * Runs every 1 minute via Cloud Scheduler
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin (only once)
if (!admin.apps.length) {
  admin.initializeApp();
}

const OFFLINE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes
const DELETE_OLD_RECORDS_AFTER_DAYS = 7; // Delete records older than 7 days

/**
 * Scheduled function: Runs every minute
 * Schedule: "every 1 minutes" in cron syntax: "* * * * *"
 */
exports.cleanupDeviceStatus = functions
  .runWith({
    timeoutSeconds: 300, // 5 minutes max
    memory: '256MB'
  })
  .pubsub
  .schedule('every 1 minutes')
  .timeZone('America/New_York') // Change to your timezone
  .onRun(async (context) => {
    try {
      console.log('[CleanupFunction] Starting device status cleanup...');

      const now = Date.now();
      const db = admin.firestore();

      // Get all devices
      const devicesSnapshot = await db.collection('devices').get();

      if (devicesSnapshot.empty) {
        console.log('[CleanupFunction] No devices found');
        return null;
      }

      const batch = db.batch();
      let batchCount = 0;
      let markedOffline = 0;
      let deleted = 0;

      // Process each device
      for (const deviceDoc of devicesSnapshot.docs) {
        const deviceId = deviceDoc.id;

        // Get current status
        const statusDoc = await deviceDoc.ref
          .collection('status')
          .doc('current')
          .get();

        if (!statusDoc.exists) {
          continue;
        }

        const statusData = statusDoc.data();
        const lastHeartbeat = statusData.last_heartbeat?.toMillis() || 0;
        const timeSinceLastHeartbeat = now - lastHeartbeat;
        const isCurrentlyOnline = statusData.online === true;

        // Mark device offline if heartbeat expired
        if (isCurrentlyOnline && timeSinceLastHeartbeat > OFFLINE_THRESHOLD_MS) {
          console.log(`[CleanupFunction] Marking ${deviceId} as OFFLINE (${(timeSinceLastHeartbeat / 1000).toFixed(0)}s ago)`);

          batch.update(statusDoc.ref, {
            online: false,
            marked_offline_at: admin.firestore.FieldValue.serverTimestamp(),
            offline_reason: 'heartbeat_timeout'
          });

          markedOffline++;
          batchCount++;
        }

        // Delete very old offline records
        const deleteThreshold = now - (DELETE_OLD_RECORDS_AFTER_DAYS * 24 * 60 * 60 * 1000);
        if (!isCurrentlyOnline && lastHeartbeat < deleteThreshold) {
          console.log(`[CleanupFunction] Deleting old status for ${deviceId}`);

          batch.delete(statusDoc.ref);
          deleted++;
          batchCount++;
        }

        // Commit batch if too large (max 500 per batch)
        if (batchCount >= 400) {
          await batch.commit();
          console.log(`[CleanupFunction] Committed batch of ${batchCount} operations`);
          batchCount = 0;
        }
      }

      // Commit remaining operations
      if (batchCount > 0) {
        await batch.commit();
      }

      console.log(`[CleanupFunction] Complete: ${markedOffline} marked offline, ${deleted} deleted`);

      return {
        success: true,
        markedOffline,
        deleted,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('[CleanupFunction] Error:', error);
      throw error;
    }
  });

/**
 * HTTP-triggered version (for manual testing)
 * Call: https://YOUR_PROJECT.cloudfunctions.net/cleanupDeviceStatusManual
 */
exports.cleanupDeviceStatusManual = functions
  .runWith({
    timeoutSeconds: 300,
    memory: '256MB'
  })
  .https
  .onRequest(async (req, res) => {
    try {
      // Run the same cleanup logic
      const result = await exports.cleanupDeviceStatus.run({});

      res.json({
        status: 'ok',
        result
      });
    } catch (error) {
      console.error('[CleanupFunction] Manual trigger error:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });
