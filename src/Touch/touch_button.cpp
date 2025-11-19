#include "GUI/screen_manager.h"

// Check if touch coordinates are within bounds
bool isTouchInBounds(int touchX, int touchY, int x, int y, int width, int height)
{
  return (touchX >= x && touchX < (x + width) && touchY >= y && touchY < (y + height));
}

// Update touch button state
// Returns true when button is released (clicked)
// Updates btn->isPressed, btn->isDragging states for rendering
bool updateTouchButton(TouchButton* btn, int touchX, int touchY, bool isTouching)
{
  bool wasReleased = false;

  if (isTouching)
  {
    // Touch is active
    if (!btn->isPressed)
    {
      // New touch - check if it's in bounds
      if (isTouchInBounds(touchX, touchY, btn->x, btn->y, btn->width, btn->height))
      {
        // Touch started inside button
        btn->isPressed = true;
        btn->initialTouchX = touchX;
        btn->initialTouchY = touchY;
        btn->pressStartTime = millis();
        btn->isDragging = false;
      }
    }
    else
    {
      // Continuing touch - check if dragged outside
      if (!isTouchInBounds(touchX, touchY, btn->x, btn->y, btn->width, btn->height))
      {
        btn->isDragging = true;
      }
      else
      {
        // Back inside bounds
        btn->isDragging = false;
      }
    }
  }
  else
  {
    // Touch released
    if (btn->isPressed)
    {
      // Button was pressed and now released
      if (!btn->isDragging && isTouchInBounds(btn->initialTouchX, btn->initialTouchY, btn->x, btn->y, btn->width, btn->height))
      {
        // Valid click - started and ended inside bounds without dragging
        wasReleased = true;
      }

      // Reset button state
      btn->isPressed = false;
      btn->isDragging = false;
    }
  }

  return wasReleased;
}
