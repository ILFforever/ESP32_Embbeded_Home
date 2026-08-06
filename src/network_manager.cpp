#include "network_manager.h"
#include "heartbeat.h"
#include "face_detection_sender.h"
#include <WiFi.h>
#include <HTTPClient.h>

enum NetworkJobType
{
  NETWORK_JOB_BACKEND_POST,
  NETWORK_JOB_HEARTBEAT,
  NETWORK_JOB_FETCH_COMMANDS
};

struct NetworkJob
{
  NetworkJobType type;
  char *endpoint;
  char *payload;
  char label[24];
  bool withAuth;
  uint16_t timeoutMs;
};

static QueueHandle_t networkQueue = NULL;
static TaskHandle_t networkTaskHandle = NULL;
static NetworkManagerStats stats = {0, 0, 0, 0, 0, 0};

static char *copyString(const char *value)
{
  if (value == nullptr)
  {
    return nullptr;
  }

  size_t length = strlen(value) + 1;
  char *copy = static_cast<char *>(malloc(length));
  if (copy == nullptr)
  {
    return nullptr;
  }

  memcpy(copy, value, length);
  return copy;
}

static bool enqueueJob(NetworkJob &job)
{
  if (networkQueue == NULL)
  {
    Serial.println("[NetworkManager] Not initialized");
    stats.dropped++;
    return false;
  }

  if (xQueueSend(networkQueue, &job, 0) != pdTRUE)
  {
    Serial.printf("[NetworkManager] Queue full, dropping %s\n", job.label);
    stats.dropped++;
    return false;
  }

  stats.queued++;
  return true;
}

static void freeJob(NetworkJob &job)
{
  if (job.endpoint != nullptr)
  {
    free(job.endpoint);
    job.endpoint = nullptr;
  }
  if (job.payload != nullptr)
  {
    free(job.payload);
    job.payload = nullptr;
  }
}

bool enqueueBackendPost(const char *endpoint,
                        const char *payload,
                        const char *label,
                        bool withAuth,
                        uint16_t timeoutMs)
{
  NetworkJob job = {};
  job.type = NETWORK_JOB_BACKEND_POST;
  job.endpoint = copyString(endpoint);
  job.payload = copyString(payload);
  job.withAuth = withAuth;
  job.timeoutMs = timeoutMs;
  strncpy(job.label, label ? label : "post", sizeof(job.label) - 1);

  if (job.endpoint == nullptr || job.payload == nullptr)
  {
    Serial.printf("[NetworkManager] Allocation failed for %s\n", job.label);
    freeJob(job);
    stats.dropped++;
    return false;
  }

  if (!enqueueJob(job))
  {
    freeJob(job);
    return false;
  }

  return true;
}

bool enqueueFetchCommands()
{
  NetworkJob job = {};
  job.type = NETWORK_JOB_FETCH_COMMANDS;
  strncpy(job.label, "commands", sizeof(job.label) - 1);

  if (!enqueueJob(job))
  {
    return false;
  }

  stats.commandFetchQueued++;
  return true;
}

bool enqueueHeartbeat()
{
  NetworkJob job = {};
  job.type = NETWORK_JOB_HEARTBEAT;
  strncpy(job.label, "heartbeat", sizeof(job.label) - 1);
  return enqueueJob(job);
}

static void waitForFaceUploadWindow()
{
  unsigned long start = millis();
  while (faceDetectionUploadInProgress && (millis() - start < 15000))
  {
    vTaskDelay(pdMS_TO_TICKS(250));
  }
}

static bool performBackendPost(NetworkJob &job)
{
  waitForFaceUploadWindow();

  if (WiFi.status() != WL_CONNECTED)
  {
    Serial.printf("[NetworkManager] WiFi not connected, dropping %s\n", job.label);
    return false;
  }

  HTTPClient http;
  char url[224];
  snprintf(url, sizeof(url), "%s%s", BACKEND_SERVER_URL, job.endpoint);

  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  if (job.withAuth && DEVICE_API_TOKEN && strlen(DEVICE_API_TOKEN) > 0)
  {
    char authHeader[256];
    snprintf(authHeader, sizeof(authHeader), "Bearer %s", DEVICE_API_TOKEN);
    http.addHeader("Authorization", authHeader);
  }

  http.setTimeout(job.timeoutMs);

  int httpResponseCode = http.POST(reinterpret_cast<uint8_t *>(job.payload), strlen(job.payload));
  stats.lastStatusCode = httpResponseCode > 0 ? httpResponseCode : 0;

  if (httpResponseCode >= 200 && httpResponseCode < 300)
  {
    Serial.printf("[NetworkManager] %s sent (code: %d)\n", job.label, httpResponseCode);
    http.end();
    return true;
  }

  Serial.printf("[NetworkManager] %s failed (code: %d)\n", job.label, httpResponseCode);
  http.end();
  return false;
}

static void networkTask(void *parameter)
{
  (void)parameter;
  NetworkJob job;

  while (true)
  {
    if (xQueueReceive(networkQueue, &job, portMAX_DELAY) == pdTRUE)
    {
      bool success = false;

      switch (job.type)
      {
      case NETWORK_JOB_BACKEND_POST:
        success = performBackendPost(job);
        break;
      case NETWORK_JOB_HEARTBEAT:
        sendHeartbeatImmediate();
        success = true;
        break;
      case NETWORK_JOB_FETCH_COMMANDS:
        fetchAndExecuteCommandsImmediate();
        success = true;
        break;
      }

      if (success)
      {
        stats.completed++;
      }
      else
      {
        stats.failed++;
      }

      freeJob(job);
      vTaskDelay(pdMS_TO_TICKS(25));
    }
  }
}

void initNetworkManager(uint32_t stackSize, UBaseType_t priority, BaseType_t coreId)
{
  if (networkQueue != NULL)
  {
    return;
  }

  networkQueue = xQueueCreate(8, sizeof(NetworkJob));
  if (networkQueue == NULL)
  {
    Serial.println("[NetworkManager] Failed to create queue");
    return;
  }

  BaseType_t result = xTaskCreatePinnedToCore(
      networkTask,
      "NetworkManager",
      stackSize,
      NULL,
      priority,
      &networkTaskHandle,
      coreId);

  if (result != pdPASS)
  {
    Serial.println("[NetworkManager] Failed to create task");
    vQueueDelete(networkQueue);
    networkQueue = NULL;
    return;
  }

  Serial.printf("[NetworkManager] Initialized (Core %d, Stack: %u, Priority: %u)\n",
                coreId, stackSize, priority);
}

NetworkManagerStats getNetworkManagerStats()
{
  return stats;
}

int getPendingNetworkJobCount()
{
  if (networkQueue == NULL)
  {
    return 0;
  }
  return uxQueueMessagesWaiting(networkQueue);
}
