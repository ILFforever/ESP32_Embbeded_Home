#pragma once

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"
#include "esp_err.h"
#include <cstdint>

namespace backend_stream {

// Backend server configuration
//#define BACKEND_SERVER_HOST "192.168.1.35"
#define BACKEND_SERVER_HOST "embedded-smarthome.fly.dev"  // Production server
#define BACKEND_SERVER_PORT 80
#define DEVICE_ID "db_001"
#define API_TOKEN "d8ac2f1ee97b4a8b3f299696773e807e735284c47cfc30aadef1287e10a53b6d"

// Maximum frame/chunk sizes
#define MAX_FRAME_SIZE 50000  // 50KB for JPEG frames
#define MAX_AUDIO_CHUNK_SIZE 2048  // 2KB for audio chunks

/**
 * Camera frame structure for backend streaming
 */
struct CameraFrame {
    uint8_t* data;
    size_t size;
    uint16_t frame_id;
    uint32_t timestamp;
};

/**
 * Audio chunk structure for backend streaming
 */
struct AudioChunk {
    uint8_t* data;
    size_t size;
    uint32_t sequence;
    uint32_t timestamp;
};

/**
 * Streaming statistics
 */
struct StreamStats {
    uint32_t camera_frames_sent;
    uint32_t camera_frames_failed;
    uint32_t camera_queue_overflows;
    uint32_t audio_chunks_sent;
    uint32_t audio_chunks_failed;
    uint32_t audio_queue_overflows;
    uint32_t last_send_duration_ms;
};

/**
 * Initialize backend streaming module
 * Creates FreeRTOS tasks and queues for camera and audio streaming
 *
 * @return ESP_OK on success
 */
esp_err_t init();

/**
 * Start/stop camera frame streaming to backend
 */
void start_camera_streaming();
void stop_camera_streaming();
bool is_camera_streaming();

/**
 * Start/stop audio streaming to backend
 */
void start_audio_streaming();
void stop_audio_streaming();
bool is_audio_streaming();

/**
 * Queue a camera frame for backend transmission
 * Non-blocking - copies frame data and returns immediately
 *
 * @param jpeg_data Pointer to JPEG frame data
 * @param jpeg_size Size of JPEG data in bytes
 * @param frame_id Frame sequence number
 * @return ESP_OK if queued successfully
 */
esp_err_t queue_camera_frame(const uint8_t* jpeg_data, size_t jpeg_size, uint16_t frame_id);

/**
 * Queue an audio chunk for backend transmission
 * Non-blocking - copies audio data and returns immediately
 *
 * @param audio_data Pointer to PCM audio data (int16_t samples)
 * @param audio_size Size of audio data in bytes
 * @param sequence Chunk sequence number
 * @return ESP_OK if queued successfully
 */
esp_err_t queue_audio_chunk(const uint8_t* audio_data, size_t audio_size, uint32_t sequence);

/**
 * Get streaming statistics
 */
StreamStats get_stats();

/**
 * Cleanup backend streaming module
 */
void cleanup();

} // namespace backend_stream
