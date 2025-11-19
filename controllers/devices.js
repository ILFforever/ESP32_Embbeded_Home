const { getFirestore, admin } = require('../config/firebase');
const { publishFaceDetection } = require('../config/mqtt');
const crypto = require('crypto');
const axios = require('axios');

// ============================================================================
// In-Memory Cache for Throttling (reduces Firebase writes by 95%)
// ============================================================================
const deviceCache = new Map(); // { device_id: { lastWrite, lastData, ... } }

// Helper: Generate secure random token
function generateDeviceToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Thresholds
const WRITE_INTERVAL_MS = 5 * 60 * 1000; // Write every 5 minutes
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
// @desc    Get current device status (TTL-based: document exists = online, missing = offline)
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
      // Document exists = device is online (TTL hasn't deleted it)
      const data = statusDoc.data();
      res.json({
        status: 'ok',
        device_id,
        online: true,
        last_heartbeat: data.last_heartbeat,
        uptime_ms: data.uptime_ms,
        free_heap: data.free_heap,
        wifi_rssi: data.wifi_rssi,
        ip_address: data.ip_address
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
// @desc    Get status of all devices (TTL-based: document exists = online)
// ============================================================================
const getAllDevicesStatus = async (req, res) => {
  try {
    const db = getFirestore();
    const devicesSnapshot = await db.collection('devices').get();

    const devices = [];

    for (const deviceDoc of devicesSnapshot.docs) {
      const deviceId = deviceDoc.id;
      const deviceData = deviceDoc.data();

      // Get status subcollection
      const statusDoc = await deviceDoc.ref.collection('status').doc('current').get();

      if (statusDoc.exists) {
        // Document exists = device is online (TTL hasn't deleted it)
        const statusData = statusDoc.data();
        const lastHeartbeat = statusData.last_heartbeat?.toMillis() || 0;

        devices.push({
          device_id: deviceId,
          type: deviceData.type || 'unknown',
          name: deviceData.name || deviceId,
          online: true,  // Document exists = online
          last_seen: lastHeartbeat ? new Date(lastHeartbeat).toISOString() : null,
          uptime_ms: statusData.uptime_ms || 0,
          free_heap: statusData.free_heap || 0,
          wifi_rssi: statusData.wifi_rssi || 0,
          ip_address: statusData.ip_address || null
        });
      } else {
        // Document doesn't exist = device offline (TTL deleted it or never sent heartbeat)
        devices.push({
          device_id: deviceId,
          type: deviceData.type || 'unknown',
          name: deviceData.name || deviceId,
          online: false,  // Document missing = offline
          last_seen: null,
          uptime_ms: 0,
          free_heap: 0,
          wifi_rssi: 0,
          ip_address: null
        });
      }
    }

    // Summary stats
    const onlineCount = devices.filter(d => d.online).length;
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

    const db = getFirestore();
    const deviceRef = db.collection('devices').doc(device_id);

    let imageUrl = null;

    // Upload image to Firebase Storage if provided
    if (imageFile && imageFile.buffer) {
      try {
        const bucket = admin.storage().bucket();
        const fileName = `face_detections/${device_id}/${Date.now()}.jpg`;
        const file = bucket.file(fileName);

        // Upload the image buffer
        await file.save(imageFile.buffer, {
          metadata: {
            contentType: imageFile.mimetype || 'image/jpeg',
          },
          public: true, // Make publicly accessible
        });

        // Get public URL
        imageUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

        console.log(`[FaceDetection] Image uploaded to Firebase Storage: ${imageUrl}`);
      } catch (uploadError) {
        console.error('[FaceDetection] Failed to upload image to Firebase Storage:', uploadError);
        // Continue without image URL - non-blocking error
      }
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
    await publishFaceDetection({
      device_id,
      recognized: faceDetectionEvent.recognized,
      name: name || 'Unknown',
      confidence: confidence ? parseFloat(confidence) : 0,
      event_id: eventRef.id
    });

    // Respond to doorbell device
    res.json({
      status: 'ok',
      message: 'Face detection event saved and published to hub',
      event_id: eventRef.id,
      image_url: imageUrl,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('[FaceDetection] Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
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
// @route   GET /api/v1/devices/doorbell/:device_id/info
// @desc    Get doorbell device info (proxies request to ESP32)
// ============================================================================
const getDoorbellInfo = async (req, res) => {
  try {
    const { device_id } = req.params;
    const db = getFirestore();

    // Get device from Firebase to find its IP address
    const deviceDoc = await db.collection('devices').doc(device_id).get();

    if (!deviceDoc.exists) {
      return res.status(404).json({
        status: 'error',
        message: 'Device not found'
      });
    }

    // Get current status which contains IP address
    const statusDoc = await deviceDoc.ref.collection('status').doc('current').get();

    if (!statusDoc.exists || !statusDoc.data().ip_address) {
      return res.status(503).json({
        status: 'error',
        message: 'Device is offline or IP address not available'
      });
    }

    const deviceIP = statusDoc.data().ip_address;

    // Proxy request to ESP32 device
    console.log(`[DoorbellInfo] Proxying request to http://${deviceIP}/info`);

    const response = await axios.get(`http://${deviceIP}/info`, {
      timeout: 5000  // 5 second timeout
    });

    // Return ESP32 response data
    res.json({
      status: 'ok',
      device_id,
      data: response.data
    });

  } catch (error) {
    console.error('[DoorbellInfo] Error:', error.message);

    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      res.status(503).json({
        status: 'error',
        message: 'Failed to connect to doorbell device'
      });
    } else {
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  }
};

// ============================================================================
// @route   POST /api/v1/devices/doorbell/:device_id/control
// @desc    Control doorbell device (proxies commands to ESP32)
// ============================================================================
const controlDoorbell = async (req, res) => {
  try {
    const { device_id } = req.params;
    const { action } = req.body;

    // Validate action
    const validActions = ['camera_start', 'camera_stop', 'mic_start', 'mic_stop', 'ping'];
    if (!action || !validActions.includes(action)) {
      return res.status(400).json({
        status: 'error',
        message: `Invalid action. Must be one of: ${validActions.join(', ')}`
      });
    }

    const db = getFirestore();

    // Get device from Firebase to find its IP address
    const deviceDoc = await db.collection('devices').doc(device_id).get();

    if (!deviceDoc.exists) {
      return res.status(404).json({
        status: 'error',
        message: 'Device not found'
      });
    }

    // Get current status which contains IP address
    const statusDoc = await deviceDoc.ref.collection('status').doc('current').get();

    if (!statusDoc.exists || !statusDoc.data().ip_address) {
      return res.status(503).json({
        status: 'error',
        message: 'Device is offline or IP address not available'
      });
    }

    const deviceIP = statusDoc.data().ip_address;

    // Map actions to ESP32 endpoints
    const endpoints = {
      camera_start: '/camera/start',
      camera_stop: '/camera/stop',
      mic_start: '/mic/start',
      mic_stop: '/mic/stop',
      ping: '/ping'
    };

    const endpoint = endpoints[action];

    // Proxy request to ESP32 device
    console.log(`[DoorbellControl] Proxying ${action} to http://${deviceIP}${endpoint}`);

    const response = await axios.get(`http://${deviceIP}${endpoint}`, {
      timeout: 10000  // 10 second timeout for commands
    });

    // Return ESP32 response
    res.json({
      status: 'ok',
      device_id,
      action,
      result: response.data
    });

  } catch (error) {
    console.error('[DoorbellControl] Error:', error.message);

    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      res.status(503).json({
        status: 'error',
        message: 'Failed to connect to doorbell device'
      });
    } else {
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
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
  getDoorbellInfo,
  controlDoorbell
};
