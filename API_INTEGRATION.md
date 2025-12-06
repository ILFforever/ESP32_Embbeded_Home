# Door Lock Backend API Integration Guide

## Overview

The door lock system follows the **exact same API pattern** as your doorbell device for consistency and compatibility with your existing backend infrastructure.

---

## Authentication

All API requests use **Bearer Token** authentication:

```http
Authorization: Bearer {DEVICE_API_TOKEN}
```

The token is configured in [src/main_doorlock.cpp:44](src/main_doorlock.cpp#L44):
```cpp
const char* DEVICE_API_TOKEN = "your_doorlock_api_token_here";
```

---

## API Endpoints

### Base URL Configuration

Set in [src/main_doorlock.cpp:57](src/main_doorlock.cpp#L57):
```cpp
const char* BACKEND_URL = "http://192.168.1.100:3000/api/v1/devices/commands";
```

The system will automatically append endpoint paths:
- `/pending` → for fetching commands
- `/manual-unlock` → for manual unlock notifications

---

## 1. Fetch Pending Commands

**ESP32 → Backend** (Every 5 seconds)

### Request

```http
POST {BACKEND_URL}/pending
Content-Type: application/json
Authorization: Bearer {token}

{
  "device_id": "dl_001"
}
```

### Response

```json
{
  "commands": [
    {
      "id": "cmd_12345",
      "action": "unlock",
      "timestamp": "2025-12-06T10:30:00Z"
    },
    {
      "id": "cmd_12346",
      "action": "lock",
      "timestamp": "2025-12-06T10:31:00Z"
    }
  ]
}
```

### Empty Response (No Commands)

```json
{
  "commands": []
}
```

---

## 2. Manual Unlock Notification

**ESP32 → Backend** (When button is pressed)

### Request

```http
POST {BACKEND_URL}/manual-unlock
Content-Type: application/json
Authorization: Bearer {token}

{
  "device_id": "dl_001",
  "device_type": "doorlock",
  "location": "Front Door",
  "action": "manual_unlock",
  "timestamp": 1234567890,
  "api_token": "your_token_here"
}
```

### Response

```json
{
  "status": "ok",
  "message": "Manual unlock event recorded"
}
```

---

## MQTT Integration (Optional but Recommended)

The door lock also publishes status updates via MQTT and can receive command notifications.

### Subscribe Topic

```
smarthome/device/{DEVICE_ID}/command
```

Example: `smarthome/device/dl_001/command`

### MQTT Message Format (Received)

When your backend wants to send a command:

```json
{
  "fetch_commands": true,
  "device_id": "dl_001",
  "command_id": "cmd_12345",
  "action": "unlock"
}
```

**Flow:**
1. Backend publishes to MQTT topic
2. ESP32 receives MQTT message
3. ESP32 calls `fetchAndExecuteCommands()`
4. ESP32 fetches commands via HTTP POST to `/pending`
5. ESP32 executes the command

### Publish Topic

```
smarthome/doorlock/status
```

### Status Message Format (Published)

```json
{
  "device_id": "dl_001",
  "status": "locked",           // or "unlocked", "unlocked_manual"
  "is_locked": true,            // or false
  "timestamp": 1234567890
}
```

**Status Values:**
- `"locked"` - Door is locked (remote or startup)
- `"unlocked"` - Door unlocked via remote command
- `"unlocked_manual"` - Door unlocked via physical button

---

## Supported Actions

| Action | Description | Result |
|--------|-------------|--------|
| `lock` or `LOCK` | Lock the door | Servo moves to 0°, two high beeps |
| `unlock` or `UNLOCK` | Unlock the door | Servo moves to 90°, one low beep |
| `status` or `STATUS` | Report current status | Publishes status to MQTT |

---

## Implementation Comparison with Doorbell

### Similarities (Same Pattern)

✅ Uses POST to `/pending` endpoint
✅ Sends `device_id` in JSON body
✅ Uses `Authorization: Bearer {token}` header
✅ 5-second timeout
✅ Parses `commands` array from response
✅ Executes commands and can acknowledge (optional)

### Differences (Device-Specific)

❌ Door lock has `/manual-unlock` endpoint (doorbell doesn't)
❌ Door lock actions: `lock`, `unlock`, `status` (vs doorbell's camera/mic/face commands)
❌ Door lock has physical button (doorbell has ring button)

---

## Backend Implementation Requirements

Your backend needs to implement these endpoints:

### 1. `POST /api/v1/devices/commands/pending`

**Purpose:** Return pending commands for a device

**Expected Behavior:**
- Validate Bearer token
- Look up device by `device_id`
- Return list of pending commands
- Mark commands as delivered (or handle in acknowledgment)

**Example (Node.js/Express):**

```javascript
app.post('/api/v1/devices/commands/pending', authenticateToken, async (req, res) => {
  const { device_id } = req.body;

  // Fetch pending commands from database
  const commands = await db.commands.findPending(device_id);

  res.json({ commands });
});
```

### 2. `POST /api/v1/devices/commands/manual-unlock`

**Purpose:** Log manual unlock events

**Expected Behavior:**
- Validate Bearer token or API token in body
- Log event to database
- Optionally trigger notifications
- Return success response

**Example (Node.js/Express):**

```javascript
app.post('/api/v1/devices/commands/manual-unlock', authenticateToken, async (req, res) => {
  const { device_id, device_type, location, action, timestamp } = req.body;

  // Log event to database
  await db.events.create({
    device_id,
    event_type: 'manual_unlock',
    timestamp: new Date(timestamp),
    metadata: { location }
  });

  // Optionally send notification
  await sendNotification(`Door at ${location} was manually unlocked`);

  res.json({ status: 'ok', message: 'Manual unlock event recorded' });
});
```

---

## Testing the API

### Using curl

**Fetch Commands:**
```bash
curl -X POST http://192.168.1.100:3000/api/v1/devices/commands/pending \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_token_here" \
  -d '{"device_id":"dl_001"}'
```

**Manual Unlock Notification:**
```bash
curl -X POST http://192.168.1.100:3000/api/v1/devices/commands/manual-unlock \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_token_here" \
  -d '{
    "device_id":"dl_001",
    "device_type":"doorlock",
    "location":"Front Door",
    "action":"manual_unlock",
    "timestamp":1234567890
  }'
```

### Using Postman

1. **Create New Request**: POST
2. **URL**: `http://your-backend/api/v1/devices/commands/pending`
3. **Headers**:
   - `Content-Type: application/json`
   - `Authorization: Bearer your_token_here`
4. **Body** (JSON):
   ```json
   {
     "device_id": "dl_001"
   }
   ```

---

## Security Best Practices

### 1. Token Security
- ✅ Use strong, randomly generated tokens (minimum 32 characters)
- ✅ Store tokens securely in backend database
- ✅ Rotate tokens periodically
- ✅ Never commit tokens to version control

### 2. API Security
- ✅ Use HTTPS in production (not HTTP)
- ✅ Validate all input parameters
- ✅ Implement rate limiting (max requests per device)
- ✅ Log all lock/unlock events with timestamps

### 3. MQTT Security
- ✅ Use MQTT over TLS (port 8883)
- ✅ Implement MQTT username/password authentication
- ✅ Use unique client IDs per device
- ✅ Validate message sources

---

## Debugging

### Enable Verbose Logging

The ESP32 serial output shows all API calls:

```
[CMD] Fetching pending commands from backend...
[CMD] HTTP Response: 200
[CMD] Response: {"commands":[{"id":"cmd_123","action":"unlock"}]}
[CMD] ✓ Found 1 pending command(s)
[CMD] Executing command ID: cmd_123, Action: unlock
[LOCK] 🔓 Unlocking door (remote)...
[MQTT] ✓ Door lock status published!
```

### Common Issues

**HTTP 401 Unauthorized:**
- Check Bearer token is correct
- Verify token hasn't expired
- Ensure Authorization header is formatted correctly

**HTTP 404 Not Found:**
- Verify BACKEND_URL is correct
- Check endpoint path matches backend routes
- Ensure backend server is running

**No commands received:**
- Check backend has pending commands for device
- Verify `device_id` matches
- Monitor backend logs for incoming requests

---

## Integration Checklist

- [ ] Backend implements `/pending` endpoint
- [ ] Backend implements `/manual-unlock` endpoint
- [ ] Bearer token authentication configured
- [ ] MQTT broker setup (optional)
- [ ] Test with curl/Postman
- [ ] Update BACKEND_URL in code
- [ ] Update DEVICE_API_TOKEN in code
- [ ] Upload firmware to ESP32
- [ ] Monitor serial output
- [ ] Test remote lock/unlock
- [ ] Test manual button
- [ ] Verify events logged in backend

---

## Example Backend Response Flow

### Scenario: User sends unlock command

1. **User**: Clicks "Unlock" in mobile app
2. **Backend**: Creates command in database
   ```json
   {
     "id": "cmd_12345",
     "device_id": "dl_001",
     "action": "unlock",
     "status": "pending",
     "created_at": "2025-12-06T10:30:00Z"
   }
   ```
3. **Backend**: Publishes MQTT notification
   ```json
   Topic: smarthome/device/dl_001/command
   {
     "fetch_commands": true,
     "device_id": "dl_001",
     "command_id": "cmd_12345",
     "action": "unlock"
   }
   ```
4. **ESP32**: Receives MQTT notification
5. **ESP32**: Calls `fetchAndExecuteCommands()`
6. **ESP32**: POST to `/pending` endpoint
7. **Backend**: Returns command list
8. **ESP32**: Executes `unlock` action
9. **ESP32**: Publishes status to MQTT
10. **Backend**: Updates command status to "executed"

---

## Next Steps

1. Implement backend endpoints
2. Test with curl/Postman
3. Configure ESP32 with your backend URL and token
4. Upload firmware
5. Test end-to-end flow
6. Add error handling and logging
7. Implement command acknowledgment (optional)
8. Set up monitoring and alerts

---

**Last Updated:** 2025-12-06
**Compatible With:** Doorbell API v1
