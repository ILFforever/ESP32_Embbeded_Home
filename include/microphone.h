#ifndef MICROPHONE_H
#define MICROPHONE_H

#include <Arduino.h>
#include <driver/i2s.h>

// I2S Configuration for INMP441
#define I2S_PORT          I2S_NUM_0
#define I2S_SAMPLE_RATE   44100  // 44.1kHz sample rate
#define I2S_BUFFER_SIZE   64     // DMA buffer size

// INMP441 Pin Configuration
#define I2S_WS_PIN        32     // Word Select (LRCK)
#define I2S_SCK_PIN       12      // Serial Clock (BCLK)
#define I2S_SD_PIN        13     // Serial Data (DOUT)

// Microphone settings
#define MIC_GAIN          1.0f   // Gain multiplier
#define LOUDNESS_SAMPLES  100    // Number of samples to average for loudness

// Initialize the I2S microphone
bool initMicrophone();

// Read raw audio samples from microphone
int32_t readMicrophoneSample();

// Calculate loudness level (RMS value)
float calculateLoudness();

// Get loudness in decibels
float getLoudnessDB();

// Task function for periodic loudness updates
void updateMicrophoneLoudness();

#endif // MICROPHONE_H
