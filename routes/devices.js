const express = require('express');
const router = express.Router();
const {
  handleHeartbeat,
  getDeviceStatus,
  handleSensorData,
  getDeviceHistory,
  registerDevice
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

// @route   GET /api/v1/devices/:device_id/status
// @desc    Get current device status
// @access  Public
router.get('/:device_id/status', getDeviceStatus);

// @route   GET /api/v1/devices/:device_id/history
// @desc    Get device history (optional)
// @access  Public
router.get('/:device_id/history', getDeviceHistory);

module.exports = router;
