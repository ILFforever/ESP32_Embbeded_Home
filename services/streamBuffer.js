/**
 * In-Memory Stream Buffer Manager (Multi-Device Support)
 *
 * Manages separate stream buffers for multiple ESP32 devices.
 * Each device (doorbell camera) has its own isolated buffer.
 * Supports both device-specific and aggregated streaming.
 */

/**
 * Single device stream buffer
 */
class StreamBuffer {
  constructor(deviceId, maxFrames = 30, maxAudioChunks = 100) {
    this.deviceId = deviceId;

    // Camera frames buffer (circular buffer, keeps last N frames)
    this.frames = [];
    this.maxFrames = maxFrames;
    this.currentFrameId = 0;

    // Audio chunks buffer (circular buffer)
    this.audioChunks = [];
    this.maxAudioChunks = maxAudioChunks;
    this.currentAudioSeq = 0;

    // Client subscriptions for Server-Sent Events
    this.videoClients = new Set();
    this.audioClients = new Set();

    // Statistics
    this.stats = {
      framesReceived: 0,
      audioChunksReceived: 0,
      framesDropped: 0,
      audioChunksDropped: 0,
      videoClientsConnected: 0,
      audioClientsConnected: 0,
      lastFrameTime: null,
      lastAudioTime: null,
    };

    // Stream activity
    this.lastFrameTimestamp = 0;
    this.lastAudioTimestamp = 0;
  }

  /**
   * Add camera frame to buffer
   */
  addFrame(frameData, frameId) {
    const timestamp = Date.now();

    const frame = {
      id: this.currentFrameId++,
      frameId,
      deviceId: this.deviceId,
      data: frameData,
      size: frameData.length,
      timestamp,
      receivedAt: new Date().toISOString(),
    };

    // Add to buffer
    this.frames.push(frame);

    // Keep buffer size limited (circular buffer)
    if (this.frames.length > this.maxFrames) {
      this.frames.shift(); // Remove oldest
      this.stats.framesDropped++;
    }

    // Update stats
    this.stats.framesReceived++;
    this.stats.lastFrameTime = timestamp;
    this.lastFrameTimestamp = timestamp;

    // Broadcast to connected clients (MJPEG streaming)
    this.broadcastFrame(frame);

    return frame.id;
  }

  /**
   * Add audio chunk to buffer
   */
  addAudioChunk(audioData, sequence) {
    const timestamp = Date.now();

    const chunk = {
      id: this.currentAudioSeq++,
      sequence,
      deviceId: this.deviceId,
      data: audioData,
      size: audioData.length,
      timestamp,
      receivedAt: new Date().toISOString(),
    };

    // Add to buffer
    this.audioChunks.push(chunk);

    // Keep buffer size limited
    if (this.audioChunks.length > this.maxAudioChunks) {
      this.audioChunks.shift();
      this.stats.audioChunksDropped++;
    }

    // Update stats
    this.stats.audioChunksReceived++;
    this.stats.lastAudioTime = timestamp;
    this.lastAudioTimestamp = timestamp;

    // Broadcast to connected clients
    this.broadcastAudio(chunk);

    return chunk.id;
  }

  /**
   * Get latest frame
   */
  getLatestFrame() {
    return this.frames[this.frames.length - 1] || null;
  }

  /**
   * Get latest audio chunk
   */
  getLatestAudioChunk() {
    return this.audioChunks[this.audioChunks.length - 1] || null;
  }

  /**
   * Get frame by ID
   */
  getFrame(id) {
    return this.frames.find(f => f.id === id);
  }

  /**
   * Get synced frame for audio timestamp
   */
  getSyncedFrame(audioTimestamp) {
    if (this.frames.length === 0) return null;

    // Find frame with closest timestamp
    let closestFrame = this.frames[0];
    let minDiff = Math.abs(closestFrame.timestamp - audioTimestamp);

    for (const frame of this.frames) {
      const diff = Math.abs(frame.timestamp - audioTimestamp);
      if (diff < minDiff) {
        minDiff = diff;
        closestFrame = frame;
      }
    }

    // Only return if within 500ms sync window
    return minDiff < 500 ? closestFrame : null;
  }

  /**
   * Add video client (for MJPEG streaming)
   */
  addVideoClient(res) {
    this.videoClients.add(res);
    this.stats.videoClientsConnected = this.videoClients.size;

    // Clean up when client disconnects
    res.on('close', () => {
      this.videoClients.delete(res);
      this.stats.videoClientsConnected = this.videoClients.size;
      console.log(`[Stream] Client disconnected from ${this.deviceId} video stream`);
    });
  }

  /**
   * Add audio client (for PCM streaming)
   */
  addAudioClient(res) {
    this.audioClients.add(res);
    this.stats.audioClientsConnected = this.audioClients.size;

    res.on('close', () => {
      this.audioClients.delete(res);
      this.stats.audioClientsConnected = this.audioClients.size;
      console.log(`[Stream] Client disconnected from ${this.deviceId} audio stream`);
    });
  }

  /**
   * Broadcast frame to all connected video clients (MJPEG)
   */
  broadcastFrame(frame) {
    if (this.videoClients.size === 0) return;

    // MJPEG format: --boundary\r\nContent-Type: image/jpeg\r\nContent-Length: N\r\n\r\n[JPEG DATA]
    const boundary = 'frame';
    const header = `--${boundary}\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.size}\r\nX-Device-ID: ${this.deviceId}\r\n\r\n`;

    for (const client of this.videoClients) {
      try {
        client.write(header);
        client.write(frame.data);
        client.write('\r\n');
      } catch (err) {
        console.error(`[Stream] Error sending frame to client (${this.deviceId}):`, err.message);
        this.videoClients.delete(client);
      }
    }
  }

  /**
   * Broadcast audio chunk to all connected audio clients
   */
  broadcastAudio(chunk) {
    if (this.audioClients.size === 0) return;

    for (const client of this.audioClients) {
      try {
        client.write(chunk.data);
      } catch (err) {
        console.error(`[Stream] Error sending audio to client (${this.deviceId}):`, err.message);
        this.audioClients.delete(client);
      }
    }
  }

  /**
   * Check if stream is active (received data recently)
   */
  isVideoActive(timeoutMs = 5000) {
    return (Date.now() - this.lastFrameTimestamp) < timeoutMs;
  }

  isAudioActive(timeoutMs = 5000) {
    return (Date.now() - this.lastAudioTimestamp) < timeoutMs;
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      deviceId: this.deviceId,
      ...this.stats,
      currentFrames: this.frames.length,
      currentAudioChunks: this.audioChunks.length,
      bufferUsage: {
        frames: `${this.frames.length}/${this.maxFrames}`,
        audio: `${this.audioChunks.length}/${this.maxAudioChunks}`,
      },
      streamActive: {
        video: this.isVideoActive(),
        audio: this.isAudioActive(),
      },
    };
  }

  /**
   * Clear all buffers (cleanup)
   */
  clear() {
    this.frames = [];
    this.audioChunks = [];

    // Close all client connections
    for (const client of this.videoClients) {
      try {
        client.end();
      } catch (err) {
        // Ignore errors on close
      }
    }
    for (const client of this.audioClients) {
      try {
        client.end();
      } catch (err) {
        // Ignore errors on close
      }
    }

    this.videoClients.clear();
    this.audioClients.clear();
    this.stats.videoClientsConnected = 0;
    this.stats.audioClientsConnected = 0;
  }
}

/**
 * Multi-device stream buffer manager
 */
class StreamBufferManager {
  constructor() {
    // Map of device_id → StreamBuffer
    this.deviceBuffers = new Map();
  }

  /**
   * Get or create buffer for a device
   */
  getDeviceBuffer(deviceId) {
    if (!this.deviceBuffers.has(deviceId)) {
      console.log(`[StreamBuffer] Creating new buffer for device: ${deviceId}`);
      this.deviceBuffers.set(deviceId, new StreamBuffer(deviceId));
    }
    return this.deviceBuffers.get(deviceId);
  }

  /**
   * Check if device has a buffer
   */
  hasDevice(deviceId) {
    return this.deviceBuffers.has(deviceId);
  }

  /**
   * Add frame to device-specific buffer
   */
  addFrame(deviceId, frameData, frameId) {
    const buffer = this.getDeviceBuffer(deviceId);
    return buffer.addFrame(frameData, frameId);
  }

  /**
   * Add audio chunk to device-specific buffer
   */
  addAudioChunk(deviceId, audioData, sequence) {
    const buffer = this.getDeviceBuffer(deviceId);
    return buffer.addAudioChunk(audioData, sequence);
  }

  /**
   * Get latest frame from specific device
   */
  getLatestFrame(deviceId) {
    const buffer = this.deviceBuffers.get(deviceId);
    return buffer ? buffer.getLatestFrame() : null;
  }

  /**
   * Get latest audio chunk from specific device
   */
  getLatestAudioChunk(deviceId) {
    const buffer = this.deviceBuffers.get(deviceId);
    return buffer ? buffer.getLatestAudioChunk() : null;
  }

  /**
   * Get all active devices (streaming in last 5 seconds)
   */
  getActiveDevices() {
    const devices = [];
    for (const [deviceId, buffer] of this.deviceBuffers.entries()) {
      if (buffer.isVideoActive() || buffer.isAudioActive()) {
        devices.push({
          deviceId,
          videoActive: buffer.isVideoActive(),
          audioActive: buffer.isAudioActive(),
          stats: buffer.getStats()
        });
      }
    }
    return devices;
  }

  /**
   * Get all devices (active or not)
   */
  getAllDevices() {
    const devices = [];
    for (const [deviceId, buffer] of this.deviceBuffers.entries()) {
      devices.push({
        deviceId,
        videoActive: buffer.isVideoActive(),
        audioActive: buffer.isAudioActive(),
        stats: buffer.getStats()
      });
    }
    return devices;
  }

  /**
   * Get stats for specific device or all devices
   */
  getStats(deviceId = null) {
    if (deviceId) {
      const buffer = this.deviceBuffers.get(deviceId);
      return buffer ? buffer.getStats() : null;
    }

    // Return stats for all devices
    const allStats = {};
    for (const [id, buffer] of this.deviceBuffers.entries()) {
      allStats[id] = buffer.getStats();
    }
    return allStats;
  }

  /**
   * Add video client to specific device stream
   */
  addVideoClient(deviceId, res) {
    const buffer = this.getDeviceBuffer(deviceId);
    buffer.addVideoClient(res);
  }

  /**
   * Add audio client to specific device stream
   */
  addAudioClient(deviceId, res) {
    const buffer = this.getDeviceBuffer(deviceId);
    buffer.addAudioClient(res);
  }

  /**
   * Clear buffer for specific device or all devices
   */
  clear(deviceId = null) {
    if (deviceId) {
      const buffer = this.deviceBuffers.get(deviceId);
      if (buffer) {
        buffer.clear();
        this.deviceBuffers.delete(deviceId);
        console.log(`[StreamBuffer] Cleared buffer for device: ${deviceId}`);
      }
    } else {
      // Clear all devices
      for (const buffer of this.deviceBuffers.values()) {
        buffer.clear();
      }
      this.deviceBuffers.clear();
      console.log('[StreamBuffer] Cleared all device buffers');
    }
  }

  /**
   * Get total number of connected clients across all devices
   */
  getTotalClients() {
    let videoClients = 0;
    let audioClients = 0;

    for (const buffer of this.deviceBuffers.values()) {
      videoClients += buffer.stats.videoClientsConnected;
      audioClients += buffer.stats.audioClientsConnected;
    }

    return { videoClients, audioClients };
  }
}

// Export singleton manager
module.exports = new StreamBufferManager();
