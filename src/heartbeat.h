#ifndef HEARTBEAT_H
#define HEARTBEAT_H

#include <Arduino.h>

// ============================================================================
// Function Declarations
// ============================================================================

/**
 * Send heartbeat to backend server
 *
 * @param deviceId Device identifier (e.g., "dl_001")
 * @param deviceType Device type (e.g., "actuator")
 * @param deviceToken API token for authentication
 * @param backendUrl Full heartbeat endpoint URL (e.g., "https://embedded-smarthome.fly.dev/api/v1/devices/heartbeat")
 * @return true if heartbeat was sent successfully, false otherwise
 */
bool sendHeartbeatToBackend(
    const char* deviceId,
    const char* deviceToken,
    const char* backendUrl,
    const char* deviceType
);

// Function to fetch and execute commands from backend
// This should be implemented in your main application file
extern void fetchAndExecuteCommands();

#endif // HEARTBEAT_H
