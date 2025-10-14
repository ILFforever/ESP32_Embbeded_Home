#ifndef UART_COMMANDS_H
#define UART_COMMANDS_H

#include <Arduino.h>
#include <ArduinoJson.h>
#include <HardwareSerial.h>

extern HardwareSerial SlaveSerial;
extern uint32_t ping_counter;
extern unsigned long last_pong_time;
extern int slave_status;
extern bool uiNeedsUpdate;
extern String status_msg;
extern bool status_msg_is_temporary;
extern String status_msg_fallback;
extern bool recognition_success;

// Face detection bounding box
extern bool hasFaceDetection;
extern int face_bbox_x;
extern int face_bbox_y;
extern int face_bbox_w;
extern int face_bbox_h;
extern unsigned long lastFaceDetectionTime;

// Send command to Slave
void sendUARTCommand(const char *cmd, const char *param = nullptr, int value = -1);

// Send ping message
void sendUARTPing();

// Handle UART response from Slave
void handleUARTResponse(String line);

// Update status message on LCD
void updateStatusMsg(const char* msg, bool temporary = false, const char* fallback = nullptr);

#endif