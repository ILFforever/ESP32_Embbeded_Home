#ifndef LOGGER_H
#define LOGGER_H

#include <Arduino.h>
#include <ArduinoJson.h>

// Log levels (matching backend API)
enum LogLevel {
  LOG_INFO,
  LOG_WARNING,
  LOG_ERROR,
  LOG_CRITICAL
};

// Initialize logger (must be called after initHeartbeat)
void initLogger();

// Core logging function with metadata support
void logToBackend(LogLevel level, const char* module, const char* message, JsonObject metadata = JsonObject());

// Convenience functions for different log levels
void logInfo(const char* module, const char* message, JsonObject metadata = JsonObject());
void logWarning(const char* module, const char* message, JsonObject metadata = JsonObject());
void logError(const char* module, const char* message, JsonObject metadata = JsonObject());
void logCritical(const char* module, const char* message, JsonObject metadata = JsonObject());

// Helper to create metadata objects
// Usage:
//   StaticJsonDocument<256> doc;
//   JsonObject meta = doc.to<JsonObject>();
//   meta["key"] = "value";
//   logError("module", "message", meta);

#endif
