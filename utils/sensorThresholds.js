const Alert = require('../models/Alert');
const { ALERT_LEVELS } = require('../models/Alert');
const { sendAlertNotification } = require('./emailNotifications');

// Thresholds configuration
const THRESHOLDS = {
  TEMPERATURE: {
    MAX: 35, // Celsius
    WARN: 'temperature',
  },
  HUMIDITY: {
    MAX: 75, // Percentage
    WARN: 'humidity',
  }
};

// Track when we last sent alerts to prevent spam
// Format: { device_id: { temperature: timestamp, humidity: timestamp } }
const lastAlertTimes = new Map();

// Cooldown period (in milliseconds) - only send alerts every 30 minutes for the same threshold
const ALERT_COOLDOWN = 30 * 60 * 1000; // 30 minutes

/**
 * Check if we should send an alert based on cooldown period
 * @param {string} deviceId - Device ID
 * @param {string} type - 'temperature' or 'humidity'
 * @returns {boolean} - True if we should send alert
 */
const shouldSendAlert = (deviceId, type) => {
  const now = Date.now();
  const deviceAlerts = lastAlertTimes.get(deviceId);

  if (!deviceAlerts) {
    lastAlertTimes.set(deviceId, { [type]: now });
    return true;
  }

  const lastAlertTime = deviceAlerts[type];
  if (!lastAlertTime || (now - lastAlertTime) >= ALERT_COOLDOWN) {
    deviceAlerts[type] = now;
    return true;
  }

  return false;
};

/**
 * Check sensor thresholds and send alerts if exceeded
 * @param {string} deviceId - Device ID
 * @param {object} sensorData - Sensor data object containing temperature and/or humidity
 * @returns {Promise<object>} - Result object with alerts sent
 */
const checkThresholdsAndAlert = async (deviceId, sensorData) => {
  const results = {
    temperatureAlert: null,
    humidityAlert: null,
    emailsSent: false
  };

  try {
    const temperature = sensorData.temperature;
    const humidity = sensorData.humidity;

    // Check temperature threshold
    if (temperature != null && temperature > THRESHOLDS.TEMPERATURE.MAX) {
      if (shouldSendAlert(deviceId, 'temperature')) {
        console.log(`[Threshold Alert] Device ${deviceId} temperature ${temperature}°C exceeds ${THRESHOLDS.TEMPERATURE.MAX}°C`);

        // Create alert in database
        const alert = await Alert.create({
          level: ALERT_LEVELS.WARN,
          message: `High temperature detected: ${temperature}°C on device ${deviceId}`,
          source: deviceId,
          tags: ['temperature', 'threshold', 'sensor'],
          metadata: {
            temperature,
            threshold: THRESHOLDS.TEMPERATURE.MAX,
            sensorType: 'temperature'
          }
        });

        // Send email notification to all users and admins
        const emailResult = await sendAlertNotification(alert);

        results.temperatureAlert = alert;
        results.emailsSent = emailResult.success;

        console.log(`[Threshold Alert] Temperature alert created and email sent to ${emailResult.sent || 0} users`);
      }
    }

    // Check humidity threshold
    if (humidity != null && humidity > THRESHOLDS.HUMIDITY.MAX) {
      if (shouldSendAlert(deviceId, 'humidity')) {
        console.log(`[Threshold Alert] Device ${deviceId} humidity ${humidity}% exceeds ${THRESHOLDS.HUMIDITY.MAX}%`);

        // Create alert in database
        const alert = await Alert.create({
          level: ALERT_LEVELS.WARN,
          message: `High humidity detected: ${humidity}% on device ${deviceId}`,
          source: deviceId,
          tags: ['humidity', 'threshold', 'sensor'],
          metadata: {
            humidity,
            threshold: THRESHOLDS.HUMIDITY.MAX,
            sensorType: 'humidity'
          }
        });

        // Send email notification to all users and admins
        const emailResult = await sendAlertNotification(alert);

        results.humidityAlert = alert;
        results.emailsSent = results.emailsSent || emailResult.success;

        console.log(`[Threshold Alert] Humidity alert created and email sent to ${emailResult.sent || 0} users`);
      }
    }

  } catch (error) {
    console.error('[Threshold Alert] Error checking thresholds:', error);
  }

  return results;
};

/**
 * Clear alert cooldown for a device (useful for testing)
 * @param {string} deviceId - Device ID
 */
const clearAlertCooldown = (deviceId) => {
  lastAlertTimes.delete(deviceId);
};

module.exports = {
  THRESHOLDS,
  checkThresholdsAndAlert,
  clearAlertCooldown
};
