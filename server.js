const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const deviceRoutes = require('./routes/devices');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API Routes
app.use('/api/devices', deviceRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'ESP32 IoT Smart Home API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      devices: '/api/devices'
    },
    documentation: 'See API_TESTING_GUIDE.md for details'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

// Start server
app.listen(PORT, () => {
  console.log('=====================================');
  console.log('ESP32 IoT Smart Home API Server');
  console.log('=====================================');
  console.log(`Server running on port ${PORT}`);
  console.log(`API Base URL: http://localhost:${PORT}/api/devices`);
  console.log(`Health Check: http://localhost:${PORT}/health`);
  console.log('=====================================');
  console.log('Ready to receive ESP32 device connections');
});

module.exports = app;
