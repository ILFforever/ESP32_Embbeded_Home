#ifndef MESH_UART_H
#define MESH_UART_H

#include <Arduino.h>
#include <ArduinoJson.h>
#include <HardwareSerial.h>

// Mesh Serial object (will be initialized in main.cpp)
extern HardwareSerial MeshSerial;

// Mesh ping-pong tracking
extern uint32_t mesh_ping_counter;
extern unsigned long last_mesh_pong_time;
extern int mesh_status; // 0 = standby, -1 = disconnected, 1 = active

// Mesh disconnect warning tracking
extern unsigned long mesh_disconnect_start;
extern bool mesh_disconnect_warning_sent;

// Initialize Mesh UART communication
void initMeshUART(int rxPin, int txPin, unsigned long baud);

// Send ping message to Mesh
void sendMeshPing();

// Send command to Mesh
void sendMeshCommand(const char* cmd, const char* param = nullptr);

// Handle UART response from Mesh
void handleMeshResponse(String line);

// Check Mesh UART for incoming data
void checkMeshUART();

// Check Mesh ping timeout
void checkMeshTimeout();

#endif
