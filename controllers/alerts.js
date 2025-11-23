const Alert = require('../models/Alert');
const { ALERT_LEVELS } = require('../models/Alert');

// ============================================================================
// @route   GET /api/v1/alerts
// @desc    Get alerts with filtering and sorting (for frontend and ESP32 LCD)
// @access  Public (for ESP32) / Protected (for frontend)
// @query   level - Filter by level (INFO, WARN, IMPORTANT)
// @query   source - Filter by source (system, doorbell, hub, etc.)
// @query   tags - Filter by tags (comma-separated)
// @query   read - Filter by read status (true/false)
// @query   limit - Max alerts to return (default 50, max 100)
// ============================================================================
const getAlerts = async (req, res) => {
  try {
    const {
      level,
      source,
      tags,
      read,
      limit = 50
    } = req.query;

    // Validate level
    if (level && !Object.values(ALERT_LEVELS).includes(level)) {
      return res.status(400).json({
        status: 'error',
        message: `Invalid level. Must be one of: ${Object.values(ALERT_LEVELS).join(', ')}`
      });
    }

    // Parse tags (comma-separated string to array)
    const tagArray = tags ? tags.split(',').map(t => t.trim()) : null;

    // Parse read filter
    const readFilter = read === 'true' ? true : read === 'false' ? false : null;

    // Parse and validate limit
    const limitNum = Math.min(parseInt(limit) || 50, 100);

    console.log(`[Alerts] Fetching alerts - level: ${level || 'all'}, source: ${source || 'all'}, limit: ${limitNum}`);

    // Get alerts with filters
    const alerts = await Alert.getAlerts({
      level,
      source,
      tags: tagArray,
      read: readFilter,
      limit: limitNum,
      sortBy: 'priority', // Sort by priority (IMPORTANT > WARN > INFO) then timestamp
      sortOrder: 'desc'
    });

    console.log(`[Alerts] Returning ${alerts.length} alerts`);

    // Return alerts
    res.json({
      status: 'ok',
      count: alerts.length,
      alerts: alerts.map(a => a.toJSON())
    });

  } catch (error) {
    console.error('[Alerts] Error fetching alerts:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// ============================================================================
// @route   POST /api/v1/alerts
// @desc    Create a new alert (manual creation)
// @access  Protected (requires user token)
// ============================================================================
const createAlert = async (req, res) => {
  try {
    const { level, message, source, tags, metadata } = req.body;

    // Validation
    if (!message) {
      return res.status(400).json({
        status: 'error',
        message: 'Message is required'
      });
    }

    // Create alert
    const alert = await Alert.create({
      level: level || ALERT_LEVELS.INFO,
      message,
      source: source || 'user',
      tags: tags || [],
      metadata: metadata || {}
    });

    console.log(`[Alerts] Created alert: ${alert.id}`);

    res.status(201).json({
      status: 'ok',
      message: 'Alert created successfully',
      alert: alert.toJSON()
    });

  } catch (error) {
    console.error('[Alerts] Error creating alert:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// ============================================================================
// @route   PATCH /api/v1/alerts/:alert_id/read
// @desc    Mark alert as read
// @access  Protected (requires user token)
// ============================================================================
const markAlertAsRead = async (req, res) => {
  try {
    const { alert_id } = req.params;

    const alert = await Alert.markAsRead(alert_id);

    if (!alert) {
      return res.status(404).json({
        status: 'error',
        message: 'Alert not found'
      });
    }

    console.log(`[Alerts] Marked alert as read: ${alert_id}`);

    res.json({
      status: 'ok',
      message: 'Alert marked as read',
      alert: alert.toJSON()
    });

  } catch (error) {
    console.error('[Alerts] Error marking alert as read:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// ============================================================================
// @route   POST /api/v1/alerts/mark-read
// @desc    Mark multiple alerts as read
// @access  Protected (requires user token)
// ============================================================================
const markMultipleAlertsAsRead = async (req, res) => {
  try {
    const { alert_ids } = req.body;

    if (!alert_ids || !Array.isArray(alert_ids) || alert_ids.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'alert_ids array is required'
      });
    }

    await Alert.markMultipleAsRead(alert_ids);

    console.log(`[Alerts] Marked ${alert_ids.length} alerts as read`);

    res.json({
      status: 'ok',
      message: `${alert_ids.length} alerts marked as read`
    });

  } catch (error) {
    console.error('[Alerts] Error marking alerts as read:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// ============================================================================
// @route   DELETE /api/v1/alerts/:alert_id
// @desc    Delete an alert
// @access  Protected (requires user token)
// ============================================================================
const deleteAlert = async (req, res) => {
  try {
    const { alert_id } = req.params;

    const alert = await Alert.delete(alert_id);

    if (!alert) {
      return res.status(404).json({
        status: 'error',
        message: 'Alert not found'
      });
    }

    console.log(`[Alerts] Deleted alert: ${alert_id}`);

    res.json({
      status: 'ok',
      message: 'Alert deleted successfully'
    });

  } catch (error) {
    console.error('[Alerts] Error deleting alert:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// ============================================================================
// Helper function to create alert from device event
// (can be called from other controllers)
// ============================================================================
const createDeviceAlert = async (alertData) => {
  try {
    return await Alert.create(alertData);
  } catch (error) {
    console.error('[Alerts] Error creating device alert:', error);
    throw error;
  }
};

module.exports = {
  getAlerts,
  createAlert,
  markAlertAsRead,
  markMultipleAlertsAsRead,
  deleteAlert,
  createDeviceAlert
};
