#ifndef FACE_RECOGNITION_CONTROLLER_H
#define FACE_RECOGNITION_CONTROLLER_H

#include <Arduino.h>

// Face recognition states
enum FaceRecognitionState {
    FACE_REC_IDLE = 0,
    FACE_REC_CAMERA_STARTING,
    FACE_REC_DETECTION_RESUMING,
    FACE_REC_RECOGNIZING,
    FACE_REC_ACTIVE
};

// Face Recognition Controller Class
class FaceRecognitionController {
private:
    FaceRecognitionState currentState;
    unsigned long stateStartTime;
    unsigned long recognitionStartTime;
    bool isActive;

    // Timing constants (in milliseconds)
    static const unsigned long CAMERA_START_DELAY = 100;
    static const unsigned long DETECTION_RESUME_DELAY = 500;
    static const unsigned long RECOGNITION_TIMEOUT = 10000;  // 10 seconds

public:
    FaceRecognitionController();

    // Start the face recognition process
    void startRecognition();

    // Stop/cancel face recognition
    void stopRecognition();

    // Update state machine - call this regularly from scheduler
    void update();

    // Check if face recognition is currently active
    bool isRecognitionActive() const;

    // Get current state
    FaceRecognitionState getState() const;

    // Handle recognition result from UART response
    void handleRecognitionResult(int result);

    // Reset to idle state
    void reset();
};

// Global instance
extern FaceRecognitionController faceRecController;

#endif // FACE_RECOGNITION_CONTROLLER_H
