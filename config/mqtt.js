const mqtt = require('mqtt');

// MQTT Configuration (HiveMQ Public Broker)
const MQTT_BROKER = 'mqtt://broker.hivemq.com:1883';
const MQTT_TOPICS = {
  DOORBELL_RING: 'smarthome/doorbell/ring',
  HUB_COMMAND: 'smarthome/hub/command',
  FACE_DETECTION: 'smarthome/face/detection',
  HUB_STATUS: 'smarthome/hub/status',
  DEVICE_COMMAND: 'smarthome/device/{device_id}/command', // Template for device-specific commands
};

let mqttClient = null;

/**
 * Initialize MQTT client (publish-only, no subscription)
 * This is called once when the server starts
 */
const initMQTT = () => {
  try {
    console.log('[MQTT] Initializing MQTT client...');
    console.log(`[MQTT] Broker: ${MQTT_BROKER}`);

    // Create client but don't maintain persistent connection
    // We'll connect/disconnect as needed for publishing
    mqttClient = mqtt.connect(MQTT_BROKER, {
      clientId: `backend_${Math.random().toString(16).substr(2, 8)}`,
      clean: true,
      connectTimeout: 4000,
      reconnectPeriod: 0, // Disable auto-reconnect (we'll connect on-demand)
    });

    mqttClient.on('connect', () => {
      console.log('[MQTT] ✓ Connected to broker');
    });

    mqttClient.on('error', (err) => {
      console.error('[MQTT] ✗ Connection error:', err.message);
    });

    mqttClient.on('close', () => {
      console.log('[MQTT] Connection closed');
    });

    return mqttClient;
  } catch (error) {
    console.error('[MQTT] Failed to initialize:', error);
    return null;
  }
};

/**
 * Publish a message to an MQTT topic
 * @param {string} topic - MQTT topic to publish to
 * @param {object} payload - Data to publish (will be JSON stringified)
 * @returns {Promise<boolean>} - Success status
 */
const publishMQTT = async (topic, payload) => {
  return new Promise((resolve, reject) => {
    if (!mqttClient) {
      console.error('[MQTT] Client not initialized');
      return resolve(false);
    }

    // Ensure client is connected
    if (!mqttClient.connected) {
      console.log('[MQTT] Reconnecting...');
      mqttClient.reconnect();

      // Wait for connection
      mqttClient.once('connect', () => {
        doPublish();
      });
    } else {
      doPublish();
    }

    function doPublish() {
      const message = JSON.stringify(payload);

      mqttClient.publish(topic, message, { qos: 1 }, (err) => {
        if (err) {
          console.error(`[MQTT] ✗ Failed to publish to ${topic}:`, err.message);
          return resolve(false);
        }

        console.log(`[MQTT] ✓ Published to ${topic}:`, payload);
        resolve(true);
      });
    }
  });
};

/**
 * Publish face detection event to Hub
 * @param {object} data - Face detection data
 */
const publishFaceDetection = async (data) => {
  const payload = {
    type: 'face_detection',
    device_id: data.device_id,
    recognized: data.recognized || false,
    name: data.name || 'Unknown',
    confidence: data.confidence || 0,
    timestamp: Date.now(),
  };

  return await publishMQTT(MQTT_TOPICS.FACE_DETECTION, payload);
};

/**
 * Publish command to Hub
 * @param {string} command - Command type
 * @param {object} params - Command parameters
 */
const publishHubCommand = async (command, params = {}) => {
  const payload = {
    command,
    params,
    timestamp: Date.now(),
  };

  return await publishMQTT(MQTT_TOPICS.HUB_COMMAND, payload);
};

/**
 * Publish doorbell ring notification (if backend needs to trigger it)
 * @param {string} deviceId - Device ID
 */
const publishDoorbellRing = async (deviceId) => {
  const payload = {
    device_id: deviceId,
    timestamp: Date.now(),
  };

  return await publishMQTT(MQTT_TOPICS.DOORBELL_RING, payload);
};

/**
 * Publish device command notification (tells device to fetch pending commands)
 * @param {string} deviceId - Device ID
 * @param {string} commandId - Command ID that was queued
 */
const publishDeviceCommand = async (deviceId, commandId) => {
  // Replace {device_id} in topic template with actual device ID
  const topic = MQTT_TOPICS.DEVICE_COMMAND.replace('{device_id}', deviceId);

  const payload = {
    device_id: deviceId,
    command_id: commandId,
    fetch_commands: true,
    timestamp: Date.now(),
  };

  console.log(`[MQTT] Notifying device ${deviceId} to fetch command ${commandId}`);
  return await publishMQTT(topic, payload);
};

module.exports = {
  initMQTT,
  publishMQTT,
  publishFaceDetection,
  publishHubCommand,
  publishDoorbellRing,
  publishDeviceCommand,
  MQTT_TOPICS,
};
