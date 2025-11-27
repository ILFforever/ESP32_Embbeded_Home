/**
 * In-Memory Stream Buffer Manager
 *
 * Lightweight streaming solution for ESP32 camera and microphone.
 * Keeps frames/audio in memory with timestamps for sync.
 * No Firebase storage - pure pass-through with small buffer.
 */

class StreamBuffer {
  constructor(maxFrames = 30, maxAudioChunks = 100) {
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
   * @param {Buffer} frameData - JPEG frame data
   * @param {number} frameId - Frame sequence number
   * @param {string} deviceId - Source device ID
   */
  addFrame(frameData, frameId, deviceId = 'unknown') {
    const timestamp = Date.now();

    const frame = {
      id: this.currentFrameId++,
      frameId,
      deviceId,
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
   * @param {Buffer} audioData - PCM audio data
   * @param {number} sequence - Chunk sequence number
   * @param {string} deviceId - Source device ID
   */
  addAudioChunk(audioData, sequence, deviceId = 'unknown') {
    const timestamp = Date.now();

    const chunk = {
      id: this.currentAudioSeq++,
      sequence,
      deviceId,
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
   * Finds the frame closest to the given audio timestamp
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
    });
  }

  /**
   * Broadcast frame to all connected video clients (MJPEG)
   */
  broadcastFrame(frame) {
    if (this.videoClients.size === 0) return;

    // MJPEG format: --boundary\r\nContent-Type: image/jpeg\r\nContent-Length: N\r\n\r\n[JPEG DATA]
    const boundary = 'frame';
    const header = `--${boundary}\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.size}\r\n\r\n`;

    for (const client of this.videoClients) {
      try {
        client.write(header);
        client.write(frame.data);
        client.write('\r\n');
      } catch (err) {
        console.error('Error sending frame to client:', err.message);
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
        console.error('Error sending audio to client:', err.message);
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
    this.videoClients.clear();
    this.audioClients.clear();
    this.stats.videoClientsConnected = 0;
    this.stats.audioClientsConnected = 0;
  }
}

// Singleton instance
const streamBuffer = new StreamBuffer();

module.exports = streamBuffer;
