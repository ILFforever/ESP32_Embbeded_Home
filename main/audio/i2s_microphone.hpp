#pragma once

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/i2s_pdm.h"
#include "esp_log.h"
#include <cstdint>
#include <cmath>

namespace who {
namespace audio {

/**
 * I2S PDM Microphone Driver for XIAO ESP32-S3 Sense
 *
 * Hardware: MSM261S4030H0 / MP34DT06JTR PDM microphone
 * Pins: GPIO 42 (CLK), GPIO 41 (DATA)
 *
 * Features:
 * - PDM to PCM conversion via hardware
 * - 16 kHz sample rate, 16-bit mono
 * - Continuous audio capture
 * - Serial output of audio levels (RMS/peak)
 */
class I2SMicrophone {
public:
    /**
     * Constructor
     * @param sample_rate Sample rate in Hz (default: 16000)
     * @param clk_gpio PDM clock GPIO (default: 42)
     * @param data_gpio PDM data GPIO (default: 41)
     */
    I2SMicrophone(uint32_t sample_rate = 16000,
                  int clk_gpio = 42,
                  int data_gpio = 41);

    ~I2SMicrophone();

    /**
     * Initialize I2S PDM interface
     * @return ESP_OK on success
     */
    esp_err_t init();

    /**
     * Start audio capture task
     * @return true if started successfully
     */
    bool start();

    /**
     * Stop audio capture task
     */
    void stop();

    /**
     * Check if microphone is running
     * @return true if capturing audio
     */
    bool is_running() const { return m_is_running; }

    /**
     * Get last RMS audio level
     * @return RMS level (0-32767)
     */
    uint32_t get_rms_level() const { return m_last_rms; }

    /**
     * Get last peak audio level
     * @return Peak level (0-32767)
     */
    uint32_t get_peak_level() const { return m_last_peak; }

    /**
     * Read audio samples (blocking call)
     * @param buffer Buffer to store audio samples
     * @param buffer_size Size of buffer in bytes
     * @param bytes_read Number of bytes actually read
     * @param timeout_ms Timeout in milliseconds
     * @return ESP_OK on success
     */
    esp_err_t read_audio(int16_t* buffer, size_t buffer_size, size_t* bytes_read, uint32_t timeout_ms = 100);

private:
    // Configuration
    uint32_t m_sample_rate;
    int m_clk_gpio;
    int m_data_gpio;

    // I2S handle
    i2s_chan_handle_t m_rx_chan;

    // Running state
    bool m_is_running;

    // Audio statistics
    uint32_t m_last_rms;
    uint32_t m_last_peak;

    // Audio buffer size (1024 samples = 64ms @ 16kHz)
    static const size_t BUFFER_SIZE = 1024;
    static const size_t BUFFER_BYTES = BUFFER_SIZE * sizeof(int16_t);

    // Internal methods
    void calculate_audio_levels(const int16_t* samples, size_t count);
    void print_audio_stats();
};

} // namespace audio
} // namespace who
