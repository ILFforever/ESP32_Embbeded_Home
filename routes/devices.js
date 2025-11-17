const express = require('express');
const router = express.Router();
const {
  handleHeartbeat,
  getDeviceStatus,
  getAllDevicesStatus,
  handleSensorData,
  getDeviceHistory,
  registerDevice,
  handleDoorbellRing,
  handleFaceDetection
} = require('../controllers/devices');
const { authenticateDevice } = require('../middleware/deviceAuth');

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
router.post('/doorbell/face-detection', authenticateDevice, handleFaceDetection);

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
