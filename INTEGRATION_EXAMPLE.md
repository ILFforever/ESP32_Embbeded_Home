# Quick Integration Example

## Before (Blocking) vs After (Non-Blocking)

### Before: System Blocks for 3-5 Seconds

```cpp
// src/comm/uart_commands.cpp - Line 211
// ❌ BLOCKS ENTIRE SYSTEM
sendFaceDetection(recognized, name, confidence, frameData, frameSize);

// Nothing else can run during this time:
// - No button presses detected
// - No NFC reads
// - LCD frozen
// - UART messages queued up
```

### After: System Stays Responsive

```cpp
// src/comm/uart_commands.cpp - Line 211
// ✅ RETURNS IMMEDIATELY
bool queued = sendFaceDetectionAsync(recognized, name, confidence, frameData, frameSize);

// System continues running:
// - Buttons work instantly
// - NFC reads process
// - LCD updates smoothly
// - UART messages handled immediately
```

## Complete Integration (3 Files)

### File 1: `src/main.cpp`

```cpp
#include "face_detection_sender.h"  // ADD THIS

void setup() {
    // ... existing initialization ...

    // Initialize heartbeat (already there)
    initHeartbeat(serverUrl, deviceId, deviceType, apiToken);

    // ADD THIS LINE:
    initFaceDetectionSender(8192, 1, 0);  // 8KB stack, priority 1, Core 0
    Serial.println("[Setup] Non-blocking face sender ready");

    // ... rest of setup ...
}

// loop() - no changes needed
void loop() {
    myscheduler.execute();
}
```

### File 2: `src/comm/uart_commands.cpp`

```cpp
// ADD at top of file:
#include "face_detection_sender.h"

// FIND this section (around line 209-211):
void handleUARTResponse() {
    // ... existing code ...

    // OLD (BLOCKING):
    // sendFaceDetection(recognized, name, confidence, frameData, frameSize);

    // NEW (NON-BLOCKING):
    bool queued = sendFaceDetectionAsync(recognized, name, confidence, frameData, frameSize);
    if (!queued) {
        Serial.println("[UART] ⚠ Face detection queue full!");
    }

    // ... rest of code ...
}
```

### File 3: No changes to other files needed!

The new files are self-contained:
- `include/face_detection_sender.h` (NEW)
- `src/face_detection_sender.cpp` (NEW)
- `include/heartbeat.h` (MODIFIED - added async function)
- `src/heartbeat.cpp` (MODIFIED - added async wrapper)

## Testing Steps

1. **Upload code to ESP32**

2. **Open Serial Monitor** (115200 baud)

3. **Trigger face detection** (doorbell button)

4. **Watch for output:**
   ```
   [Heartbeat] Queueing face detection (async) - recognized: Yes, name: John
   [Heartbeat] ✓ Face detection queued (non-blocking)
   [FaceDetectionSender] Processing event (recognized: Yes, name: John)
   [FaceDetectionSender] Sending 19482 bytes
   [FaceDetectionSender] Progress: 2048/19482 (10.5%)
   ...
   [FaceDetectionSender] ✓ Sent successfully in 3421ms (code: 200)
   ```

5. **Test responsiveness:**
   - Press doorbell button repeatedly → Should respond immediately
   - Scan NFC card during upload → Should read instantly
   - Watch LCD → Should update smoothly

## What's Happening Behind the Scenes

```
Time    Main Loop (Core 1)           Background Task (Core 0)
────────────────────────────────────────────────────────────
0ms     Face detected
1ms     └─> Queue event
2ms         (returns immediately)
3ms     ✓ Continue processing        ├─> Dequeue event
10ms    Button press detected        │
15ms    └─> Play sound               ├─> Connect to server
100ms   NFC card scanned             │
150ms   └─> Check access             ├─> Sending chunks...
500ms   LCD updates                  │
1000ms  UART message received        │
2000ms  Weather update               ├─> Still sending...
3000ms  Heartbeat sent               │
3500ms  ✓ All systems responsive     └─> ✓ Upload complete!
```

## Quick Stats

To monitor performance, add this to your code:

```cpp
// In your periodic task (e.g., every 30 seconds)
FaceDetectionStats stats = getFaceDetectionStats();
Serial.printf("[Stats] Queued: %u, Sent: %u, Failed: %u, Overflows: %u\n",
              stats.totalQueued, stats.totalSent, stats.totalFailed, stats.queueOverflows);
Serial.printf("[Stats] Last send took %ums\n", stats.lastSendDurationMs);
```

Example output:
```
[Stats] Queued: 15, Sent: 14, Failed: 1, Overflows: 0
[Stats] Last send took 3241ms
```

## Common Scenarios

### Scenario 1: Multiple Rapid Detections

```cpp
// User triggers face detection 3 times quickly
Face 1: ✓ Queued (queue: 1/3)
Face 2: ✓ Queued (queue: 2/3)
Face 3: ✓ Queued (queue: 3/3)
Face 4: ✗ Queue full!  // Need to wait or increase queue size

// Background task processes them one by one
// Main system stays responsive throughout
```

### Scenario 2: Slow Network

```cpp
// Upload takes 10 seconds due to slow WiFi
Upload starts...
Main loop: Processing 200+ iterations
NFC: 5 cards scanned
Buttons: 10 presses handled
LCD: 50 frames rendered
...10 seconds later...
Upload complete!

// Without async: Everything would be frozen for 10 seconds
```

### Scenario 3: WiFi Disconnected

```cpp
// Upload will fail, but won't block
[FaceDetectionSender] WiFi not connected - skipping
[FaceDetectionSender] ✗ Failed
// Main system continues running normally
// Event is dropped (could add retry logic if needed)
```

## Memory Check

Add this to see memory usage:

```cpp
Serial.printf("[Memory] Free heap: %u bytes\n", ESP.getFreeHeap());
Serial.printf("[Memory] Pending uploads: %d\n", getPendingFaceDetectionCount());
```

Expected values:
- Free heap: >50KB after initialization
- Pending uploads: 0-3 (queue size)

## Troubleshooting Quick Reference

| Problem | Check | Solution |
|---------|-------|----------|
| Queue full | Too many rapid detections | Increase queue size or upload faster |
| Out of memory | Free heap < 20KB | Reduce queue size or image size |
| Still blocking | Using old function | Verify using `sendFaceDetectionAsync()` |
| Not uploading | WiFi status | Check WiFi connection |
| Task crash | Stack overflow | Increase stack size to 16KB |

## Performance Comparison

**Test:** Trigger face detection, then immediately press doorbell button

| Version | Button Response | System State | LCD |
|---------|----------------|--------------|-----|
| **Old (Blocking)** | 3-5 sec delay | Frozen | Frozen |
| **New (Async)** | <50ms | Responsive | Smooth |

## That's It!

Just 3 lines of code changes to main.cpp and uart_commands.cpp, and your system is now non-blocking!

All image uploads happen in the background while your ESP32 stays responsive.
