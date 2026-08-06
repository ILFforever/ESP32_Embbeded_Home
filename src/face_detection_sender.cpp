#include "face_detection_sender.h"
#include <WiFi.h>
#include <ArduinoJson.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"
#include "esp_task_wdt.h"

// External backend configuration from heartbeat.h
extern const char *BACKEND_SERVER_URL;
extern const char *DEVICE_ID;
extern const char *DEVICE_API_TOKEN;

// Queue and task handles
static QueueHandle_t faceDetectionQueue = NULL;
static TaskHandle_t faceDetectionTaskHandle = NULL;

// Statistics
static FaceDetectionStats stats = {0, 0, 0, 0, 0};

// Global flag to pause other WiFi operations during upload
volatile bool faceDetectionUploadInProgress = false;

// ============================================================================
// Internal: Parse BACKEND_SERVER_URL into host/port and build the
// face-detection endpoint path - fixed buffers, no heap allocation
// ============================================================================
static void buildFaceEndpoint(char *host, size_t hostSize, int *port, char *path, size_t pathSize)
{
    const char *url = BACKEND_SERVER_URL;
    if (strncmp(url, "http://", 7) == 0)
    {
        url += 7;
    }
    else if (strncmp(url, "https://", 8) == 0)
    {
        url += 8;
    }

    const char *colon = strchr(url, ':');
    const char *slash = strchr(url, '/');

    size_t hostLen;
    if (colon != nullptr)
    {
        hostLen = (size_t)(colon - url);
        *port = atoi(colon + 1); // atoi stops at '/' automatically
    }
    else
    {
        hostLen = (slash != nullptr) ? (size_t)(slash - url) : strlen(url);
        *port = 80;
    }
    if (hostLen >= hostSize)
    {
        hostLen = hostSize - 1;
    }
    memcpy(host, url, hostLen);
    host[hostLen] = '\0';

    // Base path from URL (if any), then append endpoint avoiding double slashes
    size_t baseLen = 0;
    if (slash != nullptr)
    {
        baseLen = strlen(slash);
        if (baseLen >= pathSize)
        {
            baseLen = pathSize - 1;
        }
        memcpy(path, slash, baseLen);
    }
    path[baseLen] = '\0';

    const char *apiPath = "/api/v1/devices/doorbell/face-detection";
    if (baseLen == 0 || strcmp(path, "/") == 0)
    {
        snprintf(path, pathSize, "%s", apiPath);
    }
    else if (path[baseLen - 1] == '/')
    {
        snprintf(path + baseLen, pathSize - baseLen, "%s", apiPath + 1);
    }
    else
    {
        snprintf(path + baseLen, pathSize - baseLen, "%s", apiPath);
    }
}

// ============================================================================
// Internal: Send HTTP request headers using a fixed buffer
// ============================================================================
static void sendRequestHeaders(WiFiClient &client, const char *path, const char *host,
                               const char *contentType, size_t contentLength)
{
    char header[512];
    int headerLen = snprintf(header, sizeof(header),
                             "POST %s HTTP/1.1\r\n"
                             "Host: %s\r\n"
                             "Content-Type: %s\r\n"
                             "Content-Length: %u\r\n",
                             path, host, contentType, (unsigned)contentLength);
    if (DEVICE_API_TOKEN && strlen(DEVICE_API_TOKEN) > 0 && headerLen > 0 && headerLen < (int)sizeof(header))
    {
        headerLen += snprintf(header + headerLen, sizeof(header) - headerLen,
                              "Authorization: Bearer %s\r\n", DEVICE_API_TOKEN);
    }
    if (headerLen > 0 && headerLen < (int)sizeof(header))
    {
        snprintf(header + headerLen, sizeof(header) - headerLen, "Connection: close\r\n\r\n");
    }
    client.print(header);
}

// ============================================================================
// Internal: Send face detection event as JSON (fallback, no image)
// ============================================================================
static void sendFaceDetectionJson(FaceDetectionEvent *event)
{
    if (WiFi.status() != WL_CONNECTED)
    {
        Serial.println("[FaceDetectionSender] (JSON) WiFi not connected - skipping fallback");
        return;
    }

    // Parse backend URL
    char host[64];
    char path[160];
    int port = 80;
    buildFaceEndpoint(host, sizeof(host), &port, path, sizeof(path));

    WiFiClient client;
    client.setTimeout(5000);

    if (!client.connect(host, port, 5000))
    {
        Serial.println("[FaceDetectionSender] (JSON) ✗ Connection failed");
        return;
    }

    Serial.println("[FaceDetectionSender] (JSON) ✓ Connected for fallback");

    // Create JSON payload
    StaticJsonDocument<256> doc;
    doc["device_id"] = DEVICE_ID;
    doc["recognized"] = event->recognized;
    doc["name"] = event->name;
    doc["confidence"] = event->confidence;
    doc["timestamp"] = event->timestamp;
    doc["image_upload_failed"] = true;

    char payload[256];
    size_t payloadLen = serializeJson(doc, payload, sizeof(payload));

    // Send HTTP headers and body
    sendRequestHeaders(client, path, host, "application/json", payloadLen);
    client.print(payload);
    client.flush();

    Serial.println("[FaceDetectionSender] (JSON) ✓ Fallback request sent. Waiting for response...");

    unsigned long responseTimeout = millis();
    while (client.available() == 0)
    {
        if (!client.connected() || millis() - responseTimeout > 5000)
        {
            Serial.println("[FaceDetectionSender] (JSON) ✗ No response or timeout.");
            client.stop();
            return;
        }
        vTaskDelay(pdMS_TO_TICKS(10));
    }

    // Read response to confirm
    int httpCode = 0;
    if (client.find("HTTP/1.1 "))
    {
        httpCode = client.parseInt();
    }

    client.stop();
    Serial.printf("[FaceDetectionSender] (JSON) ✓ Fallback response code: %d\n", httpCode);
}

// ============================================================================
// Internal: Send face detection event (blocking, but runs in dedicated task)
// ============================================================================
static void sendFaceDetectionBlocking(FaceDetectionEvent *event)
{
    // Set flag to pause other WiFi operations
    faceDetectionUploadInProgress = true;

    unsigned long startTime = millis();

    if (WiFi.status() != WL_CONNECTED)
    {
        Serial.println("[FaceDetectionSender] WiFi not connected - skipping");
        stats.totalFailed++;
        faceDetectionUploadInProgress = false;
        return;
    }

    // Note: Camera should already be stopped by caller to free SPI buffer
    // This reduces heap fragmentation during WiFiClient operations

    // Parse backend URL
    char host[64];
    char path[160];
    int port = 80;
    buildFaceEndpoint(host, sizeof(host), &port, path, sizeof(path));

    Serial.printf("[FaceDetectionSender] Connecting to %s:%d%s\n", host, port, path);

    WiFiClient client;
    client.setTimeout(6000); // 5 second timeout for reads/writes

    if (!client.connect(host, port, 6000))
    { // 5 second connection timeout
        Serial.println("[FaceDetectionSender] ✗ Connection failed");
        Serial.println("[FaceDetectionSender] ☛ Timed out with image, attempting fallback without image...");
        sendFaceDetectionJson(event);
        stats.totalFailed++;
        faceDetectionUploadInProgress = false;
        return;
    }

    Serial.println("[FaceDetectionSender] ✓ Connected");

    // Disable Nagle's algorithm for faster transmission (must be after connect)
    client.setNoDelay(true);

    char boundary[40];
    snprintf(boundary, sizeof(boundary), "----ESP32Boundary%lu", millis());

    // Build form data (fixed buffer, no heap)
    char formData[640];
    size_t formLen = snprintf(formData, sizeof(formData),
                              "--%s\r\n"
                              "Content-Disposition: form-data; name=\"device_id\"\r\n\r\n"
                              "%s\r\n"
                              "--%s\r\n"
                              "Content-Disposition: form-data; name=\"recognized\"\r\n\r\n"
                              "%s\r\n"
                              "--%s\r\n"
                              "Content-Disposition: form-data; name=\"name\"\r\n\r\n"
                              "%s\r\n"
                              "--%s\r\n"
                              "Content-Disposition: form-data; name=\"confidence\"\r\n\r\n"
                              "%.2f\r\n"
                              "--%s\r\n"
                              "Content-Disposition: form-data; name=\"timestamp\"\r\n\r\n"
                              "%lu\r\n",
                              boundary, DEVICE_ID,
                              boundary, event->recognized ? "true" : "false",
                              boundary, event->name,
                              boundary, event->confidence,
                              boundary, event->timestamp);

    // Image header
    char imageHeader[192];
    size_t imageHeaderLen = 0;
    if (event->imageData != nullptr && event->imageSize > 0)
    {
        imageHeaderLen = snprintf(imageHeader, sizeof(imageHeader),
                                  "--%s\r\n"
                                  "Content-Disposition: form-data; name=\"image\"; filename=\"face.jpg\"\r\n"
                                  "Content-Type: image/jpeg\r\n\r\n",
                                  boundary);
    }
    else
    {
        imageHeader[0] = '\0';
    }

    char footer[48];
    size_t footerLen = snprintf(footer, sizeof(footer), "--%s--\r\n", boundary);

    // The +2 is the CRLF written after the image bytes - only counted when an
    // image is actually sent, otherwise the declared length overshoots by 2 and
    // the server blocks waiting for bytes that never arrive.
    size_t contentLength = formLen + imageHeaderLen + event->imageSize + footerLen;
    if (event->imageData != nullptr && event->imageSize > 0)
    {
        contentLength += 2;
    }

    // Send HTTP headers
    Serial.printf("[FaceDetectionSender] Sending headers (Content-Length: %u)\n", contentLength);
    char multipartType[80];
    snprintf(multipartType, sizeof(multipartType), "multipart/form-data; boundary=%s", boundary);
    sendRequestHeaders(client, path, host, multipartType, contentLength);

    // Send form data
    Serial.printf("[FaceDetectionSender] Sending form data (%u bytes)\n", formLen);
    client.print(formData);

    // Send image in chunks
    if (event->imageData != nullptr && event->imageSize > 0)
    {
        client.print(imageHeader);

        const size_t CHUNK_SIZE = 512;
        size_t sent = 0;

        Serial.printf("[FaceDetectionSender] Sending %u bytes\n", event->imageSize);

        int writeRetries = 0;
        while (sent < event->imageSize)
        {
            // Feed watchdog regularly during upload
            esp_task_wdt_reset();

            if (!client.connected())
            {
                Serial.printf("[FaceDetectionSender] ✗ Connection lost at %u/%u\n", sent, event->imageSize);
                stats.totalFailed++;
                client.flush();
                client.stop();
                delay(10); // Give WiFi stack time to clean up
                faceDetectionUploadInProgress = false;
                return;
            }

            size_t toSend = min(CHUNK_SIZE, event->imageSize - sent);
            size_t written = client.write(event->imageData + sent, toSend);

            if (written == 0)
            {
                // Socket buffer full (EAGAIN) - wait and retry
                writeRetries++;
                if (writeRetries > 10)
                {
                    Serial.printf("[FaceDetectionSender] ✗ Write timeout at %u/%u (buffer full)\n", sent, event->imageSize);
                    stats.totalFailed++;
                    client.flush();
                    client.stop();
                    delay(10);
                    faceDetectionUploadInProgress = false;
                    return;
                }
                Serial.println("[FaceDetectionSender] ⚠ Socket buffer full, retrying...");
                esp_task_wdt_reset();           // Feed watchdog during retry
                vTaskDelay(pdMS_TO_TICKS(100)); // Wait for buffer to drain
                continue;                       // Retry this chunk
            }

            if (written != toSend)
            {
                Serial.printf("[FaceDetectionSender] ✗ Partial write at %u/%u (wrote %u/%u)\n",
                              sent, event->imageSize, written, toSend);
                stats.totalFailed++;
                client.flush();
                client.stop();
                delay(10);
                faceDetectionUploadInProgress = false;
                return;
            }

            sent += written;
            writeRetries = 0; // Reset retry counter on success

            // Yield to other tasks while sending (removed flush - it blocks)
            if (sent < event->imageSize)
            {
                vTaskDelay(pdMS_TO_TICKS(10)); // Reduced delay for faster upload
            }

            if (sent % 2048 == 0)
            {
                Serial.printf("[FaceDetectionSender] Progress: %u/%u (%.1f%%)\n",
                              sent, event->imageSize, (sent * 100.0) / event->imageSize);
            }
        }

        client.print("\r\n");
        Serial.printf("[FaceDetectionSender] ✓ Image sent (%u bytes)\n", sent);
    }

    // Send footer
    client.print(footer);
    client.flush();

    Serial.printf("[FaceDetectionSender] ✓ Upload complete, waiting for response (connected: %d)\n", client.connected());

    // Wait for response
    unsigned long timeout = millis();
    while (client.available() == 0)
    {
        if (!client.connected())
        {
            Serial.println("[FaceDetectionSender] ✗ Server closed connection before response");
            stats.totalFailed++;
            client.flush();
            client.stop();
            delay(10);
            faceDetectionUploadInProgress = false;
            return;
        }
        if (millis() - timeout > 10000)
        { // 10 seconds timeout to prevent watchdog
            Serial.println("[FaceDetectionSender] ✗ Timeout waiting for response (10s)");
            stats.totalFailed++;
            client.flush();
            client.stop();
            delay(10); // Give stack time to clean up

            Serial.println("[FaceDetectionSender] ☛ Timed out with image, attempting fallback without image...");
            sendFaceDetectionJson(event);

            faceDetectionUploadInProgress = false;
            return;
        }
        esp_task_wdt_reset();           // Feed watchdog while waiting
        vTaskDelay(pdMS_TO_TICKS(100)); // Longer delay to reduce CPU usage
    }

    // Read response
    int httpCode = 0;
    bool headersEnd = false;

    while (client.available() && !headersEnd)
    {
        esp_task_wdt_reset(); // Feed watchdog while reading headers
        String line = client.readStringUntil('\n');
        if (line.startsWith("HTTP/1."))
        {
            int spaceIdx = line.indexOf(' ');
            if (spaceIdx > 0)
            {
                httpCode = line.substring(spaceIdx + 1, spaceIdx + 4).toInt();
            }
        }
        if (line == "\r" || line.length() == 0)
        {
            headersEnd = true;
        }
    }

    char responseBody[512];
    size_t responseLen = 0;
    while (client.available())
    {
        esp_task_wdt_reset(); // Feed watchdog while reading body
        int c = client.read();
        if (c != -1 && responseLen < sizeof(responseBody) - 1)
        {
            responseBody[responseLen++] = (char)c;
        }
        vTaskDelay(pdMS_TO_TICKS(1)); // Small yield to prevent CPU hogging
    }
    responseBody[responseLen] = '\0';

    // Explicit cleanup to prevent socket leaks
    client.flush();
    client.stop();
    delay(10); // Give WiFi stack time to clean up socket

    unsigned long duration = millis() - startTime;
    stats.lastSendDurationMs = duration;

    if (httpCode == 200)
    {
        Serial.printf("[FaceDetectionSender] ✓ Sent successfully in %lums (code: %d)\n", duration, httpCode);
        stats.totalSent++;

        StaticJsonDocument<512> responseDoc;
        DeserializationError error = deserializeJson(responseDoc, responseBody);
        if (!error && responseDoc.containsKey("event_id"))
        {
            const char *eventId = responseDoc["event_id"];
            Serial.printf("[FaceDetectionSender] → Event ID: %s\n", eventId);
        }
    }
    else
    {
        Serial.printf("[FaceDetectionSender] ✗ Failed (code: %d, duration: %lums)\n", httpCode, duration);
        Serial.printf("[FaceDetectionSender] Response: %s\n", responseBody);
        Serial.println("[FaceDetectionSender] attempting fallback without image...");
        sendFaceDetectionJson(event);
        stats.totalFailed++;
    }

    // Clear flag to resume other WiFi operations
    faceDetectionUploadInProgress = false;
}

// ============================================================================
// FreeRTOS Task: Process queued face detection events
// ============================================================================
static void faceDetectionTask(void *parameter)
{
    Serial.println("[FaceDetectionSender] Task started");

    FaceDetectionEvent event;

    while (true)
    {
        // Wait for events in queue (blocks task, not main loop)
        if (xQueueReceive(faceDetectionQueue, &event, portMAX_DELAY) == pdTRUE)
        {
            Serial.printf("[FaceDetectionSender] Processing event (recognized: %s, name: %s)\n",
                          event.recognized ? "Yes" : "No", event.name);

            // Send the event (this will block, but only this task)
            sendFaceDetectionBlocking(&event);

            // Free the image buffer after sending
            if (event.imageData != nullptr)
            {
                free(event.imageData);
                event.imageData = nullptr;
            }

            // Small delay before processing next event
            vTaskDelay(pdMS_TO_TICKS(100));
        }
    }
}

// ============================================================================
// Public API Implementation
// ============================================================================

void initFaceDetectionSender(uint32_t stackSize, UBaseType_t priority, BaseType_t coreId)
{
    if (faceDetectionQueue != NULL)
    {
        Serial.println("[FaceDetectionSender] Already initialized");
        return;
    }

    // Create queue (reduced to 1 to prevent piling up when backend is slow)
    faceDetectionQueue = xQueueCreate(1, sizeof(FaceDetectionEvent));
    if (faceDetectionQueue == NULL)
    {
        Serial.println("[FaceDetectionSender] ✗ Failed to create queue");
        return;
    }

    // Create task
    BaseType_t result = xTaskCreatePinnedToCore(
        faceDetectionTask,        // Task function
        "FaceDetectionSender",    // Task name
        stackSize,                // Stack size
        NULL,                     // Parameters
        priority,                 // Priority
        &faceDetectionTaskHandle, // Task handle
        coreId                    // Core ID
    );

    if (result != pdPASS)
    {
        Serial.println("[FaceDetectionSender] ✗ Failed to create task");
        vQueueDelete(faceDetectionQueue);
        faceDetectionQueue = NULL;
        return;
    }

    Serial.printf("[FaceDetectionSender] ✓ Initialized (Core %d, Stack: %u, Priority: %u)\n",
                  coreId, stackSize, priority);
}

bool queueFaceDetection(bool recognized, const char *name, float confidence,
                        const uint8_t *imageData, size_t imageSize)
{
    if (faceDetectionQueue == NULL)
    {
        Serial.println("[FaceDetectionSender] Not initialized!");
        return false;
    }

    if (imageSize > MAX_FACE_IMAGE_SIZE)
    {
        Serial.printf("[FaceDetectionSender] ⚠ Image too large (%u bytes, max %u), queueing metadata only\n",
                      imageSize, MAX_FACE_IMAGE_SIZE);
        imageData = nullptr;
        imageSize = 0;
    }

    FaceDetectionEvent event;
    event.recognized = recognized;
    strncpy(event.name, name, sizeof(event.name) - 1);
    event.name[sizeof(event.name) - 1] = '\0';
    event.confidence = confidence;
    event.timestamp = millis();

    // Copy image data to heap (freed after sending)
    if (imageData != nullptr && imageSize > 0)
    {
        // Memory pressure check: Skip if heap is low
        size_t freeHeap = ESP.getFreeHeap();
        size_t largestBlock = ESP.getMaxAllocHeap();
        const size_t MIN_FREE_HEAP = 20000; // Require 20KB free minimum

        if (freeHeap < MIN_FREE_HEAP || largestBlock < imageSize)
        {
            Serial.printf("[FaceDetectionSender] ⚠ Low memory for image (free: %u, largest: %u, need: %u), queueing metadata only\n",
                          freeHeap, largestBlock, imageSize);
            event.imageData = nullptr;
            event.imageSize = 0;
        }
        else
        {
            event.imageData = (uint8_t *)malloc(imageSize);
            if (event.imageData == NULL)
            {
                Serial.printf("[FaceDetectionSender] ⚠ Failed to allocate %u bytes (free heap: %u, largest block: %u), queueing metadata only\n",
                              imageSize, freeHeap, largestBlock);
                event.imageData = nullptr;
                event.imageSize = 0;
            }
            else
            {
                memcpy(event.imageData, imageData, imageSize);
                event.imageSize = imageSize;
                Serial.printf("[FaceDetectionSender] ✓ Allocated %u bytes (free: %u → %u)\n",
                              imageSize, freeHeap, ESP.getFreeHeap());
            }
        }
    }
    else
    {
        event.imageData = nullptr;
        event.imageSize = 0;
    }

    // Try to queue (don't block if queue is full)
    if (xQueueSend(faceDetectionQueue, &event, 0) != pdTRUE)
    {
        Serial.println("[FaceDetectionSender] ✗ Queue full, dropping event");
        if (event.imageData != nullptr)
        {
            free(event.imageData);
        }
        stats.queueOverflows++;
        return false;
    }

    stats.totalQueued++;
    Serial.printf("[FaceDetectionSender] ✓ Queued event (%u in queue)\n", uxQueueMessagesWaiting(faceDetectionQueue));
    return true;
}

int getPendingFaceDetectionCount()
{
    if (faceDetectionQueue == NULL)
    {
        return 0;
    }
    return uxQueueMessagesWaiting(faceDetectionQueue);
}

FaceDetectionStats getFaceDetectionStats()
{
    return stats;
}
