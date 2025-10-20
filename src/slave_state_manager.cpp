#include "slave_state_manager.h"
#include "uart_commands.h"

// Global state tracking
int desired_slave_mode = 0;  // What we want
int actual_slave_mode = 0;   // What slave reports (same as slave_status)

static unsigned long last_sync_check = 0;
#define SYNC_CHECK_INTERVAL 1000  // Check every 1 second

// Set what mode we want the slave in
void setDesiredMode(int mode) {
    if (desired_slave_mode != mode) {
        Serial.printf("[STATE] Desired mode: %d -> %d\n", desired_slave_mode, mode);
        desired_slave_mode = mode;
    }
}

// Update what mode slave is actually in (called from UART response handler)
void updateActualMode(int mode) {
    actual_slave_mode = mode;
}

// Check if slave is in the mode we want, if not, send recovery commands
void checkSlaveSync() {
    unsigned long now = millis();

    // Don't check too frequently
    if (now - last_sync_check < SYNC_CHECK_INTERVAL) {
        return;
    }
    last_sync_check = now;

    // If disconnected, can't do anything
    if (actual_slave_mode == -1) {
        return;
    }

    // Check if modes match
    if (desired_slave_mode == actual_slave_mode) {
        return; // All good
    }

    // Modes don't match - recovery needed
    Serial.printf("[STATE] Mode mismatch! Desired=%d, Actual=%d - Recovering...\n",
                  desired_slave_mode, actual_slave_mode);

    // Send commands to restore desired mode
    switch (desired_slave_mode) {
        case 0:  // Should be standby
            Serial.println("[STATE] Recovery: Stopping camera");
            sendUARTCommand("camera_control", "camera_stop");
            //sendUARTCommand("stop_recognition");
            break;

        case 1:  // Should have camera running
            if (actual_slave_mode == 0) {
                Serial.println("[STATE] Recovery: Starting camera");
                sendUARTCommand("camera_control", "camera_start");
            } else if (actual_slave_mode == 2) {
                Serial.println("[STATE] Recovery: Stopping recognition");
                //sendUARTCommand("stop_recognition");
            }
            break;

        case 2:  // Should have recognition running
            if (actual_slave_mode == 0) {
                Serial.println("[STATE] Recovery: Starting camera + recognition");
                sendUARTCommand("camera_control", "camera_start");
                delay(100);  // Give camera time to start
                sendUARTCommand("start_recognition");
            } else if (actual_slave_mode == 1) {
                Serial.println("[STATE] Recovery: Starting recognition");
                sendUARTCommand("start_recognition");
            }
            break;

        default:
            Serial.printf("[STATE] Unknown desired mode: %d\n", desired_slave_mode);
            break;
    }
}
