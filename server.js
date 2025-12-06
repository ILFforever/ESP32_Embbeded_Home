const express = require('express');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/db');
const { initializeFirebase } = require('./config/firebase');
const { initMQTT } = require('./config/mqtt');
const enforceHttpsExceptIoT = require('./middleware/httpsEnforcement');
const cors = require('cors');
const { initWebSocketServer } = require('./services/websocketStream');

// Load env vars
dotenv.config();

// Connect to database
connectDB();

// Initialize Firebase
initializeFirebase();

// Initialize MQTT client (publish-only)
initMQTT();

const app = express();

app.use(cors({
  origin: true, // Reflect the request origin, as it comes from the browser
  credentials: true,
}));

// Enforce HTTPS for all routes except IoT device endpoints
app.use(enforceHttpsExceptIoT);

// Body parser with increased limits for ESP32 uploads
// Raw body parser for audio streaming (must come before JSON parser)
// Note: This applies to all /devices/:device_id/stream/audio routes
app.use('/api/v1/devices/*/stream/audio', express.raw({ type: 'application/octet-stream', limit: '10kb' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie parser
app.use(cookieParser());

// Import route files
const auth = require('./routes/auth');
const devices = require('./routes/devices');
const streaming = require('./routes/streaming');
const alerts = require('./routes/alerts');

// Mount routers
app.use('/api/v1/auth', auth);
app.use('/api/v1/devices', devices);
app.use('/api/v1', streaming); // Streaming endpoints (stream/* and devices/doorbell/*-stream)
app.use('/api/v1/alerts', alerts);

app.get('/info', (req, res) => {
  res.send('Arduino-888-SmartHome is running!');
});

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});

// Initialize WebSocket server for device streaming
initWebSocketServer(server);

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.log(`Error: ${err.message}`);
  // Close server & exit process
  server.close(() => process.exit(1));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
