#ifndef UART_COMMANDS_H
#define UART_COMMANDS_H

#include <Arduino.h>
#include <ArduinoJson.h>
#include <HardwareSerial.h>

extern HardwareSerial SlaveSerial;
extern uint32_t ping_counter;
extern unsigned long last_pong_time;
extern int slave_status;

// Send command to Slave
void sendUARTCommand(const char *cmd, const char *param = nullptr, int value = -1);

// Send ping message
void sendUARTPing();

// Handle UART response from Slave
void handleUARTResponse(String line);

#endif