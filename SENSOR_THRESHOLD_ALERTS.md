# Sensor Threshold Alert System

## Overview

The system automatically monitors temperature and humidity sensor readings from all devices and sends email notifications to all users and admins when thresholds are exceeded.

## Thresholds

- **Temperature**: Alert when > 35°C
- **Humidity**: Alert when > 75%

## How It Works

### 1. Sensor Data Processing

When sensor data is received via these endpoints:
- `POST /api/v1/devices/sensor` (handleSensorData)
- `POST /api/v1/devices/sensor-data` (handleRoomSensorData)

The system automatically checks if temperature or humidity exceeds the defined thresholds.

### 2. Alert Creation

When a threshold is exceeded:
1. An alert is created in the Firebase `alerts` collection with:
   - Level: `WARN`
   - Message: Details about the threshold violation
   - Source: The device ID
   - Tags: `temperature/humidity`, `threshold`, `sensor`
   - Metadata: Actual value and threshold value

### 3. Email Notifications

Email notifications are sent to:
- **All users** (with any role)
- **All admins**

The email includes:
- Alert level (WARN)
- Threshold violation details
- Device ID
- Timestamp
- Formatted HTML email with visual styling

### 4. Alert Cooldown

To prevent spam, the system implements a **30-minute cooldown** per device per threshold type:
- Once an alert is sent for high temperature on device X, no additional temperature alerts will be sent for that device for 30 minutes
- Humidity alerts have their own separate cooldown
- Different devices have independent cooldowns

## Files Modified/Created

### Created Files

1. **`utils/sensorThresholds.js`**
   - Main threshold checking logic
   - Alert creation and email notification trigger
   - Cooldown management
   - Configurable thresholds

### Modified Files

1. **`controllers/devices.js`**
   - Added import for `checkThresholdsAndAlert`
   - Added threshold checking in `handleSensorData` (line ~375)
   - Added threshold checking in `handleRoomSensorData` (line ~449)

## Configuration

### Threshold Values

To modify threshold values, edit `utils/sensorThresholds.js`:

```javascript
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
```

### Cooldown Period

To modify the cooldown period, edit the `ALERT_COOLDOWN` constant in `utils/sensorThresholds.js`:

```javascript
const ALERT_COOLDOWN = 30 * 60 * 1000; // 30 minutes in milliseconds
```

## Email Configuration

Ensure your email settings are configured in `.env`:

```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
EMAIL_FROM=your-email@gmail.com
EMAIL_FROM_NAME=Smart Home System
```

## Testing

### Manual Testing

You can test the threshold alerts by:

1. Sending sensor data that exceeds thresholds via the API:

```bash
POST /api/v1/devices/sensor
Authorization: Bearer <device_token>

{
  "device_id": "Main_lcd",
  "sensors": {
    "temperature": 40,
    "humidity": 80
  }
}
```

2. Check the server logs for:
```
[Threshold Alert] Device Main_lcd temperature 40°C exceeds 35°C
[Threshold Alert] Temperature alert created and email sent to X users
```

3. Verify that:
   - Alert appears in Firebase `alerts` collection
   - Email is received by all users/admins
   - Subsequent alerts are throttled (30-minute cooldown)

### Clear Cooldown for Testing

For testing purposes, you can clear the cooldown cache by adding a test endpoint or calling:

```javascript
const { clearAlertCooldown } = require('./utils/sensorThresholds');
clearAlertCooldown('Main_lcd'); // Clear for specific device
```

## Database Structure

### Alerts Collection

Each alert document contains:

```javascript
{
  level: "WARN",
  message: "High temperature detected: 40°C on device Main_lcd",
  source: "Main_lcd",
  tags: ["temperature", "threshold", "sensor"],
  metadata: {
    temperature: 40,
    threshold: 35,
    sensorType: "temperature"
  },
  timestamp: Timestamp,
  read: false,
  created_at: Timestamp
}
```

## Monitoring

Monitor threshold alerts via:

1. **Firebase Console**: Check the `alerts` collection
2. **Server Logs**: Look for `[Threshold Alert]` entries
3. **Email Notifications**: Users receive immediate notifications
4. **Frontend Dashboard**: Alerts appear in the alerts UI

## Notes

- Threshold checking only occurs when sensor data is written to Firebase (not on every sensor update due to throttling)
- The system uses the existing email notification infrastructure from `utils/emailNotifications.js`
- Alerts are stored in Firebase for historical tracking and frontend display
- Email notifications use the same HTML template as other alert types
