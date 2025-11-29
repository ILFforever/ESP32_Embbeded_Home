/**
 * Arduino WebSockets backend stream implementation
 * This works where ESP-IDF websocket client fails!
 */

#include "backend_stream.hpp"
#include <Arduino.h>
#include <WiFi.h>
#include <ArduinoWebsockets.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"
#include "esp_log.h"

using namespace websockets;

namespace backend_stream {

static const char *TAG = "BackendStreamWS";

// Queue handles
static QueueHandle_t camera_queue = nullptr;
static QueueHandle_t audio_queue = nullptr;

// Task handles
static TaskHandle_t camera_task_handle = nullptr;
static TaskHandle_t audio_task_handle = nullptr;
static TaskHandle_t ws_task_handle = nullptr;

// WebSocket client
static WebsocketsClient ws_client;
static bool ws_connected = false;

// Streaming state
static bool camera_streaming_active = false;
static bool audio_streaming_active = false;

// Statistics
static StreamStats stats = {0};

// Frame rate limiting
static uint32_t last_frame_sent_time = 0;
static const uint32_t FRAME_INTERVAL_MS = 150;  // 10 FPS

// ============================================================================
// WebSocket Callbacks
// ============================================================================

void onMessageCallback(WebsocketsMessage message) {
    ESP_LOGI(TAG, "Received message: %s", message.data().c_str());
}

void onEventsCallback(WebsocketsEvent event, String data) {
    switch(event) {
        case WebsocketsEvent::ConnectionOpened:
            ESP_LOGI(TAG, "✓ WebSocket Connected!");
            ws_connected = true;

            // Send authentication message
            {
                char auth_msg[256];
                snprintf(auth_msg, sizeof(auth_msg),
                    "{\"type\":\"auth\",\"device_id\":\"%s\",\"token\":\"%s\"}",
                    DEVICE_ID, API_TOKEN);

                ESP_LOGI(TAG, "Sending auth: %s", auth_msg);
                ws_client.send(auth_msg);
            }
            break;

        case WebsocketsEvent::ConnectionClosed:
            ESP_LOGW(TAG, "✗ WebSocket Disconnected!");
            ws_connected = false;
            break;

        case WebsocketsEvent::GotPing:
            ESP_LOGD(TAG, "Got Ping");
            break;

        case WebsocketsEvent::GotPong:
            ESP_LOGD(TAG, "Got Pong");
            break;
    }
}

// ============================================================================
// WebSocket Task
// ============================================================================

static void ws_poll_task(void* param) {
    ESP_LOGI(TAG, "WebSocket poll task started");

    while(true) {
        if(ws_client.available()) {
            ws_client.poll();
        }

        // Try to reconnect if disconnected
        if(!ws_connected) {
            vTaskDelay(pdMS_TO_TICKS(5000));  // Wait before reconnect

            char ws_url[256];
            snprintf(ws_url, sizeof(ws_url), "ws://%s:%d/ws/stream",
                     BACKEND_SERVER_HOST, BACKEND_SERVER_PORT);

            ESP_LOGI(TAG, "Attempting reconnect to %s", ws_url);
            ws_client.connect(ws_url);
        }

        vTaskDelay(pdMS_TO_TICKS(10));
    }
}

// ============================================================================
// Send Functions
// ============================================================================

static esp_err_t send_camera_frame_ws(CameraFrame* frame) {
    if (!ws_connected) {
        ESP_LOGW(TAG, "WebSocket not connected, dropping frame");
        stats.camera_frames_failed++;
        return ESP_FAIL;
    }

    uint32_t start_time = xTaskGetTickCount() * portTICK_PERIOD_MS;

    // Create binary message: [type(1)][frame_id(2)][timestamp(4)][jpeg_data...]
    size_t msg_size = 7 + frame->size;
    uint8_t* msg_buffer = (uint8_t*)malloc(msg_size);

    if (msg_buffer == nullptr) {
        ESP_LOGE(TAG, "Failed to allocate message buffer");
        stats.camera_frames_failed++;
        return ESP_FAIL;
    }

    // Pack header
    msg_buffer[0] = 0x01;  // Type: Camera
    msg_buffer[1] = (frame->frame_id >> 8) & 0xFF;
    msg_buffer[2] = frame->frame_id & 0xFF;
    msg_buffer[3] = (frame->timestamp >> 24) & 0xFF;
    msg_buffer[4] = (frame->timestamp >> 16) & 0xFF;
    msg_buffer[5] = (frame->timestamp >> 8) & 0xFF;
    msg_buffer[6] = frame->timestamp & 0xFF;

    // Copy JPEG data
    memcpy(msg_buffer + 7, frame->data, frame->size);

    // Send binary frame
    ws_client.sendBinary((const char*)msg_buffer, msg_size);

    free(msg_buffer);

    uint32_t total_duration = (xTaskGetTickCount() * portTICK_PERIOD_MS) - start_time;
    stats.last_send_duration_ms = total_duration;
    stats.camera_frames_sent++;

    if (stats.camera_frames_sent % 10 == 0) {
        ESP_LOGI(TAG, "Frame %u sent: %zu bytes in %lums",
                 frame->frame_id, msg_size, total_duration);
    }

    return ESP_OK;
}

static esp_err_t send_audio_chunk_ws(AudioChunk* chunk) {
    if (!ws_connected) {
        stats.audio_chunks_failed++;
        return ESP_FAIL;
    }

    // Create binary message
    size_t msg_size = 7 + chunk->size;
    uint8_t* msg_buffer = (uint8_t*)malloc(msg_size);

    if (msg_buffer == nullptr) {
        ESP_LOGE(TAG, "Failed to allocate audio buffer");
        stats.audio_chunks_failed++;
        return ESP_FAIL;
    }

    // Pack header
    msg_buffer[0] = 0x02;  // Type: Audio
    msg_buffer[1] = (chunk->sequence >> 8) & 0xFF;
    msg_buffer[2] = chunk->sequence & 0xFF;
    msg_buffer[3] = (chunk->timestamp >> 24) & 0xFF;
    msg_buffer[4] = (chunk->timestamp >> 16) & 0xFF;
    msg_buffer[5] = (chunk->timestamp >> 8) & 0xFF;
    msg_buffer[6] = chunk->timestamp & 0xFF;

    // Copy audio data
    memcpy(msg_buffer + 7, chunk->data, chunk->size);

    // Send binary frame
    ws_client.sendBinary((const char*)msg_buffer, msg_size);

    free(msg_buffer);

    stats.audio_chunks_sent++;

    if (stats.audio_chunks_sent % 50 == 0) {
        ESP_LOGI(TAG, "Audio chunk %lu sent: %zu bytes",
                 (unsigned long)chunk->sequence, msg_size);
    }

    return ESP_OK;
}

// ============================================================================
// Stream Tasks
// ============================================================================

static void camera_stream_task(void* param) {
    ESP_LOGI(TAG, "Camera stream task started");

    CameraFrame frame;

    while (true) {
        if (xQueueReceive(camera_queue, &frame, portMAX_DELAY) == pdTRUE) {
            if (camera_streaming_active && ws_connected) {
                send_camera_frame_ws(&frame);
            }

            if (frame.data != nullptr) {
                free(frame.data);
            }

            vTaskDelay(pdMS_TO_TICKS(10));
        }
    }
}

static void audio_stream_task(void* param) {
    ESP_LOGI(TAG, "Audio stream task started");

    AudioChunk chunk;

    while (true) {
        if (xQueueReceive(audio_queue, &chunk, portMAX_DELAY) == pdTRUE) {
            if (audio_streaming_active && ws_connected) {
                send_audio_chunk_ws(&chunk);
            }

            if (chunk.data != nullptr) {
                free(chunk.data);
            }

            vTaskDelay(pdMS_TO_TICKS(5));
        }
    }
}

// ============================================================================
// Public API
// ============================================================================

esp_err_t init() {
    if (camera_queue != nullptr) {
        ESP_LOGW(TAG, "Already initialized");
        return ESP_OK;
    }

    // Build WebSocket URL
    char ws_url[256];
    snprintf(ws_url, sizeof(ws_url), "ws://%s:%d/ws/stream",
             BACKEND_SERVER_HOST, BACKEND_SERVER_PORT);

    ESP_LOGI(TAG, "Connecting to: %s", ws_url);

    // Set callbacks
    ws_client.onMessage(onMessageCallback);
    ws_client.onEvent(onEventsCallback);

    // Add headers
    ws_client.addHeader("Origin", String("http://") + String(BACKEND_SERVER_HOST));

    // Connect - This will be handled by the poll task
    // bool connected = ws_client.connect(ws_url);

    // if(connected) {
    //     ESP_LOGI(TAG, "✓ WebSocket connection initiated!");
    // } else {
    //     ESP_LOGW(TAG, "✗ Initial connection failed, will retry");
    // }

    // Create queues
    camera_queue = xQueueCreate(5, sizeof(CameraFrame));
    audio_queue = xQueueCreate(15, sizeof(AudioChunk));

    if (camera_queue == nullptr || audio_queue == nullptr) {
        ESP_LOGE(TAG, "Failed to create queues");
        return ESP_FAIL;
    }

    // Create WebSocket poll task
    BaseType_t ret = xTaskCreatePinnedToCore(
        ws_poll_task,
        "ws_poll",
        8192,
        nullptr,
        5,  // High priority
        &ws_task_handle,
        0
    );

    if (ret != pdPASS) {
        ESP_LOGE(TAG, "Failed to create ws_poll task");
        return ESP_FAIL;
    }

    // Create camera streaming task
    ret = xTaskCreatePinnedToCore(
        camera_stream_task,
        "ws_camera",
        10240,
        nullptr,
        4,
        &camera_task_handle,
        0
    );

    if (ret != pdPASS) {
        ESP_LOGE(TAG, "Failed to create camera stream task");
        return ESP_FAIL;
    }

    // Create audio streaming task
    ret = xTaskCreatePinnedToCore(
        audio_stream_task,
        "ws_audio",
        8192,
        nullptr,
        4,
        &audio_task_handle,
        0
    );

    if (ret != pdPASS) {
        ESP_LOGE(TAG, "Failed to create audio stream task");
        return ESP_FAIL;
    }

    ESP_LOGI(TAG, "WebSocket streaming initialized");

    return ESP_OK;
}

bool is_initialized() {
    return camera_queue != nullptr;
}

void start_camera_streaming() {
    camera_streaming_active = true;
    last_frame_sent_time = 0;
    ESP_LOGI(TAG, "Camera streaming started");
}

void stop_camera_streaming() {
    camera_streaming_active = false;
    ESP_LOGI(TAG, "Camera streaming stopped");
}

bool is_camera_streaming() {
    return camera_streaming_active && ws_connected;
}

void start_audio_streaming() {
    audio_streaming_active = true;
    ESP_LOGI(TAG, "Audio streaming started");
}

void stop_audio_streaming() {
    audio_streaming_active = false;
    ESP_LOGI(TAG, "Audio streaming stopped");
}

bool is_audio_streaming() {
    return audio_streaming_active && ws_connected;
}

esp_err_t queue_camera_frame(const uint8_t* jpeg_data, size_t jpeg_size, uint16_t frame_id) {
    if (camera_queue == nullptr || !camera_streaming_active) {
        return ESP_FAIL;
    }

    if (jpeg_size > MAX_FRAME_SIZE) {
        ESP_LOGW(TAG, "Frame too large: %zu bytes", jpeg_size);
        return ESP_FAIL;
    }

    // Rate limiting
    uint32_t now = xTaskGetTickCount() * portTICK_PERIOD_MS;
    if (last_frame_sent_time > 0 && (now - last_frame_sent_time) < FRAME_INTERVAL_MS) {
        return ESP_FAIL;  // Drop frame
    }

    CameraFrame frame;
    frame.frame_id = frame_id;
    frame.timestamp = now;
    frame.size = jpeg_size;

    // Allocate and copy frame data
    frame.data = (uint8_t*)malloc(jpeg_size);
    if (frame.data == nullptr) {
        ESP_LOGE(TAG, "Failed to allocate frame buffer");
        return ESP_FAIL;
    }
    memcpy(frame.data, jpeg_data, jpeg_size);

    // Try to queue
    if (xQueueSend(camera_queue, &frame, 0) != pdTRUE) {
        ESP_LOGW(TAG, "Camera queue full, dropping frame");
        free(frame.data);
        stats.camera_queue_overflows++;
        return ESP_FAIL;
    }

    last_frame_sent_time = now;
    return ESP_OK;
}

esp_err_t queue_audio_chunk(const uint8_t* audio_data, size_t audio_size, uint32_t sequence) {
    if (audio_queue == nullptr || !audio_streaming_active) {
        return ESP_FAIL;
    }

    if (audio_size > MAX_AUDIO_CHUNK_SIZE) {
        ESP_LOGW(TAG, "Audio chunk too large: %zu bytes", audio_size);
        return ESP_FAIL;
    }

    AudioChunk chunk;
    chunk.sequence = sequence;
    chunk.timestamp = xTaskGetTickCount() * portTICK_PERIOD_MS;
    chunk.size = audio_size;

    // Allocate and copy audio data
    chunk.data = (uint8_t*)malloc(audio_size);
    if (chunk.data == nullptr) {
        ESP_LOGE(TAG, "Failed to allocate audio buffer");
        return ESP_FAIL;
    }
    memcpy(chunk.data, audio_data, audio_size);

    // Try to queue
    if (xQueueSend(audio_queue, &chunk, 0) != pdTRUE) {
        ESP_LOGW(TAG, "Audio queue full, dropping chunk");
        free(chunk.data);
        stats.audio_queue_overflows++;
        return ESP_FAIL;
    }

    return ESP_OK;
}

StreamStats get_stats() {
    return stats;
}

void cleanup() {
    stop_camera_streaming();
    stop_audio_streaming();

    ws_client.close();

    if (ws_task_handle != nullptr) {
        vTaskDelete(ws_task_handle);
        ws_task_handle = nullptr;
    }

    if (camera_task_handle != nullptr) {
        vTaskDelete(camera_task_handle);
        camera_task_handle = nullptr;
    }

    if (audio_task_handle != nullptr) {
        vTaskDelete(audio_task_handle);
        audio_task_handle = nullptr;
    }

    if (camera_queue != nullptr) {
        vQueueDelete(camera_queue);
        camera_queue = nullptr;
    }

    if (audio_queue != nullptr) {
        vQueueDelete(audio_queue);
        audio_queue = nullptr;
    }

    ESP_LOGI(TAG, "WebSocket streaming cleaned up");
}

} // namespace backend_stream
