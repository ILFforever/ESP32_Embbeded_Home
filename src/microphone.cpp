#include "microphone.h"
#include <math.h>

// I2S configuration structure
// Try ONLY_RIGHT if L/R pin is connected to VCC instead of GND
static i2s_config_t i2s_config = {
    .mode = i2s_mode_t(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = I2S_SAMPLE_RATE,
    .bits_per_sample = i2s_bits_per_sample_t(16),
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,  // Change to I2S_CHANNEL_FMT_ONLY_RIGHT if needed
    .communication_format = i2s_comm_format_t(I2S_COMM_FORMAT_STAND_I2S),
    .intr_alloc_flags = 0,  // default interrupt priority
    .dma_buf_count = 8,
    .dma_buf_len = I2S_BUFFER_SIZE,
    .use_apll = false
};

// I2S pin configuration
static i2s_pin_config_t pin_config = {
    .bck_io_num = I2S_SCK_PIN,
    .ws_io_num = I2S_WS_PIN,
    .data_out_num = -1,
    .data_in_num = I2S_SD_PIN
};

// Initialize the I2S microphone
bool initMicrophone()
{
    Serial.println("[MIC] Initializing INMP441 microphone...");

    // Install and start I2S driver
    esp_err_t err = i2s_driver_install(I2S_PORT, &i2s_config, 0, NULL);
    if (err != ESP_OK)
    {
        Serial.printf("[MIC] Failed to install I2S driver: %d\n", err);
        return false;
    }

    // Set I2S pins
    err = i2s_set_pin(I2S_PORT, &pin_config);
    if (err != ESP_OK)
    {
        Serial.printf("[MIC] Failed to set I2S pins: %d\n", err);
        return false;
    }

    // Start I2S
    i2s_start(I2S_PORT);

    // Clear I2S DMA buffer
    i2s_zero_dma_buffer(I2S_PORT);

    // Discard first few samples (they're often garbage)
    int16_t discard;
    size_t bytes_read;
    for (int i = 0; i < 100; i++)
    {
        i2s_read(I2S_PORT, &discard, sizeof(int16_t), &bytes_read, 10);
    }

    Serial.println("[MIC] INMP441 initialized successfully");
    Serial.printf("[MIC] Sample Rate: %d Hz\n", I2S_SAMPLE_RATE);
    Serial.printf("[MIC] Pins - WS:%d, SCK:%d, SD:%d\n", I2S_WS_PIN, I2S_SCK_PIN, I2S_SD_PIN);

    return true;
}

// Read raw audio sample from microphone
int32_t readMicrophoneSample()
{
    int16_t sBuffer[I2S_BUFFER_SIZE];
    size_t bytesIn = 0;

    // Read buffer from I2S
    esp_err_t result = i2s_read(I2S_PORT, &sBuffer, I2S_BUFFER_SIZE, &bytesIn, portMAX_DELAY);

    if (result == ESP_OK && bytesIn > 0)
    {
        int samples_read = bytesIn / 8;
        if (samples_read > 0)
        {
            float mean = 0;
            for (int i = 0; i < samples_read; ++i)
            {
                mean += sBuffer[i];
            }
            mean /= samples_read;

            // Apply gain and convert to int32_t
            return (int32_t)(mean * MIC_GAIN);
        }
    }

    return 0;
}

// Calculate loudness level (RMS value)
float calculateLoudness()
{
    int64_t sum = 0;
    int32_t sample;

    // Read multiple samples and calculate RMS
    for (int i = 0; i < LOUDNESS_SAMPLES; i++)
    {
        sample = readMicrophoneSample();
        sum += (int64_t)sample * sample;
    }

    // Calculate RMS (Root Mean Square)
    float rms = sqrt((float)sum / LOUDNESS_SAMPLES);

    return rms;
}

// Get loudness in decibels
float getLoudnessDB()
{
    float rms = calculateLoudness();

    // Avoid log(0) by setting minimum threshold
    if (rms < 1.0f)
        rms = 1.0f;

    // Convert RMS to decibels
    // Reference: 20 * log10(rms / reference)
    // Using 2^15 as reference (16-bit max value)
    float db = 20.0f * log10(rms / 32768.0f);

    return db;
}

// Task function for periodic loudness updates
void updateMicrophoneLoudness()
{
    // Simply read and process samples to keep I2S buffer flowing
    // The loudness values can be accessed via calculateLoudness() and getLoudnessDB()
    // when needed by other parts of the application

    // Optionally, you can uncomment the code below to print loudness values
    /*
    static unsigned long lastPrintTime = 0;
    unsigned long currentTime = millis();

    if (currentTime - lastPrintTime >= 500)
    {
        lastPrintTime = currentTime;

        float loudness = calculateLoudness();
        float loudnessDB = getLoudnessDB();

        Serial.printf("[MIC] Loudness: %.0f (RMS) | %.1f dB\n", loudness, loudnessDB);
    }
    */
}
