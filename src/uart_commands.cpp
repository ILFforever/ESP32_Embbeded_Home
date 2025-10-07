#include "uart_commands.h"

// Send command to Slave
void sendUARTCommand(const char *cmd, const char *param, int value)
{
  StaticJsonDocument<256> doc;
  doc["cmd"] = cmd;

  if (param != nullptr)
  {
    doc["name"] = param;
  }

  if (value >= 0)
  {
    doc["id"] = value;
  }

  String output;
  serializeJson(doc, output);

  SlaveSerial.println(output);
  Serial.print("📤 TX→Slave: ");
  Serial.println(output);
}

// Send ping message
void sendUARTPing()
{
  StaticJsonDocument<128> doc;
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
  Serial.print("📥 RX←Slave: ");
  Serial.println(line);

  StaticJsonDocument<512> doc;
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
    uint32_t seq = doc["seq"];
    last_pong_time = millis();

    Serial.printf("PONG ← seq=%u, uptime=%ds\n",
                  seq, (int)doc["uptime"]);
    return;
  }

  // Handle status response
  if (doc.containsKey("status"))
  {
    const char *status = doc["status"];
    Serial.printf("✅ Status: %s", status);

    if (doc.containsKey("msg"))
    {
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