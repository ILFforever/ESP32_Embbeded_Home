/**
 * HTTPS Enforcement Middleware
 * Forces HTTPS for all routes EXCEPT IoT device endpoints
 *
 * Why: ESP32 devices have limited memory and can't handle SSL
 * Solution: Allow HTTP only for /api/v1/devices/* paths
 */
const enforceHttpsExceptIoT = (req, res, next) => {
  // Skip HTTPS enforcement for IoT device endpoints
  const iotPaths = [
    '/api/v1/devices/heartbeat',
    '/api/v1/devices/sensor',
    '/api/v1/devices/warning',
    '/ws/stream'  // WebSocket for ESP32 streaming
  ];

  const isIoTEndpoint = iotPaths.some(path => req.path === path);

  // Allow HTTP for IoT endpoints
  if (isIoTEndpoint) {
    return next();
  }

  // Check if request is already HTTPS
  const isHttps = req.secure ||
                  req.headers['x-forwarded-proto'] === 'https' ||
                  req.protocol === 'https';

  // For non-IoT endpoints, enforce HTTPS
  if (!isHttps && process.env.NODE_ENV === 'production') {
    const httpsUrl = `https://${req.headers.host}${req.url}`;
    console.log(`[Security] Redirecting HTTP → HTTPS: ${req.path}`);
    return res.redirect(301, httpsUrl);
  }

  next();
};

module.exports = enforceHttpsExceptIoT;
