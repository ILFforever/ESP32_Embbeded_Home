# Network and Performance Audit

This document records the current network behavior of the ESP32 doorbell LCD
firmware, the reliability risks found in those paths, and the highest-impact
performance improvements for the project.

The audit is based on the checked-in source layout as of this review. It is a
source-level audit only: PlatformIO was not available in this environment, so
the firmware was not compiled or flashed during the review.

## Executive Summary

The firmware is an ESP32 DOIT DevKit V1 smart doorbell LCD/controller. It drives
the TFT display, receives camera frames from a camera/face-recognition slave,
reads NFC cards, controls an amplifier slave, and talks to cloud/backend
services over WiFi.

The active network model is mostly outbound:

- The ESP32 connects to WiFi at boot.
- The ESP32 sends HTTP requests to the backend server.
- The ESP32 sends weather HTTP requests to OpenWeatherMap.
- The ESP32 opens raw TCP HTTP uploads for face images.
- The ESP32 connects to a public MQTT broker and subscribes to command
  notifications.
- The ESP32 can optionally connect to a camera audio stream through
  `AudioClient`, although that path does not appear wired into the current main
  runtime.

The old browser control panel and HTTP server documentation are stale in the
current firmware. The HTTP server include and dependencies are disabled, so the
LCD ESP32 does not currently expose the documented `/camera/start`,
`/snapshot`, `/status`, or `/face/*` endpoints.

The most important problems are:

1. Many network operations are synchronous and can block the scheduler,
   rendering, UART processing, button response, MQTT processing, or NFC task.
2. Network work is spread across main/UI code, UART handlers, NFC callbacks,
   heartbeat code, logger code, MQTT callbacks, and a face upload task. There is
   no central network queue or backpressure policy.
3. The SPI/JPEG frame path allocates and frees large buffers repeatedly, which
   can fragment heap and collide with HTTP/MQTT allocations.
4. Credentials, API tokens, and API keys are hardcoded in source.
5. Plain HTTP is currently an intentional ESP32 memory tradeoff because HTTPS
   causes no-memory failures in this firmware; unauthenticated plain MQTT remains
   a separate exposure.

## Active Network Inventory

### WiFi Station Connection

Source:

- `src/main.cpp`

Behavior:

- Initializes WiFi in station mode.
- Disables WiFi sleep.
- Enables auto reconnect and auto connect.
- Connects to a hardcoded SSID and password.

Current destination:

- SSID: hardcoded in `WiFi.begin(...)`

Triggers:

- Boot only, then `wifiWatchdogTask()` calls `WiFi.reconnect()` if disconnected.

Risks:

- Credentials are hardcoded in firmware source.
- Boot waits up to roughly 10 seconds for WiFi before continuing.
- Reconnect handling is basic and can generate backend logs during network
  instability.

Recommended changes:

- Move SSID/password to a local ignored config header, NVS provisioning, or
  PlatformIO build flags.
- Make boot non-blocking after a short initial attempt if display and local
  functions should remain available offline.
- Track WiFi state centrally so other network modules do not all independently
  attempt network work during reconnect.

### NTP Time Sync

Source:

- `src/main.cpp`

Behavior:

- Calls `configTime(7 * 3600, 0, "pool.ntp.org")` after WiFi connects.

Destination:

- `pool.ntp.org`

Triggers:

- Boot after WiFi connection.

Risks:

- Time display and logger timestamp generation call `getLocalTime()`. The
  default Arduino ESP32 timeout can block if time is unavailable.

Recommended changes:

- Use `getLocalTime(&timeinfo, 0)` in render/UI paths.
- Prefer `time(nullptr)` plus cached formatting in the UI path.
- Keep NTP state separate from render state.

### Weather API

Source:

- `src/weather.cpp`

Behavior:

- Sends HTTP GET to OpenWeatherMap.
- Parses JSON weather response into a static `WeatherData` structure.

Destination:

- `http://api.openweathermap.org/data/2.5/weather`

Triggers:

- Immediately during boot.
- Every 30 minutes through `taskUpdateWeather`.

Risks:

- Hardcoded API key.
- Plain HTTP.
- Synchronous `HTTPClient::GET()` with a 5 second timeout.
- Boot calls `fetchWeatherTask()` immediately after WiFi setup, before the rest
  of backend/MQTT initialization completes.

Recommended changes:

- Move the API key to configuration.
- Run weather fetch through a shared low-priority network task.
- Do not fetch weather during boot if heap pressure is high.
- Consider disabling weather while camera streaming or face upload is active.

### Backend Heartbeat

Source:

- `src/heartbeat.cpp`

Behavior:

- Sends a JSON POST with device ID, type, uptime, free heap, WiFi RSSI, and IP.
- Parses the backend response.
- If the backend reports pending commands, immediately calls
  `fetchAndExecuteCommands()`.

Destination:

- `http://embedded-smarthome.fly.dev/api/v1/devices/heartbeat`

Triggers:

- Every 60 seconds through `taskSendServerHeartbeat`.

Risks:

- Synchronous HTTP POST with 5 second timeout.
- Can chain into command fetch and command execution inside the same scheduler
  call.
- Skips while `faceDetectionUploadInProgress` is true, but this is only a
  partial backpressure mechanism.
- Plain HTTP carries bearer token and device metadata unencrypted. This is a
  known tradeoff because HTTPS currently causes no-memory failures on the ESP32
  with the present sprite, JPEG, JSON, MQTT, and upload memory profile.

Recommended changes:

- Convert heartbeat to a queued network job.
- Split command fetch from heartbeat response handling: heartbeat should enqueue
  a fetch request and return.
- Add rate limiting and result coalescing. If multiple heartbeats happen while a
  fetch is pending, keep only one fetch job.
- Keep the current HTTP choice documented as intentional until heap pressure is
  reduced enough to retest HTTPS.
- Mitigate operationally with trusted WiFi/VLAN isolation, short-lived scoped
  device tokens, backend rate limiting, and token rotation.

### Backend Disconnect Warning

Source:

- `src/heartbeat.cpp`
- `src/main.cpp`

Behavior:

- If camera or amplifier ping/pong is disconnected for 30 seconds, sends a
  warning POST.
- Also sends a log event.

Destination:

- `/api/v1/devices/warning`
- `/api/v1/devices/{device_id}/log`

Triggers:

- `checkDisconnectWarning()` every second.

Risks:

- Synchronous HTTP from scheduler path.
- Warning can chain into synchronous logger call.
- During unstable WiFi, repeated attempts may compete with reconnection and
  other device work.

Recommended changes:

- Queue warning and log events.
- Use drop-on-full for non-critical logs.
- Coalesce repeated disconnect warnings per module.

### Doorbell Ring HTTP Event

Source:

- `src/heartbeat.cpp`
- `src/main.cpp`

Behavior:

- Sends a POST when the physical doorbell button is short-pressed.

Destination:

- `/api/v1/devices/doorbell/ring`

Triggers:

- Doorbell short press when not in preview mode.

Risks:

- Synchronous HTTP from button handling path.
- Duplicated with MQTT publish for the same event.
- Skipped during face upload, which may cause missed ring events.

Recommended changes:

- Queue ring events locally with a short TTL.
- Decide whether HTTP and MQTT are both required. If both remain, define one as
  authoritative and one as best-effort notification.
- Avoid skipping user-facing ring events during face upload; enqueue them for
  later or publish a minimal event through the lowest-cost path.

### Doorbell Status HTTP Event

Source:

- `src/heartbeat.cpp`
- `src/comm/uart_commands.cpp`
- `src/main.cpp`

Behavior:

- Sends current camera/mic active state to backend.
- Also acts as a heartbeat/reset for backend TTL.

Destination:

- `/api/v1/devices/doorbell/status`

Triggers:

- UART camera started/stopped responses.
- Ping timeout recovery/disconnect handling.

Risks:

- Synchronous HTTP can happen inside UART response handling.
- Repeated start/stop/status messages can create redundant backend traffic.
- Skipped during face upload.

Recommended changes:

- Convert to state coalescing: keep latest desired status and send at most once
  per interval or when state changes.
- Do not send directly from UART handlers; enqueue state update.
- Make status update idempotent server-side if possible.

### Face Detection Multipart Upload

Source:

- `src/face_detection_sender.cpp`
- `src/comm/uart_commands.cpp`

Behavior:

- On `face_recognized`, the code captures the current SPI JPEG frame if ready.
- Stops the camera.
- Shows an upload screen.
- Queues an async face detection upload.
- The face sender task copies image bytes, opens a `WiFiClient`, writes a
  multipart/form-data POST, waits for a response, and frees the copied buffer.

Destination:

- `/api/v1/devices/doorbell/face-detection`

Triggers:

- UART `face_recognized` event from the camera slave.

Risks:

- Upload is off the main loop, which is good, but it still doubles JPEG memory:
  one SPI frame buffer plus one upload copy.
- Large raw TCP write with manual HTTP generation is sensitive to socket buffer
  pressure.
- The global `faceDetectionUploadInProgress` pauses some other network tasks
  but not all.
- Fallback JSON calls are also network operations from inside the upload task.
- Uses plain HTTP by design because HTTPS currently causes no-memory failures.

Recommended changes:

- Transfer ownership of the SPI frame buffer to the upload queue, or use a fixed
  frame/upload buffer pool.
- Avoid allocating per upload if a fixed pool is feasible.
- Reduce image dimensions or JPEG quality for upload separate from display.
- Keep queue size small, but expose dropped-upload counters in heartbeat.
- Centralize network socket ownership if other network operations still collide.

### Legacy Blocking Face Upload

Source:

- `src/heartbeat.cpp`

Behavior:

- Older blocking implementation of the same multipart upload remains available.

Destination:

- `/api/v1/devices/doorbell/face-detection`

Triggers:

- Not used by the current UART handler, which calls `sendFaceDetectionAsync()`.

Risks:

- If used again, it blocks the calling task for seconds.
- Duplicate implementation can drift from the async sender.

Recommended changes:

- Keep only one implementation if possible.
- If the blocking version remains, mark it as diagnostic-only and avoid calling
  it from scheduler, UI, UART, or NFC paths.

### Face Database Result

Source:

- `src/heartbeat.cpp`
- `src/comm/uart_commands.cpp`

Behavior:

- Sends face count, face list, or face database check results to backend.

Destination:

- `/api/v1/devices/{device_id}/face-database/result`

Triggers:

- UART responses for `face_count`, `list_faces`, and `check_face_db`.

Risks:

- Synchronous HTTP is called from UART response handling.
- Uses `StaticJsonDocument<2048>` in multiple paths.
- Face list parsing can allocate extra heap through `DynamicJsonDocument`.

Recommended changes:

- UART handler should parse and enqueue compact result data.
- Network task should serialize/send later.
- Use fixed maximum face list size or stream/chunk large database responses.

### Backend Command Fetch

Source:

- `src/heartbeat.cpp`
- `src/doorbell_mqtt.cpp`

Behavior:

- Posts device ID to pending-command endpoint.
- Parses command list.
- Executes commands locally.
- Acknowledges each command.

Destination:

- `/api/v1/devices/commands/pending`

Triggers:

- Heartbeat response with `has_pending_commands`.
- MQTT command notification callback.

Risks:

- Synchronous HTTP can be triggered from MQTT callback.
- Command execution includes blocking delays and device side effects.
- Multiple command sources can race or duplicate fetches.
- Some actions update `isStreaming` without returning true in all branches.

Recommended changes:

- MQTT callback should only set a flag or enqueue `FETCH_COMMANDS`.
- A dedicated command task should fetch, execute, and ack commands.
- Command execution should be state-machine based where delays are currently
  used.
- Add command deduplication by command ID.

### Backend Command Acknowledgement

Source:

- `src/heartbeat.cpp`

Behavior:

- Posts command execution result.

Destination:

- `/api/v1/devices/commands/ack`

Triggers:

- After each fetched command.
- Before reboot command execution.

Risks:

- Synchronous HTTP after every command can create long command batches.
- Ack failure has no retry queue.

Recommended changes:

- Queue acks separately.
- For reboot, persist or send ack before reboot as currently done, but keep the
  timeout short.
- Include last failed ack count in heartbeat.

### NFC Registration and Access Scan

Source:

- `src/main.cpp`
- `src/nfc/nfc_controller.cpp`

Behavior:

- NFC task detects cards.
- Callback in main sends either registration scan or access scan to backend.
- Plays amplifier sounds based on result.
- Updates status UI.

Destinations:

- `/api/v1/devices/nfc/register/scan`
- `/api/v1/devices/nfc/scan/access`

Triggers:

- PN532 card read.

Risks:

- Blocking HTTP occurs inside the NFC task callback.
- UI globals are mutated from the NFC task.
- The HTTP requests do not set explicit timeouts.
- Card events can be lost during WiFi outage.

Recommended changes:

- NFC task should enqueue immutable card UID events only.
- Main/UI task should own status message updates.
- Network task should send NFC requests and publish completion events.
- Add explicit HTTP timeout.
- Decide whether failed access scans should retry or fail fast.

### Backend Logger

Source:

- `src/logger.cpp`

Behavior:

- Sends a log JSON document with timestamp, level, module, message, and metadata.

Destination:

- `/api/v1/devices/{device_id}/log`

Triggers:

- Network disconnect/reconnect.
- Camera/amp disconnect warnings.
- UART parse/errors.
- Button-triggered reboot.
- Remote reboot.

Risks:

- Synchronous HTTP in critical paths.
- Logging a network failure can amplify network failure.
- Log metadata uses JSON objects whose lifetime must be treated carefully.

Recommended changes:

- Queue logs with a fixed-size ring buffer.
- Drop info logs first when full.
- Never block reboot, UART, rendering, or watchdog paths for logging.
- Include dropped log count in heartbeat.

### MQTT Broker Connection

Source:

- `src/doorbell_mqtt.cpp`

Behavior:

- Connects to HiveMQ public broker.
- Publishes doorbell rings.
- Subscribes to per-device command topic.
- On command notification, fetches pending commands over HTTP.

Destination:

- Broker: `broker.hivemq.com:1883`
- Publish topic: `smarthome/doorbell/ring`
- Subscribe topic: `smarthome/device/{device_id}/command`

Triggers:

- Boot.
- Reconnect attempts every 5 seconds when disconnected.
- Doorbell press publish.
- Broker callback.

Risks:

- Public broker.
- No TLS.
- No auth.
- Generic topic names are easy to collide with.
- Callback does too much work by calling backend fetch directly.
- Reconnect attempts may compete with other network work.

Recommended changes:

- Use a private broker, scoped credentials, or at least unique topic prefixes.
- Treat MQTT TLS the same as backend HTTPS: retest only after heap pressure is
  reduced enough to avoid no-memory failures.
- MQTT callback should enqueue and return.
- Treat MQTT as notification only; backend command fetch should remain
  authoritative.

### Audio Client Stream

Source:

- `src/comm/audio_client.cpp`
- `include/audio_client.h`

Behavior:

- Creates a task.
- Opens `http://{camera_ip}/audio/stream`.
- Reads stream chunks and discards data for now.

Destination:

- Camera module IP supplied to `AudioClient`.

Triggers:

- `AudioClient::start()`.

Current status:

- No clear active use from `main.cpp` in the current source.

Risks:

- Allocates a 2048 byte buffer.
- Runs at priority 5 on Core 1.
- If wired in, it would compete with SPI/JPEG/rendering.
- Currently has a TODO for actual audio processing.

Recommended changes:

- Remove or disable if unused.
- If used, pin away from the render/SPI hot path and define how audio buffering
  interacts with camera streaming and amplifier UART.

## Stale or Inactive Network Surface

### Browser Control Panel

Source:

- `doorbell-control.html`

Behavior expected by page:

- Calls endpoints such as `/camera/start`, `/camera/stop`, `/status`,
  `/face/count`, and amplifier routes on an ESP32 HTTP API URL.

Current firmware status:

- `http_control.h` is commented out in `src/main.cpp`.
- Async HTTP server dependencies are commented out in `platformio.ini`.
- Header exists as `include/http_control.h.txt`, not `include/http_control.h`.

Conclusion:

- The browser panel is not compatible with the current firmware unless the HTTP
  server is restored. It should be documented as legacy/debug UI or removed from
  the active docs.

### README and Claude Docs

The docs still mention HTTP server endpoints and `/snapshot`. The active
firmware has that server disabled to save RAM/flash.

Recommended change:

- Update README to clearly separate active features from disabled legacy
  features.

## Cross-Cutting Network Problems

### 1. Blocking Calls in Critical Paths

Blocking network calls appear in:

- Scheduler tasks.
- UART response handling.
- NFC callbacks.
- MQTT callbacks.
- Logger paths.
- Button-triggered control paths.

Impact:

- Missed button responsiveness.
- Delayed UART parsing.
- Frozen or late LCD updates.
- MQTT keepalive delays.
- Heap pressure during long network operations.

Primary fix:

- Create one low-priority network worker task.
- Producers enqueue small events.
- Network worker serializes HTTP/MQTT operations.
- Main/UI/UART/NFC callbacks do not perform HTTP directly.

### 2. Partial Backpressure

`faceDetectionUploadInProgress` prevents some network operations during image
upload, but it is not a complete network scheduler.

Issues:

- Some network paths still run independently.
- Important events may be skipped instead of queued.
- There is no single place to inspect pending work.

Primary fix:

- Replace ad hoc skip checks with queue policy:
  - Critical events: bounded retry.
  - Latest-state events: coalesce.
  - Logs: drop when full.
  - Face uploads: one in flight, drop or downscale when memory is low.

### 3. Heap Fragmentation

The firmware mixes:

- TFT sprites.
- SPI JPEG frame allocation.
- Upload image copy allocation.
- HTTPClient internal buffers.
- Arduino `String`.
- JSON documents.
- MQTT buffers.

High-risk paths:

- Per-frame SPI `malloc/free`.
- Face upload copy of JPEG.
- Dynamic JSON parsing for face list.
- Repeated String concatenation for URLs and JSON bodies.

Primary fix:

- Preallocate frame buffers.
- Reuse static request buffers where practical.
- Avoid copying JPEGs between SPI and upload paths.
- Cap payload sizes.
- Track `ESP.getFreeHeap()` and largest alloc block in telemetry.

### 4. Security Exposure

Current source contains:

- WiFi SSID/password.
- Backend bearer token.
- OpenWeatherMap API key.
- Device ID.
- Public MQTT broker and topics.

Traffic uses:

- Plain HTTP for backend.
- Plain HTTP for weather.
- Plain MQTT over port 1883.

The plain HTTP choice is intentional for now. HTTPS has been observed to cause
no-memory failures on the ESP32 with the current firmware memory profile. Treat
this as a known operational risk, not an accidental oversight.

Primary fix:

- Move secrets out of source.
- Regenerate exposed tokens/keys if this repo has been shared.
- Reduce heap pressure from sprites, SPI frame allocation, upload image copies,
  and repeated HTTP/JSON allocation before retesting HTTPS.
- While HTTP remains required, isolate the device on trusted WiFi/VLANs, use
  scoped per-device tokens, rotate tokens, and enforce backend rate limits.
- Use private/scoped MQTT topics and credentials.

## Performance Findings

These findings are prioritized by expected impact on responsiveness, heap
stability, and frame rate.

### P1: Centralize Network Work

Problem:

- HTTP and MQTT side effects are spread across the firmware.
- Many calls block for up to 5-10 seconds.

Fix:

- Add a `NetworkJob` queue and a single worker task.
- Producers:
  - Heartbeat scheduler.
  - UART handler.
  - NFC handler.
  - MQTT callback.
  - Button handler.
  - Logger.
- Consumer:
  - Serializes HTTP/MQTT work.
  - Applies priority, coalescing, and drop policy.

Suggested job types:

- `JOB_HEARTBEAT`
- `JOB_FETCH_COMMANDS`
- `JOB_COMMAND_ACK`
- `JOB_DOORBELL_RING`
- `JOB_DOORBELL_STATUS`
- `JOB_NFC_ACCESS_SCAN`
- `JOB_NFC_REGISTER_SCAN`
- `JOB_FACE_DB_RESULT`
- `JOB_LOG`
- `JOB_WARNING`
- `JOB_WEATHER`

Suggested policy:

- Heartbeat: coalesce latest.
- Doorbell status: coalesce latest.
- Fetch commands: coalesce if already pending.
- Logs: fixed ring, drop low severity first.
- NFC scans: bounded queue, fail fast if offline.
- Face uploads: separate queue or fixed pool because payloads are large.

### P1: Stop Per-Frame SPI Allocation

Problem:

- `SPIMaster` allocates a new frame buffer for each frame.
- Large frame buffers fragment internal heap.

Fix:

- Preallocate one or two `SPI_MAX_FRAME_SIZE` buffers.
- Use state flags: `free`, `receiving`, `ready`, `rendering`, `uploading`.
- Only accept a new frame when a buffer is available.
- Drop frames explicitly instead of allocating under pressure.

Tradeoff:

- One 60KB buffer is predictable.
- Two 60KB buffers improves throughput but costs RAM.
- If RAM is tight, lower camera JPEG size or quality first.

### P1: Reduce Sprite Heap Usage

Problem:

- Multiple 16-bit sprites are created.
- `miduiSprite` appears unused.
- Sprite creation return values are not checked.

Fix:

- Remove unused `miduiSprite`.
- Check `createSprite()` success and log/fallback if allocation fails.
- Use lower color depth for UI-only sprites if acceptable.
- Avoid keeping full-screen-like sprites that can be redrawn directly.

### P1: Avoid Blocking UI Time Lookups

Problem:

- UI path calls `getLocalTime()` once per second.
- Default timeout can block if NTP is not ready.

Fix:

- Use zero-timeout local time calls:

```cpp
getLocalTime(&timeinfo, 0);
```

- Or maintain formatted cached time from `time(nullptr)`.

### P2: UART Line Buffer Instead of `readStringUntil`

Problem:

- `readStringUntil('\n')` can block when only partial data is available.
- `String` allocations add heap churn.

Fix:

- Use fixed char buffers for UART1 and UART2.
- Consume a bounded number of bytes per scheduler tick.
- Call handlers only for complete lines.
- Keep parse docs sized to actual message class.

### P2: Keep MQTT Callback Lightweight

Problem:

- MQTT callback calls backend command fetch directly.

Fix:

- Set a volatile flag or enqueue `JOB_FETCH_COMMANDS`.
- Return immediately.
- Let network/command worker fetch and execute.

### P2: NFC Callback Should Not Send HTTP

Problem:

- NFC task does HTTP and UI mutations through callback.

Fix:

- NFC task emits `NfcEvent`.
- Main/UI task updates display state.
- Network task sends backend scan.

### P2: UI Redraw Throttling

Problem:

- Overlay rendering competes with frame rendering.
- Dirty flag exists but is not used aggressively.

Fix:

- Redraw top/bottom UI only when:
  - time changes,
  - status changes,
  - WiFi bars change,
  - animation tick is due.
- Cap animated overlay redraw to 10-30 Hz.
- Avoid RSSI calls every frame.

### P2: JPEG Render Path Optimization

Problem:

- Frame processing decodes JPEG to a sprite, then pushes sprite to TFT.
- The TFT mutex is held across decode and push.

Fix options:

- Render JPEG blocks directly to TFT with y-offset if overlay allows.
- Use `TJpgDec.setJpgScale(2)` or lower camera resolution when speed is more
  important than full detail.
- Keep UI overlay drawing outside the frame decode critical section where
  possible.

### P3: Replace Repeated URL String Building

Problem:

- Many functions build URLs with Arduino `String`.

Fix:

- Precompute base URLs during `initHeartbeat()`.
- Use `snprintf` into fixed buffers for common endpoints.
- Keep endpoint strings in flash where possible.

### P3: Telemetry for Real Optimization

Add periodic debug counters:

- Free heap.
- Largest alloc block.
- SPI frames received/dropped.
- JPEG decode failures.
- Network queue depth.
- Dropped network jobs by type.
- Face upload success/failure/timeout.
- MQTT reconnect count.
- UART parse errors.
- NFC scan failures.

This makes performance work measurable instead of guess-driven.

## Recommended Refactor Plan

### Phase 1: Stabilize Build and Documentation

1. Update README to say HTTP server/control panel is disabled.
2. Move secrets into local config and rotate exposed keys/tokens.
3. Add explicit HTTP timeouts to NFC requests.

### Phase 2: Network Isolation

1. Add `network_manager.h/.cpp`.
2. Define `NetworkJob` and fixed queue.
3. Move logger to queued best-effort jobs.
4. Move heartbeat to queued job.
5. Make MQTT callback enqueue fetch command.
6. Move NFC HTTP requests to queue.
7. Move face DB result and doorbell status to queue.

### Phase 3: Heap and Frame Path

1. Remove unused sprite.
2. Check sprite allocation failures.
3. Preallocate SPI frame buffer(s).
4. Avoid face upload JPEG copy if ownership transfer is feasible.
5. Add heap telemetry.

### Phase 4: Scheduler and UI Responsiveness

1. Replace UART `readStringUntil()` with fixed line buffers.
2. Make command sequencing non-blocking.
3. Use zero-timeout time lookup.
4. Throttle UI redraws.
5. Lower or rebalance SPI task priority if Core 1 starvation appears in tests.

### Phase 5: Security Hardening

1. Retest HTTPS only after reducing heap pressure enough to avoid no-memory
   failures.
2. Use authenticated/private MQTT broker.
3. Scope tokens by device and permission.
4. Avoid logging secrets or full URLs with tokens.

## Validation Checklist

Before firmware flash:

- PlatformIO build passes.
- No secrets are committed.
- HTTP server docs match active firmware.
- Network manager queue compiles with bounded memory.

Runtime serial checks:

- WiFi connects and reconnects without blocking UI.
- Heartbeat succeeds.
- MQTT connects and subscribes.
- Doorbell press still plays sound immediately.
- Doorbell HTTP/MQTT events are delivered.
- NFC access scan returns correct access result.
- NFC registration scan sends correct session ID.
- Face recognition still uploads image.
- Face upload no longer blocks button/NFC/UI.
- Camera and amp disconnect warnings are sent once after threshold.

Performance checks:

- Free heap after boot.
- Largest alloc block after boot.
- Free heap while camera streaming.
- Largest alloc block after 5 minutes of streaming.
- SPI frame drop count.
- JPEG decode failure count.
- UI responsiveness during face upload.
- MQTT reconnect count.
- Network queue high-water mark.

## Immediate Action List

1. Remove or disable stale HTTP control panel references in active docs.
2. Add a network manager queue and move MQTT callback, heartbeat command fetch,
   logger, and NFC HTTP behind it.
3. Replace per-frame SPI allocation with fixed buffer ownership.
4. Remove unused sprite and check all sprite allocation results.
5. Replace blocking time and UART reads in hot paths.
