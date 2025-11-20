#include "logger.h"
#include "heartbeat.h"
#include <WiFi.h>
#include <HTTPClient.h>
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
// Get ISO 8601 timestamp
// ============================================================================
String getISOTimestamp()
{
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo))
  {
    // Fallback to millis() if time not synced
    return String(millis());
  }

  char buffer[30];
  strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
  return String(buffer);
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
  // Check WiFi connection
  if (WiFi.status() != WL_CONNECTED)
  {
    Serial.printf("[Logger] WiFi not connected - skipping log (level: %s, module: %s)\n",
                  logLevelToString(level), module);
    return;
  }

  HTTPClient http;
  String url = String(BACKEND_SERVER_URL) + "/api/v1/devices/" + String(DEVICE_ID) + "/log";

  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  // Add Authorization header with Bearer token
  if (DEVICE_API_TOKEN && strlen(DEVICE_API_TOKEN) > 0)
  {
    String authHeader = String("Bearer ") + DEVICE_API_TOKEN;
    http.addHeader("Authorization", authHeader.c_str());
  }

  http.setTimeout(5000);

  // Build JSON payload
  StaticJsonDocument<1024> doc;
  doc["device_id"] = DEVICE_ID;
  doc["timestamp"] = getISOTimestamp();
  doc["level"] = logLevelToString(level);
  doc["message"] = message;
  doc["module"] = module;

  // Add metadata if provided
  if (!metadata.isNull())
  {
    doc["metadata"] = metadata;
  }

  String jsonString;
  serializeJson(doc, jsonString);

  // Send POST request
  int httpResponseCode = http.POST(jsonString);

  if (httpResponseCode > 0)
  {
    if (httpResponseCode == 200 || httpResponseCode == 201)
    {
      Serial.printf("[Logger] ✓ %s logged (module: %s): %s\n",
                    logLevelToString(level), module, message);
    }
    else
    {
      Serial.printf("[Logger] ✗ Failed to log (code: %d)\n", httpResponseCode);
    }
  }
  else
  {
    Serial.printf("[Logger] ✗ Connection failed: %s\n",
                  http.errorToString(httpResponseCode).c_str());
  }

  http.end();
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
