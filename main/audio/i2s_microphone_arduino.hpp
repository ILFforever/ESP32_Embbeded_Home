#pragma once

// Forward declare to avoid Arduino header conflicts
#ifndef ARDUINO
#define ARDUINO_PRIVATE_INCLUDE
#endif

#include "esp_log.h"
#include "esp_err.h"
#include <cstdint>
#include <cmath>

// Forward declare I2SClass to avoid including Arduino.h in header
class I2SClass;

namespace who {
namespace audio {

/**
 * Arduino-based I2S PDM Microphone Driver
 * Uses ESP_I2S library for compatibility with working Arduino code
 */
class I2SMicrophoneArduino {
public:
    I2SMicrophoneArduino(uint32_t sample_rate = 16000,
                        int clk_gpio = 42,
                        int data_gpio = 41);
    ~I2SMicrophoneArduino();

    esp_err_t init();
    bool start();
    void stop();
    bool is_running() const { return m_is_running; }

    // Audio level getters
    uint32_t get_rms_level() const { return m_last_rms; }
    uint32_t get_peak_level() const { return m_last_peak; }
    int32_t get_dc_offset() const { return m_dc_offset; }

    // Read audio samples (blocking)
    esp_err_t read_audio(int16_t* buffer, size_t buffer_size, size_t* bytes_read, uint32_t timeout_ms = 100);

    // Gain control
    void set_gain(float gain);
    float get_gain() const { return m_gain; }

private:
    // Configuration
    uint32_t m_sample_rate;
    int m_clk_gpio;
    int m_data_gpio;

    // Arduino I2S instance (pointer to avoid header inclusion)
    I2SClass* m_i2s;

    // State
    bool m_is_running;

    // Audio stats
    uint32_t m_last_rms;
    uint32_t m_last_peak;
    int32_t m_dc_offset;
    float m_gain;

    // Buffer size
    static const size_t BUFFER_SIZE = 512;

    // Calculate audio levels (matches working Arduino code)
    void calculate_audio_levels(const int16_t* samples, size_t count);
};

} // namespace audio
} // namespace who
