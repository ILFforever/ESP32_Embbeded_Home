const WebSocket = require('ws');
const streamBuffer = require('./streamBuffer');

/**
 * WebSocket Streaming Service
 * Handles real-time camera and audio streaming from ESP32 devices via WebSocket
 */

let wss = null;
const deviceConnections = new Map(); // device_id -> WebSocket

/**
 * Initialize WebSocket server
 * @param {http.Server} server - HTTP server instance
 */
function initWebSocketServer(server) {
  wss = new WebSocket.Server({
    server,
    path: '/ws/stream',
    verifyClient: (info, callback) => {
      console.log('[WebSocket] Upgrade request from:', info.req.socket.remoteAddress);
      console.log('[WebSocket] Headers:', JSON.stringify(info.req.headers, null, 2));
      callback(true); // Accept all connections
    }
  });

  wss.on('connection', handleConnection);

  wss.on('error', (error) => {
    console.error('[WebSocket] Server error:', error);
  });

  console.log('[WebSocket] Stream server initialized on /ws/stream');
}

/**
 * Handle new WebSocket connection from device
 */
function handleConnection(ws, req) {
  console.log('[WebSocket] New connection attempt from:', req.socket.remoteAddress);

  let device_id = null;
  let authenticated = false;

  // Handle incoming messages
  ws.on('message', async (data) => {
    try {
      // First message should be authentication
      if (!authenticated) {
        const authMsg = JSON.parse(data.toString());

        if (authMsg.type !== 'auth') {
          ws.send(JSON.stringify({ type: 'error', message: 'First message must be auth' }));
          ws.close();
          return;
        }

        // Validate device credentials
        const isValid = await validateDevice(authMsg.device_id, authMsg.token);

        if (!isValid) {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid credentials' }));
          ws.close();
          return;
        }

        device_id = authMsg.device_id;
        authenticated = true;
        deviceConnections.set(device_id, ws);

        ws.send(JSON.stringify({
          type: 'auth_success',
          device_id,
          message: 'WebSocket streaming ready'
        }));

        console.log(`[WebSocket] Device ${device_id} authenticated and connected`);
        return;
      }

      // Handle streaming data
      if (Buffer.isBuffer(data)) {
        handleBinaryFrame(device_id, data);
      } else {
        const msg = JSON.parse(data.toString());
        handleControlMessage(device_id, ws, msg);
      }

    } catch (error) {
      console.error('[WebSocket] Message handling error:', error);
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  });

  ws.on('close', () => {
    if (device_id) {
      deviceConnections.delete(device_id);
      console.log(`[WebSocket] Device ${device_id} disconnected`);
    }
  });

  ws.on('error', (error) => {
    console.error(`[WebSocket] Connection error for ${device_id}:`, error);
  });
}

/**
 * Validate device credentials
 */
async function validateDevice(device_id, token) {
  try {
    const { getFirestore } = require('../config/firebase');
    const db = getFirestore();
    const deviceDoc = await db.collection('devices').doc(device_id).get();

    if (!deviceDoc.exists) {
      return false;
    }

    const deviceData = deviceDoc.data();
    return deviceData.api_token === token && !deviceData.disabled;
  } catch (error) {
    console.error('[WebSocket] Auth error:', error);
    return false;
  }
}

/**
 * Handle binary frame data (camera JPEG or audio PCM)
 */
function handleBinaryFrame(device_id, data) {
  // Frame format: [type(1)][frame_id(2)][timestamp(4)][data...]
  // type: 0x01 = camera, 0x02 = audio

  if (data.length < 7) {
    console.warn(`[WebSocket] Frame too small from ${device_id}: ${data.length} bytes`);
    return;
  }

  const type = data.readUInt8(0);
  const frame_id = data.readUInt16BE(1);
  const timestamp = data.readUInt32BE(3);
  const frameData = data.slice(7);

  if (type === 0x01) {
    // Camera frame
    const bufferId = streamBuffer.addFrame(device_id, frameData, frame_id);

    if (bufferId % 10 === 0) {
      const stats = streamBuffer.getStats(device_id);
      console.log(`[WebSocket] Camera frame ${bufferId} from ${device_id}: ${frameData.length} bytes (${stats.videoClientsConnected} clients)`);
    }
  } else if (type === 0x02) {
    // Audio chunk
    const bufferId = streamBuffer.addAudioChunk(device_id, frameData, frame_id);

    if (bufferId % 50 === 0) {
      const stats = streamBuffer.getStats(device_id);
      console.log(`[WebSocket] Audio chunk ${bufferId} from ${device_id}: ${frameData.length} bytes (${stats.audioClientsConnected} clients)`);
    }
  } else {
    console.warn(`[WebSocket] Unknown frame type ${type} from ${device_id}`);
  }
}

/**
 * Handle control messages (ping, stats requests, etc.)
 */
function handleControlMessage(device_id, ws, msg) {
  switch (msg.type) {
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      break;

    case 'stats':
      const stats = streamBuffer.getStats(device_id);
      ws.send(JSON.stringify({ type: 'stats', data: stats }));
      break;

    default:
      console.warn(`[WebSocket] Unknown message type: ${msg.type}`);
  }
}

/**
 * Send message to specific device
 */
function sendToDevice(device_id, message) {
  const ws = deviceConnections.get(device_id);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
    return true;
  }
  return false;
}

/**
 * Get connected devices
 */
function getConnectedDevices() {
  return Array.from(deviceConnections.keys());
}

/**
 * Check if device is connected
 */
function isDeviceConnected(device_id) {
  const ws = deviceConnections.get(device_id);
  return ws && ws.readyState === WebSocket.OPEN;
}

module.exports = {
  initWebSocketServer,
  sendToDevice,
  getConnectedDevices,
  isDeviceConnected
};
