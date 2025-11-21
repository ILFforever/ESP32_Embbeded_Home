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
  syncFaceDatabase,
  handleFaceDatabaseResult,
  getFaceDatabaseInfo,
  // System control
  restartSystem,
  // Device info
  getDeviceInfo,
  // Visitors
  getLatestVisitors
} = require('../controllers/devices');
const { authenticateDevice } = require('../middleware/deviceAuth');
const { protect } = require('../middleware/auth');

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

// @route   POST /api/v1/devices/:device_id/log
// @desc    Unified log endpoint - any device can send logs (hub, doorbell, etc.)
// @access  Private (requires device token)
router.post('/:device_id/log', authenticateDevice, handleDeviceLog);

// @route   POST /api/v1/devices/doorbell/status
// @desc    Doorbell pushes its status/info to server (camera state, etc.)
// @access  Private (requires device token)
router.post('/doorbell/status', authenticateDevice, handleDoorbellStatus);

// @route   GET /api/v1/devices/status/all
// @desc    Get all devices status (for frontend dashboard)
// @access  Private (requires user token)
router.get('/status/all', protect, getAllDevicesStatus);

// @route   GET /api/v1/devices/:device_id/status
// @desc    Get current device status
// @access  Private (requires user token)
router.get('/:device_id/status', protect, getDeviceStatus);

// @route   GET /api/v1/devices/:device_id/history
// @desc    Get device history with optional type filtering
// @access  Private (requires user token)
router.get('/:device_id/history', protect, getDeviceHistory);

// @route   GET /api/v1/devices/doorbell/:device_id/status
// @desc    Get doorbell status from Firebase (data pushed by doorbell, not proxy)
// @access  Public
router.get('/doorbell/:device_id/status', getDoorbellStatus);

// ============================================================================
// Command Queue Routes (Ping-Pong Command System - replaces MQTT)
// ============================================================================

// @route   POST /api/v1/devices/:device_id/command
// @desc    Send command to device (queued in Firebase, device fetches on heartbeat)
// @access  Private (requires user token)
router.post('/:device_id/command', protect, sendDeviceCommand);

// @route   POST /api/v1/devices/commands/pending
// @desc    Device fetches pending commands (called when has_pending_commands=true)
// @access  Private (requires device token)
router.post('/commands/pending', authenticateDevice, fetchPendingCommands);

// @route   POST /api/v1/devices/commands/ack
// @desc    Device acknowledges command execution
// @access  Private (requires device token)
router.post('/commands/ack', authenticateDevice, acknowledgeCommand);

// ============================================================================
// Camera Control Routes
// ============================================================================

// @route   POST /api/v1/devices/:device_id/camera/start
// @desc    Queue camera start command
// @access  Private (requires user token)
router.post('/:device_id/camera/start', protect, startCamera);

// @route   POST /api/v1/devices/:device_id/camera/stop
// @desc    Queue camera stop command
// @access  Private (requires user token)
router.post('/:device_id/camera/stop', protect, stopCamera);

// @route   POST /api/v1/devices/:device_id/camera/restart
// @desc    Queue camera restart command
// @access  Private (requires user token)
router.post('/:device_id/camera/restart', protect, restartCamera);

// ============================================================================
// Microphone Control Routes
// ============================================================================

// @route   POST /api/v1/devices/:device_id/mic/start
// @desc    Queue microphone start command
// @access  Private (requires user token)
router.post('/:device_id/mic/start', protect, startMicrophone);

// @route   POST /api/v1/devices/:device_id/mic/stop
// @desc    Queue microphone stop command
// @access  Private (requires user token)
router.post('/:device_id/mic/stop', protect, stopMicrophone);

// @route   POST /api/v1/devices/:device_id/mic/status
// @desc    Queue microphone status command
// @access  Private (requires user token)
router.post('/:device_id/mic/status', protect, getMicrophoneStatus);

// ============================================================================
// Audio Amplifier Control Routes
// ============================================================================

// @route   POST /api/v1/devices/:device_id/amp/play
// @desc    Queue amplifier play command (requires ?url= parameter)
// @access  Private (requires user token)
router.post('/:device_id/amp/play', protect, playAmplifier);

// @route   POST /api/v1/devices/:device_id/amp/stop
// @desc    Queue amplifier stop command
// @access  Private (requires user token)
router.post('/:device_id/amp/stop', protect, stopAmplifier);

// @route   POST /api/v1/devices/:device_id/amp/restart
// @desc    Queue amplifier restart command
// @access  Private (requires user token)
router.post('/:device_id/amp/restart', protect, restartAmplifier);

// @route   POST /api/v1/devices/:device_id/amp/volume
// @desc    Queue amplifier set volume command (requires ?level= parameter 0-21)
// @access  Private (requires user token)
router.post('/:device_id/amp/volume', protect, setAmplifierVolume);

// @route   GET /api/v1/devices/:device_id/amp/status
// @desc    Queue amplifier get status command
// @access  Private (requires user token)
router.get('/:device_id/amp/status', protect, getAmplifierStatus);

// @route   GET /api/v1/devices/:device_id/amp/files
// @desc    Queue amplifier list files command
// @access  Private (requires user token)
router.get('/:device_id/amp/files', protect, listAmplifierFiles);

// @route   POST /api/v1/devices/:device_id/amp/wifi
// @desc    Queue amplifier set WiFi credentials command (requires ssid and password in body)
// @access  Private (requires user token)
router.post('/:device_id/amp/wifi', protect, setAmplifierWifi);

// ============================================================================
// Face Management Routes
// ============================================================================

// @route   POST /api/v1/devices/:device_id/face/count
// @desc    Queue face count command
// @access  Private (requires user token)
router.post('/:device_id/face/count', protect, getFaceCount);

// @route   POST /api/v1/devices/:device_id/face/list
// @desc    Queue face list command (output to serial)
// @access  Private (requires user token)
router.post('/:device_id/face/list', protect, listFaces);

// @route   POST /api/v1/devices/:device_id/face/check
// @desc    Queue face database check command
// @access  Private (requires user token)
router.post('/:device_id/face/check', protect, checkFaceDatabase);

// @route   POST /api/v1/devices/:device_id/face/sync
// @desc    Queue face database sync command (runs all three: count, list, check)
// @access  Private (requires user token)
router.post('/:device_id/face/sync', protect, syncFaceDatabase);

// @route   POST /api/v1/devices/:device_id/face-database/result
// @desc    Receive face database results from device (face_count, face_list, face_check)
// @access  Private (requires device token)
router.post('/:device_id/face-database/result', authenticateDevice, handleFaceDatabaseResult);

// @route   GET /api/v1/devices/:device_id/face-database/info
// @desc    Get current face database information (for frontend display)
// @access  Private (requires user token)
router.get('/:device_id/face-database/info', protect, getFaceDatabaseInfo);

// ============================================================================
// System Control Routes
// ============================================================================

// @route   POST /api/v1/devices/:device_id/system/restart
// @desc    Queue system restart command
// @access  Private (requires user token)
router.post('/:device_id/system/restart', protect, restartSystem);

// ============================================================================
// Device Info Route
// ============================================================================

// @route   GET /api/v1/devices/:device_id/info
// @desc    Get device info (similar to HTML controller /info endpoint)
// @access  Private (requires user token)
router.get('/:device_id/info', protect, getDeviceInfo);

// ============================================================================
// Visitors Route
// ============================================================================

// @route   GET /api/v1/devices/:device_id/visitors/latest
// @desc    Get latest visitors (face detections) with images
// @access  Private (requires user token)
router.get('/:device_id/visitors/latest', protect, getLatestVisitors);

module.exports = router;
