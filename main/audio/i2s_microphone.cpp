#include "i2s_microphone.hpp"
#include <cstring>

namespace who {
namespace audio {

static const char* TAG = "I2SMic";

I2SMicrophone::I2SMicrophone(uint32_t sample_rate, int clk_gpio, int data_gpio)
    : m_sample_rate(sample_rate)
    , m_clk_gpio(clk_gpio)
    , m_data_gpio(data_gpio)
    , m_rx_chan(nullptr)
    , m_is_running(false)
    , m_last_rms(0)
    , m_last_peak(0)
    , m_gain(1.0f)  // Default 1x gain (no amplification)
    , m_dc_offset(0)  // DC offset starts at 0, will adapt
{
}

I2SMicrophone::~I2SMicrophone()
{
    stop();

    if (m_rx_chan) {
        i2s_del_channel(m_rx_chan);
        m_rx_chan = nullptr;
    }
}

esp_err_t I2SMicrophone::init()
{


    // Create I2S RX channel with smaller buffers for lower latency
    i2s_chan_config_t chan_cfg = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_0, I2S_ROLE_MASTER);
    chan_cfg.dma_desc_num = 3;   // Reduced from 4 (3 × 512 = 96ms total @ 16kHz)
    chan_cfg.dma_frame_num = 512; // Reduced from 1024 (32ms per descriptor)

    esp_err_t ret = i2s_new_channel(&chan_cfg, NULL, &m_rx_chan);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to create I2S RX channel: %s", esp_err_to_name(ret));
        return ret;
    }

    // Configure PDM RX mode - match Arduino I2S.h library defaults
    i2s_pdm_rx_slot_config_t slot_cfg = I2S_PDM_RX_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO);

    // Use 8x downsampling (default) instead of 16x
    i2s_pdm_rx_clk_config_t clk_cfg = I2S_PDM_RX_CLK_DEFAULT_CONFIG(m_sample_rate);
    // clk_cfg.dn_sample_mode defaults to I2S_PDM_DSR_8S - don't override it

    i2s_pdm_rx_config_t pdm_rx_cfg = {
        .clk_cfg = clk_cfg,
        .slot_cfg = slot_cfg,
        .gpio_cfg = {
            .clk = static_cast<gpio_num_t>(m_clk_gpio),
            .din = static_cast<gpio_num_t>(m_data_gpio),
            .invert_flags = {
                .clk_inv = false,
            },
        },
    };

    ret = i2s_channel_init_pdm_rx_mode(m_rx_chan, &pdm_rx_cfg);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to initialize PDM RX mode: %s", esp_err_to_name(ret));
        i2s_del_channel(m_rx_chan);
        m_rx_chan = nullptr;
        return ret;
    }


    return ESP_OK;
}

bool I2SMicrophone::start()
{
    if (m_is_running) {
        ESP_LOGW(TAG, "Microphone already running");
        return true;
    }

    if (!m_rx_chan) {
        ESP_LOGE(TAG, "I2S not initialized. Call init() first.");
        return false;
    }

    // Enable I2S channel
    esp_err_t ret = i2s_channel_enable(m_rx_chan);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to enable I2S channel: %s", esp_err_to_name(ret));
        return false;
    }

    m_is_running = true;

    return true;
}

void I2SMicrophone::stop()
{
    if (!m_is_running) {
        return;
    }


}

void I2SMicrophone::calculate_audio_levels(const int16_t* samples, size_t count)
{
    if (count == 0) {
        return;
    }

    // Filter invalid samples (matches working Arduino code)
    static const size_t MAX_VALID = 1024;
    int16_t valid_samples[MAX_VALID];
    size_t valid_count = 0;

    for (size_t i = 0; i < count && valid_count < MAX_VALID; i++) {
        int16_t sample = samples[i];
        // Filter out invalid samples (0, -1, 1) - matches Arduino code
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

esp_err_t I2SMicrophone::read_audio(int16_t* buffer, size_t buffer_size, size_t* bytes_read, uint32_t timeout_ms)
{
    if (!m_is_running || !m_rx_chan) {
        ESP_LOGW(TAG, "Microphone not running");
        return ESP_ERR_INVALID_STATE;
    }

    if (!buffer || !bytes_read) {
        return ESP_ERR_INVALID_ARG;
    }

    // Read directly from I2S channel
    esp_err_t ret = i2s_channel_read(m_rx_chan, buffer, buffer_size, bytes_read, pdMS_TO_TICKS(timeout_ms));

    if (ret == ESP_OK && *bytes_read > 0) {
        size_t samples_read = *bytes_read / sizeof(int16_t);

        // Calculate audio levels on RAW samples (calculate_audio_levels handles DC offset internally)
        calculate_audio_levels(buffer, samples_read);

        // Optional: Apply software gain if needed (for output/streaming, not for level calculation)
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
    }

    return ret;
}

void I2SMicrophone::set_gain(float gain)
{
    if (gain < 0.1f) {
        gain = 0.1f;  // Minimum 0.1x
    } else if (gain > 8.0f) {
        gain = 8.0f;  // Maximum 8x
    }

    m_gain = gain;
    ESP_LOGI(TAG, "Gain set to %.1fx", m_gain);
}

} // namespace audio
} // namespace who
