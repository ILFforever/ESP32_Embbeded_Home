#include "logger.h"
#include "heartbeat.h"
#include "network_manager.h"
#include <time.h>

// External references from heartbeat module
extern const char *BACKEND_SERVER_URL;
extern const char *DEVICE_ID;
extern const char *DEVICE_API_TOKEN;

// ============================================================================
// Initialize logger module
// ============================================================================
void initLogger()
{
  Serial.println("[Logger] Initialized");
}

// ============================================================================
// Get ISO 8601 timestamp (written into caller-provided buffer, no heap)
// ============================================================================
static void getISOTimestamp(char *buffer, size_t bufferSize)
{
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo))
  {
    // Fallback to millis() if time not synced
    snprintf(buffer, bufferSize, "%lu", millis());
    return;
  }

  strftime(buffer, bufferSize, "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
}

// ============================================================================
// Convert log level enum to string
// ============================================================================
const char* logLevelToString(LogLevel level)
{
  switch (level)
  {
    case LOG_INFO:     return "INFO";
    case LOG_WARNING:  return "WARNING";
    case LOG_ERROR:    return "ERROR";
    case LOG_CRITICAL: return "CRITICAL";
    default:           return "UNKNOWN";
  }
}

// ============================================================================
// Core logging function - sends log to backend server
// ============================================================================
void logToBackend(LogLevel level, const char* module, const char* message, JsonObject metadata)
{
  char timestamp[32];
  getISOTimestamp(timestamp, sizeof(timestamp));

  StaticJsonDocument<512> doc;
  doc["device_id"] = DEVICE_ID;
  doc["timestamp"] = timestamp;
  doc["level"] = logLevelToString(level);
  doc["message"] = message;
  doc["module"] = module;

  // Add metadata if provided
  if (!metadata.isNull())
  {
    doc["metadata"] = metadata;
  }

  char jsonString[768];
  serializeJson(doc, jsonString, sizeof(jsonString));

  char endpoint[96];
  snprintf(endpoint, sizeof(endpoint), "/api/v1/devices/%s/log", DEVICE_ID);
  if (!enqueueBackendPost(endpoint, jsonString, "log", true, 5000))
  {
    Serial.printf("[Logger] Failed to queue log (level: %s, module: %s)\n",
                  logLevelToString(level), module);
  }
}

// ============================================================================
// Convenience functions for different log levels
// ============================================================================
void logInfo(const char* module, const char* message, JsonObject metadata)
{
  logToBackend(LOG_INFO, module, message, metadata);
}

void logWarning(const char* module, const char* message, JsonObject metadata)
{
  logToBackend(LOG_WARNING, module, message, metadata);
}

void logError(const char* module, const char* message, JsonObject metadata)
{
  logToBackend(LOG_ERROR, module, message, metadata);
}

void logCritical(const char* module, const char* message, JsonObject metadata)
{
  logToBackend(LOG_CRITICAL, module, message, metadata);
}
