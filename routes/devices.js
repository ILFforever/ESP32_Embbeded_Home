const express = require('express');
const router = express.Router();
const {
  handleHeartbeat,
  getDeviceStatus,
  handleSensorData,
  getDeviceHistory
} = require('../controllers/devices');

// @route   POST /api/v1/devices/heartbeat
// @desc    Receive device heartbeat (always responds, throttles Firebase writes)
// @access  Public (add auth later)
router.post('/heartbeat', handleHeartbeat);

// @route   POST /api/v1/devices/sensor
// @desc    Receive sensor data (throttled writes)
// @access  Public
router.post('/sensor', handleSensorData);

// @route   GET /api/v1/devices/:device_id/status
// @desc    Get current device status
// @access  Public
router.get('/:device_id/status', getDeviceStatus);

// @route   GET /api/v1/devices/:device_id/history
// @desc    Get device history (optional)
// @access  Public
router.get('/:device_id/history', getDeviceHistory);

module.exports = router;
