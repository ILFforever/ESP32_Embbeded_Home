# ESP32 Smart Home - Backend API

This branch contains the **production backend API** implementation for the ESP32 IoT Smart Home system.

## Branch Purpose

🎯 **Backend API Implementation Only**
- Express.js server
- API routes and controllers
- Authentication middleware
- Production-ready code

> **Note:** For API testing and frontend integration, see the `claude/frontend-testing-*` branch.

## Project Structure

```
.
├── controllers/
│   └── deviceController.js    # API endpoint handlers
├── middleware/
│   └── auth.js                # Authentication middleware
├── routes/
│   └── devices.js             # API route definitions
├── server.js                  # Express server setup
├── package.json               # Dependencies
└── FRONTEND_INTEGRATION.md    # Frontend integration guide
```

## API Endpoints

All endpoints are prefixed with `/api/v1/devices`

### Public Endpoints
- `POST /heartbeat` - Device heartbeat
- `POST /sensor-data` - Sensor data submission
- `POST /register` - Device registration
- `POST /doorbell/ring` - Doorbell events
- `POST /doorbell/face-detection` - Face detection events
- `POST /hub/log` - Hub logging
- `POST /doorbell/status` - Update doorbell status
- `POST /command` - Send device commands
- `POST /commands/acknowledge` - Command acknowledgment

### Protected Endpoints (Require Auth)
- `GET /status/:deviceId` 🔒 - Get device status
- `GET /status` 🔒 - Get all devices status
- `GET /history/:deviceId` - Get device history
- `GET /doorbell/status` - Get doorbell status
- `GET /commands/pending/:deviceId` - Fetch pending commands

## Key Features

### 1. expireAt Logic
Instead of returning `status: "online"`, the API returns `expireAt` timestamp.
Clients calculate online status: `currentTime < expireAt`

**Example Response:**
```json
{
  "success": true,
  "deviceId": "df_001",
  "lastSeen": "2025-11-19T08:00:00Z",
  "expireAt": "2025-11-19T08:05:00Z"
}
```

### 2. Authentication Middleware
Protected endpoints require Bearer token authentication:

```javascript
headers: {
  'Authorization': 'Bearer YOUR_TOKEN_HERE'
}
```

### 3. Device Types Supported
- `main_lcd` - Main LCD hub
- `main_mesh` - Mesh network hub
- `room_sensor` - Temperature/humidity/motion sensors
- `doorbell_lcd` - Doorbell LCD display
- `doorbell_camera` - Doorbell camera with face detection

## Installation

```bash
npm install
```

## Environment Variables

Create `.env` file:

```env
PORT=3000
NODE_ENV=production
JWT_SECRET=your_jwt_secret_here
DB_CONNECTION_STRING=your_database_url
```

## Running the Server

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

## Authentication Setup

⚠️ **TODO:** The authentication middleware currently accepts any non-empty token.

Update `middleware/auth.js` to implement:
- JWT verification
- Database token validation
- API key management

Example JWT implementation:
```javascript
const jwt = require('jsonwebtoken');

const decoded = jwt.verify(token, process.env.JWT_SECRET);
req.user = decoded;
```

## Database Integration

⚠️ **TODO:** Controllers currently return mock data.

Implement database queries in:
- `controllers/deviceController.js`

Example MongoDB integration:
```javascript
const Device = require('../models/Device');
const device = await Device.findOne({ deviceId });
```

## API Documentation

See `FRONTEND_INTEGRATION.md` for:
- Complete API reference
- Request/response examples
- Frontend integration guide
- Authentication details

## Deployment

### Fly.io (Current Production)
```bash
fly deploy
```

API is deployed at: `https://embedded-smarthome.fly.dev`

### Docker
```bash
docker build -t esp32-api .
docker run -p 3000:3000 esp32-api
```

## Testing

For API testing with Postman, switch to the `claude/frontend-testing-*` branch:
- Postman collection with 50+ requests
- Testing documentation
- Example payloads

## Security Notes

1. ✅ Protected status endpoints with authentication
2. ⚠️ Implement real token validation (currently accepts any token)
3. ⚠️ Add rate limiting
4. ⚠️ Implement CORS restrictions for production
5. ⚠️ Add input validation and sanitization
6. ⚠️ Implement API key rotation
7. ⚠️ Add request logging and monitoring

## Contributing

This is a backend-only branch. Do not add:
- Postman collections
- Frontend code
- Testing documentation (unless it's backend unit tests)

For API testing and frontend integration, use the `claude/frontend-testing-*` branch.

## Branch Workflow

```
main
  ├── claude/backend-api-*        (this branch - production API)
  └── claude/frontend-testing-*   (Postman, frontend integration)
```

## Related Branches

- **Frontend/Testing**: `claude/frontend-testing-01TSAMniYh9nQZtUhNeBDWf9`
  - Postman collection
  - API testing guide
  - Frontend integration examples

## License

See main README.md

## Support

For issues related to:
- **Backend API**: Open issue on this branch
- **API Testing**: See frontend-testing branch
- **Hardware**: See device-specific branches (Main_lcd, Room_Sensors, etc.)
