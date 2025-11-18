/**
 * Integration Example: Non-Blocking Face Recognition
 *
 * This file shows the exact code changes needed in your main.cpp
 * to integrate the non-blocking face recognition controller.
 */

// ============================================================================
// STEP 1: Add include at the top of main.cpp
// ============================================================================

#include "face_recognition_controller.h"


// ============================================================================
// STEP 2: In setup(), add the scheduler task
// ============================================================================

void setup() {
    // ... your existing setup code ...

    // Add this task after all your other scheduler tasks
    // Place it before enabling all tasks

    Task taskFaceRecUpdate(10, TASK_FOREVER, []() {
        faceRecController.update();
    });
    myscheduler.addTask(taskFaceRecUpdate);
    taskFaceRecUpdate.enable();

    // ... rest of your setup code ...
}


// ============================================================================
// STEP 3: Replace blocking button handler
// ============================================================================

// FIND THIS CODE IN YOUR BUTTON HANDLER:

/*  OLD CODE - REMOVE THIS:
if (strcmp(buttonName, "Doorbell") == 0) {
    sendUARTCommand("camera_control", "camera_start");
    delay(100);  // BLOCKING!
    sendUARTCommand("resume_detection");
    delay(500);  // BLOCKING!
    sendUARTCommand("recognize_face");

    face_recognition_start_time = millis();
    face_recognition_active = true;
}
*/

// REPLACE WITH THIS:

if (strcmp(buttonName, "Doorbell") == 0) {
    faceRecController.startRecognition();
}


// ============================================================================
// STEP 4: Update uart_commands.cpp handleUARTResponse()
// ============================================================================

// In handleUARTResponse(), find where you handle recognition results
// and add the controller notification:

void handleUARTResponse() {
    // ... existing code ...

    // Find your JSON parsing section
    StaticJsonDocument<2048> doc;
    DeserializationError error = deserializeJson(doc, MasterSerial);

    if (!error) {
        // ... existing response handling ...

        // ADD THIS SECTION to notify the controller of recognition results:
        if (doc.containsKey("type") && strcmp(doc["type"], "recognition") == 0) {
            if (doc.containsKey("result")) {
                int result = doc["result"];
                // 1 = success, 2 = failure
                recognition_state = result;
                faceRecController.handleRecognitionResult(result);
            }
        }

        // ... rest of your code ...
    }
}


// ============================================================================
// STEP 5: (Optional) Remove old timeout checking code
// ============================================================================

// Find and REMOVE this code from your timer checking task:

/*  OLD TIMEOUT CODE - CAN BE REMOVED:
if (face_recognition_active &&
    (millis() - face_recognition_start_time > FACE_RECOGNITION_TIMEOUT)) {
    updateStatusMsg("Recognition timeout", true, "Standing By");
    sendUARTCommand("camera_control", "camera_stop");
    face_recognition_active = false;
}
*/

// The controller now handles timeouts internally!


// ============================================================================
// COMPLETE EXAMPLE: Minimal working setup()
// ============================================================================

void exampleSetup() {
    Serial.begin(115200);

    // ... LCD, UART, SPI, NFC initialization ...

    // Create all your existing tasks
    // Task taskRenderUI(...);
    // Task taskCheckTimers(...);
    // etc.

    // ADD THIS TASK:
    Task taskFaceRecUpdate(10, TASK_FOREVER, []() {
        faceRecController.update();
    });

    // Add all tasks to scheduler
    myscheduler.addTask(taskFaceRecUpdate);
    // ... add other tasks ...

    // Enable all tasks
    taskFaceRecUpdate.enable();
    // ... enable other tasks ...
}


// ============================================================================
// USAGE EXAMPLES
// ============================================================================

void usageExamples() {
    // Start face recognition (non-blocking)
    faceRecController.startRecognition();

    // Check if recognition is active
    if (faceRecController.isRecognitionActive()) {
        Serial.println("Recognition in progress...");
    }

    // Manually stop recognition
    faceRecController.stopRecognition();

    // Get current state
    FaceRecognitionState state = faceRecController.getState();
    switch (state) {
        case FACE_REC_IDLE:
            Serial.println("Idle");
            break;
        case FACE_REC_CAMERA_STARTING:
            Serial.println("Starting camera...");
            break;
        case FACE_REC_DETECTION_RESUMING:
            Serial.println("Resuming detection...");
            break;
        case FACE_REC_ACTIVE:
            Serial.println("Recognizing...");
            break;
    }
}


// ============================================================================
// DEBUGGING TIPS
// ============================================================================

/*
1. Monitor Serial output for [FaceRec] messages:
   [FaceRec] Starting non-blocking face recognition
   [FaceRec] Camera started, resuming detection
   [FaceRec] Detection resumed, starting recognition
   [FaceRec] Recognition active, waiting for result

2. Verify scheduler task is running:
   Add a counter in the update task and print every 1000 calls

3. Test responsiveness:
   - Press doorbell button
   - Immediately try NFC card read
   - Both should work without blocking

4. Check timing:
   - Commands should be sent with proper delays
   - Camera start -> 100ms -> Resume detection -> 500ms -> Recognize
*/
