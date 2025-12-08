#ifndef TOUCH_HANDLER_H
#define TOUCH_HANDLER_H

#include "touch_button.h"
#include "hub_network.h"

// Screen-specific touch handlers
void handleTouchInput();  // Main touch dispatcher for all screens
void resetAlertsLoadedFlag();

// External declarations for alert data
extern Alert alerts[5];
extern int selectedAlertIndex;

#endif // TOUCH_HANDLER_H
