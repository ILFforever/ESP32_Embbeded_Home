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
extern TFT_eSprite videoSprite;

// Update status message on LCD
void updateStatusMsg(const char* msg, bool temporary = false, const char* fallback = nullptr);

void checkStatusMessageExpiration();

String getStatusMessageForSlaveState(int state);

// Fill video area with uploading message
void showUploadingScreen();

#endif
