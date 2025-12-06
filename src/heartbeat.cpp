#include "heartbeat.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

/**
 * Send heartbeat to backend server
 *
 * Sends device health metrics to POST /api/v1/devices/heartbeat
 * The backend uses this to:
 * - Monitor device online status (with TTL auto-deletion after 3 min)
 * - Track device health metrics (uptime, memory, WiFi signal)
 * - Notify device of pending commands via has_pending_commands flag
 * - Throttle Firebase writes to reduce costs
 *
 * @param deviceId Device identifier (e.g., "dl_001")
 * @param deviceToken API token for authentication
 * @param backendUrl Full heartbeat endpoint URL (e.g., "https://embedded-smarthome.fly.dev/api/v1/devices/heartbeat")
 * @param deviceType Device type (e.g., "actuator")
 * @return true if heartbeat was sent successfully, false otherwise
 */
bool sendHeartbeatToBackend(
    const char* deviceId,
    const char* deviceToken,
    const char* backendUrl,
    const char* deviceType
) {
    // Check WiFi connection
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[HEARTBEAT] WiFi not connected - skipping");
        return false;
    }

    Serial.println("[HEARTBEAT] Sending to backend...");

    HTTPClient http;

    // Use the provided URL directly (already contains the full path)
    String url = String(backendUrl);

    http.begin(url);
    http.addHeader("Content-Type", "application/json");

    // Add Authorization header with Bearer token
    if (deviceToken && strlen(deviceToken) > 0) {
        String authHeader = String("Bearer ") + deviceToken;
        http.addHeader("Authorization", authHeader.c_str());
    }

    http.setTimeout(5000);

    // Build JSON payload
    StaticJsonDocument<512> doc;
    doc["device_id"] = deviceId;
    doc["uptime_ms"] = millis();
    doc["free_heap"] = ESP.getFreeHeap();
    doc["wifi_rssi"] = WiFi.RSSI();
    doc["ip_address"] = WiFi.localIP().toString();
    doc["device_type"]=  deviceType;

    String payload;
    serializeJson(doc, payload);

    Serial.printf("[HEARTBEAT] Payload: %s\n", payload.c_str());

    // Send POST request
    int httpCode = http.POST(payload);

    bool success = false;

    if (httpCode > 0) {
        Serial.printf("[HEARTBEAT] HTTP Response: %d\n", httpCode);

        if (httpCode == HTTP_CODE_OK) {
            String response = http.getString();
            Serial.printf("[HEARTBEAT] Response: %s\n", response.c_str());

            // Parse response to check for pending commands
            StaticJsonDocument<512> responseDoc;
            DeserializationError error = deserializeJson(responseDoc, response);

            if (!error) {
                bool hasPendingCommands = responseDoc["has_pending_commands"] | false;

                if (hasPendingCommands) {
                    Serial.println("[HEARTBEAT] ⚠ Backend reports pending commands!");
                    Serial.println("[HEARTBEAT] → Triggering command fetch...");

                    // Trigger command fetch (implemented in main file)
                    fetchAndExecuteCommands();
                } else {
                    Serial.println("[HEARTBEAT] ✓ No pending commands");
                }

                success = true;
            } else {
                Serial.printf("[HEARTBEAT] ⚠ Failed to parse response JSON: %s\n", error.c_str());
                success = true; // Still consider it successful since backend responded with 200
            }
        } else {
            Serial.printf("[HEARTBEAT] ⚠ Unexpected response code: %d\n", httpCode);
        }
    } else {
        Serial.printf("[HEARTBEAT] ✗ HTTP request failed: %s\n", http.errorToString(httpCode).c_str());
    }

    http.end();

    return success;
}
