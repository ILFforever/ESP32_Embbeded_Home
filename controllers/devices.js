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
      .collection('live_status')
      .doc('heartbeat')
      .get();

    if (statusDoc.exists) {
      // Document exists - calculate online status from expireAt
      const data = statusDoc.data();

      // Check if device is online based on expireAt timestamp
      const now = Date.now();
      const expireAtMillis = data.expireAt ? data.expireAt.toMillis() : 0;
      const isOnline = expireAtMillis > now;

      res.json({
        status: 'ok',
        device_id,
        online: isOnline,
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

      // Get status subcollection
      const statusDoc = await deviceDoc.ref.collection('live_status').doc('heartbeat').get();

      if (statusDoc.exists) {
        // Document exists - calculate online status from expireAt
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
          online: isOnline,
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
          online: false,
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
// @desc    Get device history - returns mix of heartbeats, face detections, and commands
// ============================================================================
const getDeviceHistory = async (req, res) => {
  try {
    const { device_id } = req.params;
    const { limit = 20 } = req.query;
    const db = getFirestore();
    const deviceRef = db.collection('devices').doc(device_id);

    // Fetch data from multiple sources in parallel
    const [liveStatusDoc, faceDetectionsSnapshot, commandsSnapshot] = await Promise.all([
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

    // Combine all events and sort by timestamp (most recent first)
    const allEvents = [...statusEvents, ...faceDetections, ...commands];

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
        commands: commands.length
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
    const { level, message, data, timestamp } = req.body;

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

    // Notify device via MQTT to fetch commands immediately (faster than waiting for heartbeat)
    await publishDeviceCommand(device_id, commandRef.id, action);

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
// Camera Control Endpoints
// ============================================================================

const startCamera = async (req, res) => {
  try {
    const { device_id } = req.params;

    const db = getFirestore();
    const deviceRef = db.collection('devices').doc(device_id);

    // Queue camera_start command
    const commandRef = await deviceRef.collection('commands').add({
      action: 'camera_start',
      params: {},
      status: 'pending',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      executed_at: null,
      result: null
    });

    console.log(`[CameraControl] ${device_id} - Start camera command queued (ID: ${commandRef.id})`);

    // Notify device via MQTT
    await publishDeviceCommand(device_id, commandRef.id, 'camera_start');

    res.json({
      status: 'ok',
      message: 'Camera start command queued and device notified',
      command_id: commandRef.id
    });
  } catch (error) {
    console.error('[CameraControl] Error starting camera:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

const stopCamera = async (req, res) => {
  try {
    const { device_id } = req.params;

    const db = getFirestore();
    const deviceRef = db.collection('devices').doc(device_id);

    // Queue camera_stop command
    const commandRef = await deviceRef.collection('commands').add({
      action: 'camera_stop',
      params: {},
      status: 'pending',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      executed_at: null,
      result: null
    });

    console.log(`[CameraControl] ${device_id} - Stop camera command queued (ID: ${commandRef.id})`);

    // Notify device via MQTT
    await publishDeviceCommand(device_id, commandRef.id, 'camera_stop');

    res.json({
      status: 'ok',
      message: 'Camera stop command queued and device notified',
      command_id: commandRef.id
    });
  } catch (error) {
    console.error('[CameraControl] Error stopping camera:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

const restartCamera = async (req, res) => {
  try {
    const { device_id } = req.params;

    const db = getFirestore();
    const deviceRef = db.collection('devices').doc(device_id);

    // Queue camera_restart command
    const commandRef = await deviceRef.collection('commands').add({
      action: 'camera_restart',
      params: {},
      status: 'pending',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      executed_at: null,
      result: null
    });

    console.log(`[CameraControl] ${device_id} - Restart camera command queued (ID: ${commandRef.id})`);

    // Notify device via MQTT
    await publishDeviceCommand(device_id, commandRef.id, 'camera_restart');

    res.json({
      status: 'ok',
      message: 'Camera restart command queued and device notified',
      command_id: commandRef.id
    });
  } catch (error) {
    console.error('[CameraControl] Error restarting camera:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ============================================================================
// Microphone Control Endpoints
// ============================================================================

const startMicrophone = async (req, res) => {
  try {
    const { device_id } = req.params;

    const db = getFirestore();
    const deviceRef = db.collection('devices').doc(device_id);

    // Queue mic_start command
    const commandRef = await deviceRef.collection('commands').add({
      action: 'mic_start',
      params: {},
      status: 'pending',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      executed_at: null,
      result: null
    });

    console.log(`[MicControl] ${device_id} - Start microphone command queued (ID: ${commandRef.id})`);

    // Notify device via MQTT
    await publishDeviceCommand(device_id, commandRef.id, 'mic_start');

    res.json({
      status: 'ok',
      message: 'Microphone start command queued and device notified',
      command_id: commandRef.id
    });
  } catch (error) {
    console.error('[MicControl] Error starting microphone:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

const stopMicrophone = async (req, res) => {
  try {
    const { device_id } = req.params;

    const db = getFirestore();
    const deviceRef = db.collection('devices').doc(device_id);

    // Queue mic_stop command
    const commandRef = await deviceRef.collection('commands').add({
      action: 'mic_stop',
      params: {},
      status: 'pending',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      executed_at: null,
      result: null
    });

    console.log(`[MicControl] ${device_id} - Stop microphone command queued (ID: ${commandRef.id})`);

    // Notify device via MQTT
    await publishDeviceCommand(device_id, commandRef.id, 'mic_stop');

    res.json({
      status: 'ok',
      message: 'Microphone stop command queued and device notified',
      command_id: commandRef.id
    });
  } catch (error) {
    console.error('[MicControl] Error stopping microphone:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

const getMicrophoneStatus = async (req, res) => {
  try {
    const { device_id } = req.params;

    const db = getFirestore();
    const deviceRef = db.collection('devices').doc(device_id);

    // Queue mic_status command
    const commandRef = await deviceRef.collection('commands').add({
      action: 'mic_status',
      params: {},
      status: 'pending',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      executed_at: null,
      result: null
    });

    console.log(`[MicControl] ${device_id} - Get microphone status command queued (ID: ${commandRef.id})`);

    // Notify device via MQTT
    await publishDeviceCommand(device_id, commandRef.id, 'mic_status');

    res.json({
      status: 'ok',
      message: 'Microphone status command queued and device notified',
      command_id: commandRef.id
    });
  } catch (error) {
    console.error('[MicControl] Error getting microphone status:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

// ============================================================================
// Audio Amplifier Control Endpoints
// ============================================================================

const playAmplifier = async (req, res) => {
  try {
    const { device_id } = req.params;
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({
        status: 'error',
        message: 'url parameter is required'
      });
    }

    const db = getFirestore();
    const deviceRef = db.collection('devices').doc(device_id);

    // Queue amp_play command with URL parameter
    const commandRef = await deviceRef.collection('commands').add({
      action: 'amp_play',
      params: { url },
      status: 'pending',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      executed_at: null,
      result: null
    });

    console.log(`[AmpControl] ${device_id} - Play amplifier command queued (ID: ${commandRef.id}, URL: ${url})`);

    // Notify device via MQTT
    await publishDeviceCommand(device_id, commandRef.id, 'amp_play');

    res.json({
      status: 'ok',
      message: 'Amplifier play command queued and device notified',
      command_id: commandRef.id
    });
  } catch (error) {
    console.error('[AmpControl] Error playing amplifier:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

const stopAmplifier = async (req, res) => {
  try {
    const { device_id } = req.params;

    const db = getFirestore();
    const deviceRef = db.collection('devices').doc(device_id);

    // Queue amp_stop command
    const commandRef = await deviceRef.collection('commands').add({
      action: 'amp_stop',
      params: {},
      status: 'pending',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      executed_at: null,
      result: null
    });

    console.log(`[AmpControl] ${device_id} - Stop amplifier command queued (ID: ${commandRef.id})`);

    // Notify device via MQTT
    await publishDeviceCommand(device_id, commandRef.id, 'amp_stop');

    res.json({
      status: 'ok',
      message: 'Amplifier stop command queued and device notified',
      command_id: commandRef.id
    });
  } catch (error) {
    console.error('[AmpControl] Error stopping amplifier:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

const restartAmplifier = async (req, res) => {
  try {
    const { device_id } = req.params;

    const db = getFirestore();
    const deviceRef = db.collection('devices').doc(device_id);

    // Queue amp_restart command
    const commandRef = await deviceRef.collection('commands').add({
      action: 'amp_restart',
      params: {},
      status: 'pending',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      executed_at: null,
      result: null
    });

    console.log(`[AmpControl] ${device_id} - Restart amplifier command queued (ID: ${commandRef.id})`);

    // Notify device via MQTT
    await publishDeviceCommand(device_id, commandRef.id, 'amp_restart');

    res.json({
      status: 'ok',
      message: 'Amplifier restart command queued and device notified',
      command_id: commandRef.id
    });
  } catch (error) {
    console.error('[AmpControl] Error restarting amplifier:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

const setAmplifierVolume = async (req, res) => {
  try {
    const { device_id } = req.params;
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

    const db = getFirestore();
    const deviceRef = db.collection('devices').doc(device_id);

    // Queue amp_volume command
    const commandRef = await deviceRef.collection('commands').add({
      action: 'amp_volume',
      params: { level: volumeLevel },
      status: 'pending',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      executed_at: null,
      result: null
    });

    console.log(`[AmpControl] ${device_id} - Set volume to ${volumeLevel} command queued (ID: ${commandRef.id})`);

    // Notify device via MQTT
    await publishDeviceCommand(device_id, commandRef.id, 'amp_volume');

    res.json({
      status: 'ok',
      message: `Amplifier volume set to ${volumeLevel} command queued and device notified`,
      command_id: commandRef.id
    });
  } catch (error) {
    console.error('[AmpControl] Error setting amplifier volume:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

const getAmplifierStatus = async (req, res) => {
  try {
    const { device_id } = req.params;

    const db = getFirestore();
    const deviceRef = db.collection('devices').doc(device_id);

    // Queue amp_status command
    const commandRef = await deviceRef.collection('commands').add({
      action: 'amp_status',
      params: {},
      status: 'pending',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      executed_at: null,
      result: null
    });

    console.log(`[AmpControl] ${device_id} - Get status command queued (ID: ${commandRef.id})`);

    // Notify device via MQTT
    await publishDeviceCommand(device_id, commandRef.id, 'amp_status');

    res.json({
      status: 'ok',
      message: 'Amplifier status command queued and device notified. Check device serial output.',
      command_id: commandRef.id
    });
  } catch (error) {
    console.error('[AmpControl] Error getting amplifier status:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

const listAmplifierFiles = async (req, res) => {
  try {
    const { device_id } = req.params;

    const db = getFirestore();
    const deviceRef = db.collection('devices').doc(device_id);

    // Queue amp_list command
    const commandRef = await deviceRef.collection('commands').add({
      action: 'amp_list',
      params: {},
      status: 'pending',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      executed_at: null,
      result: null
    });

    console.log(`[AmpControl] ${device_id} - List files command queued (ID: ${commandRef.id})`);

    // Notify device via MQTT
    await publishDeviceCommand(device_id, commandRef.id, 'amp_list');

    res.json({
      status: 'ok',
      message: 'Amplifier list files command queued and device notified. Check device serial output.',
      command_id: commandRef.id
    });
  } catch (error) {
    console.error('[AmpControl] Error listing amplifier files:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
};

const setAmplifierWifi = async (req, res) => {
  try {
    const { device_id } = req.params;
    const { ssid, password } = req.body;

    if (!ssid || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'ssid and password are required in request body'
      });
    }

    const db = getFirestore();
    const deviceRef = db.collection('devices').doc(device_id);

    // Queue amp_wifi command
    const commandRef = await deviceRef.collection('commands').add({
      action: 'amp_wifi',
      params: { ssid, password },
      status: 'pending',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      executed_at: null,
      result: null
    });

    console.log(`[AmpControl] ${device_id} - Set WiFi credentials command queued (ID: ${commandRef.id})`);

    // Notify device via MQTT
    await publishDeviceCommand(device_id, commandRef.id, 'amp_wifi');

    res.json({
      status: 'ok',
      message: 'Amplifier WiFi credentials command queued and device notified',
      command_id: commandRef.id
    });
  } catch (error) {
    console.error('[AmpControl] Error setting amplifier WiFi:', error);
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
    await publishDeviceCommand(device_id, commandRef.id, 'face_count');

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
    await publishDeviceCommand(device_id, commandRef.id, 'face_list');

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
    await publishDeviceCommand(device_id, commandRef.id, 'face_check');

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

// ============================================================================
// System Control Endpoints
// ============================================================================

const restartSystem = async (req, res) => {
  try {
    const { device_id } = req.params;

    const db = getFirestore();
    const deviceRef = db.collection('devices').doc(device_id);

    // Queue system_restart command
    const commandRef = await deviceRef.collection('commands').add({
      action: 'system_restart',
      params: {},
      status: 'pending',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      executed_at: null,
      result: null
    });

    console.log(`[SystemControl] ${device_id} - System restart command queued (ID: ${commandRef.id})`);

    // Notify device via MQTT
    await publishDeviceCommand(device_id, commandRef.id, 'system_restart');

    res.json({
      status: 'ok',
      message: 'System restart command queued and device notified',
      command_id: commandRef.id
    });
  } catch (error) {
    console.error('[SystemControl] Error restarting system:', error);
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

    // Get device heartbeat data
    const heartbeatDoc = await deviceRef
      .collection('live_status')
      .doc('heartbeat')
      .get();

    // Get device state data
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

module.exports = {
  registerDevice,
  handleHeartbeat,
  getDeviceStatus,
  getAllDevicesStatus,
  handleSensorData,
  getDeviceHistory,
  handleDoorbellRing,
  handleFaceDetection,
  handleDeviceLog,
  handleDoorbellStatus,
  getDoorbellStatus,
  sendDeviceCommand,
  fetchPendingCommands,
  acknowledgeCommand,
  // Camera control
  startCamera,
  stopCamera,
  restartCamera,
  // Microphone control
  startMicrophone,
  stopMicrophone,
  getMicrophoneStatus,
  // Amplifier control
  playAmplifier,
  stopAmplifier,
  restartAmplifier,
  setAmplifierVolume,
  getAmplifierStatus,
  listAmplifierFiles,
  setAmplifierWifi,
  // Face management
  getFaceCount,
  listFaces,
  checkFaceDatabase,
  // System control
  restartSystem,
  // Device info
  getDeviceInfo
};
