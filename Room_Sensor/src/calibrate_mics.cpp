/**
 * MICS-5524 Gas Sensor Calibration Script
 *
 * PURPOSE: One-time calibration in CLEAN AIR
 * Run this script ONCE in a clean air environment for 20 minutes
 * It will calculate and store the R0 baseline value
 *
 * INSTRUCTIONS:
 * 1. Ensure sensor is in CLEAN AIR (well-ventilated room, no gas sources)
 * 2. Upload this script to ESP32
 * 3. Wait 20 minutes for sensor to stabilize
 * 4. R0 value will be stored in RTC memory
 * 5. Upload main_hybrid.cpp - it will use the stored R0
 *
 * WARNING: Do NOT run this during a fire or in contaminated air!
 */

#include <Arduino.h>

// GPIO Configuration
#define MICS5524_HEATER_PIN 25
#define MICS5524_ANALOG_PIN 34
#define EXTERNAL_LED_PIN 13

// LED PWM Configuration
#define LED_PWM_CHANNEL 0
#define LED_PWM_FREQ 5000
#define LED_PWM_RESOLUTION 8

// Calibration Settings
#define WARMUP_TIME_MS 1200000  // 20 minutes (1200 seconds)
#define SAMPLE_INTERVAL_MS 5000 // Sample every 5 seconds
#define FINAL_SAMPLES 50        // Final 50 samples for averaging

// RTC Memory (survives deep sleep and reset)
RTC_DATA_ATTR bool micsCalibrated = false;
RTC_DATA_ATTR int16_t mics_r0 = 2048;  // Baseline resistance

void setup()
{
  Serial.begin(115200);
  delay(2000);

  Serial.println("\n\n========================================");
  Serial.println("  MICS-5524 CALIBRATION SCRIPT");
  Serial.println("========================================");
  Serial.println();
  Serial.println("⚠️  WARNING: ENSURE SENSOR IS IN CLEAN AIR!");
  Serial.println();
  Serial.println("This script will:");
  Serial.println("  1. Heat sensor for 20 minutes");
  Serial.println("  2. Monitor stabilization");
  Serial.println("  3. Calculate R0 baseline");
  Serial.println("  4. Store R0 in RTC memory");
  Serial.println();
  Serial.println("Do NOT run this during a fire or in");
  Serial.println("contaminated air - it will calibrate");
  Serial.println("incorrectly!");
  Serial.println("========================================\n");

  delay(3000);

  // Setup pins
  pinMode(MICS5524_HEATER_PIN, OUTPUT);
  digitalWrite(MICS5524_HEATER_PIN, LOW);

  // Setup LED PWM
  ledcSetup(LED_PWM_CHANNEL, LED_PWM_FREQ, LED_PWM_RESOLUTION);
  ledcAttachPin(EXTERNAL_LED_PIN, LED_PWM_CHANNEL);
  ledcWrite(LED_PWM_CHANNEL, 0);

  // Setup ADC
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);

  Serial.println("[SETUP] ✓ GPIO and ADC configured");
  Serial.println();
}

void loop()
{
  // Turn on heater
  digitalWrite(MICS5524_HEATER_PIN, HIGH);
  Serial.println("[HEATER] ✓ ON - Starting 20-minute warmup");
  Serial.println();

  unsigned long startTime = millis();
  unsigned long lastSample = 0;
  uint32_t sampleCount = 0;

  // Arrays to store readings for analysis
  uint16_t allReadings[300];  // Up to 300 samples (20 min / 5 sec)
  uint16_t finalReadings[FINAL_SAMPLES];

  Serial.println("Time(s) | ADC  | Inverted | Status");
  Serial.println("--------|------|----------|--------");

  // Warmup phase - 20 minutes
  while (millis() - startTime < WARMUP_TIME_MS)
  {
    // Breathing LED effect during warmup
    int brightness = (millis() / 20) % 512;
    if (brightness > 255) brightness = 511 - brightness;
    ledcWrite(LED_PWM_CHANNEL, brightness);

    // Take samples every 5 seconds
    if (millis() - lastSample >= SAMPLE_INTERVAL_MS)
    {
      lastSample = millis();

      // Read ADC
      uint32_t sum = 0;
      for (int i = 0; i < 10; i++) {
        sum += analogRead(MICS5524_ANALOG_PIN);
        delay(10);
      }
      uint16_t adc = sum / 10;
      uint16_t inverted = 4095 - adc;

      // Store reading
      if (sampleCount < 300) {
        allReadings[sampleCount] = inverted;
      }

      // Calculate elapsed time
      unsigned long elapsed = (millis() - startTime) / 1000;
      unsigned long remaining = (WARMUP_TIME_MS - (millis() - startTime)) / 1000;

      // Print status
      Serial.printf("%7lu | %4d | %8d | ", elapsed, adc, inverted);

      if (elapsed < 300) {
        Serial.println("Warming up...");
      } else if (elapsed < 900) {
        Serial.println("Stabilizing...");
      } else {
        Serial.printf("Final phase (%lus left)\n", remaining);
      }

      sampleCount++;
    }
  }

  Serial.println();
  Serial.println("[WARMUP] ✓ 20-minute warmup complete!");
  Serial.println();

  // Turn off heater
  digitalWrite(MICS5524_HEATER_PIN, LOW);
  Serial.println("[HEATER] ✗ OFF");

  // Solid LED during calculation
  ledcWrite(LED_PWM_CHANNEL, 255);

  // Take final stable readings
  Serial.println();
  Serial.println("[CALIBRATION] Taking final stable readings...");
  digitalWrite(MICS5524_HEATER_PIN, HIGH);
  delay(5000);  // Quick 5s warmup

  for (int i = 0; i < FINAL_SAMPLES; i++)
  {
    uint32_t sum = 0;
    for (int j = 0; j < 10; j++) {
      sum += analogRead(MICS5524_ANALOG_PIN);
      delay(10);
    }
    finalReadings[i] = 4095 - (sum / 10);
    delay(100);
  }

  digitalWrite(MICS5524_HEATER_PIN, LOW);

  // Calculate R0 from final samples
  uint32_t sum = 0;
  uint16_t minVal = 4095;
  uint16_t maxVal = 0;

  for (int i = 0; i < FINAL_SAMPLES; i++)
  {
    sum += finalReadings[i];
    if (finalReadings[i] < minVal) minVal = finalReadings[i];
    if (finalReadings[i] > maxVal) maxVal = finalReadings[i];
  }

  mics_r0 = sum / FINAL_SAMPLES;
  micsCalibrated = true;

  // Print results
  Serial.println();
  Serial.println("========================================");
  Serial.println("  CALIBRATION COMPLETE!");
  Serial.println("========================================");
  Serial.printf("Total samples taken: %d\n", sampleCount);
  Serial.printf("Final %d samples analyzed\n", FINAL_SAMPLES);
  Serial.println();
  Serial.printf("R0 (Baseline): %d\n", mics_r0);
  Serial.printf("Min value: %d\n", minVal);
  Serial.printf("Max value: %d\n", maxVal);
  Serial.printf("Variance: %d\n", maxVal - minVal);
  Serial.println();
  Serial.println("✓ Stored in RTC memory");
  Serial.println();

  // Stability check
  float variance_percent = ((float)(maxVal - minVal) / (float)mics_r0) * 100.0;
  Serial.printf("Stability: %.2f%% variance\n", variance_percent);

  if (variance_percent < 5.0) {
    Serial.println("✓ EXCELLENT - Sensor is very stable");
  } else if (variance_percent < 10.0) {
    Serial.println("✓ GOOD - Sensor is stable");
  } else if (variance_percent < 20.0) {
    Serial.println("⚠ FAIR - Consider recalibrating");
  } else {
    Serial.println("✗ POOR - Air may not be clean, recalibrate!");
  }

  Serial.println();
  Serial.println("========================================");
  Serial.println("NEXT STEPS:");
  Serial.println("1. Upload main_hybrid.cpp to use this R0");
  Serial.println("2. R0 will persist in RTC memory");
  Serial.println("3. Only power cycle will reset it");
  Serial.println("========================================");

  // Blink LED to indicate completion
  ledcWrite(LED_PWM_CHANNEL, 0);
  for (int i = 0; i < 10; i++) {
    ledcWrite(LED_PWM_CHANNEL, 255);
    delay(200);
    ledcWrite(LED_PWM_CHANNEL, 0);
    delay(200);
  }

  Serial.println();
  Serial.println("[DONE] Calibration complete. You can now upload main_hybrid.cpp");

  // Stay in idle loop
  while (true) {
    delay(1000);
  }
}
