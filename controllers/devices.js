const { getFirestore, admin } = require('../config/firebase');
const { publishFaceDetection } = require('../config/mqtt');
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
const STATUS_TTL_SECONDS = 120; // 2 minutes - document auto-deletes if no heartbeat
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
  const timeSinceLastWrite = now - cached.lastWriteTime;

  // Always write if 1+ minute elapsed
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
      await deviceRef.collection('status').doc('current').set({
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
// @desc    Get current device status (use expireAt to determine online status)
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

    if (statusDoc.exists) {
      // Document exists - return data with expireAt
      const data = statusDoc.data();
      res.json({
        status: 'ok',
        device_id,
        last_heartbeat: data.last_heartbeat,
        uptime_ms: data.uptime_ms,
        free_heap: data.free_heap,
        wifi_rssi: data.wifi_rssi,
        ip_address: data.ip_address,
        expireAt: data.expireAt
      });
    } else {
      // Document doesn't exist = device went offline and TTL deleted it
      res.json({
        status: 'ok',
        device_id,
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
// ============================================================================
const getAllDevicesStatus = async (req, res) => {
  try {
    const db = getFirestore();
    const devicesSnapshot = await db.collection('devices').get();

    const devices = [];
    let onlineCount = 0;

    for (const deviceDoc of devicesSnapshot.docs) {
      const deviceId = deviceDoc.id;
      const deviceData = deviceDoc.data();

      // Get status subcollection
      const statusDoc = await deviceDoc.ref.collection('status').doc('current').get();

      if (statusDoc.exists) {
        // Document exists - return data with expireAt
        const statusData = statusDoc.data();
        const lastHeartbeat = statusData.last_heartbeat?.toMillis() || 0;
        const expireAt = statusData.expireAt;

        // Count as online if expireAt is in the future
        const isOnline = expireAt && expireAt.toMillis() > Date.now();
        if (isOnline) onlineCount++;

        devices.push({
          device_id: deviceId,
          type: deviceData.type || 'unknown',
          name: deviceData.name || deviceId,
          last_seen: lastHeartbeat ? new Date(lastHeartbeat).toISOString() : null,
          uptime_ms: statusData.uptime_ms || 0,
          free_heap: statusData.free_heap || 0,
          wifi_rssi: statusData.wifi_rssi || 0,
          ip_address: statusData.ip_address || null,
          expireAt: expireAt
        });
      } else {
        // Document doesn't exist = device offline (TTL deleted it or never sent heartbeat)
        devices.push({
          device_id: deviceId,
          type: deviceData.type || 'unknown',
          name: deviceData.name || deviceId,
          last_seen: null,
          uptime_ms: 0,
          free_heap: 0,
          wifi_rssi: 0,
          ip_address: null,
          expireAt: null
        });
      }
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
// @desc    Get device history with optional filtering by type
// @query   limit - number of records to return (default: 100)
// @query   type - filter by collection type: 'heartbeat' (default), 'sensor', 'face_detections', 'device_logs'
// ============================================================================
const getDeviceHistory = async (req, res) => {
  try {
    const { device_id } = req.params;
    const { limit = 100, type = 'heartbeat' } = req.query;
    const db = getFirestore();

    // Map type to collection name
    const collectionMap = {
      'heartbeat': 'heartbeat_history',
      'sensor': 'sensor_history',
      'face_detections': 'face_detections',
      'logs': 'device_logs'
    };

    const collectionName = collectionMap[type] || 'heartbeat_history';

    const historySnapshot = await db.collection('devices')
      .doc(device_id)
      .collection(collectionName)
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
      type: type,
      collection: collectionName,
      count: history.length,
      history
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
// @route   POST /api/v1/devices/hub/log
// @desc    Receive logs and errors from Hub - save to Firebase for frontend display
// ============================================================================
const handleHubLog = async (req, res) => {
  try {
    const { device_id, level, message, data, timestamp } = req.body;

    // Validation
    if (!device_id || !level || !message) {
      return res.status(400).json({
        status: 'error',
        message: 'device_id, level, and message are required'
      });
    }

    console.log(`[HubLog] ${device_id} [${level}] - ${message}`);

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

    // Write log to Firebase (in device_logs collection)
    await deviceRef.collection('device_logs').add(logEntry);

    // If it's an error, also update device status
    if (level === 'error') {
      await deviceRef.collection('status').doc('current').set({
        last_error: message,
        last_error_time: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }

    // Respond to hub
    res.json({
      status: 'ok',
      message: 'Log saved successfully'
    });

  } catch (error) {
    console.error('[HubLog] Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ============================================================================
// @route   POST /api/v1/devices/doorbell/status
// @desc    Doorbell pushes its status/info to server (camera state, etc.)
// ============================================================================
const handleDoorbellStatus = async (req, res) => {
  try {
    const { device_id, camera_active, mic_active, recording, motion_detected, battery_level } = req.body;

    if (!device_id) {
      return res.status(400).json({
        status: 'error',
        message: 'device_id is required'
      });
    }

    console.log(`[DoorbellStatus] ${device_id} - Received status update`);

    const db = getFirestore();
    const deviceRef = db.collection('devices').doc(device_id);

    // Update doorbell-specific status in Firebase
    await deviceRef.collection('status').doc('doorbell').set({
      camera_active: camera_active || false,
      mic_active: mic_active || false,
      recording: recording || false,
      motion_detected: motion_detected || false,
      battery_level: battery_level || null,
      last_updated: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    res.json({
      status: 'ok',
      message: 'Doorbell status updated'
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
      .collection('status')
      .doc('doorbell')
      .get();

    if (!statusDoc.exists) {
      return res.status(404).json({
        status: 'error',
        message: 'No doorbell status found. Device may not have sent status yet.'
      });
    }

    res.json({
      status: 'ok',
      device_id,
      data: statusDoc.data()
    });

  } catch (error) {
    console.error('[GetDoorbellStatus] Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ============================================================================
// @route   POST /api/v1/devices/:device_id/command
// @desc    Send command to device (queued, device fetches on next heartbeat)
// ============================================================================
const sendDeviceCommand = async (req, res) => {
  try {
    const { device_id } = req.params;
    const { action, params } = req.body;

    // Validate action
    const validActions = [
      'camera_start', 'camera_stop',
      'mic_start', 'mic_stop',
      'recording_start', 'recording_stop',
      'reboot', 'update_config'
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
      action,
      params: params || {},
      status: 'pending',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      executed_at: null,
      result: null
    });

    console.log(`[SendCommand] ${device_id} - Queued command: ${action} (ID: ${commandRef.id})`);

    res.json({
      status: 'ok',
      message: 'Command queued. Device will fetch on next heartbeat.',
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

module.exports = {
  registerDevice,
  handleHeartbeat,
  getDeviceStatus,
  getAllDevicesStatus,
  handleSensorData,
  getDeviceHistory,
  handleDoorbellRing,
  handleFaceDetection,
  handleHubLog,
  handleDoorbellStatus,
  getDoorbellStatus,
  sendDeviceCommand,
  fetchPendingCommands,
  acknowledgeCommand
};
