const express = require('express');
const router = express.Router();
const deviceController = require('../controllers/deviceController');

// Device heartbeat - receive periodic status updates from devices
router.post('/heartbeat', deviceController.handleHeartbeat);

// Get status of a specific device
router.get('/status/:deviceId', deviceController.getDeviceStatus);

// Get status of all devices
router.get('/status', deviceController.getAllDevicesStatus);

// Receive sensor data from devices
router.post('/sensor-data', deviceController.handleSensorData);

// Get historical data for a device
router.get('/history/:deviceId', deviceController.getDeviceHistory);

// Register a new device
router.post('/register', deviceController.registerDevice);

// Handle doorbell ring event
router.post('/doorbell/ring', deviceController.handleDoorbellRing);

// Handle face detection from doorbell camera
router.post('/doorbell/face-detection', deviceController.handleFaceDetection);

// Receive hub logs
router.post('/hub/log', deviceController.handleHubLog);

// Update doorbell status
router.post('/doorbell/status', deviceController.handleDoorbellStatus);

// Get doorbell status
router.get('/doorbell/status', deviceController.getDoorbellStatus);

// Send command to a device
router.post('/command', deviceController.sendDeviceCommand);

// Fetch pending commands for a device
router.get('/commands/pending/:deviceId', deviceController.fetchPendingCommands);

// Acknowledge command execution
router.post('/commands/acknowledge', deviceController.acknowledgeCommand);

module.exports = router;
