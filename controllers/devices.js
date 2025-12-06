const { getFirestore, admin } = require('../config/firebase');
const { publishFaceDetection, publishDeviceCommand } = require('../config/mqtt');
const crypto = require('crypto');

// ============================================================================
// In-Memory Cache for Throttling (reduces Firebase writes by 95%)
// ============================================================================
const deviceCache = new Map(); // { device_id: { lastWrite, lastData, ... } }

// Helper: Generate secure random token
function generateDeviceToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Thresholds
const WRITE_INTERVAL_MS = 1 * 60 * 1000; // Write every 1 minute
const SENSOR_DELTA_THRESHOLD = 5; // Write if sensor changes by 5%
const OFFLINE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes = offline

// TTL Settings (Firestore auto-deletion)
const STATUS_TTL_SECONDS = 180; // 3 minutes - document auto-deletes if no heartbeat
const HISTORY_RETENTION_DAYS = 30; // Keep history for 30 days

// Helper: Calculate expiration timestamp for status (2 minutes)
function getStatusExpiration() {
  const expirationDate = new Date();
  expirationDate.setSeconds(expirationDate.getSeconds() + STATUS_TTL_SECONDS);
  return admin.firestore.Timestamp.fromDate(expirationDate);
}

// Helper: Calculate expiration timestamp for history (30 days)
function getHistoryExpiration() {
  const expirationDate = new Date();
  expirationDate.setDate(expirationDate.getDate() + HISTORY_RETENTION_DAYS);
  return admin.firestore.Timestamp.fromDate(expirationDate);
}

// Helper: Check if should write to Firebase
function shouldWriteToFirebase(deviceId, newData, dataType = 'heartbeat') {
  const cached = deviceCache.get(deviceId);

  if (!cached) {
    // First time - always write
    return true;
  }

  const now = Date.now();

  // Check last write time for THIS specific data type only
  const lastWriteTime = cached.lastWriteTime?.[dataType] || 0;
  const timeSinceLastWrite = now - lastWriteTime;

  // Always write if 1+ minute elapsed since last write of this type
  if (timeSinceLastWrite >= WRITE_INTERVAL_MS) {
    return true;
  }

  // Check for status changes (online/offline)
  if (dataType === 'heartbeat') {
    // Status changed - write immediately
    const lastHeartbeat = cached.lastData?.heartbeat;
    if (lastHeartbeat && lastHeartbeat.online !== newData.online) {
      return true;
    }
  }

  // Check for significant sensor changes
  if (dataType === 'sensor') {
    const lastSensor = cached.lastData?.sensor;
    if (lastSensor && lastSensor.sensors) {
      for (const [key, value] of Object.entries(newData.sensors || {})) {
        const oldValue = lastSensor.sensors[key];
        if (oldValue !== undefined) {
          const percentChange = Math.abs((value - oldValue) / oldValue) * 100;
          if (percentChange >= SENSOR_DELTA_THRESHOLD) {
            console.log(`[Throttle] Sensor ${key} changed by ${percentChange.toFixed(1)}% - writing`);
            return true;
          }
        }
      }
    }
  }

  // Otherwise, skip write (throttle)
  return false;
}

// Helper: Update cache with separate tracking per data type
function updateCache(deviceId, data, dataType) {
  const cached = deviceCache.get(deviceId) || { lastWriteTime: {}, lastData: {} };

  // Update write time for this specific data type
  cached.lastWriteTime[dataType] = Date.now();

  // Update data for this specific data type
  cached.lastData[dataType] = { ...data, online: true };

  deviceCache.set(deviceId, cached);
}

// History write interval (5 minutes in milliseconds)
const HISTORY_WRITE_INTERVAL_MS = 5 * 60 * 1000;

// Cache for tracking last history write time per device
const historyWriteCache = new Map(); // { device_id: lastHistoryWriteTime }

// Helper: Check if we should write to history (every 30 minutes)
function shouldWriteToHistory(deviceId) {
  const lastWrite = historyWriteCache.get(deviceId);

  if (!lastWrite) {
    return true; // First time - always write
  }

  const now = Date.now();
  const timeSinceLastWrite = now - lastWrite;

  return timeSinceLastWrite >= HISTORY_WRITE_INTERVAL_MS;
}

// Helper: Store sensor reading in history for graphing (30-minute intervals)
async function storeSensorHistory(deviceRef, sensorData, timestamp, deviceId) {
  if (!shouldWriteToHistory(deviceId)) {
    return false; // Skip history write
  }

  // Create history document with timestamp and sensor values
  const historyDoc = {
    timestamp: admin.firestore.Timestamp.fromDate(new Date(timestamp)),
    ...sensorData,
    created_at: admin.firestore.FieldValue.serverTimestamp()
  };

  // Store in history collection with readings subcollection
  await deviceRef.collection('sensors').doc('history').collection('readings').add(historyDoc);

  // Update cache
  historyWriteCache.set(deviceId, Date.now());

  return true;
}

// Helper: Queues a command in Firestore and notifies the device via MQTT
const queueCommand = async (deviceId, action, params = {}) => {
  try {
    const db = getFirestore();
    const deviceRef = db.collection('devices').doc(deviceId);
    const commandRef = await deviceRef.collection('commands').add({
      action,
      params,
      status: 'pending',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      executed_at: null,
      result: null,
    });

    console.log(`[QueueCommand] ${deviceId} - Queued command: ${action} (ID: ${commandRef.id})`);
    await publishDeviceCommand(deviceId, commandRef.id);
    return { success: true, commandId: commandRef.id, deviceId };
  } catch (error) {
    console.error(`[QueueCommand] Failed to queue command ${action} for ${deviceId}:`, error);
    return { success: false, deviceId, error: error.message };
  }
};

// ============================================================================
// @route   POST /api/v1/devices/register
// @desc    Register a new device and generate API token
// ============================================================================
const registerDevice = async (req, res) => {
  try {
    const { device_id, device_type, name } = req.body;

    // Validation
    if (!device_id || !device_type) {
      return res.status(400).json({
        status: 'error',
        message: 'device_id and device_type are required'
      });
    }

    const db = getFirestore();
    const deviceRef = db.collection('devices').doc(device_id);

    // Check if device already exists
    const existingDevice = await deviceRef.get();
    if (existingDevice.exists) {
      return res.status(409).json({
        status: 'error',
        message: 'Device already registered. Use a different device_id or delete existing device first.'
      });
    }

    // Generate secure token
    const apiToken = generateDeviceToken();

    // Create device in Firestore
    await deviceRef.set({
      type: device_type,
      name: name || device_id,
      api_token: apiToken,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      disabled: false
    });

    // Note: No initial status document - it will be created on first heartbeat with TTL
    // This ensures TTL-based online detection works from the start

    console.log(`[Register] New device registered: ${device_id} (${device_type})`);

    res.status(201).json({
      status: 'ok',
      message: 'Device registered successfully',
      device_id,
      api_token: apiToken,
      warning: 'Save this token securely! It will not be shown again.'
    });

  } catch (error) {
    console.error('[Register] Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ============================================================================
// @route   POST /api/v1/devices/heartbeat
// @desc    Receive device heartbeat - ALWAYS respond OK, throttle Firebase writes
//          Also notify device if there are pending commands to fetch
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
    const db = getFirestore();
    const deviceRef = db.collection('devices').doc(device_id);

    if (shouldWrite) {
      console.log(`[Heartbeat] ${device_id} - Writing to Firebase`);

      const now = admin.firestore.FieldValue.serverTimestamp();
      const statusExpireAt = getStatusExpiration();
      const historyExpireAt = getHistoryExpiration();

      // Write current status WITH TTL - auto-deletes if device goes offline
      await deviceRef.collection('live_status').doc('heartbeat').set({
        ...heartbeatData,
        last_heartbeat: now,
        updated_at: now,
        expireAt: statusExpireAt  // TTL: Auto-delete after 2 min if no heartbeat
      }, { merge: true });

      // Update device metadata (no TTL)
      await deviceRef.set({
        type: device_type,
        last_seen: now,
      }, { merge: true });

      // Add to heartbeat history with TTL (auto-delete after 30 days)
      await deviceRef.collection('heartbeat_history').add({
        timestamp: now,
        ip_address: heartbeatData.ip_address,
        uptime_ms: heartbeatData.uptime_ms,
        free_heap: heartbeatData.free_heap,
        wifi_rssi: heartbeatData.wifi_rssi,
        expireAt: historyExpireAt  // TTL: Auto-delete old history
      });

      // Update cache
      updateCache(device_id, heartbeatData, 'heartbeat');
    } else {
      console.log(`[Heartbeat] ${device_id} - Throttled (no Firebase write)`);
    }

    // Check for pending commands (lightweight query)
    let hasPendingCommands = false;
    try {
      const pendingCommandsSnapshot = await deviceRef
        .collection('commands')
        .where('status', '==', 'pending')
        .limit(1)
        .get();

      hasPendingCommands = !pendingCommandsSnapshot.empty;

      if (hasPendingCommands) {
        console.log(`[Heartbeat] ${device_id} - Has pending commands, notifying device`);
      }
    } catch (cmdError) {
      console.error('[Heartbeat] Error checking commands:', cmdError);
      // Non-blocking - continue with heartbeat response
    }

    // ALWAYS respond OK to ESP32 (so it knows backend is alive)
    res.json({
      status: 'ok',
      message: 'Heartbeat received',
      written: shouldWrite, // For debugging
      has_pending_commands: hasPendingCommands, // NEW: Tell device to fetch commands
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

      // Write sensor data to current (for real-time display)
      await deviceRef.collection('sensors').doc('current').set({
        ...sensors,
        timestamp: admin.firestore.Timestamp.fromDate(new Date(sensorData.timestamp)),
        last_updated: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      // Store in history (30-minute intervals for graphing)
      const historyWritten = await storeSensorHistory(deviceRef, sensors, sensorData.timestamp, device_id);
      if (historyWritten) {
        console.log(`[Sensor] ${device_id} - Stored in history (30min interval)`);
      }

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
// @route   POST /api/v1/devices/sensor-data
// @desc    Handle sensor data from room sensors (forwarded by Main_lcd hub)
// @access  Authenticated devices (requires Bearer token)
// ============================================================================
const handleRoomSensorData = async (req, res) => {
  try {
    const { device_id, device_type, data, timestamp, forwarded_by } = req.body;

    if (!device_id || !data) {
      return res.status(400).json({
        status: 'error',
        message: 'device_id and data object required'
      });
    }

    // Convert timestamp from seconds to milliseconds if needed
    // ESP32 sends Unix timestamp in seconds, JavaScript Date needs milliseconds
    let timestampMs = timestamp || Date.now();
    if (timestamp && timestamp < 10000000000) {
      // If timestamp is less than 10 billion, it's in seconds (before year 2286)
      timestampMs = timestamp * 1000;
    }

    const sensorData = {
      ...data,
      timestamp: timestampMs,
      forwarded_by: forwarded_by || 'unknown'
    };

    // Room sensors already throttle on ESP32 side - always write to Firebase
    const shouldWrite = true;

    console.log(`[RoomSensor] ${device_id} - Writing to Firebase (forwarded by: ${forwarded_by})`);

    const db = getFirestore();
    const deviceRef = db.collection('devices').doc(device_id);

    // Write sensor data to current document (for real-time display)
    await deviceRef.collection('sensors').doc('current').set({
      ...data,
      device_type: device_type || 'environmental_sensor',
      forwarded_by: forwarded_by || 'unknown',
      timestamp: admin.firestore.Timestamp.fromDate(new Date(timestampMs)),
      last_updated: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // Store in history (30-minute intervals for graphing)
    const historyWritten = await storeSensorHistory(deviceRef, data, sensorData.timestamp, device_id);
    if (historyWritten) {
      console.log(`[RoomSensor] ${device_id} - Stored in history (30min interval)`);
    }

    // Update cache to track last write
    updateCache(device_id, sensorData, 'sensor');

    res.json({
      status: 'ok',
      message: 'Sensor data received',
      written: shouldWrite
    });

  } catch (error) {
    console.error('[RoomSensor] Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ============================================================================
// @route   GET /api/v1/devices/:device_id/status
// @desc    Get current device status (use expireAt to determine online status)
// ============================================================================
const getDeviceStatus = async (req, res) => {
  try {
    const { device_id } = req.params;
    const db = getFirestore();

    // Get heartbeat status
    const statusDoc = await db.collection('devices')
      .doc(device_id)
      .collection('live_status')
      .doc('heartbeat')
      .get();

    // Get device-specific state (e.g., doorbell camera_active, mic_active)
    const deviceStateDoc = await db.collection('devices')
      .doc(device_id)
      .collection('live_status')
      .doc('device_state')
      .get();

    if (statusDoc.exists) {
      // Document exists - calculate online status from expireAt
      const data = statusDoc.data();

      // Check if device is online based on expireAt timestamp
      const now = Date.now();
      const expireAtMillis = data.expireAt ? data.expireAt.toMillis() : 0;
      const isOnline = expireAtMillis > now;

      // Base response with generic status
      const response = {
        status: 'ok',
        device_id,
        online: isOnline,
        last_heartbeat: data.last_heartbeat,
        uptime_ms: data.uptime_ms,
        free_heap: data.free_heap,
        wifi_rssi: data.wifi_rssi,
        ip_address: data.ip_address,
        expireAt: data.expireAt
      };

      // Merge device-specific state if available (e.g., doorbell camera_active, mic_active)
      if (deviceStateDoc.exists) {
        const deviceState = deviceStateDoc.data();
        Object.assign(response, deviceState);
      }

      res.json(response);
    } else {
      // Document doesn't exist = device went offline and TTL deleted it
      res.json({
        status: 'ok',
        device_id,
        online: false,
        message: 'Device offline (no heartbeat in 2+ minutes)'
      });
    }

  } catch (error) {
    console.error('[Status] Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ============================================================================
// @route   GET /api/v1/devices/status/all
// @desc    Get status of all devices (use expireAt to determine online status)
// @query   type - optional filter by device type (e.g., doorbell, hub, sensor)
// ============================================================================
const getAllDevicesStatus = async (req, res) => {
  try {
    const { type } = req.query;
    const db = getFirestore();

    // Build query - optionally filter by type
    let query = db.collection('devices');
    if (type) {
      query = query.where('type', '==', type);
    }

    const devicesSnapshot = await query.get();

    const devices = [];
    let onlineCount = 0;

    for (const deviceDoc of devicesSnapshot.docs) {
      const deviceId = deviceDoc.id;
      const deviceData = deviceDoc.data();
      const deviceType = deviceData.type || 'unknown';

      let isOnline = false;
      let lastSeenTimestamp = null;
      let statusDetails = {
        uptime_ms: 0,
        free_heap: 0,
        wifi_rssi: -100,
        ip_address: 'N/A',
        sensor_data: null // For sensors
      };

      if (deviceType.includes('sensor')) {
        const SENSOR_OFFLINE_MINUTES = 20;
        const sensorCurrentDoc = await deviceDoc.ref.collection('sensors').doc('current').get();

        if (sensorCurrentDoc.exists) {
          const sensorRawData = sensorCurrentDoc.data();
          let lastUpdatedMillis = 0;
          const timestampValue = sensorRawData.last_updated || sensorRawData.timestamp;

          if (timestampValue) {
            if (typeof timestampValue.toMillis === 'function') {
              lastUpdatedMillis = timestampValue.toMillis();
            } else if (typeof timestampValue === 'string') {
              const parsedDate = new Date(timestampValue);
              if (!isNaN(parsedDate)) {
                lastUpdatedMillis = parsedDate.getTime();
              }
            } else if (timestampValue instanceof Date) {
              lastUpdatedMillis = timestampValue.getTime();
            }
          }

          if (lastUpdatedMillis !== 0) {
            const now = Date.now();
            const lagTimeMs = SENSOR_OFFLINE_MINUTES * 60 * 1000;
            isOnline = (now - lastUpdatedMillis) < lagTimeMs;
            lastSeenTimestamp = new admin.firestore.Timestamp(Math.floor(lastUpdatedMillis / 1000), (lastUpdatedMillis % 1000) * 1000000);
            statusDetails.sensor_data = sensorRawData; // Include all raw sensor data
          }
        }
      } else {
        // ORIGINAL HEARTBEAT LOGIC FOR NON-SENSORS
        const heartbeatDoc = await deviceDoc.ref.collection('live_status').doc('heartbeat').get();

        if (heartbeatDoc.exists) {
          const heartbeatData = heartbeatDoc.data();
          const expireAtMillis = heartbeatData.expireAt ? heartbeatData.expireAt.toMillis() : 0;
          isOnline = expireAtMillis > Date.now();
          lastSeenTimestamp = heartbeatData.last_heartbeat;
          statusDetails.uptime_ms = heartbeatData.uptime_ms || 0;
          statusDetails.free_heap = heartbeatData.free_heap || 0;
          statusDetails.wifi_rssi = heartbeatData.wifi_rssi || -100;
          statusDetails.ip_address = heartbeatData.ip_address || 'unknown';
        }
      }

      if (isOnline) onlineCount++;

      devices.push({
        device_id: deviceId,
        type: deviceType,
        name: deviceData.name || deviceId,
        online: isOnline,
        last_seen: lastSeenTimestamp ? lastSeenTimestamp.toDate().toISOString() : null,
        ...statusDetails
      });
    }

    // Summary stats
    const offlineCount = devices.length - onlineCount;

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      summary: {
        total: devices.length,
        online: onlineCount,
        offline: offlineCount
      },
      devices
    });

  } catch (error) {
    console.error('[AllDevices] Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ============================================================================
// @route   GET /api/v1/devices/:device_id/history
// @desc    Get device history - returns mix of heartbeats, face detections, and commands
// ============================================================================
const getDeviceHistory = async (req, res) => {
  try {
    const { device_id } = req.params;
    const { limit = 20 } = req.query;
    const db = getFirestore();
    const deviceRef = db.collection('devices').doc(device_id);

    // Fetch data from multiple sources in parallel
    const [liveStatusDoc, faceDetectionsSnapshot, commandsSnapshot, deviceLogsSnapshot] = await Promise.all([
      // 1. Current live_status (contains device_state and heartbeat)
      deviceRef
        .collection('live_status')
        .doc('current')
        .get()
        .catch(() => null), // Return null if doesn't exist

      // 2. Recent face detections
      deviceRef
        .collection('face_detections')
        .orderBy('detected_at', 'desc')
        .limit(parseInt(limit))
        .get()
        .catch(() => ({ docs: [] })),

      // 3. Recent commands
      deviceRef
        .collection('commands')
        .orderBy('created_at', 'desc')
        .limit(parseInt(limit))
        .get()
        .catch(() => ({ docs: [] })),

      // 4. Recent device logs
      deviceRef
        .collection('device_logs')
        .orderBy('created_at', 'desc')
        .limit(parseInt(limit))
        .get()
        .catch(() => ({ docs: [] }))
    ]);

    // Process current live status (only 1 entry)
    const statusEvents = [];
    if (liveStatusDoc && liveStatusDoc.exists) {
      const liveData = liveStatusDoc.data();

      // Add device_state as one event
      if (liveData.device_state) {
        statusEvents.push({
          type: 'device_state',
          id: 'current_device_state',
          timestamp: liveData.device_state.timestamp || liveData.timestamp,
          data: liveData.device_state
        });
      }

      // Add heartbeat as another event
      if (liveData.heartbeat) {
        statusEvents.push({
          type: 'heartbeat',
          id: 'current_heartbeat',
          timestamp: liveData.heartbeat.timestamp || liveData.timestamp,
          data: liveData.heartbeat
        });
      }
    }

    // Process face detections
    const faceDetections = [];
    faceDetectionsSnapshot.docs.forEach(doc => {
      faceDetections.push({
        type: 'face_detection',
        id: doc.id,
        timestamp: doc.data().detected_at || doc.data().timestamp,
        data: doc.data()
      });
    });

    // Process commands
    const commands = [];
    commandsSnapshot.docs.forEach(doc => {
      commands.push({
        type: 'command',
        id: doc.id,
        timestamp: doc.data().created_at || doc.data().executed_at,
        data: doc.data()
      });
    });

    // Process device logs
    const deviceLogs = [];
    deviceLogsSnapshot.docs.forEach(doc => {
      deviceLogs.push({
        type: 'device_log',
        id: doc.id,
        timestamp: doc.data().created_at || doc.data().timestamp,
        data: doc.data()
      });
    });

    // Combine all events and sort by timestamp (most recent first)
    const allEvents = [...statusEvents, ...faceDetections, ...commands, ...deviceLogs];

    // Sort by timestamp
    allEvents.sort((a, b) => {
      const timeA = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp || 0);
      const timeB = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp || 0);
      return timeB - timeA; // Descending order (newest first)
    });

    // Return mixed history
    res.json({
      status: 'ok',
      device_id,
      summary: {
        total: allEvents.length,
        status_events: statusEvents.length,
        face_detections: faceDetections.length,
        commands: commands.length,
        device_logs: deviceLogs.length
      },
      history: allEvents.slice(0, parseInt(limit)) // Limit total results
    });

  } catch (error) {
    console.error('[History] Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ============================================================================
// @route   POST /api/v1/devices/doorbell/ring
// @desc    Receive doorbell ring event - notify hub to play audio (no Firebase save)
//          Hub can poll or use real-time listeners for notifications
// ============================================================================
const handleDoorbellRing = async (req, res) => {
  try {
    const { device_id } = req.body;

    // Validation
    if (!device_id) {
      return res.status(400).json({
        status: 'error',
        message: 'device_id is required'
      });
    }

    console.log(`[Doorbell] ${device_id} - Ring event received (not saving to Firebase)`);

    // Just acknowledge the ring - hub will play audio via other mechanism
    // No Firebase write to save space
    res.json({
      status: 'ok',
      message: 'Doorbell ring received',
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('[Doorbell] Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ============================================================================
// @route   POST /api/v1/devices/doorbell/face-detection
// @desc    Receive face detection event from doorbell camera - save to Firebase
//          Stores image (uploaded via multipart/form-data), name, timestamp, etc.
// ============================================================================
const handleFaceDetection = async (req, res) => {
  try {
    // Form fields from multipart/form-data
    const { device_id, name, confidence, timestamp, recognized } = req.body;
    // Image file from multer (req.file)
    const imageFile = req.file;

    // Validation
    if (!device_id) {
      return res.status(400).json({
        status: 'error',
        message: 'device_id is required'
      });
    }

    console.log(`[FaceDetection] ${device_id} - Face detection event received`);
    console.log(`  Recognized: ${recognized}, Name: ${name || 'Unknown'}, Confidence: ${confidence || 0}`);
    console.log(`  Image: ${imageFile ? `${imageFile.size} bytes (${imageFile.mimetype})` : 'None'}`);
    console.log(`  Buffer available: ${imageFile && imageFile.buffer ? 'Yes' : 'No'}`);

    const db = getFirestore();
    const deviceRef = db.collection('devices').doc(device_id);

    let imageUrl = null;

    // Upload image to Firebase Storage if provided
    if (imageFile && imageFile.buffer && imageFile.buffer.length > 0) {
      try {
        const bucket = admin.storage().bucket();
        const fileName = `face_detections/${device_id}/${Date.now()}.jpg`;
        const file = bucket.file(fileName);

        console.log(`[FaceDetection] Uploading ${imageFile.buffer.length} bytes to ${fileName}`);

        // Upload the image buffer with timeout
        await file.save(imageFile.buffer, {
          metadata: {
            contentType: imageFile.mimetype || 'image/jpeg',
          },
          public: true, // Make publicly accessible
          timeout: 30000 // 30 second timeout for upload
        });

        // Get public URL
        imageUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

        console.log(`[FaceDetection] Image uploaded successfully: ${imageUrl}`);
      } catch (uploadError) {
        console.error('[FaceDetection] Failed to upload image to Firebase Storage:', uploadError);
        console.error('[FaceDetection] Upload error details:', uploadError.message);
        // Continue without image URL - non-blocking error
      }
    } else {
      console.warn('[FaceDetection] No valid image buffer received');
    }

    // Create face detection event data
    const faceDetectionEvent = {
      recognized: recognized === 'true' || recognized === true,  // Parse boolean from form data
      name: name || 'Unknown',
      confidence: confidence ? parseFloat(confidence) : null,
      image: imageUrl, // Firebase Storage URL
      timestamp: timestamp || admin.firestore.FieldValue.serverTimestamp(),
      detected_at: admin.firestore.FieldValue.serverTimestamp()
    };

    // Write event to Firebase
    const eventRef = await deviceRef.collection('face_detections').add(faceDetectionEvent);

    console.log(`[FaceDetection] ${device_id} - Saved to Firebase with ID: ${eventRef.id}`);

    // Publish to MQTT for instant hub notification
    try {
      await publishFaceDetection({
        device_id,
        recognized: faceDetectionEvent.recognized,
        name: name || 'Unknown',
        confidence: confidence ? parseFloat(confidence) : 0,
        event_id: eventRef.id,
        image_url: imageUrl
      });
    } catch (mqttError) {
      console.error('[FaceDetection] MQTT publish failed:', mqttError);
      // Non-blocking - event still saved to Firebase
    }

    // Respond to doorbell device
    res.json({
      status: 'ok',
      message: 'Face detection event saved' + (imageUrl ? ' with image' : ' (no image)'),
      event_id: eventRef.id,
      image_url: imageUrl,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('[FaceDetection] Error:', error);
    console.error('[FaceDetection] Error stack:', error.stack);
    res.status(500).json({
      status: 'error',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// ============================================================================
// @route   POST /api/v1/devices/:device_id/log
// @desc    Unified log endpoint - any device can send logs (hub, doorbell, etc.)
// ============================================================================
const handleDeviceLog = async (req, res) => {
  try {
    const { device_id } = req.params;
    const { level, message, data, timestamp, metadata } = req.body;

    // Validation
    if (!level || !message) {
      return res.status(400).json({
        status: 'error',
        message: 'level and message are required'
      });
    }

    console.log(`[DeviceLog] ${device_id} [${level}] - ${message}`);

    const db = getFirestore();
    const deviceRef = db.collection('devices').doc(device_id);

    // Create log entry
    const logEntry = {
      level,  // 'error', 'warning', 'info', 'debug'
      message,
      data: data || null,
      timestamp: timestamp || admin.firestore.FieldValue.serverTimestamp(),
      created_at: admin.firestore.FieldValue.serverTimestamp()
    };

    // Add error_message from metadata if present
    if (metadata && metadata.error_message) {
      logEntry.error_message = metadata.error_message;
    }

    // Write log to Firebase (in device_logs collection)
    await deviceRef.collection('device_logs').add(logEntry);

    // If it's an error, also update device status
    if (level === 'error') {
      await deviceRef.collection('live_status').doc('heartbeat').set({
        last_error: message,
        last_error_time: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }

    // Respond to device
    res.json({
      status: 'ok',
      message: 'Log saved successfully'
    });

  } catch (error) {
    console.error('[DeviceLog] Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ============================================================================
// @route   POST /api/v1/devices/doorbell/status
// @desc    Doorbell pushes its status/info to server (camera state, etc.)
//          ALSO acts as heartbeat - resets TTL timer to keep device online
// ============================================================================
const handleDoorbellStatus = async (req, res) => {
  try {
    const {
      device_id,
      camera_active,
      mic_active,
      // Optional heartbeat fields (if doorbell wants to send them)
      uptime_ms,
      free_heap,
      wifi_rssi,
      ip_address
    } = req.body;

    if (!device_id) {
      return res.status(400).json({
        status: 'error',
        message: 'device_id is required'
      });
    }

    console.log(`[DoorbellStatus] ${device_id} - Received status update (also acts as heartbeat)`);

    const db = getFirestore();
    const deviceRef = db.collection('devices').doc(device_id);
    const now = admin.firestore.FieldValue.serverTimestamp();
    const statusExpireAt = getStatusExpiration();

    // Update doorbell-specific status in Firebase (includes heartbeat fields)
    const doorbellStatus = {
      camera_active: camera_active !== undefined ? camera_active : false,
      mic_active: mic_active !== undefined ? mic_active : false,
      ip_address: ip_address || req.ip,
      last_updated: now
    };

    // Include optional heartbeat fields if provided
    if (uptime_ms !== undefined) doorbellStatus.uptime_ms = uptime_ms;
    if (free_heap !== undefined) doorbellStatus.free_heap = free_heap;
    if (wifi_rssi !== undefined) doorbellStatus.wifi_rssi = wifi_rssi;

    await deviceRef.collection('live_status').doc('device_state').set(doorbellStatus, { merge: true });

    // ALSO update the main status document to reset TTL (acts as heartbeat)
    const heartbeatData = {
      online: true,
      last_heartbeat: now,
      updated_at: now,
      expireAt: statusExpireAt,  // TTL: Reset expiration timer
      ip_address: ip_address || req.ip,
    };

    // Include optional heartbeat fields if provided
    if (uptime_ms !== undefined) heartbeatData.uptime_ms = uptime_ms;
    if (free_heap !== undefined) heartbeatData.free_heap = free_heap;
    if (wifi_rssi !== undefined) heartbeatData.wifi_rssi = wifi_rssi;

    await deviceRef.collection('live_status').doc('heartbeat').set(heartbeatData, { merge: true });

    // Update device metadata
    await deviceRef.set({
      type: 'doorbell',
      last_seen: now,
    }, { merge: true });

    console.log(`[DoorbellStatus] ${device_id} - Status updated and TTL reset`);

    res.json({
      status: 'ok',
      message: 'Doorbell status updated and heartbeat recorded'
    });

  } catch (error) {
    console.error('[DoorbellStatus] Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ============================================================================
// @route   GET /api/v1/devices/doorbell/:device_id/status
// @desc    Get doorbell status from Firebase (not proxy - data pushed by doorbell)
// ============================================================================
const getDoorbellStatus = async (req, res) => {
  try {
    const { device_id } = req.params;
    const db = getFirestore();

    // Get doorbell status from Firebase
    const statusDoc = await db.collection('devices')
      .doc(device_id)
      .collection('live_status')
      .doc('device_state')
      .get();

    if (!statusDoc.exists) {
      return res.status(404).json({
        status: 'error',
        message: 'No doorbell status found. Device may not have sent status yet.'
      });
    }

    // Check if device is online by checking heartbeat status
    // Device is online if heartbeat document exists (TTL auto-deletes if offline)
    const heartbeatDoc = await db.collection('devices')
      .doc(device_id)
      .collection('live_status')
      .doc('heartbeat')
      .get();

    const isOnline = heartbeatDoc.exists;

    // Get status data and add online field
    const statusData = statusDoc.data();

    res.json({
      status: 'ok',
      device_id,
      data: {
        ...statusData,
        online: isOnline
      }
    });

  } catch (error) {
    console.error('[GetDoorbellStatus] Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ============================================================================
// @route   POST /api/v1/devices/:device_id/command
// @desc    Send command to device (device get alerted by MQTT)
// ============================================================================
const sendDeviceCommand = async (req, res) => {
  try {
    const { device_id } = req.params;
    const { action, params } = req.body;

    // Validate action
    const validActions = [
      'camera_start',
      'camera_stop',
      'camera_restart',
      'mic_start',
      'mic_stop',
      'mic_status',
      'recording_start',
      'recording_stop',
      'start_preview',
      'recognize_face',
      'reboot',
      'update_config',
      'amp_play',
      'amp_stop',
      'amp_restart',
      'amp_volume',
      'amp_status',
      'amp_list',
      'amp_wifi',
      'system_restart',
      // Doorlock actions
      'lock',
      'unlock',
      'status',
    ];

    if (!action || !validActions.includes(action)) {
      return res.status(400).json({
        status: 'error',
        message: `Invalid action. Must be one of: ${validActions.join(', ')}`
      });
    }

    const db = getFirestore();
    const deviceRef = db.collection('devices').doc(device_id);

    // Verify device exists
    const deviceDoc = await deviceRef.get();
    if (!deviceDoc.exists) {
      return res.status(404).json({
        status: 'error',
        message: 'Device not found'
      });
    }

    // Create command document
    const commandRef = await deviceRef.collection('commands').add({
      action : action,
      params: params || {},
      status: 'pending',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      executed_at: null,
      result: null
    });

    console.log(`[SendCommand] ${device_id} - Queued command: ${action} (ID: ${commandRef.id})`);

    // Notify device via MQTT to fetch commands immediately (faster than waiting for heartbeat)
    await publishDeviceCommand(device_id, commandRef.id);

    res.json({
      status: 'ok',
      message: 'Command queued and device notified via MQTT.',
      command_id: commandRef.id,
      action
    });

  } catch (error) {
    console.error('[SendCommand] Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ============================================================================
// @route   GET /api/v1/devices/commands/pending
// @desc    Device fetches pending commands (called when heartbeat says has_pending_commands=true)
// ============================================================================
const fetchPendingCommands = async (req, res) => {
  try {
    const { device_id } = req.body;

    if (!device_id) {
      return res.status(400).json({
        status: 'error',
        message: 'device_id is required'
      });
    }

    const db = getFirestore();
    const deviceRef = db.collection('devices').doc(device_id);

    // Get all pending commands
    const pendingCommandsSnapshot = await deviceRef
      .collection('commands')
      .where('status', '==', 'pending')
      .orderBy('created_at', 'asc')
      .get();

    const commands = [];
    pendingCommandsSnapshot.forEach(doc => {
      commands.push({
        id: doc.id,
        action: doc.data().action,
        params: doc.data().params || {},
        created_at: doc.data().created_at
      });
    });

    console.log(`[FetchCommands] ${device_id} - Returning ${commands.length} pending command(s)`);

    res.json({
      status: 'ok',
      count: commands.length,
      commands
    });

  } catch (error) {
    console.error('[FetchCommands] Error:', error);

    // Check if error is due to missing Firestore index
    if (error.message && error.message.includes('index')) {
      return res.status(500).json({
        status: 'error',
        message: 'Firestore index required. Run: firebase deploy --only firestore:indexes',
        details: error.message
      });
    }

    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ============================================================================
// @route   POST /api/v1/devices/commands/ack
// @desc    Device acknowledges command execution (success or failure)
// ============================================================================
const acknowledgeCommand = async (req, res) => {
  try {
    const { device_id, command_id, success, result, error } = req.body;

    if (!device_id || !command_id) {
      return res.status(400).json({
        status: 'error',
        message: 'device_id and command_id are required'
      });
    }

    const db = getFirestore();
    const commandRef = db
      .collection('devices')
      .doc(device_id)
      .collection('commands')
      .doc(command_id);

    // Verify command exists
    const commandDoc = await commandRef.get();
    if (!commandDoc.exists) {
      return res.status(404).json({
        status: 'error',
        message: 'Command not found'
      });
    }

    // Update command status
    await commandRef.update({
      status: success ? 'completed' : 'failed',
      executed_at: admin.firestore.FieldValue.serverTimestamp(),
      result: result || null,
      error: error || null
    });

    console.log(`[AckCommand] ${device_id} - Command ${command_id} ${success ? 'completed' : 'failed'}`);

    res.json({
      status: 'ok',
      message: 'Command acknowledgment received'
    });

  } catch (error) {
    console.error('[AckCommand] Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ============================================================================
// @route   POST /api/v1/devices/commands/manual-unlock
// @desc    Handle manual unlock notification from doorlock device
// @access  Private (requires device token)
// ============================================================================
const handleManualUnlock = async (req, res) => {
  try {
    const { device_id, device_type, location, action, timestamp, api_token } = req.body;

    // Validation
    if (!device_id) {
      return res.status(400).json({
        status: 'error',
        message: 'device_id is required'
      });
    }

    console.log(`[ManualUnlock] ${device_id} - Manual unlock event received`);
    console.log(`  Location: ${location || 'Unknown'}`);
    console.log(`  Timestamp: ${timestamp || Date.now()}`);

    const db = getFirestore();
    const deviceRef = db.collection('devices').doc(device_id);

    // Log the manual unlock event to device logs
    const logEntry = {
      level: 'info',
      message: 'Manual unlock button pressed',
      data: {
        device_type: device_type || 'doorlock',
        location: location || 'Unknown',
        action: action || 'manual_unlock',
        manual_trigger: true
      },
      timestamp: timestamp ? admin.firestore.Timestamp.fromMillis(timestamp) : admin.firestore.FieldValue.serverTimestamp(),
      created_at: admin.firestore.FieldValue.serverTimestamp()
    };

    // Write log to device_logs collection
    const logRef = await deviceRef.collection('device_logs').add(logEntry);

    console.log(`[ManualUnlock] ${device_id} - Event logged with ID: ${logRef.id}`);

    // Optionally: Create a notification or trigger other actions
    // For example, you could publish to MQTT to notify other devices

    res.json({
      status: 'ok',
      message: 'Manual unlock event recorded'
    });

  } catch (error) {
    console.error('[ManualUnlock] Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ============================================================================
// Amplifier Global Control Endpoints (affecting all hub/doorbell devices)
// ============================================================================
const playAmplifierAll = async (req, res) => {
      const { url } = req.query;
      if (!url) {
        return res.status(400).json({ status: 'error', message: 'url parameter is required' });
      }

      try {
        const db = getFirestore();
        const devicesSnapshot = await db.collection('devices').where('type', 'in', ['hb', 'db']).get();

        if (devicesSnapshot.empty) {
          return res.status(404).json({ status: 'ok', message: 'No amplifier devices found.' });
        }

        const promises = devicesSnapshot.docs.map(doc => queueCommand(doc.id, 'amp_play', { url }));
        const results = await Promise.all(promises);

        const successes = results.filter(r => r.success);
        const failures = results.filter(r => !r.success);

        res.json({
          status: 'ok',
          message: `Attempted to play on ${results.length} device(s).`,
          success_count: successes.length,
          failure_count: failures.length,
          successes,
          failures
        });
      } catch (error) {
        console.error('[playAmplifierAll] Error:', error);
        res.status(500).json({ status: 'error', message: error.message });
      }
    };

const stopAmplifierAll = async (req, res) => {
      try {
        const db = getFirestore();
        const devicesSnapshot = await db.collection('devices').where('type', 'in', ['hb', 'db']).get();

        if (devicesSnapshot.empty) {
          return res.status(404).json({ status: 'ok', message: 'No amplifier devices found.' });
        }

        const promises = devicesSnapshot.docs.map(doc => queueCommand(doc.id, 'amp_stop', {}));
        const results = await Promise.all(promises);

        const successes = results.filter(r => r.success);
        const failures = results.filter(r => !r.success);

        res.json({
          status: 'ok',
          message: `Attempted to stop on ${results.length} device(s).`,
          success_count: successes.length,
          failure_count: failures.length,
          successes,
          failures
        });
      } catch (error) {
        console.error('[stopAmplifierAll] Error:', error);
        res.status(500).json({ status: 'error', message: error.message });
      }
    };

const setAmplifierVolumeAll = async (req, res) => {
    const { level } = req.query;

    if (level === undefined) {
      return res.status(400).json({
        status: 'error',
        message: 'level parameter is required (0-21)'
      });
    }

    const volumeLevel = parseInt(level);
    if (isNaN(volumeLevel) || volumeLevel < 0 || volumeLevel > 21) {
      return res.status(400).json({
        status: 'error',
        message: 'level must be a number between 0 and 21'
      });
    }
      try {
        const db = getFirestore();
        const devicesSnapshot = await db.collection('devices').where('type', 'in', ['hb', 'db']).get();

        if (devicesSnapshot.empty) {
          return res.status(404).json({ status: 'ok', message: 'No amplifier devices found.' });
        }

        const promises = devicesSnapshot.docs.map(doc => queueCommand(doc.id, 'amp_volume', { level: volumeLevel }));
        const results = await Promise.all(promises);

        const successes = results.filter(r => r.success);
        const failures = results.filter(r => !r.success);

        res.json({
          status: 'ok',
          message: `Attempted to set volume on ${results.length} device(s).`,
          success_count: successes.length,
          failure_count: failures.length,
          successes,
          failures
        });
      } catch (error) {
        console.error('[setAmplifierVolumeAll] Error:', error);
        res.status(500).json({ status: 'error', message: error.message });
      }
    };

const restartAmplifierAll = async (req, res) => {
      try {
        const db = getFirestore();
        const devicesSnapshot = await db.collection('devices').where('type', 'in', ['hb', 'db']).get();

        if (devicesSnapshot.empty) {
          return res.status(404).json({ status: 'ok', message: 'No amplifier devices found.' });
        }

        const promises = devicesSnapshot.docs.map(doc => queueCommand(doc.id, 'amp_restart', {}));
        const results = await Promise.all(promises);

        const successes = results.filter(r => r.success);
        const failures = results.filter(r => !r.success);

        res.json({
          status: 'ok',
          message: `Attempted to restart on ${results.length} device(s).`,
          success_count: successes.length,
          failure_count: failures.length,
          successes,
          failures
        });
      } catch (error) {
        console.error('[restartAmplifierAll] Error:', error);
        res.status(500).json({ status: 'error', message: error.message });
      }
    };

// ============================================================================
// Face Management Endpoints
// ============================================================================

const getFaceCount = async (req, res) => {
  try {
    const { device_id } = req.params;

    const db = getFirestore();
    const deviceRef = db.collection('devices').doc(device_id);

    // Queue face_count command
    const commandRef = await deviceRef.collection('commands').add({
      action: 'face_count',
      params: {},
      status: 'pending',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      executed_at: null,
      result: null
    });

    console.log(`[FaceManagement] ${device_id} - Get face count command queued (ID: ${commandRef.id})`);

    // Notify device via MQTT
    await publishDeviceCommand(device_id, commandRef.id);

    res.json({
      status: 'ok',
      message: 'Face count command queued and device notified',
      command_id: commandRef.id
    });
  } catch (error) {
    console.error('[FaceManagement] Error getting face count:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

const listFaces = async (req, res) => {
  try {
    const { device_id } = req.params;

    const db = getFirestore();
    const deviceRef = db.collection('devices').doc(device_id);

    // Queue face_list command
    const commandRef = await deviceRef.collection('commands').add({
      action: 'face_list',
      params: {},
      status: 'pending',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      executed_at: null,
      result: null
    });

    console.log(`[FaceManagement] ${device_id} - List faces command queued (ID: ${commandRef.id})`);

    // Notify device via MQTT
    await publishDeviceCommand(device_id, commandRef.id);

    res.json({
      status: 'ok',
      message: 'Face list command queued and device notified (output will be in serial)',
      command_id: commandRef.id
    });
  } catch (error) {
    console.error('[FaceManagement] Error listing faces:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

const checkFaceDatabase = async (req, res) => {
  try {
    const { device_id } = req.params;

    const db = getFirestore();
    const deviceRef = db.collection('devices').doc(device_id);

    // Queue face_check command
    const commandRef = await deviceRef.collection('commands').add({
      action: 'face_check',
      params: {},
      status: 'pending',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      executed_at: null,
      result: null
    });

    console.log(`[FaceManagement] ${device_id} - Check face database command queued (ID: ${commandRef.id})`);

    // Notify device via MQTT
    await publishDeviceCommand(device_id, commandRef.id);

    res.json({
      status: 'ok',
      message: 'Face database check command queued and device notified',
      command_id: commandRef.id
    });
  } catch (error) {
    console.error('[FaceManagement] Error checking face database:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// @desc    Sync face database (queues all three commands: face_count, face_list, face_check)
// @access  Private (requires user token)
const syncFaceDatabase = async (req, res) => {
  try {
    const { device_id } = req.params;

    const db = getFirestore();
    const deviceRef = db.collection('devices').doc(device_id);

    // Queue sync_database command - ESP32 will handle executing all three
    const commandRef = await deviceRef.collection('commands').add({
      action: 'sync_database',
      params: {},
      status: 'pending',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      executed_at: null,
      result: null
    });

    console.log(`[FaceManagement] ${device_id} - Sync database command queued (ID: ${commandRef.id})`);

    // Notify device via MQTT
    await publishDeviceCommand(device_id, commandRef.id);

    res.json({
      status: 'ok',
      message: 'Face database sync command queued and device notified',
      command_id: commandRef.id
    });
  } catch (error) {
    console.error('[FaceManagement] Error syncing face database:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// @desc    Receive face database results from device (face_count, face_list, face_check)
// @access  Private (requires device token)
const handleFaceDatabaseResult = async (req, res) => {
  try {
    const { device_id } = req.params;
    const { type, count, faces, status, message } = req.body;

    if (!type || !['face_count', 'face_list', 'face_check'].includes(type)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid type. Must be face_count, face_list, or face_check'
      });
    }

    const db = getFirestore();
    const deviceRef = db.collection('devices').doc(device_id);

    // Prepare result data based on type
    const resultData = {
      type,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      created_at: admin.firestore.FieldValue.serverTimestamp()
    };

    if (type === 'face_count') {
      resultData.count = count || 0;
    } else if (type === 'face_list') {
      resultData.faces = faces || [];
      resultData.count = faces ? faces.length : 0;
    } else if (type === 'face_check') {
      resultData.status = status || 'unknown';
      resultData.message = message || '';
    }

    // Save to face_database collection (with TTL for history)
    await deviceRef.collection('face_database').add({
      ...resultData,
      ttl: admin.firestore.FieldValue.serverTimestamp()
    });

    // Update live_status/face_database with latest result (overwrites previous)
    await deviceRef.collection('live_status').doc('face_database').set({
      ...resultData,
      last_updated: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    console.log(`[FaceDatabase] ${device_id} - Received ${type} result:`, resultData);

    res.json({
      status: 'ok',
      message: 'Face database result saved successfully'
    });
  } catch (error) {
    console.error('[FaceDatabase] Error saving face database result:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// @desc    Get current face database info (for frontend display)
// @access  Private (requires user token)
const getFaceDatabaseInfo = async (req, res) => {
  try {
    const { device_id } = req.params;

    const db = getFirestore();
    const deviceRef = db.collection('devices').doc(device_id);

    // Get latest face database status from live_status
    const faceDbDoc = await deviceRef
      .collection('live_status')
      .doc('face_database')
      .get();

    if (!faceDbDoc.exists) {
      return res.json({
        status: 'ok',
        device_id,
        face_database: null,
        message: 'No face database information available'
      });
    }

    const faceDbData = faceDbDoc.data();

    res.json({
      status: 'ok',
      device_id,
      face_database: {
        type: faceDbData.type,
        count: faceDbData.count || 0,
        faces: faceDbData.faces || [],
        db_status: faceDbData.status || 'unknown',
        db_message: faceDbData.message || '',
        last_updated: faceDbData.last_updated
      }
    });
  } catch (error) {
    console.error('[FaceDatabase] Error fetching face database info:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ============================================================================
// Device Info Endpoint
// ============================================================================

const getDeviceInfo = async (req, res) => {
  try {
    const { device_id } = req.params;

    const db = getFirestore();
    const deviceRef = db.collection('devices').doc(device_id);

    // Get device document to check type
    const deviceDoc = await deviceRef.get();
    if (!deviceDoc.exists) {
      return res.status(404).json({
        status: 'error',
        message: 'Device not found'
      });
    }
    const deviceData = deviceDoc.data();

    // Special case for sensors which may not have a heartbeat
    if (deviceData.type && deviceData.type.includes('sensor')) {
      const SENSOR_OFFLINE_MINUTES = 20;
      const sensorDoc = await deviceRef.collection('sensors').doc('current').get();

      if (!sensorDoc.exists) {
        return res.json({
          status: 'ok',
          online: false,
          message: 'Sensor has never reported data.',
          ip: 'N/A',
          free_heap: 0,
          uptime: 0,
          slave_status: 0,
          amp_status: 0,
          mesh_status: -1,
          ping_count: 0,
          wifi_rssi: -100,
          last_heartbeat: null,
          device_state: {}
        });
      }

      const sensorData = sensorDoc.data();
      
      let lastUpdated = 0;
      // Prefer server-side timestamp, fall back to device-side
      const timestampValue = sensorData.last_updated || sensorData.timestamp;

      if (timestampValue) {
        // Handle Firestore Timestamp object, which has a toMillis method
        if (typeof timestampValue.toMillis === 'function') {
          lastUpdated = timestampValue.toMillis();
        } 
        // Handle ISO 8601 string date format
        else if (typeof timestampValue === 'string') {
          const parsedDate = new Date(timestampValue);
          if (!isNaN(parsedDate)) {
            lastUpdated = parsedDate.getTime();
          }
        }
        // Handle JavaScript Date object
        else if (timestampValue instanceof Date) {
            lastUpdated = timestampValue.getTime();
        }
      }
      
      if (lastUpdated === 0) {
        return res.json({
          status: 'ok',
          online: false,
          message: 'Sensor data is missing a valid timestamp.',
          ip: 'N/A',
          free_heap: 0,
          uptime: 0,
          slave_status: 0,
          amp_status: 0,
          mesh_status: -1,
          ping_count: 0,
          wifi_rssi: -100,
          last_heartbeat: null,
          device_state: {}
        });
      }

      const now = Date.now();
      const lagTimeMs = SENSOR_OFFLINE_MINUTES * 60 * 1000;
      const isOnline = (now - lastUpdated) < lagTimeMs;

      return res.json({
        status: 'ok',
        online: isOnline,
        ip: 'N/A',
        free_heap: 0,
        uptime: 0,
        slave_status: 0,
        amp_status: 0,
        mesh_status: -1,
        ping_count: 0,
        wifi_rssi: -100,
        last_heartbeat: sensorData.last_updated || sensorData.timestamp,
        device_state: sensorData, // Return all sensor data in device_state
      });
    }

    // Original logic for devices with heartbeats
    const heartbeatDoc = await deviceRef
      .collection('live_status')
      .doc('heartbeat')
      .get();

    const deviceStateDoc = await deviceRef
      .collection('live_status')
      .doc('device_state')
      .get();

    if (!heartbeatDoc.exists) {
      return res.status(404).json({
        status: 'error',
        message: 'Device not found or offline'
      });
    }

    const heartbeatData = heartbeatDoc.data();
    const deviceStateData = deviceStateDoc.exists ? deviceStateDoc.data() : {};

    // Calculate online status
    const now = Date.now();
    const expireAtMillis = heartbeatData.expireAt ? heartbeatData.expireAt.toMillis() : 0;
    const isOnline = expireAtMillis > now;

    // Build info response similar to HTML controller expectations
    res.json({
      status: 'ok',
      online: isOnline,
      ip: heartbeatData.ip_address || 'unknown',
      free_heap: heartbeatData.free_heap || 0,
      uptime: heartbeatData.uptime_ms || 0,
      slave_status: deviceStateData.camera_active ? 1 : 0,
      amp_status: deviceStateData.audio_active ? 1 : 0,
      mesh_status: -1, // Not tracked yet
      ping_count: 0, // Not tracked yet
      wifi_rssi: heartbeatData.wifi_rssi || -100,
      last_heartbeat: heartbeatData.last_heartbeat,
      device_state: deviceStateData
    });

  } catch (error) {
    console.error('[DeviceInfo] Error getting device info:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ============================================================================
// @route   GET /api/v1/devices/:device_id/visitors/latest
// @desc    Get latest visitors (face detections) with images
// ============================================================================
const getLatestVisitors = async (req, res) => {
  try {
    const { device_id } = req.params;
    const limit = parseInt(req.query.limit) || 20;

    console.log(`[LatestVisitors] ${device_id} - Fetching ${limit} latest visitors`);

    const db = getFirestore();
    const deviceRef = db.collection('devices').doc(device_id);

    // Query face_detections collection ordered by detected_at (most recent first)
    const visitorsSnapshot = await deviceRef
      .collection('face_detections')
      .orderBy('detected_at', 'desc')
      .limit(limit)
      .get();

    if (visitorsSnapshot.empty) {
      return res.json({
        status: 'ok',
        device_id,
        count: 0,
        visitors: []
      });
    }

    // Transform Firestore documents to visitor objects
    const visitors = visitorsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name || 'Unknown',
        image: data.image || null,
        recognized: data.recognized || false,
        confidence: data.confidence || 0,
        timestamp: data.timestamp || data.detected_at,
        detected_at: data.detected_at
      };
    });

    console.log(`[LatestVisitors] ${device_id} - Found ${visitors.length} visitors`);

    res.json({
      status: 'ok',
      device_id,
      count: visitors.length,
      visitors
    });

  } catch (error) {
    console.error('[LatestVisitors] Error fetching visitors:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// ============================================================================
// Hub-Specific Endpoints
// ============================================================================

// @desc    Get Hub sensor data (DHT11 temperature/humidity + PM2.5 air quality)
// @route   GET /api/v1/devices/:device_id/hub/sensors
// @access  Protected
const getHubSensors = async (req, res) => {
  try {
    const { device_id } = req.params;

    const db = getFirestore();
    const deviceRef = db.collection('devices').doc(device_id);

    // Get the current sensor data from sensors/current document
    const sensorDoc = await deviceRef
      .collection('sensors')
      .doc('current')
      .get();

    if (!sensorDoc.exists) {
      return res.status(404).json({
        status: 'error',
        message: 'No sensor data found. Hub may not have sent data yet.'
      });
    }

    const data = sensorDoc.data();

    // Helper function to calculate AQI from PM2.5
    const calculateAQI = (pm25) => {
      if (pm25 == null) return null;

      // EPA AQI breakpoints for PM2.5
      if (pm25 <= 12.0) return Math.round((50 / 12.0) * pm25);
      if (pm25 <= 35.4) return Math.round(((100 - 51) / (35.4 - 12.1)) * (pm25 - 12.1) + 51);
      if (pm25 <= 55.4) return Math.round(((150 - 101) / (55.4 - 35.5)) * (pm25 - 35.5) + 101);
      if (pm25 <= 150.4) return Math.round(((200 - 151) / (150.4 - 55.5)) * (pm25 - 55.5) + 151);
      if (pm25 <= 250.4) return Math.round(((300 - 201) / (250.4 - 150.5)) * (pm25 - 150.5) + 201);
      return Math.round(((500 - 301) / (500.4 - 250.5)) * (pm25 - 250.5) + 301);
    };

    // Extract sensor data with correct field names from Firebase
    const sensorData = {
      temperature: data.temperature != null ? data.temperature : null,
      humidity: data.humidity != null ? data.humidity : null,
      pm25: data.pm2_5 != null ? data.pm2_5 : null,  // Note: Firebase stores as pm2_5
      pm10: data.pm10 != null ? data.pm10 : null,
      pm1_0: data.pm1_0 != null ? data.pm1_0 : null,
      aqi: data.aqi != null ? data.aqi : calculateAQI(data.pm2_5),  // Calculate if not stored
      timestamp: data.timestamp,
      device_id
    };

    console.log(`[HubSensors] ${device_id} - Retrieved sensor data from sensors/current:`, sensorData);

    res.json({
      status: 'ok',
      device_id,
      sensors: sensorData
    });

  } catch (error) {
    console.error('[HubSensors] Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// @desc    Send alert to Hub LCD display
// @route   POST /api/v1/devices/:device_id/hub/alert
// @access  Protected
const sendHubAlert = async (req, res) => {
  try {
    const { device_id } = req.params;
    const { message, level, duration } = req.body;

    // Validate message
    if (!message) {
      return res.status(400).json({
        status: 'error',
        message: 'Alert message is required'
      });
    }

    // Validate level (info, warning, error, critical)
    const validLevels = ['info', 'warning', 'error', 'critical'];
    const alertLevel = level || 'info';

    if (!validLevels.includes(alertLevel)) {
      return res.status(400).json({
        status: 'error',
        message: `Invalid alert level. Must be one of: ${validLevels.join(', ')}`
      });
    }

    // Validate duration (seconds to display alert, default 10)
    const alertDuration = duration || 10;
    if (isNaN(alertDuration) || alertDuration < 1 || alertDuration > 300) {
      return res.status(400).json({
        status: 'error',
        message: 'Duration must be between 1 and 300 seconds'
      });
    }

    const db = getFirestore();
    const deviceRef = db.collection('devices').doc(device_id);

    // Verify device exists and is a Hub
    const deviceDoc = await deviceRef.get();
    if (!deviceDoc.exists) {
      return res.status(404).json({
        status: 'error',
        message: 'Device not found'
      });
    }

    // Queue hub_alert command
    const commandRef = await deviceRef.collection('commands').add({
      action: 'hub_alert',
      params: {
        message: message.substring(0, 200), // Limit message length for LCD
        level: alertLevel,
        duration: alertDuration
      },
      status: 'pending',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      executed_at: null,
      result: null
    });

    console.log(`[HubAlert] ${device_id} - Alert queued (ID: ${commandRef.id}, Level: ${alertLevel})`);

    // Notify device via MQTT
    await publishDeviceCommand(device_id, commandRef.id);

    res.json({
      status: 'ok',
      message: 'Alert sent to Hub and device notified via MQTT',
      command_id: commandRef.id,
      alert: {
        message,
        level: alertLevel,
        duration: alertDuration
      }
    });

  } catch (error) {
    console.error('[HubAlert] Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// @desc    Get Hub amplifier streaming status
// @route   GET /api/v1/devices/:device_id/hub/amp/streaming
// @access  Protected
const getHubAmpStreaming = async (req, res) => {
  try {
    const { device_id } = req.params;

    const db = getFirestore();
    const deviceRef = db.collection('devices').doc(device_id);

    // Get the latest status document which should contain amp streaming status
    const statusDoc = await deviceRef
      .collection('status')
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();

    if (statusDoc.empty) {
      return res.status(404).json({
        status: 'error',
        message: 'No amplifier status found. Hub may not have sent data yet.'
      });
    }

    const statusData = statusDoc.docs[0].data();

    // Extract amplifier streaming data
    const ampData = {
      is_streaming: statusData.amp_streaming || false,
      current_url: statusData.amp_url || null,
      volume_level: statusData.amp_volume || 0,
      is_playing: statusData.amp_playing || false,
      timestamp: statusData.timestamp,
      device_id
    };

    console.log(`[HubAmpStreaming] ${device_id} - Retrieved amp status:`, ampData);

    res.json({
      status: 'ok',
      device_id,
      amplifier: ampData
    });

  } catch (error) {
    console.error('[HubAmpStreaming] Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ============================================================================
// @route   GET /api/v1/devices/:device_id/sensors/readings
// @desc    Get sensor history readings for graphing (30-minute interval data)
// @query   hours - Number of hours to fetch (default 24, max 720 = 30 days)
// @query   limit - Max readings to return (default 500)
// @access  Protected
// ============================================================================
const getSensorReadings = async (req, res) => {
  try {
    const { device_id } = req.params;
    const { hours = 24, limit = 500 } = req.query;

    const hoursInt = parseInt(hours);
    const limitInt = parseInt(limit);

    // Validate parameters
    if (hoursInt < 1 || hoursInt > 720) {
      return res.status(400).json({
        status: 'error',
        message: 'hours must be between 1 and 720 (30 days)'
      });
    }

    console.log(`[SensorReadings] ${device_id} - Fetching last ${hoursInt} hours of data`);

    const db = getFirestore();
    const deviceRef = db.collection('devices').doc(device_id);

    // Calculate time range
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - (hoursInt * 60 * 60 * 1000));

    // Query history collection with readings subcollection
    const snapshot = await deviceRef
      .collection('sensors')
      .doc('history')
      .collection('readings')
      .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(startTime))
      .where('timestamp', '<=', admin.firestore.Timestamp.fromDate(endTime))
      .orderBy('timestamp', 'asc')
      .limit(limitInt)
      .get();

    const readings = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        timestamp: data.timestamp.toDate().toISOString(),
        ...data,
        created_at: data.created_at ? data.created_at.toDate().toISOString() : null
      };
    });

    console.log(`[SensorReadings] ${device_id} - Returning ${readings.length} history readings`);

    res.json({
      status: 'ok',
      device_id,
      start: startTime.toISOString(),
      end: endTime.toISOString(),
      hours: hoursInt,
      count: readings.length,
      interval_minutes: 30,
      readings
    });

  } catch (error) {
    console.error('[SensorReadings] Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ============================================================================
// @route   GET /api/v1/devices/:device_id/sensors/latest
// @desc    Get the latest raw sensor data for any device
// @access  Protected
// ============================================================================
const getLatestSensorData = async (req, res) => {
  try {
    const { device_id } = req.params;

    const db = getFirestore();
    const deviceRef = db.collection('devices').doc(device_id);

    // Get the current sensor data from sensors/current document
    const sensorDoc = await deviceRef
      .collection('sensors')
      .doc('current')
      .get();

    if (!sensorDoc.exists) {
      return res.status(404).json({
        status: 'error',
        message: 'No sensor data found. Device may not have sent data yet.'
      });
    }

    const rawData = sensorDoc.data();

    // Format the data to be consistent with other endpoints
    const formattedData = { ...rawData };
    if (rawData.timestamp) {
      formattedData.timestamp = rawData.timestamp.toDate().toISOString();
    }
    if (rawData.last_updated) {
      formattedData.last_updated = rawData.last_updated.toDate().toISOString();
    }

    console.log(`[LatestSensor] ${device_id} - Retrieved and formatted raw sensor data from sensors/current:`, formattedData);

    res.json({
      status: 'ok',
      device_id,
      sensors: formattedData // Use the 'sensors' key as requested
    });

  } catch (error) {
    console.error('[LatestSensor] Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ============================================================================
// Door Lock Specific Endpoints
// ============================================================================

// @desc    Update door lock state (called by ESP32 after executing command)
// @route   POST /api/v1/devices/:device_id/lock/state
// @access  Private (requires device token)
const updateDoorLockState = async (req, res) => {
  try {
    const { device_id } = req.params;
    const { lock_state, last_action, manual_trigger } = req.body;

    // Validate lock_state
    const validStates = ['locked', 'unlocked', 'unknown'];
    if (!lock_state || !validStates.includes(lock_state)) {
      return res.status(400).json({
        status: 'error',
        message: `Invalid lock_state. Must be one of: ${validStates.join(', ')}`
      });
    }

    const db = getFirestore();
    const deviceRef = db.collection('devices').doc(device_id);

    // Verify device exists and is a door lock
    const deviceDoc = await deviceRef.get();
    if (!deviceDoc.exists) {
      return res.status(404).json({
        status: 'error',
        message: 'Device not found'
      });
    }

    const deviceData = deviceDoc.data();
    if (deviceData.type !== 'door_lock') {
      return res.status(400).json({
        status: 'error',
        message: 'Device is not a door lock'
      });
    }

    // Update device state
    const stateData = {
      lock_state,
      last_action: last_action || lock_state,
      last_action_time: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    };

    if (manual_trigger !== undefined) {
      stateData.manual_trigger = manual_trigger;
    }

    await deviceRef
      .collection('live_status')
      .doc('device_state')
      .set(stateData, { merge: true });

    console.log(`[DoorLockState] ${device_id} - State updated: ${lock_state}${manual_trigger ? ' (manual)' : ''}`);

    // If manual trigger, also log it
    if (manual_trigger) {
      const logEntry = {
        level: 'info',
        message: `Manual ${lock_state === 'locked' ? 'lock' : 'unlock'} button pressed`,
        data: {
          lock_state,
          action: last_action || lock_state,
          manual_trigger: true
        },
        created_at: admin.firestore.FieldValue.serverTimestamp()
      };

      await deviceRef.collection('device_logs').add(logEntry);
      console.log(`[DoorLockState] ${device_id} - Manual trigger event logged`);
    }

    res.json({
      status: 'ok',
      message: 'Lock state updated successfully',
      device_id,
      lock_state
    });

  } catch (error) {
    console.error('[updateDoorLockState] Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// @desc    Lock the door
// @route   POST /api/v1/devices/:device_id/lock
// @access  Private (requires user token)
const lockDoor = async (req, res) => {
  try {
    const { device_id } = req.params;

    // Verify device exists and is a door lock
    const db = getFirestore();
    const deviceDoc = await db.collection('devices').doc(device_id).get();

    if (!deviceDoc.exists) {
      return res.status(404).json({
        status: 'error',
        message: 'Device not found'
      });
    }

    const deviceData = deviceDoc.data();
    if (deviceData.type !== 'actuator') {
      return res.status(400).json({
        status: 'error',
        message: 'Device is not a door lock'
      });
    }

    // Queue lock command
    const result = await queueCommand(device_id, 'lock', {});

    if (!result.success) {
      return res.status(500).json({
        status: 'error',
        message: 'Failed to queue lock command',
        error: result.error
      });
    }

    console.log(`[DoorLock] ${device_id} - Lock command queued (ID: ${result.commandId})`);

    res.json({
      status: 'ok',
      message: 'Lock command sent successfully',
      device_id,
      command_id: result.commandId,
      action: 'lock'
    });

  } catch (error) {
    console.error('[lockDoor] Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// @desc    Unlock the door
// @route   POST /api/v1/devices/:device_id/unlock
// @access  Private (requires user token)
const unlockDoor = async (req, res) => {
  try {
    const { device_id } = req.params;
    const { duration } = req.body; // Optional: auto-lock after duration (seconds)

    // Verify device exists and is a door lock
    const db = getFirestore();
    const deviceDoc = await db.collection('devices').doc(device_id).get();

    if (!deviceDoc.exists) {
      return res.status(404).json({
        status: 'error',
        message: 'Device not found'
      });
    }

    const deviceData = deviceDoc.data();
    if (deviceData.type !== 'actuator') {
      return res.status(400).json({
        status: 'error',
        message: 'Device is not a door lock'
      });
    }

    // Queue unlock command with optional duration
    const params = duration ? { duration: parseInt(duration) } : {};
    const result = await queueCommand(device_id, 'unlock', params);

    if (!result.success) {
      return res.status(500).json({
        status: 'error',
        message: 'Failed to queue unlock command',
        error: result.error
      });
    }

    console.log(`[DoorLock] ${device_id} - Unlock command queued (ID: ${result.commandId})${duration ? ` with duration: ${duration}s` : ''}`);

    res.json({
      status: 'ok',
      message: 'Unlock command sent successfully',
      device_id,
      command_id: result.commandId,
      action: 'unlock',
      ...(duration && { duration: parseInt(duration) })
    });

  } catch (error) {
    console.error('[unlockDoor] Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// @desc    Get door lock status
// @route   GET /api/v1/devices/:device_id/lock/status
// @access  Private (requires user token)
const getDoorLockStatus = async (req, res) => {
  try {
    const { device_id } = req.params;

    const db = getFirestore();
    const deviceDoc = await db.collection('devices').doc(device_id).get();

    if (!deviceDoc.exists) {
      return res.status(404).json({
        status: 'error',
        message: 'Device not found'
      });
    }

    const deviceData = deviceDoc.data();
    if (deviceData.type !== 'actuator') {
      return res.status(400).json({
        status: 'error',
        message: 'Device is not a door lock'
      });
    }

    // Get device online status
    const heartbeatDoc = await db.collection('devices')
      .doc(device_id)
      .collection('live_status')
      .doc('heartbeat')
      .get();

    const online = heartbeatDoc.exists;
    const heartbeatData = heartbeatDoc.exists ? heartbeatDoc.data() : {};

    // Get device state (lock status)
    const stateDoc = await db.collection('devices')
      .doc(device_id)
      .collection('live_status')
      .doc('device_state')
      .get();

    const stateData = stateDoc.exists ? stateDoc.data() : {};

    // Check for pending commands
    const pendingCommands = await db.collection('devices')
      .doc(device_id)
      .collection('commands')
      .where('status', '==', 'pending')
      .get();

    const hasPendingCommands = !pendingCommands.empty;
    const pendingCommandsList = pendingCommands.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      created_at: doc.data().created_at?.toDate().toISOString()
    }));

    console.log(`[DoorLockStatus] ${device_id} - Status retrieved - Online: ${online}, Lock State: ${stateData.lock_state || 'unknown'}`);

    res.json({
      status: 'ok',
      device_id,
      device_name: deviceData.name,
      online,
      lock_state: stateData.lock_state || 'unknown', // 'locked', 'unlocked', 'unknown'
      last_action: stateData.last_action || null,
      last_action_time: stateData.last_action_time?.toDate().toISOString() || null,
      last_heartbeat: heartbeatData.last_heartbeat?.toDate().toISOString() || null,
      has_pending_commands: hasPendingCommands,
      pending_commands: pendingCommandsList,
      uptime_ms: heartbeatData.uptime_ms || null,
      wifi_rssi: heartbeatData.wifi_rssi || null
    });

  } catch (error) {
    console.error('[getDoorLockStatus] Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

module.exports = {
  registerDevice,
  handleHeartbeat,
  getDeviceStatus,
  getAllDevicesStatus,
  handleSensorData,
  handleRoomSensorData,
  getDeviceHistory,
  handleDoorbellRing,
  handleFaceDetection,
  handleDeviceLog,
  handleDoorbellStatus,
  getDoorbellStatus,
  sendDeviceCommand,
  fetchPendingCommands,
  acknowledgeCommand,
  handleManualUnlock,
  // Amplifier Global Control
  playAmplifierAll,
  stopAmplifierAll,
  setAmplifierVolumeAll,
  restartAmplifierAll,
  // Face management
  getFaceCount,
  listFaces,
  checkFaceDatabase,
  syncFaceDatabase,
  handleFaceDatabaseResult,
  getFaceDatabaseInfo,
  // Device info
  getDeviceInfo,
  // Visitors
  getLatestVisitors,
  // Hub-specific endpoints
  getHubSensors,
  sendHubAlert,
  getHubAmpStreaming,
  // Sensor readings
  getSensorReadings,
  // Latest sensor reading
  getLatestSensorData,
  // Door lock specific
  lockDoor,
  unlockDoor,
  getDoorLockStatus,
  updateDoorLockState
};
