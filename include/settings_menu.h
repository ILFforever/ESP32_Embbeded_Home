#ifndef SETTINGS_MENU_H
#define SETTINGS_MENU_H

#include <Arduino.h>

// Full-screen settings page, driven by the two front buttons.
//
// Entry/exit: press Doorbell + Call together and release both inside
// BUTTON_HOLD_THRESHOLD_MS. Holding both for 3s stays the system-reboot
// gesture, so the two never collide (see checkButtons() in main.cpp).
//
// Navigation once open:
//   Call short press     - move the cursor down (wraps)
//   Doorbell short press - activate the highlighted item
//
// There is no hold gesture inside the page: every screen carries a "Back" row
// and the top level a "Exit" row, which the cursor walks to like any other
// item. Holding a button while the page is open does nothing.
//
// While the page is active it owns the whole panel: drawUIOverlay(),
// ProcessFrame() and showUploadingScreen() all bail out early, so nothing
// draws over it.

bool isSettingsMenuActive();

void openSettingsMenu();
void closeSettingsMenu();

// Button events (no-ops when the page is not active)
void settingsMenuNext();   // Call: cursor down
void settingsMenuSelect(); // Doorbell: activate

// Periodic redraw + inactivity timeout. Driven by a TaskScheduler task.
void settingsMenuTick();

#endif
