# Non-Blocking Face Recognition Implementation

## Overview

This implementation replaces the blocking `delay()` calls in the face recognition process with a non-blocking state machine that integrates seamlessly with the existing TaskScheduler.

## Problem Solved

**Before (Blocking):**
```cpp
sendUARTCommand("camera_control", "camera_start");
delay(100);  // ← BLOCKS entire system for 100ms
sendUARTCommand("resume_detection");
delay(500);  // ← BLOCKS entire system for 500ms
sendUARTCommand("recognize_face");
```

**After (Non-Blocking):**
```cpp
faceRecController.startRecognition();
// System continues running while state machine handles timing
```

## Architecture

### State Machine States

1. **FACE_REC_IDLE**: No recognition in progress
2. **FACE_REC_CAMERA_STARTING**: Camera start command sent, waiting 100ms
3. **FACE_REC_DETECTION_RESUMING**: Detection resumed, waiting 500ms
4. **FACE_REC_RECOGNIZING**: Recognition command sent
5. **FACE_REC_ACTIVE**: Actively waiting for recognition result (with timeout)

### Files Added

- `include/face_recognition_controller.h` - Header file with class definition
- `src/face_recognition_controller.cpp` - Implementation with state machine logic

## Integration Steps

### 1. Add to PlatformIO Configuration

No changes needed - uses existing libraries.

### 2. Update main.cpp

#### Include the header
```cpp
#include "face_recognition_controller.h"
```

#### In setup(), add scheduler task

Add this after your existing scheduler tasks:

```cpp
// Face recognition controller task - runs every 10ms
Task taskFaceRecUpdate(10, TASK_FOREVER, []() {
    faceRecController.update();
});
myscheduler.addTask(taskFaceRecUpdate);
taskFaceRecUpdate.enable();
```

#### Replace blocking button handler

**OLD CODE (Blocking):**
```cpp
if (strcmp(buttonName, "Doorbell") == 0) {
    sendUARTCommand("camera_control", "camera_start");
    delay(100);
    sendUARTCommand("resume_detection");
    delay(500);
    sendUARTCommand("recognize_face");

    face_recognition_start_time = millis();
    face_recognition_active = true;
}
```

**NEW CODE (Non-Blocking):**
```cpp
if (strcmp(buttonName, "Doorbell") == 0) {
    faceRecController.startRecognition();
}
```

#### Update UART response handler

In `handleUARTResponse()` (uart_commands.cpp), add result handling:

```cpp
// In the section where you parse recognition results
if (doc.containsKey("recognition_result")) {
    int result = doc["recognition_result"];
    faceRecController.handleRecognitionResult(result);
}
```

### 3. Remove old timeout checking (Optional)

The `FaceRecognitionController` now handles timeouts internally, so you can remove this code from your timer checking task:

```cpp
// OLD CODE - can be removed
if (face_recognition_active &&
    (millis() - face_recognition_start_time > FACE_RECOGNITION_TIMEOUT)) {
    updateStatusMsg("Recognition timeout", true, "Standing By");
    sendUARTCommand("camera_control", "camera_stop");
    face_recognition_active = false;
}
```

## API Reference

### FaceRecognitionController

#### Methods

- **`void startRecognition()`**
  Starts the non-blocking face recognition process. Safe to call multiple times (ignores if already running).

- **`void stopRecognition()`**
  Cancels ongoing recognition and stops the camera.

- **`void update()`**
  Updates the state machine. **Must be called regularly** (recommended: every 10-50ms via TaskScheduler).

- **`bool isRecognitionActive()`**
  Returns `true` if recognition is currently in progress.

- **`FaceRecognitionState getState()`**
  Returns the current state of the state machine.

- **`void handleRecognitionResult(int result)`**
  Call this when a recognition result is received from UART.
  - `result = 1`: Success (face recognized)
  - `result = 2`: Failure (unknown face)

- **`void reset()`**
  Manually reset to idle state.

### Global Instance

```cpp
extern FaceRecognitionController faceRecController;
```

Use this global instance throughout your code.

## Benefits

1. **Non-Blocking**: System remains responsive during face recognition
2. **State-Based**: Clear state machine makes debugging easier
3. **Timeout Handling**: Built-in 10-second timeout
4. **Compatible**: Works with existing global variables (`face_recognition_active`, etc.)
5. **Scheduler Integration**: Uses TaskScheduler for precise timing
6. **Serial Debugging**: Built-in debug messages prefixed with `[FaceRec]`

## Testing Checklist

- [ ] Face recognition starts when doorbell button is pressed
- [ ] System remains responsive during recognition (LCD updates, NFC reads work)
- [ ] Recognition timeout works after 10 seconds
- [ ] Successful recognition updates status message
- [ ] Failed recognition updates status message
- [ ] Can handle button press during active recognition (ignored)
- [ ] Camera stops after recognition completes

## Troubleshooting

### Recognition doesn't start
- Check that `taskFaceRecUpdate` is enabled in scheduler
- Verify `faceRecController.update()` is being called (add Serial.println)

### Commands sent too fast/slow
- Adjust timing constants in header file:
  ```cpp
  static const unsigned long CAMERA_START_DELAY = 100;      // Adjust as needed
  static const unsigned long DETECTION_RESUME_DELAY = 500;  // Adjust as needed
  ```

### Serial debug output
Enable debug output by monitoring for `[FaceRec]` prefixed messages:
```
[FaceRec] Starting non-blocking face recognition
[FaceRec] Camera started, resuming detection
[FaceRec] Detection resumed, starting recognition
[FaceRec] Recognition active, waiting for result
[FaceRec] Recognition result received: 1
[FaceRec] Face recognized successfully
```

## Performance Impact

- **Memory**: ~100 bytes for FaceRecognitionController instance
- **CPU**: Minimal (state machine check every 10-50ms)
- **Responsiveness**: System can handle other tasks during the 600ms+ recognition process

## Migration Summary

| Component | Old (Blocking) | New (Non-Blocking) |
|-----------|---------------|-------------------|
| Button handler | `delay()` calls | `startRecognition()` |
| Timing | Blocking delays | State machine |
| Timeout check | Manual timer check | Built-in |
| State tracking | Global booleans | State enum |
| Integration | Inline code | Scheduler task |
