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
  handleHubLog,
  handleDoorbellStatus,
  getDoorbellStatus,
  sendDeviceCommand,
  fetchPendingCommands,
  acknowledgeCommand
} = require('../controllers/devices');
const { authenticateDevice } = require('../middleware/deviceAuth');

// Configure multer for in-memory file storage (for face detection images)
// Increased limits for ESP32 reliability
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB max file size (increased for reliability)
    fieldSize: 10 * 1024 * 1024, // 10MB for form fields
    fields: 10, // Max number of non-file fields
    parts: 20 // Max number of parts (fields + files)
  },
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

// @route   POST /api/v1/devices/doorbell/status
// @desc    Doorbell pushes its status/info to server (camera state, etc.)
// @access  Private (requires device token)
router.post('/doorbell/status', authenticateDevice, handleDoorbellStatus);

// @route   GET /api/v1/devices/status/all
// @desc    Get all devices status (for frontend dashboard)
// @access  Private (requires device token)
router.get('/status/all', authenticateDevice, getAllDevicesStatus);

// @route   GET /api/v1/devices/:device_id/status
// @desc    Get current device status
// @access  Private (requires device token)
router.get('/:device_id/status', authenticateDevice, getDeviceStatus);

// @route   GET /api/v1/devices/:device_id/history
// @desc    Get device history with optional type filtering
// @access  Private (requires device token)
router.get('/:device_id/history', authenticateDevice, getDeviceHistory);

// @route   GET /api/v1/devices/doorbell/:device_id/status
// @desc    Get doorbell status from Firebase (data pushed by doorbell, not proxy)
// @access  Public
router.get('/doorbell/:device_id/status', getDoorbellStatus);

// ============================================================================
// Command Queue Routes (Ping-Pong Command System - replaces MQTT)
// ============================================================================

// @route   POST /api/v1/devices/:device_id/command
// @desc    Send command to device (queued in Firebase, device fetches on heartbeat)
// @access  Public (TODO: Add user auth)
router.post('/:device_id/command', sendDeviceCommand);

// @route   POST /api/v1/devices/commands/pending
// @desc    Device fetches pending commands (called when has_pending_commands=true)
// @access  Private (requires device token)
router.post('/commands/pending', authenticateDevice, fetchPendingCommands);

// @route   POST /api/v1/devices/commands/ack
// @desc    Device acknowledges command execution
// @access  Private (requires device token)
router.post('/commands/ack', authenticateDevice, acknowledgeCommand);

module.exports = router;
