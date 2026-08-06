#ifndef NETWORK_MANAGER_H
#define NETWORK_MANAGER_H

#include <Arduino.h>

struct NetworkManagerStats
{
  uint32_t queued;
  uint32_t completed;
  uint32_t failed;
  uint32_t dropped;
  uint32_t commandFetchQueued;
  uint32_t lastStatusCode;
};

void initNetworkManager(uint32_t stackSize = 8192, UBaseType_t priority = 1, BaseType_t coreId = 0);

bool enqueueBackendPost(const char *endpoint,
                        const char *payload,
                        const char *label,
                        bool withAuth = true,
                        uint16_t timeoutMs = 5000);

bool enqueueHeartbeat();
bool enqueueFetchCommands();

NetworkManagerStats getNetworkManagerStats();
int getPendingNetworkJobCount();

// Implemented by heartbeat.cpp. These run inside the network worker task.
void sendHeartbeatImmediate();
void fetchAndExecuteCommandsImmediate();

#endif // NETWORK_MANAGER_H
