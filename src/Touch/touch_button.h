#ifndef TOUCH_BUTTON_H
#define TOUCH_BUTTON_H

#include <stdint.h>

// Touch button state structure
struct TouchButton {
  int x, y, width, height;  // Button bounds
  bool isPressed;            // Currently being touched
  int initialTouchX;         // Where touch started
  int initialTouchY;
  bool isDragging;           // Finger moved outside bounds
  uint32_t pressStartTime;   // When press began
};

// Touch button handling functions
bool updateTouchButton(TouchButton* btn, int touchX, int touchY, bool isTouching);
bool isTouchInBounds(int touchX, int touchY, int x, int y, int width, int height);

#endif // TOUCH_BUTTON_H