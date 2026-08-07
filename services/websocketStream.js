const WebSocket = require('ws');
const streamBuffer = require('./streamBuffer');

const MAX_DEVICE_PACKET_BYTES = 128 * 1024;
const MAX_LIVE_CLIENT_BUFFERED_BYTES = 256 * 1024;

const TYPE_CAMERA_JPEG = 0x01;
const TYPE_AUDIO_PCM = 0x02;
const TYPE_AUDIO_IMA_ADPCM = 0x03;
const ADPCM_HEADER_SIZE = 13;
const ADPCM_FORMAT_VERSION = 1;

const STEP_TABLE = [
  7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31,
  34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130,
  143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449,
  494, 544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411,
  1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026,
  4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442,
  11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623,
  27086, 29794, 32767
];

const INDEX_TABLE = [
  -1, -1, -1, -1, 2, 4, 6, 8,
  -1, -1, -1, -1, 2, 4, 6, 8
];

let wss = null;
const deviceConnections = new Map();
const liveSubscribers = new Map();

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Decode the camera's independently decodable IMA ADPCM packet to PCM s16le.
 * The compressed packet itself is still relayed to modern browser clients;
 * decoding here preserves the existing /stream/audio HTTP endpoint.
 */
function decodeImaAdpcmPacket(packet) {
  if (!Buffer.isBuffer(packet) || packet.length < ADPCM_HEADER_SIZE) {
    throw new Error('ADPCM packet is too small');
  }
  if (packet.readUInt8(0) !== TYPE_AUDIO_IMA_ADPCM) {
    throw new Error('Not an IMA ADPCM packet');
  }
  if (packet.readUInt8(12) !== ADPCM_FORMAT_VERSION) {
    throw new Error(`Unsupported ADPCM version ${packet.readUInt8(12)}`);
  }

  const sampleCount = packet.readUInt16BE(7);
  if (sampleCount === 0) {
    throw new Error('ADPCM packet has no samples');
  }

  const requiredBytes = Math.ceil(Math.max(0, sampleCount - 1) / 2);
  if (packet.length < ADPCM_HEADER_SIZE + requiredBytes) {
    throw new Error('ADPCM payload is truncated');
  }

  let predictor = packet.readInt16BE(9);
  let stepIndex = clamp(packet.readUInt8(11), 0, 88);
  const encoded = packet.subarray(ADPCM_HEADER_SIZE);
  const pcm = Buffer.allocUnsafe(sampleCount * 2);
  pcm.writeInt16LE(predictor, 0);

  for (let sampleIndex = 1; sampleIndex < sampleCount; sampleIndex += 1) {
    const encodedIndex = sampleIndex - 1;
    const packed = encoded[Math.floor(encodedIndex / 2)];
    const code = (encodedIndex & 1) === 0 ? packed & 0x0f : packed >> 4;
    const step = STEP_TABLE[stepIndex];

    let delta = step >> 3;
    if (code & 4) delta += step;
    if (code & 2) delta += step >> 1;
    if (code & 1) delta += step >> 2;

    predictor += (code & 8) ? -delta : delta;
    predictor = clamp(predictor, -32768, 32767);
    stepIndex = clamp(stepIndex + INDEX_TABLE[code], 0, 88);
    pcm.writeInt16LE(predictor, sampleIndex * 2);
  }

  return pcm;
}

function addLiveSubscriber(deviceId, ws) {
  let subscribers = liveSubscribers.get(deviceId);
  if (!subscribers) {
    subscribers = new Set();
    liveSubscribers.set(deviceId, subscribers);
  }
  subscribers.add(ws);
}

function removeLiveSubscriber(deviceId, ws) {
  const subscribers = liveSubscribers.get(deviceId);
  if (!subscribers) return;
  subscribers.delete(ws);
  if (subscribers.size === 0) {
    liveSubscribers.delete(deviceId);
  }
}

function broadcastLivePacket(deviceId, packet) {
  const subscribers = liveSubscribers.get(deviceId);
  if (!subscribers || subscribers.size === 0) return;

  for (const client of subscribers) {
    if (client.readyState !== WebSocket.OPEN) continue;

    // Do not let a slow tab retain an unbounded number of JPEGs in server RAM.
    // Video can recover on the next frame and every ADPCM block is independent.
    if (client.bufferedAmount > MAX_LIVE_CLIENT_BUFFERED_BYTES) continue;

    client.send(packet, { binary: true }, (error) => {
      if (error) {
        console.error(`[WebSocket] Live relay error for ${deviceId}:`, error.message);
      }
    });
  }
}

function initWebSocketServer(server) {
  wss = new WebSocket.Server({
    server,
    path: '/ws/stream',
    maxPayload: MAX_DEVICE_PACKET_BYTES
  });

  wss.on('connection', handleConnection);
  wss.on('error', (error) => {
    console.error('[WebSocket] Server error:', error);
  });

  console.log('[WebSocket] Multiplexed device/live server initialized on /ws/stream');
}

function handleConnection(ws, req) {
  console.log('[WebSocket] New connection from:', req.socket.remoteAddress);

  let mode = null;
  let deviceId = null;
  let authenticated = false;

  ws.on('message', async (data, isBinary) => {
    try {
      if (mode === null) {
        if (isBinary) {
          ws.send(JSON.stringify({ type: 'error', message: 'First message must be JSON' }));
          ws.close();
          return;
        }

        const firstMessage = JSON.parse(data.toString());

        if (firstMessage.type === 'subscribe') {
          if (typeof firstMessage.device_id !== 'string' || !firstMessage.device_id.trim()) {
            ws.send(JSON.stringify({ type: 'error', message: 'device_id is required' }));
            ws.close();
            return;
          }

          mode = 'subscriber';
          deviceId = firstMessage.device_id.trim();
          addLiveSubscriber(deviceId, ws);
          ws.send(JSON.stringify({
            type: 'subscribed',
            device_id: deviceId,
            video: { codec: 'jpeg', max_fps: 5 },
            audio: { codec: 'ima-adpcm', sample_rate: 16000, channels: 1 }
          }));
          console.log(`[WebSocket] Browser subscribed to ${deviceId}`);
          return;
        }

        if (firstMessage.type !== 'auth') {
          ws.send(JSON.stringify({ type: 'error', message: 'First message must be auth or subscribe' }));
          ws.close();
          return;
        }

        const isValid = await validateDevice(firstMessage.device_id, firstMessage.token);
        if (!isValid) {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid credentials' }));
          ws.close();
          return;
        }

        mode = 'device';
        deviceId = firstMessage.device_id;
        authenticated = true;

        const oldConnection = deviceConnections.get(deviceId);
        if (oldConnection && oldConnection !== ws && oldConnection.readyState === WebSocket.OPEN) {
          oldConnection.close(1000, 'Replaced by a newer device connection');
        }
        deviceConnections.set(deviceId, ws);

        ws.send(JSON.stringify({
          type: 'auth_success',
          device_id: deviceId,
          message: 'WebSocket streaming ready'
        }));
        console.log(`[WebSocket] Device ${deviceId} authenticated`);
        return;
      }

      if (mode === 'device') {
        if (!authenticated) return;
        if (isBinary) {
          handleBinaryFrame(deviceId, data);
        } else {
          handleControlMessage(deviceId, ws, JSON.parse(data.toString()));
        }
        return;
      }

      if (!isBinary) {
        const message = JSON.parse(data.toString());
        if (message.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        }
      }
    } catch (error) {
      console.error('[WebSocket] Message handling error:', error);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    }
  });

  ws.on('close', () => {
    if (mode === 'device' && deviceId && deviceConnections.get(deviceId) === ws) {
      deviceConnections.delete(deviceId);
      console.log(`[WebSocket] Device ${deviceId} disconnected`);
    } else if (mode === 'subscriber' && deviceId) {
      removeLiveSubscriber(deviceId, ws);
      console.log(`[WebSocket] Browser unsubscribed from ${deviceId}`);
    }
  });

  ws.on('error', (error) => {
    console.error(`[WebSocket] Connection error for ${deviceId || 'unidentified client'}:`, error);
  });
}

async function validateDevice(deviceId, token) {
  try {
    const { getFirestore } = require('../config/firebase');
    const db = getFirestore();
    const deviceDoc = await db.collection('devices').doc(deviceId).get();
    if (!deviceDoc.exists) return false;

    const deviceData = deviceDoc.data();
    return deviceData.api_token === token && !deviceData.disabled;
  } catch (error) {
    console.error('[WebSocket] Auth error:', error);
    return false;
  }
}

function handleBinaryFrame(deviceId, data) {
  if (!Buffer.isBuffer(data) || data.length < 7) {
    console.warn(`[WebSocket] Invalid frame from ${deviceId}`);
    return;
  }

  const type = data.readUInt8(0);
  const sequence = data.readUInt16BE(1);

  if (type === TYPE_CAMERA_JPEG) {
    const jpeg = data.subarray(7);
    if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) {
      console.warn(`[WebSocket] Invalid JPEG frame from ${deviceId}`);
      return;
    }

    const bufferId = streamBuffer.addFrame(deviceId, jpeg, sequence);
    broadcastLivePacket(deviceId, data);
    if (bufferId % 10 === 0) {
      console.log(`[WebSocket] JPEG frame ${bufferId} from ${deviceId}: ${jpeg.length} bytes`);
    }
    return;
  }

  if (type === TYPE_AUDIO_PCM) {
    const pcm = data.subarray(7);
    streamBuffer.addAudioChunk(deviceId, pcm, sequence);
    broadcastLivePacket(deviceId, data);
    return;
  }

  if (type === TYPE_AUDIO_IMA_ADPCM) {
    try {
      const pcm = decodeImaAdpcmPacket(data);
      const bufferId = streamBuffer.addAudioChunk(deviceId, pcm, sequence);
      broadcastLivePacket(deviceId, data);
      if (bufferId % 50 === 0) {
        console.log(`[WebSocket] ADPCM chunk ${bufferId} from ${deviceId}: ${data.length - ADPCM_HEADER_SIZE} bytes compressed`);
      }
    } catch (error) {
      console.warn(`[WebSocket] Invalid ADPCM packet from ${deviceId}: ${error.message}`);
    }
    return;
  }

  console.warn(`[WebSocket] Unknown media type ${type} from ${deviceId}`);
}

function handleControlMessage(deviceId, ws, message) {
  switch (message.type) {
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      break;
    case 'stats':
      ws.send(JSON.stringify({ type: 'stats', data: streamBuffer.getStats(deviceId) }));
      break;
    default:
      console.warn(`[WebSocket] Unknown control message: ${message.type}`);
  }
}

function sendToDevice(deviceId, message) {
  const ws = deviceConnections.get(deviceId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
    return true;
  }
  return false;
}

function getConnectedDevices() {
  return Array.from(deviceConnections.keys());
}

function isDeviceConnected(deviceId) {
  const ws = deviceConnections.get(deviceId);
  return Boolean(ws && ws.readyState === WebSocket.OPEN);
}

function getLiveSubscriberCount(deviceId) {
  return liveSubscribers.get(deviceId)?.size || 0;
}

module.exports = {
  initWebSocketServer,
  sendToDevice,
  getConnectedDevices,
  isDeviceConnected,
  getLiveSubscriberCount,
  decodeImaAdpcmPacket
};
