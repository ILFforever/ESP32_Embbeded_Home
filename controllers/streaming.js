const asyncHandler = require('express-async-handler');
const streamBuffer = require('../services/streamBuffer');

/**
 * @desc    Receive camera frame from ESP32
 * @route   POST /api/v1/devices/:device_id/stream/camera
 * @access  Private (device auth)
 */
exports.receiveCameraFrame = asyncHandler(async (req, res) => {
  const { device_id } = req.params; // Get from URL
  const { frame_id, timestamp } = req.body;
  const frameData = req.file ? req.file.buffer : null;

  if (!frameData) {
    return res.status(400).json({
      success: false,
      error: 'No frame data received'
    });
  }

  // Verify device_id in URL matches authenticated device
  if (req.device && req.device.device_id !== device_id) {
    return res.status(403).json({
      success: false,
      error: 'Device ID mismatch - URL device_id does not match authenticated device'
    });
  }

  // Add frame to device-specific buffer
  const bufferId = streamBuffer.addFrame(
    device_id,
    frameData,
    parseInt(frame_id) || 0
  );

  // Log periodically (every 10th frame for performance)
  if (bufferId % 10 === 0) {
    const stats = streamBuffer.getStats(device_id);
    console.log(`[Stream] Frame ${bufferId} received from ${device_id}: ${frameData.length} bytes (${stats.videoClientsConnected} clients, ${stats.framesReceived} total)`);
  }

  res.status(200).json({
    success: true,
    device_id,
    frame_id: bufferId,
    size: frameData.length,
    clients: streamBuffer.getStats(device_id).videoClientsConnected
  });
});

/**
 * @desc    Receive audio chunk from ESP32
 * @route   POST /api/v1/devices/:device_id/stream/audio
 * @access  Private (device auth)
 */
exports.receiveAudioChunk = asyncHandler(async (req, res) => {
  const { device_id } = req.params; // Get from URL
  const sequence = req.headers['x-sequence'] ? parseInt(req.headers['x-sequence']) : 0;
  const audioData = req.body instanceof Buffer ? req.body : Buffer.from(req.body);

  if (!audioData || audioData.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'No audio data received'
    });
  }

  // Verify device_id in URL matches authenticated device
  if (req.device && req.device.device_id !== device_id) {
    return res.status(403).json({
      success: false,
      error: 'Device ID mismatch - URL device_id does not match authenticated device'
    });
  }

  // Add audio chunk to device-specific buffer
  const bufferId = streamBuffer.addAudioChunk(
    device_id,
    audioData,
    sequence
  );

  // Log periodically (every 50th chunk)
  if (bufferId % 50 === 0) {
    const stats = streamBuffer.getStats(device_id);
    console.log(`[Stream] Audio chunk ${bufferId} received from ${device_id}: ${audioData.length} bytes (${stats.audioClientsConnected} clients)`);
  }

  res.status(200).json({
    success: true,
    device_id,
    chunk_id: bufferId,
    sequence,
    size: audioData.length,
    clients: streamBuffer.getStats(device_id).audioClientsConnected
  });
});

/**
 * @desc    Stream camera frames from specific device to frontend/client (MJPEG)
 * @route   GET /api/v1/stream/camera/:device_id
 * @access  Public (or protected based on your needs)
 */
exports.streamCamera = asyncHandler(async (req, res) => {
  const { device_id } = req.params;

  console.log(`[Stream] New camera client connected for device: ${device_id}`);

  // Check if device exists and has frames
  if (!streamBuffer.hasDevice(device_id)) {
    return res.status(404).json({
      success: false,
      error: `Device ${device_id} not found or not streaming`
    });
  }

  const buffer = streamBuffer.getDeviceBuffer(device_id);

  // Check if device is actively streaming
  if (!buffer.isVideoActive()) {
    return res.status(404).json({
      success: false,
      error: `Device ${device_id} is not actively streaming (no frames in last 5 seconds)`
    });
  }

  // Set headers for MJPEG streaming
  res.writeHead(200, {
    'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Device-ID': device_id
  });

  // Add client to stream buffer for this device
  streamBuffer.addVideoClient(device_id, res);

  // Send latest frame immediately if available
  const latestFrame = buffer.getLatestFrame();
  if (latestFrame) {
    buffer.broadcastFrame(latestFrame);
  }

  // Connection will be kept alive and frames broadcasted via streamBuffer
  // Client disconnect is handled by streamBuffer.addVideoClient()
});

/**
 * @desc    Stream camera frames from ALL active devices (mixed feed)
 * @route   GET /api/v1/stream/camera
 * @access  Public
 */
exports.streamCameraAll = asyncHandler(async (req, res) => {
  console.log('[Stream] New camera client connected for ALL devices');

  // Get all active devices
  const activeDevices = streamBuffer.getActiveDevices().filter(d => d.videoActive);

  if (activeDevices.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'No active camera streams available'
    });
  }

  // Set headers for MJPEG streaming
  res.writeHead(200, {
    'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Active-Devices': activeDevices.map(d => d.deviceId).join(',')
  });

  // Subscribe to all active device streams
  for (const { deviceId } of activeDevices) {
    streamBuffer.addVideoClient(deviceId, res);

    // Send latest frame from each device
    const latestFrame = streamBuffer.getLatestFrame(deviceId);
    if (latestFrame) {
      const buffer = streamBuffer.getDeviceBuffer(deviceId);
      buffer.broadcastFrame(latestFrame);
    }
  }
});

/**
 * @desc    Stream audio from specific device to frontend/client (PCM)
 * @route   GET /api/v1/stream/audio/:device_id
 * @access  Public (or protected based on your needs)
 */
exports.streamAudio = asyncHandler(async (req, res) => {
  const { device_id } = req.params;

  console.log(`[Stream] New audio client connected for device: ${device_id}`);

  // Check if device exists and has audio
  if (!streamBuffer.hasDevice(device_id)) {
    return res.status(404).json({
      success: false,
      error: `Device ${device_id} not found or not streaming`
    });
  }

  const buffer = streamBuffer.getDeviceBuffer(device_id);

  // Check if device is actively streaming audio
  if (!buffer.isAudioActive()) {
    return res.status(404).json({
      success: false,
      error: `Device ${device_id} is not actively streaming audio (no chunks in last 5 seconds)`
    });
  }

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
    'X-Bit-Depth': '16',
    'X-Device-ID': device_id
  });

  // Add client to stream buffer for this device
  streamBuffer.addAudioClient(device_id, res);

  // Connection will be kept alive and audio chunks broadcasted via streamBuffer
  // Client disconnect is handled by streamBuffer.addAudioClient()
});

/**
 * @desc    Stream audio from ALL active devices (mixed feed)
 * @route   GET /api/v1/stream/audio
 * @access  Public
 */
exports.streamAudioAll = asyncHandler(async (req, res) => {
  console.log('[Stream] New audio client connected for ALL devices');

  // Get all active devices with audio
  const activeDevices = streamBuffer.getActiveDevices().filter(d => d.audioActive);

  if (activeDevices.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'No active audio streams available'
    });
  }

  // Set headers for audio streaming
  res.writeHead(200, {
    'Content-Type': 'audio/pcm',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Sample-Rate': '16000',
    'X-Channels': '1',
    'X-Bit-Depth': '16',
    'X-Active-Devices': activeDevices.map(d => d.deviceId).join(',')
  });

  // Subscribe to all active device audio streams
  for (const { deviceId } of activeDevices) {
    streamBuffer.addAudioClient(deviceId, res);
  }
});

/**
 * @desc    Get latest camera frame from specific device (snapshot)
 * @route   GET /api/v1/stream/snapshot/:device_id
 * @access  Public (or protected)
 */
exports.getCameraSnapshot = asyncHandler(async (req, res) => {
  const { device_id } = req.params;

  const latestFrame = streamBuffer.getLatestFrame(device_id);

  if (!latestFrame) {
    return res.status(404).json({
      success: false,
      error: `No frames available from device ${device_id}`
    });
  }

  res.writeHead(200, {
    'Content-Type': 'image/jpeg',
    'Content-Length': latestFrame.size,
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': '*',
    'X-Device-ID': device_id,
    'X-Frame-ID': latestFrame.frameId,
    'X-Timestamp': latestFrame.timestamp
  });

  res.end(latestFrame.data);
});

/**
 * @desc    Get latest camera frame from any active device (snapshot)
 * @route   GET /api/v1/stream/snapshot
 * @access  Public (or protected)
 */
exports.getLatestSnapshot = asyncHandler(async (req, res) => {
  // Get all active devices
  const activeDevices = streamBuffer.getActiveDevices().filter(d => d.videoActive);

  if (activeDevices.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'No active camera streams available'
    });
  }

  // Get frame from first active device (or you could implement round-robin)
  const deviceId = activeDevices[0].deviceId;
  const latestFrame = streamBuffer.getLatestFrame(deviceId);

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
    'Access-Control-Allow-Origin': '*',
    'X-Device-ID': deviceId,
    'X-Frame-ID': latestFrame.frameId,
    'X-Timestamp': latestFrame.timestamp
  });

  res.end(latestFrame.data);
});

/**
 * @desc    Get streaming statistics for specific device
 * @route   GET /api/v1/stream/stats/:device_id
 * @access  Public (or protected)
 */
exports.getStreamStats = asyncHandler(async (req, res) => {
  const { device_id } = req.params;
  const stats = streamBuffer.getStats(device_id);

  if (!stats) {
    return res.status(404).json({
      success: false,
      error: `Device ${device_id} not found`
    });
  }

  res.status(200).json({
    success: true,
    device_id,
    stats
  });
});

/**
 * @desc    Get streaming statistics for all devices
 * @route   GET /api/v1/stream/stats
 * @access  Public (or protected)
 */
exports.getAllStreamStats = asyncHandler(async (req, res) => {
  const allStats = streamBuffer.getStats(); // No device_id = all devices
  const activeDevices = streamBuffer.getActiveDevices();
  const totalClients = streamBuffer.getTotalClients();

  res.status(200).json({
    success: true,
    summary: {
      totalDevices: Object.keys(allStats).length,
      activeDevices: activeDevices.length,
      totalVideoClients: totalClients.videoClients,
      totalAudioClients: totalClients.audioClients
    },
    devices: allStats,
    activeDevicesList: activeDevices.map(d => ({
      deviceId: d.deviceId,
      videoActive: d.videoActive,
      audioActive: d.audioActive
    }))
  });
});

/**
 * @desc    Clear stream buffer for specific device (admin/debug)
 * @route   DELETE /api/v1/stream/clear/:device_id
 * @access  Protected (admin only)
 */
exports.clearStreamBuffer = asyncHandler(async (req, res) => {
  const { device_id } = req.params;

  streamBuffer.clear(device_id);

  res.status(200).json({
    success: true,
    message: `Stream buffer cleared for device: ${device_id}`
  });
});

/**
 * @desc    Clear all stream buffers (admin/debug)
 * @route   DELETE /api/v1/stream/clear
 * @access  Protected (admin only)
 */
exports.clearAllStreamBuffers = asyncHandler(async (req, res) => {
  streamBuffer.clear(); // No device_id = clear all

  res.status(200).json({
    success: true,
    message: 'All stream buffers cleared'
  });
});
