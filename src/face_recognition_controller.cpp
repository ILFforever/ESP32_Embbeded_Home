#include "face_recognition_controller.h"
#include "uart_commands.h"
#include "lcd_helper.h"

// Global instance
FaceRecognitionController faceRecController;

// External variables from main.cpp
extern bool face_recognition_active;
extern unsigned long face_recognition_start_time;
extern int recognition_state;

FaceRecognitionController::FaceRecognitionController()
    : currentState(FACE_REC_IDLE),
      stateStartTime(0),
      recognitionStartTime(0),
      isActive(false) {
}

void FaceRecognitionController::startRecognition() {
    if (currentState != FACE_REC_IDLE) {
        // Already in progress, ignore
        return;
    }

    Serial.println("[FaceRec] Starting non-blocking face recognition");

    // Initialize state machine
    currentState = FACE_REC_CAMERA_STARTING;
    stateStartTime = millis();
    isActive = true;

    // Send camera start command
    sendUARTCommand("camera_control", "camera_start");

    // Update global variables for compatibility
    face_recognition_active = true;
    face_recognition_start_time = millis();
}

void FaceRecognitionController::stopRecognition() {
    if (currentState == FACE_REC_IDLE) {
        return;
    }

    Serial.println("[FaceRec] Stopping face recognition");

    // Stop camera
    sendUARTCommand("camera_control", "camera_stop");

    // Reset state
    reset();
}

void FaceRecognitionController::update() {
    if (currentState == FACE_REC_IDLE) {
        return;
    }

    unsigned long currentTime = millis();
    unsigned long elapsedTime = currentTime - stateStartTime;

    switch (currentState) {
        case FACE_REC_CAMERA_STARTING:
            // Wait for CAMERA_START_DELAY before resuming detection
            if (elapsedTime >= CAMERA_START_DELAY) {
                Serial.println("[FaceRec] Camera started, resuming detection");
                sendUARTCommand("resume_detection");
                currentState = FACE_REC_DETECTION_RESUMING;
                stateStartTime = currentTime;
            }
            break;

        case FACE_REC_DETECTION_RESUMING:
            // Wait for DETECTION_RESUME_DELAY before recognizing face
            if (elapsedTime >= DETECTION_RESUME_DELAY) {
                Serial.println("[FaceRec] Detection resumed, starting recognition");
                sendUARTCommand("recognize_face");
                currentState = FACE_REC_RECOGNIZING;
                recognitionStartTime = currentTime;
                stateStartTime = currentTime;
            }
            break;

        case FACE_REC_RECOGNIZING:
            // Transition to active recognition
            currentState = FACE_REC_ACTIVE;
            Serial.println("[FaceRec] Recognition active, waiting for result");
            break;

        case FACE_REC_ACTIVE:
            // Check for timeout
            if ((currentTime - recognitionStartTime) >= RECOGNITION_TIMEOUT) {
                Serial.println("[FaceRec] Recognition timeout");
                updateStatusMsg("Recognition timeout", true, "Standing By");
                stopRecognition();
            }
            // Recognition result will be handled by handleRecognitionResult()
            break;

        default:
            break;
    }
}

bool FaceRecognitionController::isRecognitionActive() const {
    return isActive && (currentState != FACE_REC_IDLE);
}

FaceRecognitionState FaceRecognitionController::getState() const {
    return currentState;
}

void FaceRecognitionController::handleRecognitionResult(int result) {
    if (currentState != FACE_REC_ACTIVE && currentState != FACE_REC_RECOGNIZING) {
        return;
    }

    Serial.printf("[FaceRec] Recognition result received: %d\n", result);

    // Update global recognition_state for compatibility
    recognition_state = result;

    if (result == 1) {
        // Success
        Serial.println("[FaceRec] Face recognized successfully");
        updateStatusMsg("Face recognized!", true, "Welcome!");
    } else if (result == 2) {
        // Failure
        Serial.println("[FaceRec] Face not recognized");
        updateStatusMsg("Unknown face", true, "Access Denied");
    }

    // Stop recognition after result
    stopRecognition();
}

void FaceRecognitionController::reset() {
    currentState = FACE_REC_IDLE;
    stateStartTime = 0;
    recognitionStartTime = 0;
    isActive = false;

    // Update global variables
    face_recognition_active = false;
}
