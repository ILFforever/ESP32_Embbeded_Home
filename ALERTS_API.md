# Alerts API Documentation

The Alerts system provides a centralized way to track and display important events, warnings, and informational messages from across the smart home system.

## Alert Structure

Each alert contains the following fields:

- `id` - Unique identifier (auto-generated)
- `level` - Alert severity: `INFO`, `WARN`, or `IMPORTANT`
- `message` - Human-readable alert message
- `source` - Where the alert came from (device_id or 'system')
- `tags` - Array of tags for filtering (e.g., ['face-detection', 'unknown'])
- `metadata` - Additional context data (object)
- `timestamp` - When the event occurred
- `read` - Whether the alert has been marked as read
- `created_at` - When the alert was created in the database

## API Endpoints

### 1. Get Alerts (Protected - for Frontend)

```
GET /api/v1/alerts
```

**Authentication:** Requires user JWT token in Authorization header

### 2. Get Alerts for Device (Protected - for ESP32 Main_LCD)

```
GET /api/v1/alerts/device?device_id=Main_lcd_001
```

**Authentication:** Requires device token in Authorization header

**Query Parameters:**
- `level` - Filter by level (INFO, WARN, IMPORTANT)
- `source` - Filter by source (device_id)
- `tags` - Filter by tags (comma-separated, e.g., "face-detection,unknown")
- `read` - Filter by read status ("true" or "false")
- `limit` - Max alerts to return (default: 50, max: 100)

**Response:**
```json
{
  "status": "ok",
  "count": 2,
  "alerts": [
    {
      "id": "abc123",
      "level": "IMPORTANT",
      "message": "doorbell_001: Camera connection lost",
      "source": "doorbell_001",
      "tags": ["device-log", "error"],
      "metadata": {
        "log_level": "error",
        "timestamp": 1700000000000
      },
      "timestamp": "2025-11-24T10:30:00.000Z",
      "read": false,
      "created_at": "2025-11-24T10:30:00.000Z"
    },
    {
      "id": "def456",
      "level": "WARN",
      "message": "Unknown person detected at door",
      "source": "doorbell_001",
      "tags": ["face-detection", "unknown"],
      "metadata": {
        "event_id": "xyz789",
        "name": "Unknown",
        "confidence": null,
        "image_url": "https://storage.googleapis.com/..."
      },
      "timestamp": "2025-11-24T10:25:00.000Z",
      "read": false,
      "created_at": "2025-11-24T10:25:00.000Z"
    }
  ]
}
```

**Examples:**

```bash
# Frontend - Get all alerts (with user JWT token)
GET /api/v1/alerts
Authorization: Bearer <USER_JWT_TOKEN>

# Frontend - Get only IMPORTANT alerts
GET /api/v1/alerts?level=IMPORTANT
Authorization: Bearer <USER_JWT_TOKEN>

# ESP32 - Get unread alerts (with device token and device_id)
GET /api/v1/alerts/device?device_id=Main_lcd_001&read=false&limit=5
Authorization: Bearer <DEVICE_API_TOKEN>

# ESP32 - Get face detection alerts
GET /api/v1/alerts/device?device_id=Main_lcd_001&tags=face-detection
Authorization: Bearer <DEVICE_API_TOKEN>
```

### 3. Create Alert (Protected - requires user token)

```
POST /api/v1/alerts
```

**Body:**
```json
{
  "level": "WARN",
  "message": "Custom alert message",
  "source": "user",
  "tags": ["custom"],
  "metadata": {
    "custom_field": "value"
  }
}
```

**Response:**
```json
{
  "status": "ok",
  "message": "Alert created successfully",
  "alert": { ... }
}
```

### 3. Mark Alert as Read (Protected)

```
PATCH /api/v1/alerts/:alert_id/read
```

**Response:**
```json
{
  "status": "ok",
  "message": "Alert marked as read",
  "alert": { ... }
}
```

### 4. Mark Multiple Alerts as Read (Protected)

```
POST /api/v1/alerts/mark-read
```

**Body:**
```json
{
  "alert_ids": ["abc123", "def456"]
}
```

**Response:**
```json
{
  "status": "ok",
  "message": "2 alerts marked as read"
}
```

### 5. Delete Alert (Protected)

```
DELETE /api/v1/alerts/:alert_id
```

**Response:**
```json
{
  "status": "ok",
  "message": "Alert deleted successfully"
}
```

## Automatic Alert Creation

Alerts are automatically created for the following events:

### Face Detection Events
- **Level:** `INFO` for recognized faces, `WARN` for unknown persons
- **Source:** Device ID (e.g., "doorbell_001")
- **Tags:** ['face-detection', 'recognized'] or ['face-detection', 'unknown']
- **Metadata:** Includes event_id, name, confidence, image_url

### Device Logs (Errors & Warnings)
- **Level:** `IMPORTANT` for errors, `WARN` for warnings
- **Source:** Device ID
- **Tags:** ['device-log', 'error'] or ['device-log', 'warning']
- **Metadata:** Includes log_level, data, error_message

## Sorting & Prioritization

Alerts are sorted by:
1. **Priority** (highest first):
   - IMPORTANT = 3
   - WARN = 2
   - INFO = 1
2. **Timestamp** (newest first for same priority)

This ensures that important and new events appear at the top of the list.

## ESP32 Main_LCD Integration

The ESP32 Main_LCD can query the alerts endpoint without authentication:

```cpp
// Example ESP32 code
String url = "http://your-backend.com/api/v1/alerts?limit=5&read=false";
HTTPClient http;
http.begin(url);
int httpCode = http.GET();

if (httpCode == 200) {
  String payload = http.getString();
  // Parse JSON and display on LCD
}
```

The LCD should display:
- Alert level icon (!, ⚠, ℹ)
- Alert message (truncated to fit LCD)
- Source device
- Time since alert

## Frontend Integration

Frontend can use all endpoints with authentication:

```javascript
// Get unread alerts
const response = await fetch('/api/v1/alerts?read=false', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const data = await response.json();

// Mark alert as read
await fetch(`/api/v1/alerts/${alertId}/read`, {
  method: 'PATCH',
  headers: { 'Authorization': `Bearer ${token}` }
});
```

## Database Cleanup

To prevent database bloat, implement periodic cleanup of old read alerts:

```javascript
const Alert = require('./models/Alert');

// Delete alerts older than 30 days (can be run as a cron job)
await Alert.deleteOldAlerts(30);
```

## Testing

Test the endpoints with curl:

```bash
# Get all alerts
curl http://localhost:5000/api/v1/alerts

# Get IMPORTANT alerts only
curl "http://localhost:5000/api/v1/alerts?level=IMPORTANT"

# Create alert (requires auth token)
curl -X POST http://localhost:5000/api/v1/alerts \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "level": "WARN",
    "message": "Test alert",
    "source": "test",
    "tags": ["test"]
  }'
```
