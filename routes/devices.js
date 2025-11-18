const express = require('express');
const router = express.Router();
const multer = require('multer');
const {
  handleHeartbeat,
  getDeviceStatus,
  getAllDevicesStatus,
  handleSensorData,
  getDeviceHistory,
  registerDevice,
  handleDoorbellRing,
  handleFaceDetection,
  handleHubLog
} = require('../controllers/devices');
const { authenticateDevice } = require('../middleware/deviceAuth');

// Configure multer for in-memory file storage (for face detection images)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1 * 1024 * 1024, // 1MB max file size (increased from 500KB for reliability)
    fieldSize: 10 * 1024 * 1024, // 10MB for form fields
  },
  // Increase timeout for slow ESP32 uploads
  fileFilter: (req, file, cb) => {
    // Accept only images
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// @route   POST /api/v1/devices/register
// @desc    Register a new device (admin only - call manually or via secure endpoint)
// @access  Public (TODO: Add admin auth)
router.post('/register', registerDevice);

// @route   POST /api/v1/devices/heartbeat
// @desc    Receive device heartbeat (always responds, throttles Firebase writes)
// @access  Private (requires device token)
router.post('/heartbeat', authenticateDevice, handleHeartbeat);

// @route   POST /api/v1/devices/sensor
// @desc    Receive sensor data (throttled writes)
// @access  Private (requires device token)
router.post('/sensor', authenticateDevice, handleSensorData);

// @route   POST /api/v1/devices/doorbell/ring
// @desc    Receive doorbell ring event (notify hub, no Firebase save)
// @access  Private (requires device token)
router.post('/doorbell/ring', authenticateDevice, handleDoorbellRing);

// @route   POST /api/v1/devices/doorbell/face-detection
// @desc    Receive face detection event from doorbell camera (saves to Firebase)
// @access  Private (requires device token)
// NOTE: upload.single('image') MUST come before authenticateDevice to parse req.body
router.post('/doorbell/face-detection', upload.single('image'), authenticateDevice, handleFaceDetection);

// @route   POST /api/v1/devices/hub/log
// @desc    Receive logs and errors from Hub (saves to Firebase for frontend)
// @access  Private (requires device token)
router.post('/hub/log', authenticateDevice, handleHubLog);

// @route   GET /api/v1/devices/status/all
// @desc    Get all devices status (for frontend dashboard)
// @access  Public
router.get('/status/all', getAllDevicesStatus);

// @route   GET /api/v1/devices/:device_id/status
// @desc    Get current device status
// @access  Public
router.get('/:device_id/status', getDeviceStatus);

// @route   GET /api/v1/devices/:device_id/history
// @desc    Get device history (optional)
// @access  Public
router.get('/:device_id/history', getDeviceHistory);

module.exports = router;
