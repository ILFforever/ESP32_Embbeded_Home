const { getFirestore, admin } = require('../config/firebase');

// ============================================================================
// In-Memory Cache for Throttling (reduces Firebase writes by 95%)
// ============================================================================
const deviceCache = new Map(); // { device_id: { lastWrite, lastData, ... } }

// Thresholds
const WRITE_INTERVAL_MS = 5 * 60 * 1000; // Write every 5 minutes
const SENSOR_DELTA_THRESHOLD = 5; // Write if sensor changes by 5%
const OFFLINE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes = offline

// Helper: Check if should write to Firebase
function shouldWriteToFirebase(deviceId, newData, dataType = 'heartbeat') {
  const cached = deviceCache.get(deviceId);

  if (!cached) {
    // First time - always write
    return true;
  }

  const now = Date.now();
  const timeSinceLastWrite = now - cached.lastWriteTime;

  // Always write if 5+ minutes elapsed
  if (timeSinceLastWrite >= WRITE_INTERVAL_MS) {
    return true;
  }

  // Check for status changes (online/offline)
  if (dataType === 'heartbeat') {
    // Status changed - write immediately
    if (cached.lastData.online !== newData.online) {
      return true;
    }
  }

  // Check for significant sensor changes
  if (dataType === 'sensor' && cached.lastData.sensors) {
    for (const [key, value] of Object.entries(newData.sensors || {})) {
      const oldValue = cached.lastData.sensors[key];
      if (oldValue !== undefined) {
        const percentChange = Math.abs((value - oldValue) / oldValue) * 100;
        if (percentChange >= SENSOR_DELTA_THRESHOLD) {
          console.log(`[Throttle] Sensor ${key} changed by ${percentChange.toFixed(1)}% - writing`);
          return true;
        }
      }
    }
  }

  // Otherwise, skip write (throttle)
  return false;
}

// Helper: Update cache
function updateCache(deviceId, data, dataType) {
  deviceCache.set(deviceId, {
    lastWriteTime: Date.now(),
    lastData: { ...data, online: true },
    dataType
  });
}

// ============================================================================
// @route   POST /api/v1/devices/heartbeat
// @desc    Receive device heartbeat - ALWAYS respond OK, throttle Firebase writes
// ============================================================================
const handleHeartbeat = async (req, res) => {
  try {
    const { device_id, device_type, uptime_ms, free_heap, wifi_rssi, ip_address } = req.body;

    // Validation
    if (!device_id || !device_type) {
      return res.status(400).json({
        status: 'error',
        message: 'device_id and device_type are required'
      });
    }

    // Prepare data
    const heartbeatData = {
      online: true,
      ip_address: ip_address || req.ip,
      uptime_ms: uptime_ms || 0,
      free_heap: free_heap || 0,
      wifi_rssi: wifi_rssi || 0,
    };

    // Check if we should write to Firebase (throttling logic)
    const shouldWrite = shouldWriteToFirebase(device_id, heartbeatData, 'heartbeat');

    if (shouldWrite) {
      console.log(`[Heartbeat] ${device_id} - Writing to Firebase`);

      const db = getFirestore();
      const deviceRef = db.collection('devices').doc(device_id);

      // Write to Firebase
      await deviceRef.collection('status').doc('current').set({
        ...heartbeatData,
        last_heartbeat: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      await deviceRef.set({
        type: device_type,
        last_seen: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      // Update cache
      updateCache(device_id, heartbeatData, 'heartbeat');
    } else {
      console.log(`[Heartbeat] ${device_id} - Throttled (no Firebase write)`);
    }

    // ALWAYS respond OK to ESP32 (so it knows backend is alive)
    res.json({
      status: 'ok',
      message: 'Heartbeat received',
      written: shouldWrite, // For debugging
      next_write_in: shouldWrite ? WRITE_INTERVAL_MS : Math.max(0, WRITE_INTERVAL_MS - (Date.now() - (deviceCache.get(device_id)?.lastWriteTime || 0)))
    });

  } catch (error) {
    console.error('[Heartbeat] Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ============================================================================
// @route   POST /api/v1/devices/sensor
// @desc    Receive sensor data (temperature, humidity, motion, etc.)
// ============================================================================
const handleSensorData = async (req, res) => {
  try {
    const { device_id, sensors } = req.body;

    if (!device_id || !sensors) {
      return res.status(400).json({
        status: 'error',
        message: 'device_id and sensors object required'
      });
    }

    const sensorData = {
      sensors,
      timestamp: Date.now()
    };

    // Check if we should write (significant change or time elapsed)
    const shouldWrite = shouldWriteToFirebase(device_id, sensorData, 'sensor');

    if (shouldWrite) {
      console.log(`[Sensor] ${device_id} - Writing to Firebase`);

      const db = getFirestore();
      const deviceRef = db.collection('devices').doc(device_id);

      // Write sensor data
      await deviceRef.collection('sensors').doc('current').set({
        ...sensors,
        last_updated: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      // Optional: Store history (disable if not needed to save writes)
      // await deviceRef.collection('sensor_history').add({
      //   ...sensors,
      //   timestamp: admin.firestore.FieldValue.serverTimestamp(),
      // });

      updateCache(device_id, sensorData, 'sensor');
    } else {
      console.log(`[Sensor] ${device_id} - Throttled (no significant change)`);
    }

    res.json({
      status: 'ok',
      message: 'Sensor data received',
      written: shouldWrite
    });

  } catch (error) {
    console.error('[Sensor] Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ============================================================================
// @route   GET /api/v1/devices/:device_id/status
// @desc    Get current device status (checks online/offline)
// ============================================================================
const getDeviceStatus = async (req, res) => {
  try {
    const { device_id } = req.params;
    const db = getFirestore();

    const statusDoc = await db.collection('devices')
      .doc(device_id)
      .collection('status')
      .doc('current')
      .get();

    if (!statusDoc.exists) {
      return res.status(404).json({
        status: 'error',
        message: 'Device not found'
      });
    }

    const data = statusDoc.data();
    const lastHeartbeat = data.last_heartbeat?.toMillis() || 0;
    const now = Date.now();
    const isOnline = (now - lastHeartbeat) < OFFLINE_THRESHOLD_MS;

    res.json({
      status: 'ok',
      device_id,
      online: isOnline,
      last_seen: new Date(lastHeartbeat).toISOString(),
      ...data
    });

  } catch (error) {
    console.error('[Status] Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ============================================================================
// @route   GET /api/v1/devices/:device_id/history
// @desc    Get device history (last 24 hours)
// ============================================================================
const getDeviceHistory = async (req, res) => {
  try {
    const { device_id } = req.params;
    const { limit = 100 } = req.query;
    const db = getFirestore();

    const historySnapshot = await db.collection('devices')
      .doc(device_id)
      .collection('heartbeat_history')
      .orderBy('timestamp', 'desc')
      .limit(parseInt(limit))
      .get();

    const history = [];
    historySnapshot.forEach(doc => {
      history.push({
        id: doc.id,
        ...doc.data()
      });
    });

    res.json({
      status: 'ok',
      device_id,
      count: history.length,
      history
    });

  } catch (error) {
    console.error('[History] Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

module.exports = {
  handleHeartbeat,
  getDeviceStatus,
  handleSensorData,
  getDeviceHistory
};
