/**
 * Multiplexed Arduino WebSocket backend stream.
 *
 * Camera JPEG and IMA ADPCM audio remain independently timestamped messages,
 * but one queue/task owns all WebSocket writes. Each queued allocation already
 * contains its wire header, so sending does not allocate or copy it again.
 */

#include "backend_stream.hpp"
#include "ima_adpcm.hpp"
#include <Arduino.h>
#include <WiFi.h>
#include <ArduinoWebsockets.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"
#include "freertos/semphr.h"
#include "esp_log.h"

using namespace websockets;

namespace backend_stream {

static const char *TAG = "BackendStreamWS";

enum class MediaType : uint8_t {
    CameraJpeg = 0x01,
    AudioAdpcm = 0x03,
};

struct StreamPacket {
    MediaType type;
    uint8_t *data;
    size_t size;
};

static constexpr size_t COMMON_HEADER_SIZE = 7;
static constexpr size_t ADPCM_HEADER_SIZE = 13;
static constexpr uint8_t ADPCM_FORMAT_VERSION = 1;
static constexpr uint32_t FRAME_INTERVAL_MS = 200; // 5 FPS web stream
static constexpr UBaseType_t STREAM_QUEUE_LENGTH = 24;

static QueueHandle_t stream_queue = nullptr;
static TaskHandle_t stream_task_handle = nullptr;
static TaskHandle_t ws_task_handle = nullptr;
static SemaphoreHandle_t ws_mutex = nullptr;

static WebsocketsClient ws_client;
static volatile bool ws_connected = false;
static volatile bool ws_authenticated = false;
static volatile bool camera_streaming_active = false;
static volatile bool audio_streaming_active = false;

static StreamStats stats = {0};
static uint32_t last_frame_queued_time = 0;
static int adpcm_step_index = 0;

static void write_be16(uint8_t *target, uint16_t value)
{
    target[0] = static_cast<uint8_t>((value >> 8) & 0xff);
    target[1] = static_cast<uint8_t>(value & 0xff);
}

static void write_be32(uint8_t *target, uint32_t value)
{
    target[0] = static_cast<uint8_t>((value >> 24) & 0xff);
    target[1] = static_cast<uint8_t>((value >> 16) & 0xff);
    target[2] = static_cast<uint8_t>((value >> 8) & 0xff);
    target[3] = static_cast<uint8_t>(value & 0xff);
}

static uint16_t packet_sequence(const StreamPacket &packet)
{
    return packet.size >= 3
               ? static_cast<uint16_t>((packet.data[1] << 8) | packet.data[2])
               : 0;
}

static bool media_is_active(MediaType type)
{
    return type == MediaType::CameraJpeg ? camera_streaming_active
                                         : audio_streaming_active;
}

static void free_packet(StreamPacket &packet)
{
    if (packet.data != nullptr)
    {
        free(packet.data);
        packet.data = nullptr;
    }
    packet.size = 0;
}

static bool enqueue_packet(StreamPacket &packet)
{
    if (stream_queue == nullptr || xQueueSend(stream_queue, &packet, 0) != pdTRUE)
    {
        if (packet.type == MediaType::CameraJpeg)
        {
            stats.camera_queue_overflows++;
        }
        else
        {
            stats.audio_queue_overflows++;
        }
        free_packet(packet);
        return false;
    }
    return true;
}

static void on_message(WebsocketsMessage message)
{
    const String payload = message.data();
    if (payload.indexOf("\"type\":\"auth_success\"") >= 0)
    {
        ws_authenticated = true;
        ESP_LOGI(TAG, "WebSocket device authentication accepted");
    }
    else if (payload.indexOf("\"type\":\"error\"") >= 0)
    {
        ws_authenticated = false;
        ESP_LOGW(TAG, "WebSocket server rejected a message: %s", payload.c_str());
    }
}

static void on_event(WebsocketsEvent event, String data)
{
    (void)data;
    switch (event)
    {
    case WebsocketsEvent::ConnectionOpened:
    {
        ws_connected = true;
        ws_authenticated = false;

        char auth_message[256];
        snprintf(auth_message, sizeof(auth_message),
                 "{\"type\":\"auth\",\"device_id\":\"%s\",\"token\":\"%s\"}",
                 DEVICE_ID, API_TOKEN);
        ws_client.send(auth_message);
        ESP_LOGI(TAG, "WebSocket connected; device authentication sent");
        break;
    }
    case WebsocketsEvent::ConnectionClosed:
        ws_connected = false;
        ws_authenticated = false;
        ESP_LOGW(TAG, "WebSocket disconnected");
        break;
    case WebsocketsEvent::GotPing:
        ESP_LOGD(TAG, "WebSocket ping received");
        break;
    case WebsocketsEvent::GotPong:
        ESP_LOGD(TAG, "WebSocket pong received");
        break;
    }
}

static void ws_poll_task(void *parameter)
{
    (void)parameter;
    ESP_LOGI(TAG, "WebSocket poll task started");

    while (true)
    {
        if (xSemaphoreTake(ws_mutex, pdMS_TO_TICKS(100)) == pdTRUE)
        {
            if (ws_client.available())
            {
                ws_client.poll();
            }
            xSemaphoreGive(ws_mutex);
        }

        if (!ws_connected)
        {
            vTaskDelay(pdMS_TO_TICKS(5000));

            char ws_url[256];
            snprintf(ws_url, sizeof(ws_url), "ws://%s:%d/ws/stream",
                     BACKEND_SERVER_HOST, BACKEND_SERVER_PORT);

            if (xSemaphoreTake(ws_mutex, pdMS_TO_TICKS(1000)) == pdTRUE)
            {
                if (!ws_connected)
                {
                    ESP_LOGI(TAG, "Connecting to %s", ws_url);
                    ws_client.connect(ws_url);
                }
                xSemaphoreGive(ws_mutex);
            }
        }

        vTaskDelay(pdMS_TO_TICKS(10));
    }
}

static void stream_sender_task(void *parameter)
{
    (void)parameter;
    ESP_LOGI(TAG, "Serialized AV sender task started");
    StreamPacket packet = {};

    while (true)
    {
        if (xQueueReceive(stream_queue, &packet, portMAX_DELAY) != pdTRUE)
        {
            continue;
        }

        bool sent = false;
        const uint32_t started = xTaskGetTickCount() * portTICK_PERIOD_MS;

        if (media_is_active(packet.type) && ws_authenticated &&
            xSemaphoreTake(ws_mutex, pdMS_TO_TICKS(1000)) == pdTRUE)
        {
            if (ws_authenticated && ws_client.available())
            {
                sent = ws_client.sendBinary(reinterpret_cast<const char *>(packet.data), packet.size);
            }
            xSemaphoreGive(ws_mutex);
        }

        const uint16_t sequence = packet_sequence(packet);
        if (packet.type == MediaType::CameraJpeg)
        {
            if (sent)
            {
                stats.camera_frames_sent++;
                if (stats.camera_frames_sent % 10 == 0)
                {
                    ESP_LOGI(TAG, "JPEG frame %u sent: %zu bytes", sequence, packet.size);
                }
            }
            else
            {
                stats.camera_frames_failed++;
            }
        }
        else
        {
            if (sent)
            {
                stats.audio_chunks_sent++;
                if (stats.audio_chunks_sent % 50 == 0)
                {
                    ESP_LOGI(TAG, "ADPCM chunk %u sent: %zu bytes", sequence, packet.size);
                }
            }
            else
            {
                stats.audio_chunks_failed++;
            }
        }

        stats.last_send_duration_ms =
            (xTaskGetTickCount() * portTICK_PERIOD_MS) - started;
        free_packet(packet);
    }
}

esp_err_t init()
{
    if (stream_queue != nullptr)
    {
        ESP_LOGW(TAG, "Already initialized");
        return ESP_OK;
    }

    ws_mutex = xSemaphoreCreateMutex();
    stream_queue = xQueueCreate(STREAM_QUEUE_LENGTH, sizeof(StreamPacket));
    if (ws_mutex == nullptr || stream_queue == nullptr)
    {
        ESP_LOGE(TAG, "Failed to create AV queue or WebSocket mutex");
        cleanup();
        return ESP_ERR_NO_MEM;
    }

    ws_client.onMessage(on_message);
    ws_client.onEvent(on_event);
    ws_client.addHeader("Origin", String("http://") + String(BACKEND_SERVER_HOST));

    BaseType_t result = xTaskCreatePinnedToCore(
        ws_poll_task, "ws_poll", 8192, nullptr, 5, &ws_task_handle, 0);
    if (result != pdPASS)
    {
        ESP_LOGE(TAG, "Failed to create WebSocket poll task");
        cleanup();
        return ESP_ERR_NO_MEM;
    }

    result = xTaskCreatePinnedToCore(
        stream_sender_task, "ws_av_sender", 8192, nullptr, 4,
        &stream_task_handle, 0);
    if (result != pdPASS)
    {
        ESP_LOGE(TAG, "Failed to create serialized AV sender task");
        cleanup();
        return ESP_ERR_NO_MEM;
    }

    ESP_LOGI(TAG, "Multiplexed WebSocket streaming initialized (5 FPS, IMA ADPCM)");
    return ESP_OK;
}

bool is_initialized()
{
    return stream_queue != nullptr && stream_task_handle != nullptr;
}

void start_camera_streaming()
{
    camera_streaming_active = true;
    last_frame_queued_time = 0;
    ESP_LOGI(TAG, "Camera streaming started at 5 FPS");
}

void stop_camera_streaming()
{
    camera_streaming_active = false;
    ESP_LOGI(TAG, "Camera streaming stopped");
}

bool is_camera_streaming()
{
    return camera_streaming_active && ws_authenticated;
}

void start_audio_streaming()
{
    adpcm_step_index = 0;
    audio_streaming_active = true;
    ESP_LOGI(TAG, "IMA ADPCM audio streaming started");
}

void stop_audio_streaming()
{
    audio_streaming_active = false;
    ESP_LOGI(TAG, "Audio streaming stopped");
}

bool is_audio_streaming()
{
    return audio_streaming_active && ws_authenticated;
}

esp_err_t queue_camera_frame(const uint8_t *jpeg_data, size_t jpeg_size, uint16_t frame_id)
{
    if (stream_queue == nullptr || !camera_streaming_active || jpeg_data == nullptr)
    {
        return ESP_ERR_INVALID_STATE;
    }
    if (jpeg_size == 0 || jpeg_size > MAX_FRAME_SIZE)
    {
        ESP_LOGW(TAG, "Invalid JPEG frame size: %zu", jpeg_size);
        return ESP_ERR_INVALID_SIZE;
    }

    const uint32_t now = xTaskGetTickCount() * portTICK_PERIOD_MS;
    if (last_frame_queued_time > 0 && now - last_frame_queued_time < FRAME_INTERVAL_MS)
    {
        return ESP_ERR_NOT_FINISHED;
    }

    StreamPacket packet = {
        .type = MediaType::CameraJpeg,
        .data = static_cast<uint8_t *>(malloc(COMMON_HEADER_SIZE + jpeg_size)),
        .size = COMMON_HEADER_SIZE + jpeg_size,
    };
    if (packet.data == nullptr)
    {
        stats.camera_frames_failed++;
        return ESP_ERR_NO_MEM;
    }

    packet.data[0] = static_cast<uint8_t>(MediaType::CameraJpeg);
    write_be16(packet.data + 1, frame_id);
    write_be32(packet.data + 3, now);
    memcpy(packet.data + COMMON_HEADER_SIZE, jpeg_data, jpeg_size);

    if (!enqueue_packet(packet))
    {
        ESP_LOGW(TAG, "AV queue full, dropping JPEG frame");
        return ESP_ERR_NO_MEM;
    }

    last_frame_queued_time = now;
    return ESP_OK;
}

esp_err_t queue_audio_chunk(const uint8_t *audio_data, size_t audio_size, uint32_t sequence)
{
    if (stream_queue == nullptr || !audio_streaming_active || audio_data == nullptr)
    {
        return ESP_ERR_INVALID_STATE;
    }
    if (audio_size < sizeof(int16_t) || audio_size > MAX_AUDIO_CHUNK_SIZE ||
        (audio_size % sizeof(int16_t)) != 0)
    {
        ESP_LOGW(TAG, "Invalid PCM audio chunk size: %zu", audio_size);
        return ESP_ERR_INVALID_SIZE;
    }

    const size_t sample_count = audio_size / sizeof(int16_t);
    const size_t encoded_capacity = ima_adpcm::encoded_size(sample_count);
    StreamPacket packet = {
        .type = MediaType::AudioAdpcm,
        .data = static_cast<uint8_t *>(malloc(ADPCM_HEADER_SIZE + encoded_capacity)),
        .size = 0,
    };
    if (packet.data == nullptr)
    {
        stats.audio_chunks_failed++;
        return ESP_ERR_NO_MEM;
    }

    size_t encoded_size = 0;
    int16_t initial_predictor = 0;
    uint8_t initial_step_index = 0;
    if (!ima_adpcm::encode_block(
            reinterpret_cast<const int16_t *>(audio_data), sample_count,
            packet.data + ADPCM_HEADER_SIZE, encoded_capacity, &encoded_size,
            &adpcm_step_index, &initial_predictor, &initial_step_index))
    {
        free_packet(packet);
        stats.audio_chunks_failed++;
        return ESP_FAIL;
    }

    const uint32_t now = xTaskGetTickCount() * portTICK_PERIOD_MS;
    packet.data[0] = static_cast<uint8_t>(MediaType::AudioAdpcm);
    write_be16(packet.data + 1, static_cast<uint16_t>(sequence));
    write_be32(packet.data + 3, now);
    write_be16(packet.data + 7, static_cast<uint16_t>(sample_count));
    write_be16(packet.data + 9, static_cast<uint16_t>(initial_predictor));
    packet.data[11] = initial_step_index;
    packet.data[12] = ADPCM_FORMAT_VERSION;
    packet.size = ADPCM_HEADER_SIZE + encoded_size;

    if (!enqueue_packet(packet))
    {
        ESP_LOGW(TAG, "AV queue full, dropping ADPCM audio chunk");
        return ESP_ERR_NO_MEM;
    }

    stats.audio_bytes_raw += audio_size;
    stats.audio_bytes_encoded += packet.size;
    return ESP_OK;
}

StreamStats get_stats()
{
    return stats;
}

void cleanup()
{
    camera_streaming_active = false;
    audio_streaming_active = false;
    ws_connected = false;
    ws_authenticated = false;

    if (stream_task_handle != nullptr)
    {
        vTaskDelete(stream_task_handle);
        stream_task_handle = nullptr;
    }
    if (ws_task_handle != nullptr)
    {
        vTaskDelete(ws_task_handle);
        ws_task_handle = nullptr;
    }

    if (ws_mutex != nullptr && xSemaphoreTake(ws_mutex, pdMS_TO_TICKS(100)) == pdTRUE)
    {
        ws_client.close();
        xSemaphoreGive(ws_mutex);
    }

    if (stream_queue != nullptr)
    {
        StreamPacket packet = {};
        while (xQueueReceive(stream_queue, &packet, 0) == pdTRUE)
        {
            free_packet(packet);
        }
        vQueueDelete(stream_queue);
        stream_queue = nullptr;
    }
    if (ws_mutex != nullptr)
    {
        vSemaphoreDelete(ws_mutex);
        ws_mutex = nullptr;
    }

    ESP_LOGI(TAG, "Multiplexed WebSocket streaming cleaned up");
}

} // namespace backend_stream
