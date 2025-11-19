// Authentication middleware for protecting API routes
// Validates API keys or tokens for secured endpoints

/**
 * Middleware to protect routes requiring authentication
 * Usage: Apply to routes that need protection
 */
const authenticate = (req, res, next) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        message: 'No authorization header provided'
      });
    }

    // Support both "Bearer <token>" and "<token>" formats
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.substring(7)
      : authHeader;

    // TODO: Validate token against database or JWT verification
    // For now, check if token exists and is not empty
    if (!token || token.trim() === '') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token',
        message: 'Token is empty or malformed'
      });
    }

    // TODO: Implement actual token validation
    // Example: Verify JWT, check against database, etc.
    // const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // req.user = decoded;

    // For now, accept any non-empty token (REPLACE WITH REAL VALIDATION)
    req.user = {
      authenticated: true,
      token: token
    };

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Authentication failed',
      message: error.message
    });
  }
};

/**
 * Optional authentication - validates if token present, but allows access without it
 * Useful for endpoints that have different behavior for authenticated vs unauthenticated users
 */
const optionalAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader) {
      const token = authHeader.startsWith('Bearer ')
        ? authHeader.substring(7)
        : authHeader;

      if (token && token.trim() !== '') {
        // TODO: Validate token
        req.user = {
          authenticated: true,
          token: token
        };
      }
    }

    next();
  } catch (error) {
    // If optional auth fails, continue anyway
    next();
  }
};

/**
 * API Key validation middleware
 * Checks for X-API-Key header
 */
const validateApiKey = (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'API key required',
        message: 'X-API-Key header is missing'
      });
    }

    // TODO: Validate API key against database
    // For now, check if key exists
    if (apiKey.trim() === '') {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key',
        message: 'API key is empty'
      });
    }

    req.apiKey = apiKey;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'API key validation failed',
      message: error.message
    });
  }
};

module.exports = {
  authenticate,
  optionalAuth,
  validateApiKey
};
