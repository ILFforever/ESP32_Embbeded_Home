#ifndef AUDIO_CLIENT_H
#define AUDIO_CLIENT_H

#include <Arduino.h>
#include <HTTPClient.h>

class AudioClient {
public:
    AudioClient(const char* camera_ip);
    ~AudioClient();

    // Start streaming audio from camera
    bool start();

    // Stop streaming
    void stop();

    // Check if streaming
    bool isStreaming() const { return m_streaming; }

    // Get audio stats
    uint32_t getBytesReceived() const { return m_bytesReceived; }
    uint32_t getPacketsReceived() const { return m_packetsReceived; }

private:
    static void audioTask(void* param);
    void processAudioStream();

    const char* m_cameraIP;
    HTTPClient m_http;
    WiFiClient m_client;
    TaskHandle_t m_taskHandle;
    bool m_streaming;
    uint32_t m_bytesReceived;
    uint32_t m_packetsReceived;
};

#endif // AUDIO_CLIENT_H
