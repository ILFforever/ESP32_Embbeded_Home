#include "uart_commands.h"
#include "lcd_helper.h"
#include "slave_state_manager.h"

// Send command to Slave (with automatic mode tracking)
void sendUARTCommand(const char *cmd, const char *param, int value)
{
  JsonDocument doc;
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
  JsonDocument doc;
  doc["cmd"] = cmd;
  doc["url"] = urls;

  String output;
  serializeJson(doc, output);
  AmpSerial.println(output);
}

// Send ping message to Slave (Camera)
void sendUARTPing()
{
  JsonDocument doc;
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

  JsonDocument doc;
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
    return;
  }

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
      float confidence = data["confidence"] | 0.0;

      Serial.printf("Face Recognized: ID=%d, Name=%s, Confidence=%.2f\n",
                    id, name, confidence);

      // Update LCD status with recognition result
      if (id >= 0)
      {
        sendUART2Command("play", "success");
        char msg[64];
        snprintf(msg, sizeof(msg), "Welcome %s!", name);
        updateStatusMsg(msg, true, "Doorbell Active");
        recognition_state = 1; // Success
      }
      else
      {
        sendUART2Command("play", "error");
        updateStatusMsg("Unknown Person : Try again", true, "Doorbell Active");
        recognition_state = 2; // Failure
      }
    }
    return;
  }

  // Handle list_faces response
  if (doc.containsKey("faces") && doc.containsKey("count"))
  {
    int count = doc["count"];
    Serial.printf("✅ Found %d faces:\n", count);

    JsonArray faces = doc["faces"];
    for (JsonObject face : faces)
    {
      int id = face["id"];
      const char *name = face["name"];
      const char *enrolled = face["enrolled"];
      Serial.printf("  - ID %d: %s (enrolled: %s)\n", id, name, enrolled);
    }
    return;
  }

  // Handle status response
  if (doc.containsKey("status"))
  {
    const char *status = doc["status"];
    // Serial.printf("✅ Status: %s", status);

    if (doc.containsKey("msg"))
    {
      const char *msg = doc["msg"];
      // Serial.printf(" - %s", msg);

      // Handle error status
      if (strcmp(status, "error") == 0)
      {
        if (strcmp(msg, "Camera already stopped") == 0)
        {
          slave_status = 0;
          updateActualMode(0); // Sync actual mode
          updateStatusMsg("Doorbell Off", true, "Standing by");
        }
        Serial.printf("❌ Cam Slave Error: %s\n", msg);
        sendUART2Command("play", "error"); // Play error sound
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
        }
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