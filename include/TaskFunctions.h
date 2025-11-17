#ifndef TASK_FUNCTIONS_H
#define TASK_FUNCTIONS_H

#include <Arduino.h>
#include "TaskScheduler.h"

// ============================================================================
// Task Function Declarations
// ============================================================================

void updateTopBar();
void updateContent();
void updateTouch();
void updateCapSensor();
void pushSpritesToDisplay();

// ============================================================================
// Task Scheduler Tasks
// ============================================================================

extern Task taskUpdateTopBar;
extern Task taskUpdateContent;
extern Task taskTouchUpdate;
extern Task taskCapSensorUpdate;
extern Task taskPushSprites;

#endif // TASK_FUNCTIONS_H
