#ifndef SCREEN_MANAGER_H
#define SCREEN_MANAGER_H

#include <LovyanGFX.hpp>
#include <Touch.h>
#include "DisplayConfig.h"
#include "hub_network.h"
#include "Touch/touch_button.h"
// External references to sprites and LCD (defined in main.cpp)
extern LGFX_Sprite topBar;
extern LGFX_Sprite contentArea;
extern LGFX_Sprite botBar;
extern LGFX_Sprite touchArea;
extern LGFX lcd;

// External references to status variables (defined in main.cpp)
extern volatile bool topBarNeedsUpdate;
extern volatile bool botBarNeedsUpdate;
extern volatile bool contentNeedsUpdate;
extern volatile bool touchAreaNeedsUpdate;
extern volatile bool doorbellJustRang;
extern unsigned long doorbellRingTime;
extern DeviceStatus doorbellStatus;
extern bool doorbellOnline;
extern int cur_Screen;
extern int Last_Screen;
extern TouchPosition currentTouch;
extern volatile bool touchDataReady;





// Function declarations
void updateTopBar();
void updateContent();
void updateTouchllv();
void updatetouch();
void updateBotBar();
void drawWifiSymbol(int x, int y, int strength);
void drawProgressBar(LGFX_Sprite* sprite, int x, int y, int width, int height, int value, uint16_t fillColor, uint16_t bgColor, uint16_t borderColor, int borderThickness = 2);
uint16_t getProgressColor(int progress);
void drawTransparentText(LGFX_Sprite* sprite, const char* text, int x, int y, uint16_t textColor);

#endif // SCREEN_MANAGER_H
