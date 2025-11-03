#ifndef UART_COMMANDS_H
#define UART_COMMANDS_H

#include <Arduino.h>
#include <ArduinoJson.h>
#include <HardwareSerial.h>

extern HardwareSerial MasterSerial;
extern HardwareSerial AmpSerial;

// Camera/Slave ping-pong
extern uint32_t ping_counter;
extern unsigned long last_pong_time;
extern int slave_status;
extern bool recognition_success;

// Amp ping-pong
extern uint32_t amp_ping_counter;
extern unsigned long last_amp_pong_time;
extern int amp_status;

// Face detection bounding box
extern bool hasFaceDetection;
extern int face_bbox_x;
extern int face_bbox_y;
extern int face_bbox_w;
extern int face_bbox_h;
extern unsigned long lastFaceDetectionTime;

// Send command to Slave (with automatic mode tracking)
void sendUARTCommand(const char *cmd, const char *param = nullptr, int value = -1);

// Send command to Amp board via UART2
void sendUART2Command(const char *cmd, const char *url);

// Send ping message to Slave (Camera)
void sendUARTPing();

// Send ping message to Amp
void sendUART2Ping();

// Handle UART response from Slave
void handleUARTResponse(String line);

// Handle UART response from Amp
void handleUART2Response(String line);

#endif