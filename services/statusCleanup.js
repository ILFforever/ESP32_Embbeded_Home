const { getFirestore, admin } = require('../config/firebase');

// ============================================================================
// Background Status Cleanup Service
// ============================================================================
// This service periodically checks all device status records and marks
// devices as offline if they haven't sent a heartbeat within the threshold
// ============================================================================

const OFFLINE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes = offline
const CLEANUP_INTERVAL_MS = 60 * 1000; // Run cleanup every 1 minute
const DELETE_OLD_RECORDS_AFTER_DAYS = 7; // Delete records older than 7 days

class StatusCleanupService {
  constructor() {
    this.cleanupTimer = null;
    this.isRunning = false;
    this.stats = {
      totalChecks: 0,
      devicesMarkedOffline: 0,
      recordsDeleted: 0,
      lastRunTime: null,
      errors: 0
    };
  }

  /**
   * Start the cleanup service
   */
  start() {
    if (this.isRunning) {
      console.log('[StatusCleanup] Service already running');
      return;
    }

    console.log('[StatusCleanup] Starting service...');
    console.log(`[StatusCleanup] Offline threshold: ${OFFLINE_THRESHOLD_MS / 1000}s`);
    console.log(`[StatusCleanup] Cleanup interval: ${CLEANUP_INTERVAL_MS / 1000}s`);

    this.isRunning = true;

    // Run immediately
    this.runCleanup();

    // Schedule periodic cleanup
    this.cleanupTimer = setInterval(() => {
      this.runCleanup();
    }, CLEANUP_INTERVAL_MS);

    console.log('[StatusCleanup] Service started successfully');
  }

  /**
   * Stop the cleanup service
   */
  stop() {
    if (!this.isRunning) {
      console.log('[StatusCleanup] Service not running');
      return;
    }

    console.log('[StatusCleanup] Stopping service...');

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    this.isRunning = false;
    console.log('[StatusCleanup] Service stopped');
  }

  /**
   * Run the cleanup process
   */
  async runCleanup() {
    try {
      this.stats.totalChecks++;
      this.stats.lastRunTime = new Date().toISOString();

      const now = Date.now();
      const db = getFirestore();

      // Get all devices
      const devicesSnapshot = await db.collection('devices').get();

      if (devicesSnapshot.empty) {
        console.log('[StatusCleanup] No devices found');
        return;
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

        // Check if device should be marked offline
        if (isCurrentlyOnline && timeSinceLastHeartbeat > OFFLINE_THRESHOLD_MS) {
          console.log(`[StatusCleanup] Marking ${deviceId} as OFFLINE (last seen ${(timeSinceLastHeartbeat / 1000).toFixed(0)}s ago)`);

          // Update status to offline
          batch.update(statusDoc.ref, {
            online: false,
            marked_offline_at: admin.firestore.FieldValue.serverTimestamp(),
            offline_reason: 'heartbeat_timeout'
          });

          markedOffline++;
          batchCount++;
        }

        // Delete very old offline records (optional - saves storage)
        const deleteThreshold = now - (DELETE_OLD_RECORDS_AFTER_DAYS * 24 * 60 * 60 * 1000);
        if (!isCurrentlyOnline && lastHeartbeat < deleteThreshold) {
          console.log(`[StatusCleanup] Deleting old status for ${deviceId} (last seen ${Math.floor((now - lastHeartbeat) / (24 * 60 * 60 * 1000))} days ago)`);

          // Note: We keep the device doc, just delete the old status
          batch.delete(statusDoc.ref);
          deleted++;
          batchCount++;
        }

        // Commit batch if it gets too large (500 operations max per batch)
        if (batchCount >= 400) {
          await batch.commit();
          console.log(`[StatusCleanup] Committed batch of ${batchCount} operations`);
          batchCount = 0;
        }
      }

      // Commit any remaining operations
      if (batchCount > 0) {
        await batch.commit();
        console.log(`[StatusCleanup] Committed final batch of ${batchCount} operations`);
      }

      // Update stats
      this.stats.devicesMarkedOffline += markedOffline;
      this.stats.recordsDeleted += deleted;

      if (markedOffline > 0 || deleted > 0) {
        console.log(`[StatusCleanup] Cleanup complete: ${markedOffline} marked offline, ${deleted} deleted`);
      } else {
        console.log('[StatusCleanup] No cleanup needed - all devices current');
      }

    } catch (error) {
      this.stats.errors++;
      console.error('[StatusCleanup] Error during cleanup:', error);
    }
  }

  /**
   * Get service statistics
   */
  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      uptimeSeconds: this.isRunning ? Math.floor((Date.now() - new Date(this.stats.lastRunTime).getTime()) / 1000) : 0
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalChecks: 0,
      devicesMarkedOffline: 0,
      recordsDeleted: 0,
      lastRunTime: null,
      errors: 0
    };
    console.log('[StatusCleanup] Stats reset');
  }
}

// Export singleton instance
const statusCleanupService = new StatusCleanupService();

module.exports = statusCleanupService;
