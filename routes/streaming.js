const express = require('express');
const router = express.Router();
const multer = require('multer');
const {
  receiveCameraFrame,
  receiveAudioChunk,
  streamCamera,
  streamAudio,
  getCameraSnapshot,
  getStreamStats,
  clearStreamBuffers
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
// ESP32 → Backend (Receive streams from devices)
// ============================================================================

// @route   POST /api/v1/devices/doorbell/camera-stream
// @desc    Receive camera frame from ESP32
// @access  Private (requires device token)
router.post('/doorbell/camera-stream', upload.single('frame'), authenticateDevice, receiveCameraFrame);

// @route   POST /api/v1/devices/doorbell/mic-stream
// @desc    Receive audio chunk from ESP32
// @access  Private (requires device token)
// Note: Raw body parser needed for PCM audio
router.post('/doorbell/mic-stream',
  express.raw({ type: 'application/octet-stream', limit: '10kb' }),
  authenticateDevice,
  receiveAudioChunk
);

// ============================================================================
// Backend → Frontend/ESP32 Wroover (Stream to clients)
// ============================================================================

// @route   GET /api/v1/stream/camera
// @desc    Stream camera frames (MJPEG) to frontend/clients
// @access  Public (add auth if needed)
router.get('/stream/camera', streamCamera);

// @route   GET /api/v1/stream/audio
// @desc    Stream audio (PCM) to frontend/clients
// @access  Public (add auth if needed)
router.get('/stream/audio', streamAudio);

// @route   GET /api/v1/stream/camera/snapshot
// @desc    Get latest camera frame (single JPEG)
// @access  Public (add auth if needed)
router.get('/stream/camera/snapshot', getCameraSnapshot);

// ============================================================================
// Stream Management
// ============================================================================

// @route   GET /api/v1/stream/stats
// @desc    Get streaming statistics
// @access  Public (add auth if needed)
router.get('/stream/stats', getStreamStats);

// @route   DELETE /api/v1/stream/clear
// @desc    Clear stream buffers (admin/debug)
// @access  Protected (TODO: add admin auth)
router.delete('/stream/clear', clearStreamBuffers);

module.exports = router;
