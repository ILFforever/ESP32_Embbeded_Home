const { getFirestore } = require('../config/firebase');
const { ALERT_LEVELS } = require('../models/Alert');

// Helper: Map log level to alert level
function mapLogLevelToAlertLevel(logLevel) {
  switch (logLevel) {
    case 'error':
      return ALERT_LEVELS.IMPORTANT;
    case 'warning':
      return ALERT_LEVELS.WARN;
    case 'info':
    case 'debug':
    default:
      return ALERT_LEVELS.INFO;
  }
}

// Helper: Get base priority value for alert level
function getBasePriority(level) {
  const priorities = {
    IMPORTANT: 1000,
    WARN: 500,
    INFO: 100
  };
  return priorities[level] || 0;
}

// Helper: Calculate time-based score decay
// Recent alerts get higher scores, older alerts decay exponentially
function calculateAlertScore(level, timestamp) {
  const basePriority = getBasePriority(level);

  // Calculate age in hours
  const now = Date.now();
  const alertTime = timestamp instanceof Date ? timestamp.getTime() : new Date(timestamp).getTime();
  const ageInHours = (now - alertTime) / (1000 * 60 * 60);

  // Decay factor: alerts lose value over time
  // - 0-1 hour: 100% weight
  // - 1-6 hours: 80% weight
  // - 6-24 hours: 50% weight
  // - 24-72 hours: 20% weight
  // - 72+ hours: 5% weight
  let timeWeight = 1.0;
  if (ageInHours < 1) {
    timeWeight = 1.0;
  } else if (ageInHours < 6) {
    timeWeight = 0.8;
  } else if (ageInHours < 24) {
    timeWeight = 0.5;
  } else if (ageInHours < 72) {
    timeWeight = 0.2;
  } else {
    timeWeight = 0.05;
  }

  // Final score = base priority * time weight
  const score = basePriority * timeWeight;

  return score;
}

// ============================================================================
// @route   GET /api/v1/alerts
// @desc    Get alerts by querying device_logs and face_detections in real-time
// @access  Protected (for frontend and ESP32 LCD)
// @query   level - Filter by level (INFO, WARN, IMPORTANT)
// @query   source - Filter by source device_id
// @query   tags - Filter by tags (comma-separated)
// @query   limit - Max alerts to return (default 50, max 100)
// @query   read - Filter by read status (true/false)
// ============================================================================
const getAlerts = async (req, res) => {
  try {
    const {
      level,
      source,
      tags,
      limit = 50,
      read
    } = req.query;

    // Validate level
    if (level && !Object.values(ALERT_LEVELS).includes(level)) {
      return res.status(400).json({
        status: 'error',
        message: `Invalid level. Must be one of: ${Object.values(ALERT_LEVELS).join(', ')}`
      });
    }

    // Parse and validate limit
    const limitNum = Math.min(parseInt(limit) || 50, 100);

    // Parse tags filter
    const tagArray = tags ? tags.split(',').map(t => t.trim()) : null;

    // Parse read filter
    const readFilter = read !== undefined ? read === 'true' : null;

    console.log(`[Alerts] Querying alerts - level: ${level || 'all'}, source: ${source || 'all'}, read: ${readFilter !== null ? readFilter : 'all'}, limit: ${limitNum}`);

    const db = getFirestore();
    const alerts = [];

    // Get user/device ID for read status tracking
    const userId = req.user ? req.user.uid : req.device?.device_id;

    // Load read status map for this user/device
    const readStatusMap = new Map();
    if (userId) {
      const readStatusSnapshot = await db.collection('alert_read_status')
        .where('user_id', '==', userId)
        .get();

      readStatusSnapshot.docs.forEach(doc => {
        const data = doc.data();
        readStatusMap.set(data.alert_id, true);
      });
    }

    // Get all devices or specific device
    const devicesSnapshot = source
      ? await db.collection('devices').doc(source).get()
      : await db.collection('devices').get();

    const devices = source
      ? (devicesSnapshot.exists ? [{ id: source, data: devicesSnapshot.data() }] : [])
      : devicesSnapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));

    // Query device_logs (errors and warnings only)
    for (const device of devices) {
      const deviceId = device.id;

      // Get device logs - query without filter first, then filter in memory to avoid index requirement
      const logsSnapshot = await db.collection('devices').doc(deviceId)
        .collection('device_logs')
        .orderBy('created_at', 'desc')
        .limit(limitNum * 2) // Get more to account for filtering
        .get();

      logsSnapshot.docs.forEach(doc => {
        const logData = doc.data();

        // Only include error and warning logs
        if (logData.level !== 'error' && logData.level !== 'warning') return;

        const alertLevel = mapLogLevelToAlertLevel(logData.level);

        // Apply level filter
        if (level && alertLevel !== level) return;

        // Apply tags filter (device-log tag)
        if (tagArray && !tagArray.includes('device-log') && !tagArray.includes(logData.level)) return;

        const alertId = `${deviceId}_log_${doc.id}`;
        const isRead = readStatusMap.has(alertId);

        alerts.push({
          id: alertId,
          level: alertLevel,
          message: `${deviceId}: ${logData.message}`,
          source: deviceId,
          tags: ['device-log', logData.level],
          metadata: {
            log_level: logData.level,
            data: logData.data,
            error_message: logData.error_message
          },
          timestamp: logData.timestamp?.toDate?.() || logData.timestamp,
          created_at: logData.created_at?.toDate?.() || logData.created_at,
          read: isRead
        });
      });

      // Get face detections
      const faceSnapshot = await db.collection('devices').doc(deviceId)
        .collection('face_detections')
        .orderBy('detected_at', 'desc')
        .limit(limitNum)
        .get();

      faceSnapshot.docs.forEach(doc => {
        const faceData = doc.data();
        const isRecognized = faceData.recognized;
        const alertLevel = isRecognized ? ALERT_LEVELS.INFO : ALERT_LEVELS.WARN;

        // Apply level filter
        if (level && alertLevel !== level) return;

        // Apply tags filter (face-detection tag)
        if (tagArray && !tagArray.includes('face-detection') &&
            !tagArray.includes(isRecognized ? 'recognized' : 'unknown')) return;

        const alertId = `${deviceId}_face_${doc.id}`;
        const isRead = readStatusMap.has(alertId);

        alerts.push({
          id: alertId,
          level: alertLevel,
          message: isRecognized
            ? `Face detected: ${faceData.name || 'Unknown'}`
            : 'Unknown person detected at door',
          source: deviceId,
          tags: ['face-detection', isRecognized ? 'recognized' : 'unknown'],
          metadata: {
            event_id: doc.id,
            name: faceData.name,
            confidence: faceData.confidence,
            image_url: faceData.image
          },
          timestamp: faceData.detected_at?.toDate?.() || faceData.detected_at || faceData.timestamp?.toDate?.() || faceData.timestamp,
          created_at: faceData.detected_at?.toDate?.() || faceData.detected_at,
          read: isRead
        });
      });
    }

    // Apply read filter if specified
    let filteredAlerts = alerts;
    if (readFilter !== null) {
      filteredAlerts = alerts.filter(alert => alert.read === readFilter);
    }

    // Sort by score (combines priority and recency)
    // Recent IMPORTANT alerts score highest, old INFO alerts score lowest
    filteredAlerts.sort((a, b) => {
      const scoreA = calculateAlertScore(a.level, a.timestamp);
      const scoreB = calculateAlertScore(b.level, b.timestamp);
      return scoreB - scoreA; // Higher score = more important
    });

    // Apply limit
    const limitedAlerts = filteredAlerts.slice(0, limitNum);

    console.log(`[Alerts] Returning ${limitedAlerts.length} alerts (filtered from ${alerts.length})`);

    // Return alerts
    res.json({
      status: 'ok',
      count: limitedAlerts.length,
      alerts: limitedAlerts
    });

  } catch (error) {
    console.error('[Alerts] Error fetching alerts:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// ============================================================================
// @route   GET /api/v1/alerts/:alert_id
// @desc    Get a single alert by ID
// @access  Protected (requires user token or device token)
// ============================================================================
const getAlertById = async (req, res) => {
  try {
    const { alert_id } = req.params;

    console.log(`[Alerts] Fetching alert: ${alert_id}`);

    // Parse alert_id to determine type and IDs
    // Format: {deviceId}_face_{docId} or {deviceId}_log_{docId}
    const parts = alert_id.split('_');

    if (parts.length < 3) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid alert_id format'
      });
    }

    const type = parts[parts.length - 2]; // 'face' or 'log'
    const docId = parts[parts.length - 1];
    const deviceId = parts.slice(0, parts.length - 2).join('_');

    const db = getFirestore();

    // Get user/device ID for read status tracking
    const userId = req.user ? req.user.uid : req.device?.device_id;

    // Check read status
    let isRead = false;
    if (userId) {
      const readStatusSnapshot = await db.collection('alert_read_status')
        .where('user_id', '==', userId)
        .where('alert_id', '==', alert_id)
        .limit(1)
        .get();

      isRead = !readStatusSnapshot.empty;
    }

    // Fetch the alert based on type
    if (type === 'face') {
      const faceDoc = await db.collection('devices').doc(deviceId)
        .collection('face_detections')
        .doc(docId)
        .get();

      if (!faceDoc.exists) {
        return res.status(404).json({
          status: 'error',
          message: 'Alert not found'
        });
      }

      const faceData = faceDoc.data();
      const isRecognized = faceData.recognized;
      const alertLevel = isRecognized ? ALERT_LEVELS.INFO : ALERT_LEVELS.WARN;

      const alert = {
        id: alert_id,
        level: alertLevel,
        message: isRecognized
          ? `Face detected: ${faceData.name || 'Unknown'}`
          : 'Unknown person detected at door',
        source: deviceId,
        tags: ['face-detection', isRecognized ? 'recognized' : 'unknown'],
        metadata: {
          event_id: docId,
          name: faceData.name,
          confidence: faceData.confidence,
          image_url: faceData.image
        },
        timestamp: faceData.detected_at?.toDate?.() || faceData.detected_at || faceData.timestamp?.toDate?.() || faceData.timestamp,
        created_at: faceData.detected_at?.toDate?.() || faceData.detected_at,
        read: isRead
      };

      return res.json({
        status: 'ok',
        alert
      });

    } else if (type === 'log') {
      const logDoc = await db.collection('devices').doc(deviceId)
        .collection('device_logs')
        .doc(docId)
        .get();

      if (!logDoc.exists) {
        return res.status(404).json({
          status: 'error',
          message: 'Alert not found'
        });
      }

      const logData = logDoc.data();
      const alertLevel = mapLogLevelToAlertLevel(logData.level);

      const alert = {
        id: alert_id,
        level: alertLevel,
        message: `${deviceId}: ${logData.message}`,
        source: deviceId,
        tags: ['device-log', logData.level],
        metadata: {
          log_level: logData.level,
          data: logData.data,
          error_message: logData.error_message
        },
        timestamp: logData.timestamp?.toDate?.() || logData.timestamp,
        created_at: logData.created_at?.toDate?.() || logData.created_at,
        read: isRead
      };

      return res.json({
        status: 'ok',
        alert
      });

    } else {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid alert type. Must be face or log.'
      });
    }

  } catch (error) {
    console.error('[Alerts] Error fetching alert:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// ============================================================================
// @route   POST /api/v1/alerts
// @desc    Create a new alert (manual creation)
// @access  Protected (requires user token)
// ============================================================================
const createAlert = async (req, res) => {
  try {
    const { level, message, source, tags, metadata } = req.body;

    // Validation
    if (!message) {
      return res.status(400).json({
        status: 'error',
        message: 'Message is required'
      });
    }

    // Create alert
    const alert = await Alert.create({
      level: level || ALERT_LEVELS.INFO,
      message,
      source: source || 'user',
      tags: tags || [],
      metadata: metadata || {}
    });

    console.log(`[Alerts] Created alert: ${alert.id}`);

    res.status(201).json({
      status: 'ok',
      message: 'Alert created successfully',
      alert: alert.toJSON()
    });

  } catch (error) {
    console.error('[Alerts] Error creating alert:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// ============================================================================
// @route   PATCH /api/v1/alerts/:alert_id/read
// @desc    Mark alert as read
// @access  Protected (requires user token or device token)
// ============================================================================
const markAlertAsRead = async (req, res) => {
  try {
    const { alert_id } = req.params;
    const userId = req.user ? req.user.uid : req.device?.device_id;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'User or device authentication required'
      });
    }

    const db = getFirestore();
    const { admin } = require('../config/firebase');

    // Create or update read status
    await db.collection('alert_read_status').add({
      user_id: userId,
      alert_id: alert_id,
      read_at: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`[Alerts] Marked alert as read: ${alert_id} for user: ${userId}`);

    res.json({
      status: 'ok',
      message: 'Alert marked as read',
      alert_id: alert_id
    });

  } catch (error) {
    console.error('[Alerts] Error marking alert as read:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// ============================================================================
// @route   POST /api/v1/alerts/mark-read
// @desc    Mark multiple alerts as read
// @access  Protected (requires user token or device token)
// ============================================================================
const markMultipleAlertsAsRead = async (req, res) => {
  try {
    const { alert_ids } = req.body;
    const userId = req.user ? req.user.uid : req.device?.device_id;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'User or device authentication required'
      });
    }

    if (!alert_ids || !Array.isArray(alert_ids) || alert_ids.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'alert_ids array is required'
      });
    }

    const db = getFirestore();
    const { admin } = require('../config/firebase');
    const batch = db.batch();

    // Create read status records for each alert
    alert_ids.forEach(alert_id => {
      const docRef = db.collection('alert_read_status').doc();
      batch.set(docRef, {
        user_id: userId,
        alert_id: alert_id,
        read_at: admin.firestore.FieldValue.serverTimestamp()
      });
    });

    await batch.commit();

    console.log(`[Alerts] Marked ${alert_ids.length} alerts as read for user: ${userId}`);

    res.json({
      status: 'ok',
      message: `${alert_ids.length} alerts marked as read`
    });

  } catch (error) {
    console.error('[Alerts] Error marking alerts as read:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// ============================================================================
// @route   DELETE /api/v1/alerts/:alert_id
// @desc    Delete an alert
// @access  Protected (requires user token)
// ============================================================================
const deleteAlert = async (req, res) => {
  try {
    const { alert_id } = req.params;

    const alert = await Alert.delete(alert_id);

    if (!alert) {
      return res.status(404).json({
        status: 'error',
        message: 'Alert not found'
      });
    }

    console.log(`[Alerts] Deleted alert: ${alert_id}`);

    res.json({
      status: 'ok',
      message: 'Alert deleted successfully'
    });

  } catch (error) {
    console.error('[Alerts] Error deleting alert:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// ============================================================================
// Helper function to create alert from device event
// (can be called from other controllers)
// ============================================================================
const createDeviceAlert = async (alertData) => {
  try {
    return await Alert.create(alertData);
  } catch (error) {
    console.error('[Alerts] Error creating device alert:', error);
    throw error;
  }
};

module.exports = {
  getAlerts,
  getAlertById,
  createAlert,
  markAlertAsRead,
  markMultipleAlertsAsRead,
  deleteAlert,
  createDeviceAlert
};
