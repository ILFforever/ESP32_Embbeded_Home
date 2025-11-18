/**
 * Mesh Network Handler
 *
 * Handles all painless mesh networking functionality including:
 * - Mesh initialization and configuration
 * - Message reception and node management
 * - Mesh data storage and cleanup
 */

#ifndef MESH_HANDLER_H
#define MESH_HANDLER_H

#include <Arduino.h>
#include <painlessMesh.h>
#include <ArduinoJson.h>

// ============================================================================
// MESH CONFIGURATION
// ============================================================================

#define MESH_PREFIX       "Arduino_888_home"
#define MESH_PASSWORD     "19283746"
#define MESH_PORT         5555
#define MAX_MESH_NODES    10
#define MESH_DATA_MAX_AGE 120000  // 2 minutes

// ============================================================================
// DATA STRUCTURES
// ============================================================================

// Mesh sensor data from other nodes
struct MeshNodeData {
  uint32_t nodeId;
  String deviceId;
  String deviceType;
  DynamicJsonDocument data;
  unsigned long lastUpdate;

  MeshNodeData() : data(512) {}  // Initialize with 512 bytes
};

// ============================================================================
// MESH HANDLER CLASS
// ============================================================================

class MeshHandler {
public:
  MeshHandler(const char* deviceId, const char* deviceType);

  // Initialization
  void begin(Scheduler* scheduler);
  void update();

  // Mesh info
  uint32_t getNodeId();
  size_t getConnectedNodeCount();
  int getStoredNodeCount();

  // Data access
  MeshNodeData* getMeshNodes();
  int getMeshNodeCount();

  // Management
  void cleanupOldData();
  void clearAllData();

  // Status
  void printStatus();

private:
  painlessMesh mesh;
  MeshNodeData meshNodes[MAX_MESH_NODES];
  int meshNodeCount;

  const char* deviceId;
  const char* deviceType;

  // Callbacks (static to work with C-style function pointers)
  static void receivedCallback(uint32_t from, String &msg);
  static void newConnectionCallback(uint32_t nodeId);
  static void changedConnectionCallback();
  static void nodeTimeAdjustedCallback(int32_t offset);

  // Data management
  void storeNodeData(uint32_t nodeId, StaticJsonDocument<512> &doc);

  // Static instance pointer for callbacks
  static MeshHandler* instance;
};

#endif // MESH_HANDLER_H
