/**
 * Mesh Network Handler Implementation
 */

#include "mesh_handler.h"

// Static instance pointer for callbacks
MeshHandler* MeshHandler::instance = nullptr;

// ============================================================================
// CONSTRUCTOR
// ============================================================================

MeshHandler::MeshHandler(const char* deviceId, const char* deviceType)
  : meshNodeCount(0), deviceId(deviceId), deviceType(deviceType), dataReceivedCallback(nullptr) {
  instance = this;  // Set static instance for callbacks
}

// ============================================================================
// INITIALIZATION
// ============================================================================

void MeshHandler::begin(Scheduler* scheduler) {
  Serial.println("[MESH] Initializing Painless Mesh...");

  // Set callbacks
  mesh.setDebugMsgTypes(ERROR | STARTUP | CONNECTION);
  mesh.onReceive(&MeshHandler::receivedCallback);
  mesh.onNewConnection(&MeshHandler::newConnectionCallback);
  mesh.onChangedConnections(&MeshHandler::changedConnectionCallback);
  mesh.onNodeTimeAdjusted(&MeshHandler::nodeTimeAdjustedCallback);

  // Initialize mesh
  mesh.init(MESH_PREFIX, MESH_PASSWORD, scheduler, MESH_PORT);

  Serial.printf("[MESH] ✓ Mesh initialized\n");
  Serial.printf("[MESH]   - Network: %s\n", MESH_PREFIX);
  Serial.printf("[MESH]   - Node ID: %u\n", mesh.getNodeId());
  Serial.printf("[MESH]   - Port: %d\n", MESH_PORT);
}

// ============================================================================
// UPDATE
// ============================================================================

void MeshHandler::update() {
  mesh.update();
}

// ============================================================================
// CALLBACK SETUP
// ============================================================================

void MeshHandler::setDataReceivedCallback(DataReceivedCallback callback) {
  dataReceivedCallback = callback;
}

// ============================================================================
// MESH INFO
// ============================================================================

uint32_t MeshHandler::getNodeId() {
  return mesh.getNodeId();
}

size_t MeshHandler::getConnectedNodeCount() {
  return mesh.getNodeList().size();
}

int MeshHandler::getStoredNodeCount() {
  return meshNodeCount;
}

// ============================================================================
// DATA ACCESS
// ============================================================================

MeshNodeData* MeshHandler::getMeshNodes() {
  return meshNodes;
}

int MeshHandler::getMeshNodeCount() {
  return meshNodeCount;
}

// ============================================================================
// CALLBACKS
// ============================================================================

void MeshHandler::receivedCallback(uint32_t from, String &msg) {
  if (!instance) return;

  Serial.printf("\n[MESH] ← Received message from node %u\n", from);
  Serial.printf("[MESH]   Length: %d bytes\n", msg.length());

  // Parse JSON message
  StaticJsonDocument<512> doc;
  DeserializationError error = deserializeJson(doc, msg);

  if (error) {
    Serial.printf("[MESH] ✗ JSON parse error: %s\n", error.c_str());
    return;
  }

  // Extract device info
  const char* deviceId = doc["device_id"] | "unknown";
  const char* deviceType = doc["device_type"] | "sensor";

  Serial.printf("[MESH]   Device: %s (%s)\n", deviceId, deviceType);

  // Forward data instantly if callback is set
  if (instance->dataReceivedCallback) {
    instance->dataReceivedCallback(from, doc);
    Serial.println("[MESH] ✓ Data forwarded instantly");
  } else {
    // Fallback: Store the mesh node data (for backward compatibility)
    instance->storeNodeData(from, doc);
    Serial.println("[MESH] ✓ Data stored");
  }
}

void MeshHandler::newConnectionCallback(uint32_t nodeId) {
  if (!instance) return;

  Serial.printf("\n[MESH] ✓ New connection: Node %u\n", nodeId);
  instance->printStatus();
}

void MeshHandler::changedConnectionCallback() {
  if (!instance) return;

  Serial.println("\n[MESH] ⚠ Network topology changed");
  instance->printStatus();
}

void MeshHandler::nodeTimeAdjustedCallback(int32_t offset) {
  Serial.printf("[MESH] ⏱ Time adjusted by %d µs\n", offset);
}

// ============================================================================
// DATA MANAGEMENT
// ============================================================================

void MeshHandler::storeNodeData(uint32_t nodeId, StaticJsonDocument<512> &doc) {
  // Check if node already exists
  int existingIndex = -1;
  for (int i = 0; i < meshNodeCount; i++) {
    if (meshNodes[i].nodeId == nodeId) {
      existingIndex = i;
      break;
    }
  }

  // Update existing or add new
  if (existingIndex >= 0) {
    // Update existing node
    meshNodes[existingIndex].deviceId = doc["device_id"] | "unknown";
    meshNodes[existingIndex].deviceType = doc["device_type"] | "sensor";
    meshNodes[existingIndex].data = doc;
    meshNodes[existingIndex].lastUpdate = millis();
  } else if (meshNodeCount < MAX_MESH_NODES) {
    // Add new node
    meshNodes[meshNodeCount].nodeId = nodeId;
    meshNodes[meshNodeCount].deviceId = doc["device_id"] | "unknown";
    meshNodes[meshNodeCount].deviceType = doc["device_type"] | "sensor";
    meshNodes[meshNodeCount].data = doc;
    meshNodes[meshNodeCount].lastUpdate = millis();
    meshNodeCount++;
  } else {
    Serial.println("[MESH] ✗ Max mesh nodes reached, oldest will be replaced");
    // Replace oldest entry (simple FIFO)
    meshNodes[0].nodeId = nodeId;
    meshNodes[0].deviceId = doc["device_id"] | "unknown";
    meshNodes[0].deviceType = doc["device_type"] | "sensor";
    meshNodes[0].data = doc;
    meshNodes[0].lastUpdate = millis();
  }
}

void MeshHandler::cleanupOldData() {
  unsigned long now = millis();
  int removed = 0;

  for (int i = 0; i < meshNodeCount; i++) {
    if (now - meshNodes[i].lastUpdate > MESH_DATA_MAX_AGE) {
      // Remove stale data by shifting array
      for (int j = i; j < meshNodeCount - 1; j++) {
        meshNodes[j] = meshNodes[j + 1];
      }
      meshNodeCount--;
      removed++;
      i--; // Check this index again
    }
  }

  if (removed > 0) {
    Serial.printf("[MESH] Cleaned up %d stale node(s)\n", removed);
  }
}

void MeshHandler::clearAllData() {
  meshNodeCount = 0;
  Serial.println("[MESH] ✓ All stored data cleared");
}

// ============================================================================
// STATUS
// ============================================================================

void MeshHandler::printStatus() {
  Serial.println("[MESH] ─────────────────────────────────");
  Serial.printf("[MESH] Node ID: %u\n", mesh.getNodeId());
  Serial.printf("[MESH] Connected nodes: %d\n", mesh.getNodeList().size());
  Serial.printf("[MESH] Stored sensor data: %d nodes\n", meshNodeCount);

  auto nodes = mesh.getNodeList();
  if (nodes.size() > 0) {
    Serial.println("[MESH] Connected:");
    for (auto &&id : nodes) {
      Serial.printf("[MESH]   - Node %u\n", id);
    }
  }
  Serial.println("[MESH] ─────────────────────────────────");
}
