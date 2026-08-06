#ifndef LCD_HELPER_H
#define LCD_HELPER_H

#include <Arduino.h>
#include <TFT_eSPI.h>

extern bool uiNeedsUpdate;
extern String status_msg;
extern bool status_msg_is_temporary;
extern String status_msg_fallback;
extern int slave_status;
extern unsigned long status_msg_last_update;
extern volatile bool videoBandDirty;

// Video region on the panel. The video area is drawn directly to the TFT (no
// full-frame sprite) - a 240x200x2 sprite costs 96KB of DRAM we do not have.
#define VIDEO_X 0
#define VIDEO_Y 65
#define VIDEO_W 240
#define VIDEO_H 200

// Update status message on LCD
void updateStatusMsg(const char* msg, bool temporary = false, const char* fallback = nullptr);

void checkStatusMessageExpiration();

String getStatusMessageForSlaveState(int state);

// Fill video area with uploading message
void showUploadingScreen();

#endif
