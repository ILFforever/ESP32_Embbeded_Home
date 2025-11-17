// spi_test_master.cpp - Simple SPI master test for Arduino
#include <Arduino.h>
#include "SPIMaster.h"

extern SPIMaster spiMaster;

void spi_test_verify_pattern(uint8_t* data, uint32_t size) {
    // Verify the data matches expected pattern (0x00, 0x01, 0x02...0xFF, repeat)
    bool valid = true;
    uint32_t errors = 0;

    for (uint32_t i = 0; i < size; i++) {
        uint8_t expected = i % 256;
        if (data[i] != expected) {
            valid = false;
            errors++;
            if (errors <= 5) {  // Only print first 5 errors
                Serial.print("ERROR at byte ");
                Serial.print(i);
                Serial.print(": expected 0x");
                Serial.print(expected, HEX);
                Serial.print(" got 0x");
                Serial.println(data[i], HEX);
            }
        }
    }

    if (valid) {
        Serial.println("[TEST] ✓ Data pattern verified - ALL CORRECT!");
    } else {
        Serial.print("[TEST] ✗ Data pattern errors: ");
        Serial.print(errors);
        Serial.print(" out of ");
        Serial.println(size);
    }
}

void spi_test_process_frame() {
    if (spiMaster.isFrameReady()) {
        uint32_t start_time = millis();

        Serial.println("");
        Serial.println("=== SPI Test Frame Received ===");
        Serial.print("Frame ID: ");
        Serial.println(spiMaster.getFrameId());
        Serial.print("Size: ");
        Serial.print(spiMaster.getFrameSize());
        Serial.println(" bytes");

        // Verify the test pattern
        spi_test_verify_pattern(spiMaster.getFrameData(), spiMaster.getFrameSize());

        uint32_t duration = millis() - start_time;
        Serial.print("Verification time: ");
        Serial.print(duration);
        Serial.println(" ms");

        // Print stats
        Serial.print("Total frames received: ");
        Serial.println(spiMaster.getFramesReceived());
        Serial.print("Total frames dropped: ");
        Serial.println(spiMaster.getFramesDropped());
        Serial.println("");

        // Acknowledge frame
        spiMaster.ackFrame();
    }
}
