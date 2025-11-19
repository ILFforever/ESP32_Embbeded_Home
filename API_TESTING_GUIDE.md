# ESP32 IoT Smart Home API Testing Guide

## Overview
This guide explains how to test the ESP32 Smart Home API endpoints using the provided Postman collection.

## Files Created
- `routes/devices.js` - Express router with all API endpoints
- `controllers/deviceController.js` - Controller functions for handling requests
- `ESP32_IoT_API.postman_collection.json` - Postman collection for testing

## Quick Start

### 1. Import Postman Collection
1. Open Postman
2. Click **Import** button
3. Select `ESP32_IoT_API.postman_collection.json`
4. Collection will appear in your Postman sidebar

### 2. Configure Environment Variables
The collection uses a variable for the base URL:
- Variable: `base_url`
- Default: `http://localhost:3000/api/devices`

To change:
1. Click on the collection name
2. Go to **Variables** tab
3. Update `base_url` value

### 3. Setup Server (Optional)
If you want to run a test server:

```bash
# Install dependencies
npm init -y
npm install express body-parser cors

# Create server.js
```

Example `server.js`:
```javascript
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const deviceRoutes = require('./routes/devices');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// Routes
app.use('/api/devices', deviceRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

Then run:
```bash
node server.js
```

## API Endpoints Reference

### Device Registration & Status

#### 1. Register Device
- **Method:** POST
- **Endpoint:** `/register`
- **Purpose:** Register a new ESP32 device in the system
- **Body Example:**
```json
{
  "deviceId": "ESP32_MAIN_LCD_001",
  "deviceType": "main_lcd",
  "macAddress": "24:6F:28:12:34:56",
  "firmwareVersion": "1.0.0",
  "capabilities": ["display", "mesh_coordinator", "wifi"]
}
```

#### 2. Get Device Status
- **Method:** GET
- **Endpoint:** `/status/:deviceId`
- **Purpose:** Get status of a specific device
- **Example:** `/status/ESP32_MAIN_LCD_001`

#### 3. Get All Devices Status
- **Method:** GET
- **Endpoint:** `/status`
- **Purpose:** Get status of all registered devices

#### 4. Device Heartbeat
- **Method:** POST
- **Endpoint:** `/heartbeat`
- **Purpose:** Receive periodic status updates from devices
- **Body Example:**
```json
{
  "deviceId": "ESP32_MAIN_LCD_001",
  "timestamp": "2025-11-19T08:00:00Z",
  "uptime": 3600,
  "rssi": -45,
  "freeHeap": 120000,
  "status": "online"
}
```

### Sensor Data

#### 5. Send Sensor Data
- **Method:** POST
- **Endpoint:** `/sensor-data`
- **Purpose:** Receive sensor data from devices
- **Body Example (Temperature):**
```json
{
  "deviceId": "ESP32_ROOM_SENSOR_001",
  "timestamp": "2025-11-19T08:00:00Z",
  "sensorType": "DHT22",
  "data": {
    "temperature": 25.5,
    "humidity": 65.2,
    "unit": "celsius"
  }
}
```

#### 6. Get Device History
- **Method:** GET
- **Endpoint:** `/history/:deviceId`
- **Purpose:** Get historical sensor data
- **Query Parameters:**
  - `limit`: Number of records (default: 100)
  - `startDate`: Start date for query
  - `endDate`: End date for query
- **Example:** `/history/ESP32_ROOM_SENSOR_001?limit=100&startDate=2025-11-18&endDate=2025-11-19`

### Doorbell Operations

#### 7. Doorbell Ring Event
- **Method:** POST
- **Endpoint:** `/doorbell/ring`
- **Purpose:** Trigger doorbell ring event
- **Body Example:**
```json
{
  "deviceId": "ESP32_DOORBELL_LCD_001",
  "timestamp": "2025-11-19T08:00:00Z",
  "ringType": "button_press",
  "duration": 2000
}
```

#### 8. Face Detection Event
- **Method:** POST
- **Endpoint:** `/doorbell/face-detection`
- **Purpose:** Send face detection results from camera
- **Body Example:**
```json
{
  "deviceId": "ESP32_DOORBELL_CAM_001",
  "timestamp": "2025-11-19T08:00:00Z",
  "faceDetected": true,
  "confidence": 0.95,
  "faceId": "known_person_001",
  "personName": "John Doe",
  "imageUrl": "https://example.com/face_captures/img_001.jpg"
}
```

#### 9. Update Doorbell Status
- **Method:** POST
- **Endpoint:** `/doorbell/status`
- **Purpose:** Update doorbell configuration

#### 10. Get Doorbell Status
- **Method:** GET
- **Endpoint:** `/doorbell/status?deviceId=ESP32_DOORBELL_LCD_001`
- **Purpose:** Get current doorbell status

### Hub Management

#### 11. Send Hub Log
- **Method:** POST
- **Endpoint:** `/hub/log`
- **Purpose:** Receive log messages from hub devices
- **Body Example:**
```json
{
  "deviceId": "ESP32_MAIN_LCD_001",
  "timestamp": "2025-11-19T08:00:00Z",
  "logLevel": "INFO",
  "message": "Mesh network initialized successfully",
  "module": "mesh_coordinator",
  "metadata": {
    "connectedNodes": 5,
    "rssi": -45
  }
}
```

### Device Commands

#### 12. Send Device Command
- **Method:** POST
- **Endpoint:** `/command`
- **Purpose:** Send a command to a specific device
- **Body Example:**
```json
{
  "deviceId": "ESP32_MAIN_LCD_001",
  "command": "display_message",
  "parameters": {
    "message": "Welcome Home!",
    "duration": 5000,
    "brightness": 80
  },
  "priority": "normal",
  "timeout": 30000
}
```

#### 13. Fetch Pending Commands
- **Method:** GET
- **Endpoint:** `/commands/pending/:deviceId`
- **Purpose:** Fetch pending commands (polled by ESP32)
- **Example:** `/commands/pending/ESP32_MAIN_LCD_001`

#### 14. Acknowledge Command
- **Method:** POST
- **Endpoint:** `/commands/acknowledge`
- **Purpose:** Acknowledge command execution
- **Body Example:**
```json
{
  "deviceId": "ESP32_MAIN_LCD_001",
  "commandId": "cmd_12345",
  "status": "completed",
  "executionTime": 1500,
  "result": {
    "success": true,
    "message": "Message displayed successfully"
  }
}
```

## Testing Workflow

### Recommended Testing Sequence

1. **Register Devices First**
   - Register Main LCD Hub
   - Register Room Sensors
   - Register Doorbell Camera

2. **Test Device Communication**
   - Send heartbeats from devices
   - Check device status

3. **Test Sensor Data Flow**
   - Send temperature/humidity data
   - Send motion detection data
   - Query device history

4. **Test Doorbell Functionality**
   - Trigger doorbell ring
   - Send face detection events
   - Update/get doorbell status

5. **Test Command System**
   - Send commands to devices
   - Poll for pending commands
   - Acknowledge command execution

6. **Test Hub Logging**
   - Send various log levels
   - Test with different modules

## Error Testing

The collection includes error test cases:
- Invalid Device ID
- Malformed Sensor Data

Use these to verify error handling.

## Expected Responses

All successful responses follow this format:
```json
{
  "success": true,
  "message": "Operation successful",
  "data": { }
}
```

Error responses:
```json
{
  "success": false,
  "error": "Error message"
}
```

## ESP32 Device Integration

### Heartbeat Pattern
ESP32 devices should send heartbeat every 30-60 seconds:
```cpp
// ESP32 example
HTTPClient http;
http.begin("http://server:3000/api/devices/heartbeat");
http.addHeader("Content-Type", "application/json");
String payload = "{\"deviceId\":\"ESP32_001\",\"uptime\":3600,\"rssi\":-45}";
http.POST(payload);
```

### Command Polling Pattern
ESP32 devices should poll for commands every 5-10 seconds:
```cpp
HTTPClient http;
http.begin("http://server:3000/api/devices/commands/pending/ESP32_001");
int httpCode = http.GET();
if (httpCode == 200) {
  String response = http.getString();
  // Parse and execute commands
}
```

## Notes

- All timestamps should be in ISO 8601 format
- Device IDs should be unique and follow naming convention: `ESP32_<TYPE>_<NUMBER>`
- RSSI values are typically negative (-100 to 0)
- Free heap values are in bytes
- Command timeouts are in milliseconds

## Troubleshooting

### Connection Refused
- Verify server is running
- Check `base_url` variable in Postman
- Ensure port 3000 is not blocked

### 404 Not Found
- Verify routes are properly mounted in server.js
- Check endpoint paths match the routes

### 500 Internal Server Error
- Check server console for error messages
- Verify request body format matches expected schema
- Ensure all required fields are present
