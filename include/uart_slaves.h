#ifndef UART_SLAVES_H
#define UART_SLAVES_H

#include <Arduino.h>
#include <ArduinoJson.h>
#include <HardwareSerial.h>

// UART interfaces for slave modules
extern HardwareSerial MeshSerial;   // Main Mesh module
extern HardwareSerial AmpSerial;    // Main Amp module

// Main Mesh ping-pong
extern uint32_t mesh_ping_counter;
extern unsigned long last_mesh_pong_time;
extern int mesh_status;  // 0 = standby, -1 = disconnected, 1 = running

// Main Amp ping-pong
extern uint32_t amp_ping_counter;
extern unsigned long last_amp_pong_time;
extern int amp_status;  // 0 = standby, -1 = disconnected, 1 = playing

// Send ping message to Main Mesh
void sendMeshPing();

// Send ping message to Main Amp
void sendAmpPing();

// Send command to Main Mesh (for future use)
void sendMeshCommand(const char *cmd, const char *param = nullptr);

// Send command to Main Amp
void sendAmpCommand(const char *cmd, const char *url);

// Handle UART response from Main Mesh
void handleMeshResponse(String line);

// Handle UART response from Main Amp
void handleAmpResponse(String line);

// Structure for Main_mesh local sensor data
struct MainMeshLocalSensors {
  float temperature;   // DHT11 temperature in °C
  float humidity;      // DHT11 humidity in %
  int pm2_5;           // PMS5003 PM2.5 in µg/m³
  unsigned long timestamp; // Last update timestamp
  bool valid;          // Data validity flag
};

// Global variable for Main_mesh local sensor data
extern MainMeshLocalSensors meshLocalSensors;

// Flag to trigger screen refresh when new sensor data arrives
extern volatile bool meshSensorDataUpdated;

#endif
