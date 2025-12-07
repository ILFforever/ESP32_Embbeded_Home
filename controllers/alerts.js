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

// Helper: Calculate time-based score decay with diversity bonus
// Recent alerts get higher scores, older alerts decay exponentially
// Add diversity bonus to prevent alert type monopolization
function calculateAlertScore(level, timestamp, alertType, alertTypeCounts) {
  const basePriority = getBasePriority(level);

  // Calculate age in hours
  const now = Date.now();
  const alertTime = timestamp instanceof Date ? timestamp.getTime() : new Date(timestamp).getTime();
  const ageInHours = (now - alertTime) / (1000 * 60 * 60);

  // Decay factor: alerts lose value over time (exponential decay)
  // - 0-1 hour: 100% weight
  // - 1-6 hours: 70% weight
  // - 6-24 hours: 40% weight
  // - 24-72 hours: 15% weight
  // - 72+ hours: 5% weight
  let timeWeight = 1.0;
  if (ageInHours < 1) {
    timeWeight = 1.0;
  } else if (ageInHours < 6) {
    timeWeight = 0.7;
  } else if (ageInHours < 24) {
    timeWeight = 0.4;
  } else if (ageInHours < 72) {
    timeWeight = 0.15;
  } else {
    timeWeight = 0.05;
  }

  // Diversity bonus: reduce score for over-represented alert types
  // This prevents one type from dominating the feed
  const totalAlerts = Object.values(alertTypeCounts).reduce((sum, count) => sum + count, 0);
  const typeCount = alertTypeCounts[alertType] || 0;
  const typeRatio = totalAlerts > 0 ? typeCount / totalAlerts : 0;

  // Apply penalty for over-representation (max 30% penalty)
  // If a type is >50% of alerts, penalize it
  let diversityMultiplier = 1.0;
  if (typeRatio > 0.5) {
    diversityMultiplier = 0.7; // 30% penalty
  } else if (typeRatio > 0.3) {
    diversityMultiplier = 0.85; // 15% penalty
  }

  // Final score = base priority * time weight * diversity multiplier
  const score = basePriority * timeWeight * diversityMultiplier;

  return score;
}

// ============================================================================
// @route   GET /api/v1/alerts
// @desc    Get alerts from multiple sources with intelligent scoring
//          Sources: device_logs, face_detections, commands, sensor thresholds
//          Scoring: Combines priority level, time decay, and diversity (prevents type monopolization)
// @access  Protected (for frontend and ESP32 LCD)
// @query   level - Filter by level (INFO, WARN, IMPORTANT)
// @query   source - Filter by source device_id
// @query   tags - Filter by tags (comma-separated)
//          Available tags: device-log, face-detection, command, sensor, doorlock,
//                         manual-trigger, recognized, unknown, temperature, humidity, air-quality
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
    const userId = req.user ? req.user.id : req.device?.device_id;

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

    // Query multiple alert sources from each device
    for (const device of devices) {
      const deviceId = device.id;
      const deviceType = device.data?.type || 'unknown';

      // 1. Get device logs (errors and warnings only)
      const logsSnapshot = await db.collection('devices').doc(deviceId)
        .collection('device_logs')
        .orderBy('created_at', 'desc')
        .limit(limitNum) // Reduced since we're adding more sources
        .get();

      logsSnapshot.docs.forEach(doc => {
        const logData = doc.data();

        // Only include error and warning logs
        if (logData.level !== 'error' && logData.level !== 'warning') return;

        const alertLevel = mapLogLevelToAlertLevel(logData.level);

        // Apply level filter
        if (level && alertLevel !== level) return;

        // Check if this is a manual unlock event (special handling)
        const isManualUnlock = logData.data?.manual_trigger === true ||
                               logData.message?.toLowerCase().includes('manual');

        const tags = ['device-log', logData.level];
        if (isManualUnlock) tags.push('manual-trigger', 'doorlock');

        // Apply tags filter
        if (tagArray && !tags.some(tag => tagArray.includes(tag))) return;

        const alertId = `${deviceId}_log_${doc.id}`;
        const isRead = readStatusMap.has(alertId);

        alerts.push({
          id: alertId,
          level: isManualUnlock ? ALERT_LEVELS.IMPORTANT : alertLevel,
          message: isManualUnlock
            ? `${deviceId}: Manual ${logData.data?.action || 'action'} triggered`
            : `${deviceId}: ${logData.message}`,
          source: deviceId,
          tags,
          type: isManualUnlock ? 'manual-unlock' : 'device-log',
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

      // 2. Get face detections
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

        const tags = ['face-detection', isRecognized ? 'recognized' : 'unknown'];

        // Apply tags filter
        if (tagArray && !tags.some(tag => tagArray.includes(tag))) return;

        const alertId = `${deviceId}_face_${doc.id}`;
        const isRead = readStatusMap.has(alertId);

        alerts.push({
          id: alertId,
          level: alertLevel,
          message: isRecognized
            ? `Face detected: ${faceData.name || 'Unknown'}`
            : 'Unknown person detected at door',
          source: deviceId,
          tags,
          type: 'face-detection',
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

      // 3. Get recent commands (completed and failed commands are noteworthy)
      const commandsSnapshot = await db.collection('devices').doc(deviceId)
        .collection('commands')
        .orderBy('created_at', 'desc')
        .limit(20) // Get recent commands
        .get();

      commandsSnapshot.docs.forEach(doc => {
        const cmdData = doc.data();

        // Only include completed or failed commands (skip pending)
        if (cmdData.status === 'pending') return;

        const isFailed = cmdData.status === 'failed';
        const isLockCommand = cmdData.action === 'lock' || cmdData.action === 'unlock';

        // Determine alert level
        let alertLevel = ALERT_LEVELS.INFO;
        if (isFailed) {
          alertLevel = ALERT_LEVELS.WARN;
        } else if (isLockCommand) {
          alertLevel = ALERT_LEVELS.IMPORTANT; // Lock/unlock commands are important
        }

        // Apply level filter
        if (level && alertLevel !== level) return;

        const tags = ['command', cmdData.action, cmdData.status];
        if (isLockCommand) tags.push('doorlock');

        // Apply tags filter
        if (tagArray && !tags.some(tag => tagArray.includes(tag))) return;

        const alertId = `${deviceId}_cmd_${doc.id}`;
        const isRead = readStatusMap.has(alertId);

        // Format message based on command type
        let message = '';
        if (isLockCommand) {
          message = `${deviceId}: Door ${cmdData.action}ed ${isFailed ? '(failed)' : 'successfully'}`;
        } else {
          message = `${deviceId}: Command '${cmdData.action}' ${isFailed ? 'failed' : 'completed'}`;
        }

        alerts.push({
          id: alertId,
          level: alertLevel,
          message,
          source: deviceId,
          tags,
          type: 'command',
          metadata: {
            action: cmdData.action,
            status: cmdData.status,
            params: cmdData.params,
            result: cmdData.result,
            error: cmdData.error
          },
          timestamp: cmdData.executed_at?.toDate?.() || cmdData.created_at?.toDate?.() || cmdData.created_at,
          created_at: cmdData.created_at?.toDate?.() || cmdData.created_at,
          read: isRead
        });
      });

      // 4. Get sensor threshold violations (if device has sensors)
      if (deviceType.includes('sensor') || deviceType === 'hb') {
        const sensorDoc = await db.collection('devices').doc(deviceId)
          .collection('sensors')
          .doc('current')
          .get();

        if (sensorDoc.exists) {
          const sensorData = sensorDoc.data();
          const sensorTimestamp = sensorData.last_updated?.toDate?.() || sensorData.timestamp?.toDate?.() || new Date();

          // Check for threshold violations
          const violations = [];

          // Temperature checks
          if (sensorData.temperature != null) {
            if (sensorData.temperature > 35) {
              violations.push({ type: 'temperature', level: ALERT_LEVELS.WARN, message: `High temperature: ${sensorData.temperature}°C` });
            } else if (sensorData.temperature < 10) {
              violations.push({ type: 'temperature', level: ALERT_LEVELS.WARN, message: `Low temperature: ${sensorData.temperature}°C` });
            }
          }

          // Humidity checks
          if (sensorData.humidity != null) {
            if (sensorData.humidity > 80) {
              violations.push({ type: 'humidity', level: ALERT_LEVELS.WARN, message: `High humidity: ${sensorData.humidity}%` });
            } else if (sensorData.humidity < 20) {
              violations.push({ type: 'humidity', level: ALERT_LEVELS.INFO, message: `Low humidity: ${sensorData.humidity}%` });
            }
          }

          // Air quality checks (PM2.5)
          if (sensorData.pm2_5 != null || sensorData.aqi != null) {
            const aqi = sensorData.aqi || 0;
            const pm25 = sensorData.pm2_5 || 0;

            if (aqi > 150 || pm25 > 55) {
              violations.push({ type: 'air-quality', level: ALERT_LEVELS.IMPORTANT, message: `Unhealthy air quality (AQI: ${aqi})` });
            } else if (aqi > 100 || pm25 > 35) {
              violations.push({ type: 'air-quality', level: ALERT_LEVELS.WARN, message: `Moderate air quality (AQI: ${aqi})` });
            }
          }

          // Add violations as alerts (only if recent - within last 6 hours)
          const ageInHours = (Date.now() - sensorTimestamp.getTime()) / (1000 * 60 * 60);
          if (ageInHours < 6) {
            violations.forEach(violation => {
              // Apply level filter
              if (level && violation.level !== level) return;

              const tags = ['sensor', violation.type];

              // Apply tags filter
              if (tagArray && !tags.some(tag => tagArray.includes(tag))) return;

              const alertId = `${deviceId}_sensor_${violation.type}`;
              const isRead = readStatusMap.has(alertId);

              alerts.push({
                id: alertId,
                level: violation.level,
                message: `${deviceId}: ${violation.message}`,
                source: deviceId,
                tags,
                type: 'sensor-threshold',
                metadata: {
                  sensor_type: violation.type,
                  sensor_data: sensorData
                },
                timestamp: sensorTimestamp,
                created_at: sensorTimestamp,
                read: isRead
              });
            });
          }
        }
      }
    }

    // Apply read filter if specified
    let filteredAlerts = alerts;
    if (readFilter !== null) {
      filteredAlerts = alerts.filter(alert => alert.read === readFilter);
    }

    // Calculate alert type distribution for diversity scoring
    const alertTypeCounts = {};
    filteredAlerts.forEach(alert => {
      const type = alert.type || 'other';
      alertTypeCounts[type] = (alertTypeCounts[type] || 0) + 1;
    });

    // Sort by score (combines priority, recency, and diversity)
    // Recent IMPORTANT alerts score highest, old INFO alerts score lowest
    // Diversity factor prevents one type from dominating
    filteredAlerts.sort((a, b) => {
      const scoreA = calculateAlertScore(a.level, a.timestamp, a.type || 'other', alertTypeCounts);
      const scoreB = calculateAlertScore(b.level, b.timestamp, b.type || 'other', alertTypeCounts);
      return scoreB - scoreA; // Higher score = more important
    });

    // Apply limit
    const limitedAlerts = filteredAlerts.slice(0, limitNum);

    // Calculate summary statistics
    const summary = {
      total: limitedAlerts.length,
      by_level: {
        IMPORTANT: limitedAlerts.filter(a => a.level === ALERT_LEVELS.IMPORTANT).length,
        WARN: limitedAlerts.filter(a => a.level === ALERT_LEVELS.WARN).length,
        INFO: limitedAlerts.filter(a => a.level === ALERT_LEVELS.INFO).length
      },
      by_type: {},
      unread_count: limitedAlerts.filter(a => !a.read).length
    };

    // Count by type
    limitedAlerts.forEach(alert => {
      const type = alert.type || 'other';
      summary.by_type[type] = (summary.by_type[type] || 0) + 1;
    });

    console.log(`[Alerts] Returning ${limitedAlerts.length} alerts (filtered from ${alerts.length})`);
    console.log(`[Alerts] Summary:`, summary);

    // Return alerts with summary
    res.json({
      status: 'ok',
      count: limitedAlerts.length,
      summary,
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
    const userId = req.user ? req.user.id : req.device?.device_id;

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
    const userId = req.user ? req.user.id : req.device?.device_id;

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
    const userId = req.user ? req.user.id : req.device?.device_id;

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
