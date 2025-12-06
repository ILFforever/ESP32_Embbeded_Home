const express = require('express');
const router = express.Router();
const multer = require('multer');
const {
  receiveCameraFrame,
  receiveAudioChunk,
  streamCamera,
  streamCameraAll,
  streamAudio,
  streamAudioAll,
  getCameraSnapshot,
  getLatestSnapshot,
  getStreamStats,
  getAllStreamStats,
  clearStreamBuffer,
  clearAllStreamBuffers
} = require('../controllers/streaming');
const { authenticateDevice } = require('../middleware/deviceAuth');

// Configure multer for camera frames (in-memory, lightweight)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024, // 100KB max (ESP32 sends ~9KB frames)
    fields: 5
  },
  fileFilter: (req, file, cb) => {
    // Accept only JPEG images
    if (file.mimetype === 'image/jpeg') {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG images are allowed'));
    }
  }
});

// ============================================================================
// ESP32 → Backend (Device uploads - device-specific paths)
// ============================================================================

// @route   POST /api/v1/devices/:device_id/stream/camera
// @desc    Receive camera frame from specific ESP32 device
// @access  Private (requires device token)
router.post('/devices/:device_id/stream/camera', upload.single('frame'), authenticateDevice, receiveCameraFrame);

// @route   POST /api/v1/devices/:device_id/stream/audio
// @desc    Receive audio chunk from specific ESP32 device
// @access  Private (requires device token)
// Note: Raw body parser needed for PCM audio
router.post('/devices/:device_id/stream/audio',
  express.raw({ type: 'application/octet-stream', limit: '10kb' }),
  authenticateDevice,
  receiveAudioChunk
);

// ============================================================================
// Backend → Frontend/ESP32 Wroover (Stream consumption)
// ============================================================================

// @route   GET /api/v1/stream/camera/:device_id
// @desc    Stream camera frames (MJPEG) from specific device
// @access  Public (add auth if needed)
router.get('/stream/camera/:device_id', streamCamera);

// @route   GET /api/v1/stream/camera
// @desc    Stream camera frames (MJPEG) from all active devices (mixed feed)
// @access  Public (add auth if needed)
router.get('/stream/camera', streamCameraAll);

// @route   GET /api/v1/stream/audio/:device_id
// @desc    Stream audio (PCM) from specific device
// @access  Public (add auth if needed)
router.get('/stream/audio/:device_id', streamAudio);

// @route   GET /api/v1/stream/audio
// @desc    Stream audio (PCM) from all active devices (mixed feed)
// @access  Public (add auth if needed)
router.get('/stream/audio', streamAudioAll);

// @route   GET /api/v1/stream/snapshot/:device_id
// @desc    Get latest camera frame from specific device (single JPEG)
// @access  Public (add auth if needed)
router.get('/stream/snapshot/:device_id', getCameraSnapshot);

// @route   GET /api/v1/stream/snapshot
// @desc    Get latest camera frame from any active device (single JPEG)
// @access  Public (add auth if needed)
router.get('/stream/snapshot', getLatestSnapshot);

// ============================================================================
// Stream Management
// ============================================================================

// @route   GET /api/v1/stream/stats/:device_id
// @desc    Get streaming statistics for specific device
// @access  Public (add auth if needed)
router.get('/stream/stats/:device_id', getStreamStats);

// @route   GET /api/v1/stream/stats
// @desc    Get streaming statistics for all devices
// @access  Public (add auth if needed)
router.get('/stream/stats', getAllStreamStats);

// @route   DELETE /api/v1/stream/clear/:device_id
// @desc    Clear stream buffer for specific device (admin/debug)
// @access  Protected (TODO: add admin auth)
router.delete('/stream/clear/:device_id', clearStreamBuffer);

// @route   DELETE /api/v1/stream/clear
// @desc    Clear all stream buffers (admin/debug)
// @access  Protected (TODO: add admin auth)
router.delete('/stream/clear', clearAllStreamBuffers);

module.exports = router;
