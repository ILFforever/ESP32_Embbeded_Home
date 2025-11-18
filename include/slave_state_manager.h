#ifndef SLAVE_STATE_MANAGER_H
#define SLAVE_STATE_MANAGER_H

#include <Arduino.h>

// What mode we WANT the slave in vs what it's ACTUALLY in
extern int desired_slave_mode;  // -1=disconnected, 0=standby, 1=camera, 2=recognition
extern int actual_slave_mode;   // Tracks slave_status from uart_commands

// Check if slave needs recovery and execute it
void checkSlaveSync();

// Call this when we send a command to change mode
void setDesiredMode(int mode);

// Call this when slave confirms mode change
void updateActualMode(int mode);

#endif
