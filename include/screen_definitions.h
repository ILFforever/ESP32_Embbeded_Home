#ifndef SCREEN_DEFINITIONS_H
#define SCREEN_DEFINITIONS_H

// Screen enum for easy management
enum Screen
{
  SCREEN_HOME = 0,
  SCREEN_DEVICE_LIST = 1,
  SCREEN_DEVICE_LIST_CONT = 2,
  SCREEN_FONT = 3,
  SCREEN_BUTTON_EXAMPLE = 4,
  SCREEN_ROOM_DETAIL = 5,
  SCREEN_ENTER_PIN = 6,
  SCREEN_INFORMATION = 7,
  SCREEN_ROOM_DETAIL_GAS = 8,
  SCREEN_TEMP_1 = 9,
  SCREEN_TEMP_2 = 10,
  SCREEN_MASTER_MENU = 11,
  SCREEN_NOTIFICATION_LOG = 12,
  SCREEN_COUNT = 13 // Total number of screens
};

// Helper function to get screen name (for debugging)
inline const char *getScreenName(int screen)
{
  switch (screen)
  {
  case SCREEN_HOME:
    return "Home";
  case SCREEN_FONT:
    return "Font";
  case SCREEN_BUTTON_EXAMPLE:
    return "Button Example";
  case SCREEN_ROOM_DETAIL:
    return "Room Detail";
  case SCREEN_ENTER_PIN:
    return "Enter Pin";
  case SCREEN_INFORMATION:
    return "Information";
  case SCREEN_DEVICE_LIST:
    return "Device List";
  case SCREEN_DEVICE_LIST_CONT:
    return "Device List";
  case SCREEN_ROOM_DETAIL_GAS:
    return "Room Detail Gas";
  case SCREEN_TEMP_1:
    return "Temp 1";
  case SCREEN_TEMP_2:
    return "Temp 2";
  case SCREEN_MASTER_MENU:
    return "Master Menu";
  case SCREEN_NOTIFICATION_LOG:
    return "Notification Log";
  default:
    return "Unknown";
  }
}

#endif // SCREEN_DEFINITIONS_H
