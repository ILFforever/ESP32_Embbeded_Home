const asyncHandler = require('express-async-handler');
const streamBuffer = require('../services/streamBuffer');

/**
 * @desc    Receive camera frame from ESP32
 * @route   POST /api/v1/devices/doorbell/camera-stream
 * @access  Private (device auth)
 */
exports.receiveCameraFrame = asyncHandler(async (req, res) => {
  const { device_id, frame_id, timestamp } = req.body;
  const frameData = req.file ? req.file.buffer : null;

  if (!frameData) {
    return res.status(400).json({
      success: false,
      error: 'No frame data received'
    });
  }

  // Add frame to buffer
  const bufferId = streamBuffer.addFrame(
    frameData,
    parseInt(frame_id) || 0,
    device_id || req.device?.device_id || 'unknown'
  );

  // Log periodically (every 10th frame)
  if (bufferId % 10 === 0) {
    const stats = streamBuffer.getStats();
    console.log(`[Stream] Frame ${bufferId} received: ${frameData.length} bytes (${stats.videoClientsConnected} clients)`);
  }

  res.status(200).json({
    success: true,
    frame_id: bufferId,
    size: frameData.length,
    clients: streamBuffer.stats.videoClientsConnected
  });
});

/**
 * @desc    Receive audio chunk from ESP32
 * @route   POST /api/v1/devices/doorbell/mic-stream
 * @access  Private (device auth)
 */
exports.receiveAudioChunk = asyncHandler(async (req, res) => {
  const { device_id } = req.body;
  const sequence = req.headers['x-sequence'] ? parseInt(req.headers['x-sequence']) : 0;
  const audioData = req.body instanceof Buffer ? req.body : Buffer.from(req.body);

  if (!audioData || audioData.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'No audio data received'
    });
  }

  // Add audio chunk to buffer
  const bufferId = streamBuffer.addAudioChunk(
    audioData,
    sequence,
    device_id || req.device?.device_id || 'unknown'
  );

  // Log periodically (every 50th chunk)
  if (bufferId % 50 === 0) {
    const stats = streamBuffer.getStats();
    console.log(`[Stream] Audio chunk ${bufferId} received: ${audioData.length} bytes (${stats.audioClientsConnected} clients)`);
  }

  res.status(200).json({
    success: true,
    chunk_id: bufferId,
    sequence,
    size: audioData.length,
    clients: streamBuffer.stats.audioClientsConnected
  });
});

/**
 * @desc    Stream camera frames to frontend/client (MJPEG)
 * @route   GET /api/v1/stream/camera
 * @access  Public (or protected based on your needs)
 */
exports.streamCamera = asyncHandler(async (req, res) => {
  console.log('[Stream] New camera client connected');

  // Set headers for MJPEG streaming
  res.writeHead(200, {
    'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  // Add client to stream buffer
  streamBuffer.addVideoClient(res);

  // Send latest frame immediately if available
  const latestFrame = streamBuffer.getLatestFrame();
  if (latestFrame) {
    const boundary = 'frame';
    const header = `--${boundary}\r\nContent-Type: image/jpeg\r\nContent-Length: ${latestFrame.size}\r\n\r\n`;
    res.write(header);
    res.write(latestFrame.data);
    res.write('\r\n');
  }

  // Connection will be kept alive and frames broadcasted via streamBuffer
  // Client disconnect is handled by streamBuffer.addVideoClient()
});

/**
 * @desc    Stream audio to frontend/client (PCM)
 * @route   GET /api/v1/stream/audio
 * @access  Public (or protected based on your needs)
 */
exports.streamAudio = asyncHandler(async (req, res) => {
  console.log('[Stream] New audio client connected');

  // Set headers for audio streaming (PCM)
  res.writeHead(200, {
    'Content-Type': 'audio/pcm',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Sample-Rate': '16000',
    'X-Channels': '1',
    'X-Bit-Depth': '16'
  });

  // Add client to stream buffer
  streamBuffer.addAudioClient(res);

  // Connection will be kept alive and audio chunks broadcasted via streamBuffer
  // Client disconnect is handled by streamBuffer.addAudioClient()
});

/**
 * @desc    Get latest camera frame (snapshot)
 * @route   GET /api/v1/stream/camera/snapshot
 * @access  Public (or protected)
 */
exports.getCameraSnapshot = asyncHandler(async (req, res) => {
  const latestFrame = streamBuffer.getLatestFrame();

  if (!latestFrame) {
    return res.status(404).json({
      success: false,
      error: 'No frames available'
    });
  }

  res.writeHead(200, {
    'Content-Type': 'image/jpeg',
    'Content-Length': latestFrame.size,
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': '*'
  });

  res.end(latestFrame.data);
});

/**
 * @desc    Get streaming statistics
 * @route   GET /api/v1/stream/stats
 * @access  Public (or protected)
 */
exports.getStreamStats = asyncHandler(async (req, res) => {
  const stats = streamBuffer.getStats();

  res.status(200).json({
    success: true,
    stats
  });
});

/**
 * @desc    Clear stream buffers (admin/debug)
 * @route   DELETE /api/v1/stream/clear
 * @access  Protected (admin only)
 */
exports.clearStreamBuffers = asyncHandler(async (req, res) => {
  streamBuffer.clear();

  res.status(200).json({
    success: true,
    message: 'Stream buffers cleared'
  });
});
