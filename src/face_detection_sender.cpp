#include "face_detection_sender.h"
#include <WiFi.h>
#include <ArduinoJson.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"

// External backend configuration from heartbeat.h
extern const char* BACKEND_SERVER_URL;
extern const char* DEVICE_ID;
extern const char* DEVICE_API_TOKEN;

// Queue and task handles
static QueueHandle_t faceDetectionQueue = NULL;
static TaskHandle_t faceDetectionTaskHandle = NULL;

// Statistics
static FaceDetectionStats stats = {0, 0, 0, 0, 0};

// ============================================================================
// Internal: Send face detection event (blocking, but runs in dedicated task)
// ============================================================================
static void sendFaceDetectionBlocking(FaceDetectionEvent* event) {
    unsigned long startTime = millis();

    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[FaceDetectionSender] WiFi not connected - skipping");
        stats.totalFailed++;
        return;
    }

    // Parse backend URL
    String serverUrl = String(BACKEND_SERVER_URL);
    serverUrl.replace("http://", "");
    serverUrl.replace("https://", "");

    int colonIdx = serverUrl.indexOf(':');
    int slashIdx = serverUrl.indexOf('/');

    String host = (colonIdx > 0) ? serverUrl.substring(0, colonIdx) :
                  (slashIdx > 0) ? serverUrl.substring(0, slashIdx) : serverUrl;
    int port = (colonIdx > 0) ? serverUrl.substring(colonIdx + 1, (slashIdx > 0) ? slashIdx : serverUrl.length()).toInt() : 80;
    String path = (slashIdx > 0) ? serverUrl.substring(slashIdx) : "";

    if (path.length() == 0 || path == "/") {
        path = "/api/v1/devices/doorbell/face-detection";
    } else if (path.endsWith("/")) {
        path += "api/v1/devices/doorbell/face-detection";
    } else {
        path += "/api/v1/devices/doorbell/face-detection";
    }

    Serial.printf("[FaceDetectionSender] Connecting to %s:%d%s\n", host.c_str(), port, path.c_str());

    WiFiClient client;

    if (!client.connect(host.c_str(), port)) {
        Serial.println("[FaceDetectionSender] ✗ Connection failed");
        stats.totalFailed++;
        return;
    }

    Serial.println("[FaceDetectionSender] ✓ Connected");

    // Disable Nagle's algorithm for faster transmission (must be after connect)
    client.setNoDelay(true);

    String boundary = "----ESP32Boundary" + String(millis());

    // Build form data
    String formData = "";
    formData += "--" + boundary + "\r\n";
    formData += "Content-Disposition: form-data; name=\"device_id\"\r\n\r\n";
    formData += String(DEVICE_ID) + "\r\n";

    formData += "--" + boundary + "\r\n";
    formData += "Content-Disposition: form-data; name=\"recognized\"\r\n\r\n";
    formData += String(event->recognized ? "true" : "false") + "\r\n";

    formData += "--" + boundary + "\r\n";
    formData += "Content-Disposition: form-data; name=\"name\"\r\n\r\n";
    formData += String(event->name) + "\r\n";

    formData += "--" + boundary + "\r\n";
    formData += "Content-Disposition: form-data; name=\"confidence\"\r\n\r\n";
    formData += String(event->confidence, 2) + "\r\n";

    formData += "--" + boundary + "\r\n";
    formData += "Content-Disposition: form-data; name=\"timestamp\"\r\n\r\n";
    formData += String(event->timestamp) + "\r\n";

    // Image header
    String imageHeader = "";
    if (event->imageData != nullptr && event->imageSize > 0) {
        imageHeader += "--" + boundary + "\r\n";
        imageHeader += "Content-Disposition: form-data; name=\"image\"; filename=\"face.jpg\"\r\n";
        imageHeader += "Content-Type: image/jpeg\r\n\r\n";
    }

    String footer = "--" + boundary + "--\r\n";

    size_t contentLength = formData.length() + imageHeader.length() + event->imageSize + 2 + footer.length();

    // Send HTTP headers
    client.print("POST " + path + " HTTP/1.1\r\n");
    client.print("Host: " + host + "\r\n");
    client.print("Content-Type: multipart/form-data; boundary=" + boundary + "\r\n");
    client.print("Content-Length: " + String(contentLength) + "\r\n");
    if (DEVICE_API_TOKEN && strlen(DEVICE_API_TOKEN) > 0) {
        client.print("Authorization: Bearer " + String(DEVICE_API_TOKEN) + "\r\n");
    }
    client.print("Connection: close\r\n\r\n");

    // Send form data
    client.print(formData);

    // Send image in chunks
    if (event->imageData != nullptr && event->imageSize > 0) {
        client.print(imageHeader);

        const size_t CHUNK_SIZE = 512;
        size_t sent = 0;

        Serial.printf("[FaceDetectionSender] Sending %u bytes\n", event->imageSize);

        while (sent < event->imageSize) {
            if (!client.connected()) {
                Serial.printf("[FaceDetectionSender] ✗ Connection lost at %u/%u\n", sent, event->imageSize);
                stats.totalFailed++;
                client.stop();
                return;
            }

            size_t toSend = min(CHUNK_SIZE, event->imageSize - sent);
            size_t written = client.write(event->imageData + sent, toSend);

            if (written != toSend) {
                Serial.printf("[FaceDetectionSender] ✗ Write failed at %u/%u\n", sent, event->imageSize);
                stats.totalFailed++;
                client.stop();
                return;
            }

            sent += written;
            client.flush();

            // Yield to other tasks while sending
            if (sent < event->imageSize) {
                vTaskDelay(pdMS_TO_TICKS(50));  // Use FreeRTOS delay instead of Arduino delay
            }

            if (sent % 2048 == 0) {
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

    // Wait for response
    unsigned long timeout = millis();
    while (client.available() == 0) {
        if (millis() - timeout > 15000) {
            Serial.println("[FaceDetectionSender] ✗ Timeout");
            stats.totalFailed++;
            client.stop();
            return;
        }
        vTaskDelay(pdMS_TO_TICKS(10));  // Use FreeRTOS delay
    }

    // Read response
    int httpCode = 0;
    bool headersEnd = false;

    while (client.available() && !headersEnd) {
        String line = client.readStringUntil('\n');
        if (line.startsWith("HTTP/1.")) {
            int spaceIdx = line.indexOf(' ');
            if (spaceIdx > 0) {
                httpCode = line.substring(spaceIdx + 1, spaceIdx + 4).toInt();
            }
        }
        if (line == "\r" || line.length() == 0) {
            headersEnd = true;
        }
    }

    String responseBody = "";
    while (client.available()) {
        responseBody += client.readString();
    }

    client.stop();

    unsigned long duration = millis() - startTime;
    stats.lastSendDurationMs = duration;

    if (httpCode == 200) {
        Serial.printf("[FaceDetectionSender] ✓ Sent successfully in %lums (code: %d)\n", duration, httpCode);
        stats.totalSent++;

        StaticJsonDocument<1024> responseDoc;
        DeserializationError error = deserializeJson(responseDoc, responseBody);
        if (!error && responseDoc.containsKey("event_id")) {
            const char* eventId = responseDoc["event_id"];
            Serial.printf("[FaceDetectionSender] → Event ID: %s\n", eventId);
        }
    } else {
        Serial.printf("[FaceDetectionSender] ✗ Failed (code: %d, duration: %lums)\n", httpCode, duration);
        Serial.printf("[FaceDetectionSender] Response: %s\n", responseBody.c_str());
        stats.totalFailed++;
    }
}

// ============================================================================
// FreeRTOS Task: Process queued face detection events
// ============================================================================
static void faceDetectionTask(void* parameter) {
    Serial.println("[FaceDetectionSender] Task started");

    FaceDetectionEvent event;

    while (true) {
        // Wait for events in queue (blocks task, not main loop)
        if (xQueueReceive(faceDetectionQueue, &event, portMAX_DELAY) == pdTRUE) {
            Serial.printf("[FaceDetectionSender] Processing event (recognized: %s, name: %s)\n",
                          event.recognized ? "Yes" : "No", event.name);

            // Send the event (this will block, but only this task)
            sendFaceDetectionBlocking(&event);

            // Free the image buffer after sending
            if (event.imageData != nullptr) {
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

void initFaceDetectionSender(uint32_t stackSize, UBaseType_t priority, BaseType_t coreId) {
    if (faceDetectionQueue != NULL) {
        Serial.println("[FaceDetectionSender] Already initialized");
        return;
    }

    // Create queue (holds up to 3 events)
    faceDetectionQueue = xQueueCreate(3, sizeof(FaceDetectionEvent));
    if (faceDetectionQueue == NULL) {
        Serial.println("[FaceDetectionSender] ✗ Failed to create queue");
        return;
    }

    // Create task
    BaseType_t result = xTaskCreatePinnedToCore(
        faceDetectionTask,          // Task function
        "FaceDetectionSender",      // Task name
        stackSize,                  // Stack size
        NULL,                       // Parameters
        priority,                   // Priority
        &faceDetectionTaskHandle,   // Task handle
        coreId                      // Core ID
    );

    if (result != pdPASS) {
        Serial.println("[FaceDetectionSender] ✗ Failed to create task");
        vQueueDelete(faceDetectionQueue);
        faceDetectionQueue = NULL;
        return;
    }

    Serial.printf("[FaceDetectionSender] ✓ Initialized (Core %d, Stack: %u, Priority: %u)\n",
                  coreId, stackSize, priority);
}

bool queueFaceDetection(bool recognized, const char* name, float confidence,
                        const uint8_t* imageData, size_t imageSize) {
    if (faceDetectionQueue == NULL) {
        Serial.println("[FaceDetectionSender] Not initialized!");
        return false;
    }

    if (imageSize > MAX_FACE_IMAGE_SIZE) {
        Serial.printf("[FaceDetectionSender] ✗ Image too large (%u bytes, max %u)\n",
                      imageSize, MAX_FACE_IMAGE_SIZE);
        return false;
    }

    FaceDetectionEvent event;
    event.recognized = recognized;
    strncpy(event.name, name, sizeof(event.name) - 1);
    event.name[sizeof(event.name) - 1] = '\0';
    event.confidence = confidence;
    event.timestamp = millis();

    // Copy image data to heap (freed after sending)
    if (imageData != nullptr && imageSize > 0) {
        event.imageData = (uint8_t*)malloc(imageSize);
        if (event.imageData == NULL) {
            Serial.println("[FaceDetectionSender] ✗ Failed to allocate image buffer");
            return false;
        }
        memcpy(event.imageData, imageData, imageSize);
        event.imageSize = imageSize;
    } else {
        event.imageData = nullptr;
        event.imageSize = 0;
    }

    // Try to queue (don't block if queue is full)
    if (xQueueSend(faceDetectionQueue, &event, 0) != pdTRUE) {
        Serial.println("[FaceDetectionSender] ✗ Queue full, dropping event");
        if (event.imageData != nullptr) {
            free(event.imageData);
        }
        stats.queueOverflows++;
        return false;
    }

    stats.totalQueued++;
    Serial.printf("[FaceDetectionSender] ✓ Queued event (%u in queue)\n", uxQueueMessagesWaiting(faceDetectionQueue));
    return true;
}

int getPendingFaceDetectionCount() {
    if (faceDetectionQueue == NULL) {
        return 0;
    }
    return uxQueueMessagesWaiting(faceDetectionQueue);
}

FaceDetectionStats getFaceDetectionStats() {
    return stats;
}
