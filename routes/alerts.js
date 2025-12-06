const express = require('express');
const router = express.Router();
const {
  getAlerts,
  getAlertById,
  createAlert,
  markAlertAsRead,
  markMultipleAlertsAsRead,
  deleteAlert
} = require('../controllers/alerts');
const { protect } = require('../middleware/auth');
const { authenticateDevice } = require('../middleware/deviceAuth');

// @route   GET /api/v1/alerts
// @desc    Get alerts with filtering and sorting (for frontend with user auth)
// @access  Private (requires user token)
router.get('/', protect, getAlerts);

// @route   GET /api/v1/alerts/device
// @desc    Get alerts with filtering and sorting (for ESP32 with device auth)
// @access  Private (requires device token and device_id)
router.get('/device', authenticateDevice, getAlerts);

// @route   GET /api/v1/alerts/:alert_id
// @desc    Get a single alert by ID
// @access  Private (requires user token)
router.get('/:alert_id', protect, getAlertById);

// @route   POST /api/v1/alerts
// @desc    Create a new alert manually
// @access  Private (requires user token)
router.post('/', protect, createAlert);

// @route   PATCH /api/v1/alerts/:alert_id/read
// @desc    Mark alert as read
// @access  Private (requires user token)
router.patch('/:alert_id/read', protect, markAlertAsRead);

// @route   POST /api/v1/alerts/mark-read
// @desc    Mark multiple alerts as read
// @access  Private (requires user token)
router.post('/mark-read', protect, markMultipleAlertsAsRead);

// @route   DELETE /api/v1/alerts/:alert_id
// @desc    Delete an alert
// @access  Private (requires user token)
router.delete('/:alert_id', protect, deleteAlert);

module.exports = router;
