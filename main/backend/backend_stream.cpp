#include "backend_stream.hpp"
#include "esp_log.h"
#include "esp_http_client.h"
#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"
#include <cstring>
#include <cstdlib>

namespace backend_stream {

static const char *TAG = "BackendStream";

// Queue handles
static QueueHandle_t camera_queue = nullptr;
static QueueHandle_t audio_queue = nullptr;

// Task handles
static TaskHandle_t camera_task_handle = nullptr;
static TaskHandle_t audio_task_handle = nullptr;

// Streaming state
static bool camera_streaming_active = false;
static bool audio_streaming_active = false;

// Statistics
static StreamStats stats = {0};

// Frame rate limiting for camera
static uint32_t last_frame_sent_time = 0;
static const uint32_t FRAME_INTERVAL_MS = 200;  // 5 FPS

// Persistent HTTP client for camera streaming (keep-alive)
static esp_http_client_handle_t persistent_camera_client = nullptr;

// ============================================================================
// Internal: Get or create persistent HTTP client for camera
// ============================================================================
static esp_http_client_handle_t get_camera_http_client() {
    if (persistent_camera_client != nullptr) {
        // Client already exists, reuse it
        return persistent_camera_client;
    }

    // Create new persistent client
    char url[256];
    snprintf(url, sizeof(url), "http://%s:%d/api/v1/devices/%s/stream/camera",
             BACKEND_SERVER_HOST, BACKEND_SERVER_PORT, DEVICE_ID);

    esp_http_client_config_t config = {};
    config.url = url;
    config.method = HTTP_METHOD_POST;
    config.timeout_ms = 5000;
    config.keep_alive_enable = true;
    config.keep_alive_idle = 5;
    config.keep_alive_interval = 5;
    config.keep_alive_count = 3;

    persistent_camera_client = esp_http_client_init(&config);
    ESP_LOGI(TAG, "Created persistent HTTP client for camera streaming");

    return persistent_camera_client;
}

// ============================================================================
// Internal: Check WiFi connectivity
// ============================================================================
static bool check_wifi_connected() {
    wifi_ap_record_t ap_info;
    esp_err_t ret = esp_wifi_sta_get_ap_info(&ap_info);

    if (ret == ESP_OK) {
        ESP_LOGI(TAG, "WiFi connected to: %s, RSSI: %d", ap_info.ssid, ap_info.rssi);
        return true;
    } else {
        ESP_LOGE(TAG, "WiFi NOT connected! Error: %s", esp_err_to_name(ret));
        return false;
    }
}

// ============================================================================
// Internal: Send camera frame to backend
// ============================================================================
static esp_err_t send_camera_frame_blocking(CameraFrame* frame) {
    // Check WiFi first
    if (!check_wifi_connected()) {
        ESP_LOGE(TAG, "Cannot send frame - WiFi not connected");
        stats.camera_frames_failed++;
        return ESP_FAIL;
    }

    uint32_t start_time = xTaskGetTickCount() * portTICK_PERIOD_MS;

    // Build URL with device-specific path
    char url[256];
    snprintf(url, sizeof(url), "http://%s:%d/api/v1/devices/%s/stream/camera",
             BACKEND_SERVER_HOST, BACKEND_SERVER_PORT, DEVICE_ID);

    // Debug: Log connection details
    ESP_LOGI(TAG, "=== Camera Frame Upload ===");
    ESP_LOGI(TAG, "URL: %s", url);
    ESP_LOGI(TAG, "Frame ID: %u, Size: %zu bytes", frame->frame_id, frame->size);
    ESP_LOGI(TAG, "Backend: %s:%d", BACKEND_SERVER_HOST, BACKEND_SERVER_PORT);

    // Create boundary for multipart
    char boundary[64];
    snprintf(boundary, sizeof(boundary), "----ESP32CameraFrame%lu", (unsigned long)frame->timestamp);

    // Build multipart form data header
    char form_header[512];
    int header_len = snprintf(form_header, sizeof(form_header),
        "--%s\r\n"
        "Content-Disposition: form-data; name=\"device_id\"\r\n\r\n"
        "%s\r\n"
        "--%s\r\n"
        "Content-Disposition: form-data; name=\"frame_id\"\r\n\r\n"
        "%u\r\n"
        "--%s\r\n"
        "Content-Disposition: form-data; name=\"timestamp\"\r\n\r\n"
        "%lu\r\n"
        "--%s\r\n"
        "Content-Disposition: form-data; name=\"frame\"; filename=\"frame.jpg\"\r\n"
        "Content-Type: image/jpeg\r\n\r\n",
        boundary, DEVICE_ID,
        boundary, frame->frame_id,
        boundary, (unsigned long)frame->timestamp,
        boundary);

    // Build footer
    char form_footer[128];
    int footer_len = snprintf(form_footer, sizeof(form_footer), "\r\n--%s--\r\n", boundary);

    // Calculate total content length
    size_t content_length = header_len + frame->size + footer_len;
    ESP_LOGI(TAG, "Content-Length: %zu bytes (header:%d + frame:%zu + footer:%d)",
             content_length, header_len, frame->size, footer_len);

    // Configure HTTP client with keep-alive
    esp_http_client_config_t config = {};
    config.url = url;
    config.method = HTTP_METHOD_POST;
    config.timeout_ms = 5000;
    config.keep_alive_enable = true;      // Reuse connection
    config.keep_alive_idle = 5;           // Keep alive for 5 seconds
    config.keep_alive_interval = 5;       // Ping every 5 seconds
    config.keep_alive_count = 3;          // Max 3 retries

    ESP_LOGI(TAG, "Initializing HTTP client...");
    esp_http_client_handle_t client = esp_http_client_init(&config);
    if (client == nullptr) {
        ESP_LOGE(TAG, "Failed to init HTTP client");
        stats.camera_frames_failed++;
        return ESP_FAIL;
    }

    // Set headers
    char content_type_header[128];
    snprintf(content_type_header, sizeof(content_type_header),
             "multipart/form-data; boundary=%s", boundary);
    esp_http_client_set_header(client, "Content-Type", content_type_header);

    char auth_header[256];
    snprintf(auth_header, sizeof(auth_header), "Bearer %s", API_TOKEN);
    esp_http_client_set_header(client, "Authorization", auth_header);

    ESP_LOGI(TAG, "Headers set - Auth: Bearer ...%s", API_TOKEN + strlen(API_TOKEN) - 8);

    // Open connection and send headers
    ESP_LOGI(TAG, "Opening HTTP connection to %s:%d...", BACKEND_SERVER_HOST, BACKEND_SERVER_PORT);
    esp_err_t err = esp_http_client_open(client, content_length);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to open HTTP connection: %s (0x%x)", esp_err_to_name(err), err);
        ESP_LOGE(TAG, "Check: 1) Backend server running? 2) Correct IP? 3) Port open? 4) Network connected?");
        esp_http_client_cleanup(client);
        stats.camera_frames_failed++;
        return err;
    }
    ESP_LOGI(TAG, "HTTP connection opened successfully");

    // Send form header
    ESP_LOGI(TAG, "Writing form header (%d bytes)...", header_len);
    int written = esp_http_client_write(client, form_header, header_len);
    if (written < 0) {
        ESP_LOGE(TAG, "Failed to write form header");
        esp_http_client_cleanup(client);
        stats.camera_frames_failed++;
        return ESP_FAIL;
    }
    ESP_LOGI(TAG, "Form header written successfully (%d bytes)", written);

    // Send frame data in chunks
    const size_t CHUNK_SIZE = 1024;
    size_t sent = 0;
    ESP_LOGI(TAG, "Starting frame data upload (%zu bytes)...", frame->size);
    uint32_t upload_start = xTaskGetTickCount() * portTICK_PERIOD_MS;

    while (sent < frame->size) {
        size_t to_send = (frame->size - sent > CHUNK_SIZE) ? CHUNK_SIZE : (frame->size - sent);
        written = esp_http_client_write(client, (const char*)(frame->data + sent), to_send);
        if (written < 0) {
            ESP_LOGE(TAG, "Failed to write frame data at %zu/%zu", sent, frame->size);
            esp_http_client_cleanup(client);
            stats.camera_frames_failed++;
            return ESP_FAIL;
        }
        sent += written;

        // Log progress every 10KB
        if (sent % 10240 == 0 || sent == frame->size) {
            uint32_t elapsed = (xTaskGetTickCount() * portTICK_PERIOD_MS) - upload_start;
            ESP_LOGI(TAG, "Upload progress: %zu/%zu bytes (%.1f%%) in %lums",
                     sent, frame->size, (sent * 100.0f) / frame->size, elapsed);
        }

        // Yield occasionally to prevent watchdog
        if (sent % 4096 == 0) {
            vTaskDelay(pdMS_TO_TICKS(1));
        }
    }

    uint32_t upload_duration = (xTaskGetTickCount() * portTICK_PERIOD_MS) - upload_start;
    ESP_LOGI(TAG, "Frame data upload complete (%zu bytes in %lums)", frame->size, upload_duration);

    // Send footer
    ESP_LOGI(TAG, "Writing form footer (%d bytes)...", footer_len);
    written = esp_http_client_write(client, form_footer, footer_len);
    if (written < 0) {
        ESP_LOGE(TAG, "Failed to write form footer");
        esp_http_client_cleanup(client);
        stats.camera_frames_failed++;
        return ESP_FAIL;
    }
    ESP_LOGI(TAG, "Form footer written successfully (%d bytes)", written);

    // Fetch response
    ESP_LOGI(TAG, "Fetching server response...");
    uint32_t response_start = xTaskGetTickCount() * portTICK_PERIOD_MS;
    int content_len = esp_http_client_fetch_headers(client);
    int status_code = esp_http_client_get_status_code(client);
    uint32_t response_time = (xTaskGetTickCount() * portTICK_PERIOD_MS) - response_start;

    uint32_t total_duration = (xTaskGetTickCount() * portTICK_PERIOD_MS) - start_time;
    stats.last_send_duration_ms = total_duration;

    // Detailed timing breakdown
    uint32_t connect_time = upload_start - start_time;
    ESP_LOGI(TAG, "=== Timing Breakdown ===");
    ESP_LOGI(TAG, "Connection setup: %lums", connect_time);
    ESP_LOGI(TAG, "Data upload: %lums", upload_duration);
    ESP_LOGI(TAG, "Server response wait: %lums", response_time);
    ESP_LOGI(TAG, "Total time: %lums", total_duration);
    ESP_LOGI(TAG, "Response: status=%d, content_len=%d", status_code, content_len);

    if (status_code == 200 || status_code == 201) {
        stats.camera_frames_sent++;

        // Log periodically
        if (stats.camera_frames_sent % 10 == 0) {
            ESP_LOGI(TAG, "Camera frame %u sent (%zu bytes, %lu ms)",
                     frame->frame_id, frame->size, (unsigned long)total_duration);
        }

        esp_http_client_cleanup(client);
        return ESP_OK;
    } else {
        // Error - read response body for error message
        char response_buffer[512];
        int read_len = esp_http_client_read(client, response_buffer, sizeof(response_buffer) - 1);

        if (read_len > 0) {
            response_buffer[read_len] = '\0';  // Null terminate
            ESP_LOGE(TAG, "Backend returned status %d", status_code);
            ESP_LOGE(TAG, "Response body: %s", response_buffer);
        } else {
            ESP_LOGE(TAG, "Backend returned status %d (no response body)", status_code);
        }

        esp_http_client_cleanup(client);
        stats.camera_frames_failed++;
        return ESP_FAIL;
    }
}

// ============================================================================
// Internal: Send audio chunk to backend
// ============================================================================
static esp_err_t send_audio_chunk_blocking(AudioChunk* chunk) {
    char url[256];
    snprintf(url, sizeof(url), "http://%s:%d/api/v1/devices/%s/stream/audio",
             BACKEND_SERVER_HOST, BACKEND_SERVER_PORT, DEVICE_ID);

    esp_http_client_config_t config = {};
    config.url = url;
    config.method = HTTP_METHOD_POST;
    config.timeout_ms = 3000;

    esp_http_client_handle_t client = esp_http_client_init(&config);
    if (client == nullptr) {
        ESP_LOGE(TAG, "Failed to init HTTP client for audio");
        stats.audio_chunks_failed++;
        return ESP_FAIL;
    }

    // Set headers
    esp_http_client_set_header(client, "Content-Type", "application/octet-stream");
    esp_http_client_set_header(client, "X-Device-ID", DEVICE_ID);

    char auth_header[256];
    snprintf(auth_header, sizeof(auth_header), "Bearer %s", API_TOKEN);
    esp_http_client_set_header(client, "Authorization", auth_header);

    char sequence_header[32];
    snprintf(sequence_header, sizeof(sequence_header), "%lu", (unsigned long)chunk->sequence);
    esp_http_client_set_header(client, "X-Sequence", sequence_header);

    // Open connection and send
    esp_err_t err = esp_http_client_open(client, chunk->size);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to open HTTP connection for audio");
        esp_http_client_cleanup(client);
        stats.audio_chunks_failed++;
        return err;
    }

    int written = esp_http_client_write(client, (const char*)chunk->data, chunk->size);
    if (written < 0) {
        ESP_LOGE(TAG, "Failed to write audio data");
        esp_http_client_cleanup(client);
        stats.audio_chunks_failed++;
        return ESP_FAIL;
    }

    int content_len = esp_http_client_fetch_headers(client);
    int status_code = esp_http_client_get_status_code(client);

    if (status_code == 200 || status_code == 201) {
        ESP_LOGI(TAG, "backend returned %d", status_code);
        stats.audio_chunks_sent++;

        // Log periodically
        if (stats.audio_chunks_sent % 50 == 0) {
            ESP_LOGI(TAG, "Audio chunk %lu sent (%zu bytes, total: %lu KB)",
                     (unsigned long)chunk->sequence, chunk->size,
                     (unsigned long)(stats.audio_chunks_sent * chunk->size) / 1024);
        }

        esp_http_client_cleanup(client);
        return ESP_OK;
    } else {
        // Error - read response body for error message
        char response_buffer[512];
        int read_len = esp_http_client_read(client, response_buffer, sizeof(response_buffer) - 1);

        if (read_len > 0) {
            response_buffer[read_len] = '\0';  // Null terminate
            ESP_LOGE(TAG, "Audio backend returned status %d", status_code);
            ESP_LOGE(TAG, "Response body: %s", response_buffer);
        } else {
            ESP_LOGE(TAG, "Audio backend returned status %d (no response body)", status_code);
        }

        esp_http_client_cleanup(client);
        stats.audio_chunks_failed++;
        return ESP_FAIL;
    }
}

// ============================================================================
// FreeRTOS Tasks
// ============================================================================
static void camera_stream_task(void* param) {
    ESP_LOGI(TAG, "Camera streaming task started");

    CameraFrame frame;

    while (true) {
        // Wait for frames in queue
        if (xQueueReceive(camera_queue, &frame, portMAX_DELAY) == pdTRUE) {
            // Only send if streaming is active
            if (camera_streaming_active) {
                send_camera_frame_blocking(&frame);
            }

            // Free frame buffer
            if (frame.data != nullptr) {
                free(frame.data);
            }

            // Delay between frames
            vTaskDelay(pdMS_TO_TICKS(50));
        }
    }
}

static void audio_stream_task(void* param) {
    ESP_LOGI(TAG, "Audio streaming task started");

    AudioChunk chunk;

    while (true) {
        // Wait for audio chunks in queue
        if (xQueueReceive(audio_queue, &chunk, portMAX_DELAY) == pdTRUE) {
            // Only send if streaming is active
            if (audio_streaming_active) {
                send_audio_chunk_blocking(&chunk);
            }

            // Free chunk buffer
            if (chunk.data != nullptr) {
                free(chunk.data);
            }

            // Minimal delay
            vTaskDelay(pdMS_TO_TICKS(10));
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

    // Create queues
    camera_queue = xQueueCreate(3, sizeof(CameraFrame));
    audio_queue = xQueueCreate(10, sizeof(AudioChunk));

    if (camera_queue == nullptr || audio_queue == nullptr) {
        ESP_LOGE(TAG, "Failed to create queues");
        return ESP_FAIL;
    }

    // Create camera streaming task on Core 0
    BaseType_t ret = xTaskCreatePinnedToCore(
        camera_stream_task,
        "camera_stream",
        8192,  // 8KB stack
        nullptr,
        3,  // Priority 3
        &camera_task_handle,
        0   // Core 0
    );

    if (ret != pdPASS) {
        ESP_LOGE(TAG, "Failed to create camera stream task");
        return ESP_FAIL;
    }

    // Create audio streaming task on Core 0
    ret = xTaskCreatePinnedToCore(
        audio_stream_task,
        "audio_stream",
        6144,  // 6KB stack
        nullptr,
        3,  // Priority 3
        &audio_task_handle,
        0   // Core 0
    );

    if (ret != pdPASS) {
        ESP_LOGE(TAG, "Failed to create audio stream task");
        return ESP_FAIL;
    }

    ESP_LOGI(TAG, "Backend streaming initialized (target: %s:%d)",
             BACKEND_SERVER_HOST, BACKEND_SERVER_PORT);

    return ESP_OK;
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
    return camera_streaming_active;
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
    return audio_streaming_active;
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

    // Try to queue (don't block)
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

    // Try to queue (don't block)
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

    ESP_LOGI(TAG, "Backend streaming cleaned up");
}

} // namespace backend_stream
