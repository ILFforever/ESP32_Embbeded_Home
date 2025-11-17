/**
 * Firebase Cloud Functions Entry Point
 *
 * This file exports all cloud functions for the ESP32 Smart Home project
 */

const { cleanupDeviceStatus, cleanupDeviceStatusManual } = require('./cleanupDeviceStatus');

// Export the cleanup functions
exports.cleanupDeviceStatus = cleanupDeviceStatus;
exports.cleanupDeviceStatusManual = cleanupDeviceStatusManual;
