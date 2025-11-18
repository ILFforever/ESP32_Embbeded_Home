#ifndef SCREEN_MANAGER_H
#define SCREEN_MANAGER_H

#include <LovyanGFX.hpp>

// External references to sprites and LCD (defined in main.cpp)
extern LGFX_Sprite topBar;
extern LGFX_Sprite contentArea;
extern LGFX lcd;

// External references to status variables (defined in main.cpp)
extern volatile bool topBarNeedsUpdate;
extern volatile bool contentNeedsUpdate;
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
void updateTouch();
void pushSpritesToDisplay();
void drawWifiSymbol(int x, int y, int strength);

#endif // SCREEN_MANAGER_H
