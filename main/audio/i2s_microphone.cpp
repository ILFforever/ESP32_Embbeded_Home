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
    ESP_LOGI(TAG, "Initializing I2S PDM microphone...");
    ESP_LOGI(TAG, "  Sample rate: %lu Hz", m_sample_rate);
    ESP_LOGI(TAG, "  CLK GPIO: %d", m_clk_gpio);
    ESP_LOGI(TAG, "  DATA GPIO: %d", m_data_gpio);

    // Create I2S RX channel with smaller buffers for lower latency
    i2s_chan_config_t chan_cfg = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_0, I2S_ROLE_MASTER);
    chan_cfg.dma_desc_num = 3;   // Reduced from 4 (3 × 512 = 96ms total @ 16kHz)
    chan_cfg.dma_frame_num = 512; // Reduced from 1024 (32ms per descriptor)

    esp_err_t ret = i2s_new_channel(&chan_cfg, NULL, &m_rx_chan);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to create I2S RX channel: %s", esp_err_to_name(ret));
        return ret;
    }

    // Configure PDM RX mode
    i2s_pdm_rx_config_t pdm_rx_cfg = {
        .clk_cfg = I2S_PDM_RX_CLK_DEFAULT_CONFIG(m_sample_rate),
        .slot_cfg = I2S_PDM_RX_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO),
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

    ESP_LOGI(TAG, "I2S PDM microphone initialized successfully");
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
    ESP_LOGI(TAG, "Microphone started - streaming audio");
    return true;
}

void I2SMicrophone::stop()
{
    if (!m_is_running) {
        return;
    }

    ESP_LOGI(TAG, "Stopping microphone...");
    m_is_running = false;

    // Disable I2S channel
    if (m_rx_chan) {
        i2s_channel_disable(m_rx_chan);
    }

    ESP_LOGI(TAG, "Microphone stopped");
}

void I2SMicrophone::calculate_audio_levels(const int16_t* samples, size_t count)
{
    if (count == 0) {
        return;
    }

    uint64_t sum_squares = 0;
    int16_t peak = 0;

    for (size_t i = 0; i < count; i++) {
        int16_t sample = samples[i];

        // Calculate squared value for RMS
        int32_t squared = static_cast<int32_t>(sample) * sample;
        sum_squares += squared;

        // Track peak
        int16_t abs_sample = abs(sample);
        if (abs_sample > peak) {
            peak = abs_sample;
        }
    }

    // Calculate RMS (Root Mean Square)
    uint32_t mean_square = sum_squares / count;
    m_last_rms = static_cast<uint32_t>(sqrt(mean_square));
    m_last_peak = peak;
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
        // Update audio levels for status monitoring
        size_t samples_read = *bytes_read / sizeof(int16_t);
        calculate_audio_levels(buffer, samples_read);
    }

    return ret;
}

void I2SMicrophone::print_audio_stats()
{
    // Kept for debugging purposes (can be called manually)
    float rms_percent = (m_last_rms / 32767.0f) * 100.0f;
    float peak_percent = (m_last_peak / 32767.0f) * 100.0f;

    ESP_LOGI(TAG, "Audio: RMS=%lu (%.1f%%) Peak=%lu (%.1f%%)",
             m_last_rms, rms_percent,
             m_last_peak, peak_percent);
}

} // namespace audio
} // namespace who
