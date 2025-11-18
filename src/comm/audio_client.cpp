#include "audio_client.h"

AudioClient::AudioClient(const char* camera_ip)
    : m_cameraIP(camera_ip),
      m_taskHandle(nullptr),
      m_streaming(false),
      m_bytesReceived(0),
      m_packetsReceived(0)
{
}

AudioClient::~AudioClient() {
    stop();
}

bool AudioClient::start() {
    if (m_streaming) {
        Serial.println("[AudioClient] Already streaming");
        return false;
    }

    Serial.printf("[AudioClient] Starting stream from %s\n", m_cameraIP);

    // Create audio processing task
    BaseType_t ret = xTaskCreatePinnedToCore(
        audioTask,
        "audio_client",
        4096,
        this,
        5,  // Priority
        &m_taskHandle,
        1   // Core 1
    );

    if (ret != pdPASS) {
        Serial.println("[AudioClient] Failed to create task");
        return false;
    }

    m_streaming = true;
    return true;
}

void AudioClient::stop() {
    if (!m_streaming) {
        return;
    }

    Serial.println("[AudioClient] Stopping stream");
    m_streaming = false;

    if (m_taskHandle != nullptr) {
        vTaskDelay(pdMS_TO_TICKS(100));  // Give task time to clean up
        vTaskDelete(m_taskHandle);
        m_taskHandle = nullptr;
    }

    m_http.end();
}

void AudioClient::audioTask(void* param) {
    AudioClient* client = static_cast<AudioClient*>(param);
    client->processAudioStream();
    vTaskDelete(nullptr);
}

void AudioClient::processAudioStream() {
    // Build URL
    char url[128];
    snprintf(url, sizeof(url), "http://%s/audio/stream", m_cameraIP);

    Serial.printf("[AudioClient] Connecting to %s\n", url);

    // Start HTTP connection with retry
    bool connected = false;
    for (int retry = 0; retry < 3 && !connected; retry++) {
        if (retry > 0) {
            Serial.printf("[AudioClient] Retry attempt %d/3...\n", retry + 1);
            vTaskDelay(pdMS_TO_TICKS(1000));  // Wait 1 second between retries
        }

        m_http.begin(m_client, url);
        m_http.setTimeout(5000);  // 5 second timeout
        m_http.setConnectTimeout(5000);  // 5 second connect timeout
        m_http.setReuse(false);  // Disable keep-alive

        int httpCode = m_http.GET();

        if (httpCode == HTTP_CODE_OK) {
            connected = true;
            Serial.printf("[AudioClient] Connected, streaming audio (HTTP %d)\n", httpCode);
        } else if (httpCode > 0) {
            Serial.printf("[AudioClient] HTTP error: %d\n", httpCode);
            m_http.end();
        } else {
            Serial.printf("[AudioClient] Connection failed: %d (check WiFi/camera)\n", httpCode);
            m_http.end();
        }
    }

    if (!connected) {
        Serial.println("[AudioClient] Failed to connect after 3 retries");
        m_streaming = false;
        m_http.end();
        return;
    }

    // Get stream
    WiFiClient* stream = m_http.getStreamPtr();

    // Buffer for audio chunks (2048 bytes = 1024 samples = 64ms @ 16kHz)
    const size_t buffer_size = 2048;
    uint8_t* buffer = (uint8_t*)malloc(buffer_size);

    if (!buffer) {
        Serial.println("[AudioClient] Failed to allocate buffer");
        m_streaming = false;
        m_http.end();
        return;
    }

    // Read audio stream with minimal latency
    uint32_t empty_reads = 0;
    const uint32_t max_empty_reads = 200;  // Disconnect after 200 empty reads (~2 seconds)

    while (m_streaming && m_http.connected()) {
        // Check connection status
        if (!stream->connected()) {
            Serial.println("[AudioClient] Stream disconnected");
            break;
        }

        size_t available = stream->available();

        if (available > 0) {
            empty_reads = 0;  // Reset counter when data is available

            // Read immediately - don't wait for full buffer
            size_t to_read = (available > buffer_size) ? buffer_size : available;
            size_t bytes_read = stream->readBytes(buffer, to_read);

            if (bytes_read > 0) {
                m_bytesReceived += bytes_read;
                m_packetsReceived++;

                // Log stats every 100 packets
                if (m_packetsReceived % 100 == 0) {
                    Serial.printf("[AudioClient] Received %u packets, %u bytes (%.1f KB/s)\n",
                                  m_packetsReceived, m_bytesReceived,
                                  (float)m_bytesReceived / 1024.0);
                }

                // TODO: Process audio data here
                // For now, just discard to keep buffer clear
            }

            // No delay - read next chunk immediately to minimize latency
        } else {
            // No data available - minimal wait
            empty_reads++;
            if (empty_reads > max_empty_reads) {
                Serial.println("[AudioClient] No data timeout");
                break;
            }
            vTaskDelay(pdMS_TO_TICKS(50));  // Wait when no data available
        }

        // Minimal yield to prevent watchdog
        taskYIELD();
    }

    free(buffer);
    m_http.end();
    m_streaming = false;

    Serial.println("[AudioClient] Stream ended");
}
