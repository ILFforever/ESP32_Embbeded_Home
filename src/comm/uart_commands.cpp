#include "uart_commands.h"
#include "lcd_helper.h"
#include "slave_state_manager.h"
#include "heartbeat.h"
#include "SPIMaster.h"
#include "logger.h"

// External references
extern SPIMaster spiMaster;

// Send command to Slave (with automatic mode tracking)
void sendUARTCommand(const char *cmd, const char *param, int value)
{
  StaticJsonDocument<256> doc;
  doc["cmd"] = cmd;

  // Create nested params object if there are parameters
  if (param != nullptr || value >= 0)
  {
    JsonObject params = doc.createNestedObject("params");

    if (param != nullptr)
    {
      params["name"] = param;
    }

    if (value >= 0)
    {
      params["id"] = value;
    }
  }

  String output;
  serializeJson(doc, output);
  MasterSerial.println(output);

  // Track desired mode based on commands sent
  if (strcmp(cmd, "camera_control") == 0 && param != nullptr)
  {
    if (strcmp(param, "camera_start") == 0)
    {
      setDesiredMode(1); // Camera running
    }
    else if (strcmp(param, "camera_stop") == 0)
    {
      setDesiredMode(0); // Standby
    }
  }
  else if (strcmp(cmd, "start_recognition") == 0)
  {
    setDesiredMode(2); // Recognition running
  }
  else if (strcmp(cmd, "stop_recognition") == 0)
  {
    setDesiredMode(1); // Back to camera only
  }
}

// Send command to AMP board
void sendUART2Command(const char *cmd, const char *urls)
{
  StaticJsonDocument<256> doc;
  doc["cmd"] = cmd;
  doc["url"] = urls;

  String output;
  serializeJson(doc, output);
  AmpSerial.println(output);
}

// Send ping message to Slave (Camera)
void sendUARTPing()
{
  StaticJsonDocument<128> doc;
  doc["type"] = "ping";
  doc["seq"] = ping_counter++;
  doc["timestamp"] = millis();

  String output;
  serializeJson(doc, output);

  MasterSerial.println(output);
}

// Send ping message to Amp
void sendUART2Ping()
{
  extern uint32_t amp_ping_counter;

  StaticJsonDocument<128> doc;
  doc["type"] = "ping";
  doc["seq"] = amp_ping_counter++;
  doc["timestamp"] = millis();

  String output;
  serializeJson(doc, output);

  AmpSerial.println(output);
}

// Handle UART response from Slave
void handleUARTResponse(String line)
{
  // Skip ESP-IDF log messages (format: "I (timestamp) TAG: message")
  if (line.startsWith("I (") || line.startsWith("W (") ||
      line.startsWith("E (") || line.startsWith("D ("))
  {
    Serial.print("📋 Log: ");
    Serial.println(line);
    return;
  }

  // Skip empty lines
  if (line.length() == 0)
  {
    return;
  }

  // Use larger buffer for complex responses like list_faces
  StaticJsonDocument<2048> doc;
  DeserializationError error = deserializeJson(doc, line);
  if (error)
  {
    Serial.print("📥 RX from Slave: ");
    Serial.println(line);
    Serial.print("❌ JSON parse error: ");
    Serial.println(error.c_str());
    Serial.print("Line length: ");
    Serial.println(line.length());

    // Log JSON parse error to backend
    // Too many records just gracfuly handle it - Hammy
    // StaticJsonDocument<256> meta;
    // JsonObject metadata = meta.to<JsonObject>();
    // metadata["error"] = error.c_str();
    // metadata["line_length"] = line.length();
    // metadata["raw_data"] = line.substring(0, min((int)line.length(), 100)); // First 100 chars
    // logError("uart_slave", "Failed to parse JSON from camera slave", metadata);

    return;
  }

  // // Print all incoming JSON messages (except pong)
  // if (!doc.containsKey("type") || doc["type"] != "pong")
  // {
  //   Serial.print("📥 RX from Slave: ");
  //   Serial.println(line);
  // }

  // Handle pong response (silently, no print)
  if (doc.containsKey("type") && doc["type"] == "pong")
  {
    last_pong_time = millis();
    return;
  }

  // Handle detection event (face_detected with metadata)
  if (doc.containsKey("event") && doc["event"] == "face_detected")
  {
    if (doc.containsKey("data"))
    {
      JsonObject data = doc["data"];
      int face_count = data["face_count"] | 0;
      float score = data["score"] | 0.0;
      face_bbox_x = data["bbox_x"] | 0;
      face_bbox_y = data["bbox_y"] | 0;
      face_bbox_w = data["bbox_w"] | 0;
      face_bbox_h = data["bbox_h"] | 0;

      // Store bounding box for drawing (only if face detected)
      hasFaceDetection = (face_count > 0);
      if (hasFaceDetection)
      {
        lastFaceDetectionTime = millis();
        // Update status with detection info (temporary, then return to "Detecting faces")
        if (face_count == 1)
        {
          updateStatusMsg("Face Detected", true, "Detecting faces");
        }
        else if (face_count > 1)
        {
          char msg[32];
          snprintf(msg, sizeof(msg), "%d faces Detected", face_count);
          updateStatusMsg(msg, true, "Detecting faces");
        }
      }
      else
      {
        updateStatusMsg("Detecting faces");
      }
    }
    return;
  }

  // Handle recognition event (face_recognized with ID, name, confidence)
  if (doc.containsKey("event") && doc["event"] == "face_recognized")
  {
    if (doc.containsKey("data"))
    {
      JsonObject data = doc["data"];
      int id = data["id"] | -1;
      const char *name = data["name"] | "Unknown";
      float confidence = data.containsKey("confidence") ? data["confidence"].as<float>() : 0.0;
      bool recognized = (id >= 0);

      Serial.printf("Face Recognized: ID=%d, Name=%s, Confidence=%.2f\n",
                    id, name, confidence);

      // Clear face recognition timeout (face was recognized)
      face_recognition_active = false;

      // Capture last frame (raw JPEG - no Base64 encoding needed!)
      uint8_t *frameData = nullptr;
      uint32_t frameSize = 0;

      if (spiMaster.isFrameReady())
      {
        frameData = spiMaster.getFrameData();
        frameSize = spiMaster.getFrameSize();

        if (frameData != nullptr && frameSize > 0)
        {
          Serial.printf("[FaceDetection] Captured frame: %u bytes (raw JPEG)\n", frameSize);
        }
      }

      // STEP 1: Stop camera immediately to prevent new frame allocations
      Serial.println("[FaceDetection] Stopping camera before upload");
      sendUARTCommand("camera_control", "camera_stop");

      // STEP 2: Show "Sending to server..." screen and start timer
      updateStatusMsg("Sending to server...", false);
      showUploadingScreen();
      show_upload_screen = true;
      upload_screen_start_time = millis();

      // STEP 3: Queue upload (copies frame data internally)
      Serial.println("[FaceDetection] Queueing upload to backend");
      sendFaceDetectionAsync(recognized, name, confidence, frameData, frameSize);

      // STEP 4: Free SPI buffer immediately after copying (critical for memory)
      if (spiMaster.isFrameReady())
      {
        Serial.println("[FaceDetection] Freeing SPI buffer after upload queued");
        spiMaster.ackFrame();
      }

      // STEP 5: Prepare welcome/error message (will be shown by timer task)
      if (recognized)
      {
        sendUART2Command("play", "success");
        snprintf(welcome_message, sizeof(welcome_message), "Welcome %s!", name);
        recognition_state = 1; // Success
      }
      else
      {
        sendUART2Command("play", "error");
        snprintf(welcome_message, sizeof(welcome_message), "Unknown Person");
        recognition_state = 2; // Failure
      }
      // Note: Actual UI transitions handled by taskManageUIFlow() in main.cpp
    }
    return;
  }

  // Handle list_faces response (print_faces command)
  if (doc.containsKey("faces") && doc.containsKey("count"))
  {
    int count = doc["count"];
    Serial.printf("✅ Face List: Found %d faces\n", count);

    JsonArray faces = doc["faces"];
    for (JsonObject face : faces)
    {
      int id = face["id"];
      const char *name = face["name"];
      const char *enrolled = face["enrolled"];
      Serial.printf("  - ID %d: %s (enrolled: %s)\n", id, name, enrolled);
    }

    // Send face_list result to backend
    sendFaceDatabaseResult("face_list", -1, faces, nullptr, nullptr);
    return;
  }

  // Handle status response
  if (doc.containsKey("status"))
  {
    const char *status = doc["status"];

    // Skip ping response messages (msg="0")
    if (doc.containsKey("msg") && strcmp(doc["msg"], "0") == 0)
    {
      last_pong_time = millis();
      return;
    }

    if (doc.containsKey("msg"))
    {
      const char *msg = doc["msg"];

      // Handle face_count response
      if (strcmp(status, "face_count") == 0)
      {
        Serial.printf("✅ Face Count: %s\n", msg);

        // Try to parse count from message and send to backend
        int count = atoi(msg);
        if (count >= 0)
        {
          Serial.printf("Sending face count (%d) to backend...\n", count);
          sendFaceDatabaseResult("face_count", count, JsonArray(), nullptr, nullptr);
        }

        return;
      }

      // Handle list_faces response
      if (strcmp(status, "list_faces") == 0)
      {
        Serial.printf("✅ Face List:\n%s\n", msg);

        // Parse the face list JSON array and send to backend
        // Use DynamicJsonDocument to avoid stack overflow with nested StaticJsonDocuments
        DynamicJsonDocument* facesDoc = new DynamicJsonDocument(2048);
        if (facesDoc == nullptr)
        {
          Serial.println("❌ Failed to allocate memory for face list parsing");
          return;
        }

        DeserializationError error = deserializeJson(*facesDoc, msg);

        if (!error && facesDoc->is<JsonArray>())
        {
          JsonArray faces = facesDoc->as<JsonArray>();
          int count = faces.size();

          Serial.printf("Parsed %d faces, sending to backend...\n", count);

          // Send face_list result to backend
          sendFaceDatabaseResult("face_list", count, faces, nullptr, nullptr);
        }
        else
        {
          Serial.printf("❌ Failed to parse face list JSON: %s\n", error.c_str());
        }

        // Clean up
        delete facesDoc;

        return;
      }

      // Handle check_face_db response
      if (strcmp(status, "face_db") == 0)
      {
        Serial.printf("✅ Face Database: %s\n", msg);

        // Parse database status and send to backend
        const char *db_status = strstr(msg, "valid") ? "valid" : "invalid";
        Serial.printf("Sending database check (%s) to backend...\n", db_status);
        sendFaceDatabaseResult("face_check", -1, JsonArray(), db_status, msg);

        return;
      }

      // Handle microphone_event response
      if (strcmp(status, "microphone_event") == 0)
      {
        Serial.printf("🎤 Microphone Event: %s\n", msg);
        return;
      }

      // Handle error status
      if (strcmp(status, "error") == 0)
      {
        // these two messages happen too often and is handled already by status manager
        if (strcmp(msg, "Camera already stopped") == 0)
        {
          slave_status = 0;
          updateActualMode(0); // Sync actual mode
          updateStatusMsg("Doorbell Off", true, "Standing by");
          sendDoorbellStatus(false, false); // Camera inactive
          return;
        }
        if (strcmp(msg, "Camera already running") == 0)
        {
          slave_status = 1;
          updateActualMode(1); // Sync actual mode
          updateStatusMsg("Doorbell Active");
          sendDoorbellStatus(true, false); // Camera active
          return;
        }
        Serial.printf("❌ Cam Slave Error: %s\n", msg);
        sendUART2Command("play", "error"); // Play error sound

        // Log camera slave error to backend
        StaticJsonDocument<256> meta;
        JsonObject metadata = meta.to<JsonObject>();
        metadata["error_message"] = msg;
        metadata["slave_status"] = slave_status;
        logError("uart_slave", "Camera slave reported error", metadata);

        return;
      }

      // Handle face_count response (format: "Face count: N")
      if (strstr(msg, "Face count:") != nullptr)
      {
        int count = 0;
        if (sscanf(msg, "Face count: %d", &count) == 1)
        {
          Serial.printf("✅ Face Count: %d\n", count);
          sendFaceDatabaseResult("face_count", count, JsonArray(), nullptr, nullptr);
        }
        return;
      }

      // Handle face_check response (format: "Database status: valid/invalid")
      if (strstr(msg, "Database status:") != nullptr)
      {
        const char *db_status = strstr(msg, "valid") ? "valid" : "invalid";
        Serial.printf("✅ Face Database: %s\n", msg);
        sendFaceDatabaseResult("face_check", -1, JsonArray(), db_status, msg);
        return;
      }

      // Check if message indicates camera started
      if (strcmp(msg, "Camera and SPI sender started") == 0)
      {
        updateStatusMsg("Doorbell Active");
        if (slave_status != 1)
        {
          slave_status = 1;
          updateActualMode(1);
          Serial.print(" [Camera started - status set to 1]");
          sendDoorbellStatus(true, false); // Camera active
        }
      }
      else if (strcmp(msg, "Camera and SPI sender stopped") == 0)
      {
        updateStatusMsg("Doorbell Off", true, "Standing by"); // Temporary message
        if (slave_status != 0)
        {
          slave_status = 0;
          updateActualMode(0);
          Serial.print(" [Camera stopped - status set to 0]");
          sendDoorbellStatus(false, false); // Camera inactive
        }
        // Clear face recognition timeout when camera stops
        face_recognition_active = false;
      }
      else if (strcmp(msg, "Face recognition started") == 0)
      {
        updateStatusMsg("Looking for faces", false, "");
        if (slave_status != 2)
        {
          slave_status = 2;
          updateActualMode(2);
          Serial.print(" [Face Recog started - status set to 2]");
        }
      }
      else if (strcmp(msg, "Face recognition stopped") == 0)
      {
        updateStatusMsg("Face recognition stopped", true, "Doorbell Active");
        if (slave_status != 1)
        {
          slave_status = 1;
          updateActualMode(1);
          Serial.print(" [Face Recog stopped - status set to 1]");
        }
      }
      else
      {
        // Try parsing msg as integer for backward compatibility
        int new_status = atoi(msg);
        if (new_status != 0)
        {
          slave_status = new_status;
          updateActualMode(new_status);
          if ((new_status == 1) && (status_msg == "Standing By")) // fix for screen not updating if camera is started before lcd
          {
            updateStatusMsg("Doorbell Active");
          }
          // } else if (new_status == 2) {
          //   updateStatusMsg("Looking for faces");
          // } else if (new_status == 0) {
          //   updateStatusMsg("Doorbell Off", true); // Temporary message
          // }
        }
      }
    }
  }
}

// Handle UART response from Amp
void handleUART2Response(String line)
{
  extern unsigned long last_amp_pong_time;
  extern int amp_status;

  // Skip empty lines
  if (line.length() == 0)
  {
    return;
  }

  // Parse JSON response
  StaticJsonDocument<2048> doc;
  DeserializationError error = deserializeJson(doc, line);
  if (error)
  {
    Serial.print("📥 RX from Amp: ");
    Serial.println(line);
    Serial.print("❌ JSON parse error: ");
    Serial.println(error.c_str());

    // Log JSON parse error to backend
    StaticJsonDocument<256> meta;
    JsonObject metadata = meta.to<JsonObject>();
    metadata["error"] = error.c_str();
    metadata["line_length"] = line.length();
    metadata["raw_data"] = line.substring(0, min((int)line.length(), 100)); // First 100 chars
    logError("uart_amp", "Failed to parse JSON from amplifier", metadata);

    return;
  }

  // Handle pong response (silently, no print)
  if (doc.containsKey("type") && doc["type"] == "pong")
  {
    last_amp_pong_time = millis();
    return;
  }

  // Handle other amp responses (for future expansion)
  Serial.print("📥 RX from Amp: ");
  Serial.println(line);
}