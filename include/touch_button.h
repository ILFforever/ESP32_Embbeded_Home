#ifndef TOUCH_BUTTON_H
#define TOUCH_BUTTON_H

bool isTouchInBounds(int touchX, int touchY, int x, int y, int width, int height);
bool updateTouchButton(TouchButton* btn, int touchX, int touchY, bool isTouching);




#endif // MICROPHONE_H