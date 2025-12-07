#include "i2s_microphone_arduino.hpp"
#include <Arduino.h>
#include <ESP_I2S.h>
#include <cstring>

namespace who {
namespace audio {

static const char* TAG = "I2SMicArduino";

I2SMicrophoneArduino::I2SMicrophoneArduino(uint32_t sample_rate, int clk_gpio, int data_gpio)
    : m_sample_rate(sample_rate)
    , m_clk_gpio(clk_gpio)
    , m_data_gpio(data_gpio)
    , m_i2s(new I2SClass())
    , m_is_running(false)
    , m_last_rms(0)
    , m_last_peak(0)
    , m_dc_offset(0)
    , m_gain(1.0f)
{
}

I2SMicrophoneArduino::~I2SMicrophoneArduino()
{
    stop();
    delete m_i2s;
    m_i2s = nullptr;
}

esp_err_t I2SMicrophoneArduino::init()
{
    ESP_LOGI(TAG, "Initializing Arduino I2S PDM microphone...");
    ESP_LOGI(TAG, "  Sample rate: %lu Hz", m_sample_rate);
    ESP_LOGI(TAG, "  CLK GPIO: %d", m_clk_gpio);
    ESP_LOGI(TAG, "  DATA GPIO: %d", m_data_gpio);

    // Set PDM RX pins
    m_i2s->setPinsPdmRx(m_clk_gpio, m_data_gpio);

    // Begin I2S in PDM RX mode - use begin() first to create channel
    if (!m_i2s->begin(I2S_MODE_PDM_RX, m_sample_rate, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO)) {
        ESP_LOGE(TAG, "Failed to initialize I2S PDM RX mode");
        return ESP_FAIL;
    }

    // Try configuring RX with 32-to-16 bit transformation (like some PDM mics need)
    if (!m_i2s->configureRX(m_sample_rate, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO, I2S_RX_TRANSFORM_NONE)) {
        ESP_LOGE(TAG, "Failed to configure RX");
        return ESP_FAIL;
    }

    ESP_LOGI(TAG, "Arduino I2S PDM microphone initialized successfully");
    return ESP_OK;
}

bool I2SMicrophoneArduino::start()
{
    if (m_is_running) {
        ESP_LOGW(TAG, "Microphone already running");
        return true;
    }

    m_is_running = true;
    ESP_LOGI(TAG, "Microphone started - streaming audio");
    return true;
}

void I2SMicrophoneArduino::stop()
{
    if (!m_is_running) {
        return;
    }

    ESP_LOGI(TAG, "Stopping microphone...");
    m_is_running = false;
    if (m_i2s) {
        m_i2s->end();
    }
    ESP_LOGI(TAG, "Microphone stopped");
}

void I2SMicrophoneArduino::calculate_audio_levels(const int16_t* samples, size_t count)
{
    if (count == 0) {
        return;
    }

    // Filter valid samples (matches working Arduino code)
    int16_t valid_samples[BUFFER_SIZE];
    size_t valid_count = 0;

    for (size_t i = 0; i < count && valid_count < BUFFER_SIZE; i++) {
        int16_t sample = samples[i];
        // Filter out invalid samples (0, -1, 1)
        if (sample != 0 && sample != -1 && sample != 1) {
            valid_samples[valid_count++] = sample;
        }
    }

    if (valid_count < 10) {
        // Not enough valid samples
        m_last_rms = 0;
        m_last_peak = 0;
        m_dc_offset = 0;
        return;
    }

    // Calculate DC offset (mean) for THIS buffer - matches Arduino code
    int64_t sum = 0;
    for (size_t i = 0; i < valid_count; i++) {
        sum += valid_samples[i];
    }
    int32_t mean = sum / valid_count;

    // Calculate RMS and peak with DC offset removed (AC-coupled) - matches Arduino code
    int64_t sum_squares = 0;
    int16_t maxVal = -32768;
    int16_t minVal = 32767;

    for (size_t i = 0; i < valid_count; i++) {
        // Remove DC offset to get AC component
        int32_t ac_sample = valid_samples[i] - mean;

        // Calculate squared value for RMS (AC component only)
        sum_squares += ac_sample * ac_sample;

        // Track original min/max
        if (valid_samples[i] > maxVal) maxVal = valid_samples[i];
        if (valid_samples[i] < minVal) minVal = valid_samples[i];
    }

    // Calculate RMS (AC component only)
    m_last_rms = static_cast<uint32_t>(sqrt(sum_squares / valid_count));

    // Peak-to-peak amplitude
    m_last_peak = maxVal - minVal;

    // Store DC offset for monitoring
    m_dc_offset = mean;
}

esp_err_t I2SMicrophoneArduino::read_audio(int16_t* buffer, size_t buffer_size, size_t* bytes_read, uint32_t timeout_ms)
{
    if (!m_is_running) {
        ESP_LOGW(TAG, "Microphone not running");
        return ESP_ERR_INVALID_STATE;
    }

    if (!buffer || !bytes_read) {
        return ESP_ERR_INVALID_ARG;
    }

    // Read from Arduino I2S
    *bytes_read = m_i2s->readBytes((char*)buffer, buffer_size);

    if (*bytes_read > 0) {
        size_t samples_read = *bytes_read / sizeof(int16_t);

        // Calculate audio levels on RAW samples (calculate_audio_levels handles filtering internally)
        calculate_audio_levels(buffer, samples_read);

        // Apply software gain if needed
        if (m_gain != 1.0f) {
            for (size_t i = 0; i < samples_read; i++) {
                int32_t sample = static_cast<int32_t>(buffer[i] * m_gain);

                // Clip to prevent overflow
                if (sample > 32767) {
                    buffer[i] = 32767;
                } else if (sample < -32768) {
                    buffer[i] = -32768;
                } else {
                    buffer[i] = static_cast<int16_t>(sample);
                }
            }
        }

        return ESP_OK;
    }

    return ESP_ERR_TIMEOUT;
}

void I2SMicrophoneArduino::set_gain(float gain)
{
    if (gain < 0.1f) {
        gain = 0.1f;
    } else if (gain > 8.0f) {
        gain = 8.0f;
    }

    m_gain = gain;
    ESP_LOGI(TAG, "Gain set to %.1fx", m_gain);
}

} // namespace audio
} // namespace who
