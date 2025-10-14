#include "uart_commands.h"

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
  Serial.println(output);
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
      }
    }
    return;
  }

  // Print all other messages
  Serial.print("📥 RX from Slave: ");
  Serial.println(line);

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
    Serial.printf("✅ Status: %s", status);

    if (doc.containsKey("msg"))
    {
      const char *msg = doc["msg"];
      Serial.printf(" - %s", msg);

      // Check if message indicates camera started
      if (strcmp(msg, "Camera and SPI sender started") == 0)
      {
        if (slave_status != 1)
        {
          slave_status = 1;
          uiNeedsUpdate = true; // Trigger UI refresh on status change
          Serial.print(" [Camera started - status set to 1]");
        }
      }
      else if (strcmp(msg, "Camera and SPI sender stopped") == 0)
      {
        if (slave_status != 0)
        {
          slave_status = 0;
          uiNeedsUpdate = true; // Trigger UI refresh on status change
          Serial.print(" [Camera stopped - status set to 0]");
        }
      }
      // Try parsing msg as integer for backward compatibility
      else
      {
        int new_status = atoi(msg);
        if (new_status != 0 && new_status != slave_status)
        {
          slave_status = new_status;
          uiNeedsUpdate = true; // Trigger UI refresh on status change
        }
      }
    }

    if (doc.containsKey("free_heap"))
    {
      int heap = doc["free_heap"];
      Serial.printf(" (Free heap: %d KB)", heap / 1024);
    }

    Serial.println();
  }
}