const { getFirestore } = require('../config/firebase');

/**
 * Device Authentication Middleware
 * Validates device API tokens for ESP32 devices
 */
const authenticateDevice = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    // Debug logging for missing auth
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('[AUTH] Missing/invalid Authorization header');
      console.log('[AUTH] Received headers:', JSON.stringify(req.headers, null, 2));
      console.log('[AUTH] Path:', req.path);
      console.log('[AUTH] Method:', req.method);

      return res.status(401).json({
        status: 'error',
        message: 'Missing or invalid Authorization header. Expected: Bearer <token>'
      });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        status: 'error',
        message: 'No token provided'
      });
    }

    // Get device_id from request body, params, or query (supports POST and GET requests)
    // For multipart form data (multer), check both req.body and req.body fields
    let device_id = req.body?.device_id || req.params?.device_id || req.query?.device_id;

    // Debug logging for multipart issues
    if (!device_id && req.file) {
      console.log('[AUTH] Multipart request - req.body:', req.body);
      console.log('[AUTH] Available fields:', Object.keys(req.body || {}));
    }

    if (!device_id) {
      return res.status(400).json({
        status: 'error',
        message: 'device_id required in request body, params, or query',
        debug: req.file ? 'Multipart form detected but device_id not found in body' : undefined
      });
    }

    // Verify token matches device in Firestore
    const db = getFirestore();
    const deviceDoc = await db.collection('devices').doc(device_id).get();

    if (!deviceDoc.exists) {
      return res.status(404).json({
        status: 'error',
        message: 'Device not found. Register device first.'
      });
    }

    const deviceData = deviceDoc.data();

    // Check if token matches
    if (deviceData.api_token !== token) {
      console.warn(`[AUTH] Invalid token attempt for device: ${device_id}`);
      return res.status(403).json({
        status: 'error',
        message: 'Invalid token for this device'
      });
    }

    // Check if device is disabled
    if (deviceData.disabled === true) {
      return res.status(403).json({
        status: 'error',
        message: 'Device has been disabled'
      });
    }

    // Token valid - attach device info to request
    req.device = {
      id: device_id,
      type: deviceData.type,
      name: deviceData.name
    };

    next();
  } catch (error) {
    console.error('[AUTH] Error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Authentication error'
    });
  }
};

/**
 * Optional: Simpler API key authentication (less secure, easier)
 * Use a single shared secret for all devices
 */
const authenticateSimpleApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const validApiKey = process.env.DEVICE_API_KEY;

  if (!apiKey) {
    return res.status(401).json({
      status: 'error',
      message: 'Missing X-API-Key header'
    });
  }

  if (apiKey !== validApiKey) {
    console.warn('[AUTH] Invalid API key attempt');
    return res.status(403).json({
      status: 'error',
      message: 'Invalid API key'
    });
  }

  next();
};

module.exports = {
  authenticateDevice,
  authenticateSimpleApiKey
};
