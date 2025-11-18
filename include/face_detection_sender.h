#ifndef FACE_DETECTION_SENDER_H
#define FACE_DETECTION_SENDER_H

#include <Arduino.h>

/**
 * Non-Blocking Face Detection Sender
 *
 * Uses a dedicated FreeRTOS task to send face detection data (including images)
 * to the backend server without blocking the main application.
 *
 * Features:
 * - Runs on separate FreeRTOS task (typically Core 0)
 * - Queue-based communication (non-blocking enqueue)
 * - Handles large image uploads asynchronously
 * - Automatic retry on failure
 * - Memory-safe buffer management
 */

// Maximum image size (adjust based on your needs)
#define MAX_FACE_IMAGE_SIZE 50000  // 50KB

// Face detection event structure
struct FaceDetectionEvent {
    bool recognized;
    char name[32];
    float confidence;
    uint8_t* imageData;  // Dynamically allocated buffer
    size_t imageSize;
    unsigned long timestamp;
};

/**
 * Initialize the non-blocking face detection sender
 * Creates FreeRTOS task and queue
 *
 * @param stackSize Stack size for task (default 8KB)
 * @param priority Task priority (default 1)
 * @param coreId Core to run on (default Core 0)
 */
void initFaceDetectionSender(uint32_t stackSize = 8192, UBaseType_t priority = 1, BaseType_t coreId = 0);

/**
 * Queue a face detection event to be sent asynchronously
 * This function returns immediately and does not block
 *
 * @param recognized Whether face was recognized
 * @param name Name of recognized person (or "Unknown")
 * @param confidence Recognition confidence (0.0-1.0)
 * @param imageData Pointer to JPEG image data (will be copied)
 * @param imageSize Size of image in bytes
 * @return true if queued successfully, false if queue is full
 */
bool queueFaceDetection(bool recognized, const char* name, float confidence,
                        const uint8_t* imageData, size_t imageSize);

/**
 * Get the number of pending face detection events in the queue
 */
int getPendingFaceDetectionCount();

/**
 * Get statistics about the face detection sender
 */
struct FaceDetectionStats {
    uint32_t totalQueued;
    uint32_t totalSent;
    uint32_t totalFailed;
    uint32_t queueOverflows;
    uint32_t lastSendDurationMs;
};

FaceDetectionStats getFaceDetectionStats();

#endif // FACE_DETECTION_SENDER_H
