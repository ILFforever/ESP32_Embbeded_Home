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

  // Serial.print("📥 RX from Slave: ");
  // Serial.println(line);

  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, line);
  if (error)
  {
    Serial.print("❌ JSON parse error: ");
    Serial.println(error.c_str());
    return;
  }

  // Handle pong response
  if (doc.containsKey("type") && doc["type"] == "pong")
  {
    last_pong_time = millis();
    return;
  }

  // Handle status response
  else if (doc.containsKey("status"))
  {
    const char *status = doc["status"];
    Serial.printf("✅ Status: %s", status);

    if (doc.containsKey("msg"))
    {
      slave_status = (int)doc["msg"];
      Serial.printf(" - %s", (const char *)doc["msg"]);
    }

    if (doc.containsKey("free_heap"))
    {
      int heap = doc["free_heap"];
      Serial.printf(" (Free heap: %d KB)", heap / 1024);
    }

    Serial.println();
  }
}