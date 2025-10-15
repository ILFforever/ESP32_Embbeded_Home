#include "uart_commands.h"

// Update status message on LCD
void updateStatusMsg(const char *msg, bool temporary, const char *fallback)
{
  status_msg = String(msg);
  status_msg_is_temporary = temporary;

  // Set fallback message if provided, otherwise determine based on slave_status
  if (fallback != nullptr)
  {
    status_msg_fallback = String(fallback);
  }
  else if (temporary)
  {
    // Auto-determine fallback based on current state
    if (slave_status == -1)
    {
      status_msg_fallback = "Not connected";
    }
    else if (slave_status == 0)
    {
      status_msg_fallback = "On Stand By";
    }
    else if (slave_status == 1)
    {
      status_msg_fallback = "Doorbell Active";
    }
    else if (slave_status == 2)
    {
      status_msg_fallback = "Looking for faces";
    }
    else
    {
      status_msg_fallback = "On Stand By"; // Default fallback
    }
  }
  else
  {
    status_msg_fallback = ""; // Clear fallback for non-temporary messages
  }

  uiNeedsUpdate = true;
}

// Send command to Slave
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
  // Serial.println(output);
  SlaveSerial.println(output);
}

// Send ping message
void sendUARTPing()
{
  JsonDocument doc;
  doc["type"] = "ping";
  doc["seq"] = ping_counter++;
  doc["timestamp"] = millis();

  String output;
  serializeJson(doc, output);

  SlaveSerial.println(output);
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
        char msg[64];
        snprintf(msg, sizeof(msg), "Welcome %s!", name);
        updateStatusMsg(msg, true, "Doorbell Active");
        recognition_success = true;
      }
      else
      {
        updateStatusMsg("Unknown Person : Try again", true, "Doorbell Active");
        recognition_success = false;
        sendUARTCommand("resume_detection"); //what to run after successfull activation
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

      // Check if message indicates camera started
      if (strcmp(msg, "Camera and SPI sender started") == 0)
      {
        updateStatusMsg("Doorbell Active");
        if (slave_status != 1)
        {
          slave_status = 1;
          Serial.print(" [Camera started - status set to 1]");
        }
      }
      else if (strcmp(msg, "Camera and SPI sender stopped") == 0)
      {
        updateStatusMsg("Doorbell Off", true, "Standing by"); // Temporary message
        if (slave_status != 0)
        {
          slave_status = 0;
          Serial.print(" [Camera stopped - status set to 0]");
        }
      }
      else if (strcmp(msg, "Face recognition started") == 0)
      {
        updateStatusMsg("Looking for faces", false, "");
        if (slave_status != 2)
        {
          slave_status = 2;
          Serial.print(" [Face Recog started - status set to 2]");
        }
      }
      else if (strcmp(msg, "Face recognition stopped") == 0)
      {
        updateStatusMsg("Face recognition stopped", true, "Doorbell Active");
        if (slave_status != 1)
        {
          slave_status = 1;
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

    if (doc.containsKey("free_heap"))
    {
      int heap = doc["free_heap"];
      // Serial.printf(" (Free heap: %d KB)", heap / 1024);
    }
  }
}