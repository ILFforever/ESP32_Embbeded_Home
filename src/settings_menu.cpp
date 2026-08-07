#include "settings_menu.h"

#include <TFT_eSPI.h>
#include <WiFi.h>
#include <esp_heap_caps.h>
#include <esp_system.h>

#include "app_config.h"
#include "doorbell_mqtt.h"
#include "lcd_helper.h"
#include "logger.h"
#include "SPIMaster.h"
#include "uart_commands.h"
#include "weather.h"

extern TFT_eSPI tft;
extern SemaphoreHandle_t tftMutex;
extern SPIMaster spiMaster;
extern int slave_status;
extern int amp_status;

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
// The panel is 240x320 and there is no framebuffer to spare (see the DRAM note
// in CLAUDE.md), so every element is drawn straight to the TFT. Flicker is
// avoided the same way the clock screen avoids it: a full clear only happens on
// a screen change, and the live values redraw over themselves with opaque text
// plus setTextPadding().

#define SM_W 240
#define SM_H 320
// The panel's first reliably visible row. The rest of the UI never draws above
// y=20 either - topuiSprite is pushed at y=20 and botuiSprite ends at y=310 -
// so anything drawn in the top strip does not show up. A header placed at y=0
// simply never appeared. If the real hidden margin turns out to be a different
// size, this is the only number that needs changing.
#define SM_TOP 20
#define SM_BOTTOM 310

// Header is 22px: font 2 is 16px tall, so centred text spans 3..19 inside it.
#define SM_HEADER_H 22
#define SM_UNDERLINE_Y (SM_TOP + SM_HEADER_H)
#define SM_UNDERLINE_H 2
#define SM_STRIP_Y (SM_UNDERLINE_Y + SM_UNDERLINE_H + 2) // live CAM/AMP/NET dots
#define SM_STRIP_H 18
#define SM_INFO_Y (SM_STRIP_Y + SM_STRIP_H + 2)
// 17 gives font 2 (16px tall) a single pixel of leading. Tightening this by one
// pixel is what buys the eight rows of Device Info enough room for the footer
// block to sit higher without the deepest list running into the toast line.
#define SM_INFO_LINE_H 17
#define SM_LIST_GAP 4 // between the info block (or strip) and the first row
#define SM_ROW_H 24
#define SM_ROW_TEXT_DY 4
#define SM_ACCENT_W 4 // per-row colour bar
#define SM_TOAST_Y 256
#define SM_FRULE_Y 274
#define SM_FOOTER_Y 278
#define SM_FOOTER_Y2 290

#define SM_COL_HEADER 0x0195 // deep blue, still used for the footer rule
#define SM_COL_SELECT 0x02DF // brighter blue for the cursor row
#define SM_COL_LABEL TFT_DARKGREY
#define SM_COL_VALUE TFT_WHITE
#define SM_COL_ITEM TFT_LIGHTGREY

// Header gradient endpoints, kept as RGB565 components so the interpolation
// below stays integer-only. Top #001E6E -> base #0045D6.
#define SM_GRAD_G0 7
#define SM_GRAD_B0 13
#define SM_GRAD_G1 17
#define SM_GRAD_B1 26

// Row accents. These reuse the colour language already in drawUIOverlay() -
// cyan for information, green/amber/red for health - so the settings page does
// not read as a different device.
#define SM_ACC_INFO 0x05FF    // cyan
#define SM_ACC_SYSTEM 0xFC80  // orange
#define SM_ACC_DANGER TFT_RED // destructive item
#define SM_ACC_NEUTRAL 0x8410 // grey, for Back / Exit
#define SM_ACC_OK TFT_GREEN
#define SM_ACC_WARN 0xFD20 // amber
// Sentinel, not a real colour: resolved from live module health at draw time.
#define SM_ACC_LIVE 0x0001

#define SM_INACTIVITY_TIMEOUT_MS 30000
#define SM_CONFIRM_WINDOW_MS 3000
#define SM_TOAST_DURATION_MS 2000
#define SM_VALUE_REFRESH_MS 1000

// ---------------------------------------------------------------------------
// Menu model
// ---------------------------------------------------------------------------

enum Screen : uint8_t
{
  SCR_MAIN,
  SCR_INFO,
  SCR_MODULES,
  SCR_SYSTEM
};

enum Action : uint8_t
{
  ACT_GOTO_INFO,
  ACT_GOTO_MODULES,
  ACT_GOTO_SYSTEM,
  ACT_BACK,
  ACT_EXIT,
  ACT_REBOOT_CAMERA,
  ACT_REBOOT_AMP,
  ACT_TEST_SOUND,
  ACT_PING_MODULES,
  ACT_REBOOT_DEVICE,
  ACT_WIFI_RECONNECT,
  ACT_WEATHER_REFRESH,
  ACT_MQTT_RECONNECT
};

struct MenuItem
{
  const char *label;
  uint8_t action;
  bool confirm;    // needs a second Doorbell press to fire
  uint16_t accent; // colour of the row's left bar, or SM_ACC_LIVE
};

static const MenuItem MAIN_ITEMS[] = {
    {"Device Info", ACT_GOTO_INFO, false, SM_ACC_INFO},
    {"Module Status", ACT_GOTO_MODULES, false, SM_ACC_LIVE},
    {"System", ACT_GOTO_SYSTEM, false, SM_ACC_SYSTEM},
    {"Exit", ACT_EXIT, false, SM_ACC_NEUTRAL},
};

// Every screen ends in a Back row (and an Exit row, so leaving the page never
// costs more than two selections) - there is no hold-to-go-back gesture.
static const MenuItem INFO_ITEMS[] = {
    {"Back", ACT_BACK, false, SM_ACC_NEUTRAL},
    {"Exit", ACT_EXIT, false, SM_ACC_NEUTRAL},
};

static const MenuItem MODULE_ITEMS[] = {
    {"Re-ping Modules", ACT_PING_MODULES, false, SM_ACC_INFO},
    {"Test Sound", ACT_TEST_SOUND, false, SM_ACC_INFO},
    {"Reboot Camera", ACT_REBOOT_CAMERA, true, SM_ACC_DANGER},
    {"Reboot Amp", ACT_REBOOT_AMP, true, SM_ACC_DANGER},
    {"Back", ACT_BACK, false, SM_ACC_NEUTRAL},
    {"Exit", ACT_EXIT, false, SM_ACC_NEUTRAL},
};

static const MenuItem SYSTEM_ITEMS[] = {
    {"Reconnect WiFi", ACT_WIFI_RECONNECT, false, SM_ACC_INFO},
    {"Reconnect MQTT", ACT_MQTT_RECONNECT, false, SM_ACC_INFO},
    {"Refresh Weather", ACT_WEATHER_REFRESH, false, SM_ACC_INFO},
    {"Reboot Doorbell", ACT_REBOOT_DEVICE, true, SM_ACC_DANGER},
    {"Back", ACT_BACK, false, SM_ACC_NEUTRAL},
    {"Exit", ACT_EXIT, false, SM_ACC_NEUTRAL},
};

struct ScreenDef
{
  const char *title;
  const MenuItem *items;
  uint8_t itemCount;
  uint8_t infoLines; // dynamic lines drawn above the item list
};

static const ScreenDef SCREENS[] = {
    {"SETTINGS", MAIN_ITEMS, sizeof(MAIN_ITEMS) / sizeof(MAIN_ITEMS[0]), 0},
    {"DEVICE INFO", INFO_ITEMS, sizeof(INFO_ITEMS) / sizeof(INFO_ITEMS[0]), 8},
    {"MODULE STATUS", MODULE_ITEMS, sizeof(MODULE_ITEMS) / sizeof(MODULE_ITEMS[0]), 2},
    {"SYSTEM", SYSTEM_ITEMS, sizeof(SYSTEM_ITEMS) / sizeof(SYSTEM_ITEMS[0]), 0},
};

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------

static bool menuActive = false;
static uint8_t screen = SCR_MAIN;
static uint8_t cursor = 0;
static uint8_t prevCursor = 0;

static bool needFullRedraw = false;
static bool needCursorRedraw = false;
static unsigned long lastActivity = 0;
static unsigned long lastValueRefresh = 0;
static uint16_t lastLiveAccent = 0;

static int8_t confirmIndex = -1;
static unsigned long confirmTime = 0;

static char toastMsg[40] = "";
static unsigned long toastTime = 0;
static bool toastDirty = false;

static void markActivity()
{
  lastActivity = millis();
}

static void showToast(const char *msg)
{
  snprintf(toastMsg, sizeof(toastMsg), "%s", msg);
  toastTime = millis();
  toastDirty = true;
}

static void clearConfirm()
{
  confirmIndex = -1;
  confirmTime = 0;
}

static int listTop()
{
  const ScreenDef &s = SCREENS[screen];
  // Deepest screen is Device Info: 66 + 8*17 + 4 = 206, two rows ending at 252,
  // which stays clear of the toast line at 256.
  if (s.infoLines == 0)
    return SM_STRIP_Y + SM_STRIP_H + 6;
  return SM_INFO_Y + s.infoLines * SM_INFO_LINE_H + SM_LIST_GAP;
}

// Combined health of the two slave modules. -1 is disconnected; 0 and above
// mean the module is answering pings.
static uint16_t moduleHealthColour()
{
  const bool cameraUp = (slave_status >= 0);
  const bool ampUp = (amp_status >= 0);

  if (cameraUp && ampUp)
    return SM_ACC_OK;
  if (cameraUp || ampUp)
    return SM_ACC_WARN;
  return SM_ACC_DANGER;
}

static uint16_t resolveAccent(const MenuItem &item)
{
  return (item.accent == SM_ACC_LIVE) ? moduleHealthColour() : item.accent;
}

// ---------------------------------------------------------------------------
// Dynamic info lines
// ---------------------------------------------------------------------------

struct InfoLine
{
  const char *label;
  char value[26];
};

static InfoLine infoLines[8];

static void formatUptime(char *buf, size_t len)
{
  unsigned long s = millis() / 1000;
  snprintf(buf, len, "%luh %02lum %02lus", s / 3600, (s % 3600) / 60, s % 60);
}

static const char *slaveStateText(int state)
{
  switch (state)
  {
  case -1:
    return "DISCONNECTED";
  case 0:
    return "Standby";
  case 1:
    return "Camera on";
  case 2:
    return "Recognising";
  default:
    return "Unknown";
  }
}

static const char *ampStateText(int state)
{
  switch (state)
  {
  case -1:
    return "DISCONNECTED";
  case 0:
    return "Standby";
  case 1:
    return "Playing";
  default:
    return "Unknown";
  }
}

// Fill infoLines[] for the current screen. Returns how many are in use.
static uint8_t buildInfoLines()
{
  const bool wifiUp = (WiFi.status() == WL_CONNECTED);

  if (screen == SCR_INFO)
  {
    infoLines[0].label = "IP";
    snprintf(infoLines[0].value, sizeof(infoLines[0].value), "%s",
             wifiUp ? WiFi.localIP().toString().c_str() : "offline");

    infoLines[1].label = "SSID";
    snprintf(infoLines[1].value, sizeof(infoLines[1].value), "%s",
             wifiUp ? WiFi.SSID().c_str() : "-");

    infoLines[2].label = "Signal";
    if (wifiUp)
      snprintf(infoLines[2].value, sizeof(infoLines[2].value), "%d dBm", (int)WiFi.RSSI());
    else
      snprintf(infoLines[2].value, sizeof(infoLines[2].value), "-");

    infoLines[3].label = "Device";
    snprintf(infoLines[3].value, sizeof(infoLines[3].value), "%s", DOORBELL_DEVICE_ID);

    infoLines[4].label = "MQTT";
    snprintf(infoLines[4].value, sizeof(infoLines[4].value), "%s",
             isDoorbellMQTTConnected() ? "connected" : "offline");

    infoLines[5].label = "Uptime";
    formatUptime(infoLines[5].value, sizeof(infoLines[5].value));

    // "largest" is what actually decides whether a big allocation succeeds -
    // free heap counts 32-bit-only IRAM that cannot back a byte buffer.
    infoLines[6].label = "Heap f/lg";
    snprintf(infoLines[6].value, sizeof(infoLines[6].value), "%uK / %uK",
             (unsigned)(ESP.getFreeHeap() / 1024),
             (unsigned)(heap_caps_get_largest_free_block(MALLOC_CAP_8BIT | MALLOC_CAP_INTERNAL) / 1024));

    infoLines[7].label = "Frames r/d";
    snprintf(infoLines[7].value, sizeof(infoLines[7].value), "%lu / %lu",
             (unsigned long)spiMaster.getFramesReceived(),
             (unsigned long)spiMaster.getFramesDropped());
    return 8;
  }

  if (screen == SCR_MODULES)
  {
    infoLines[0].label = "Camera";
    snprintf(infoLines[0].value, sizeof(infoLines[0].value), "%s", slaveStateText(slave_status));

    infoLines[1].label = "Amp";
    snprintf(infoLines[1].value, sizeof(infoLines[1].value), "%s", ampStateText(amp_status));

    // Frame counters deliberately left out - they are on the Device Info screen
    // already, and a third line here would push the six rows into the toast.
    return 2;
  }

  return 0;
}

// ---------------------------------------------------------------------------
// Drawing (caller must already hold tftMutex)
// ---------------------------------------------------------------------------

// Vertical gradient across the 22px header. Integer interpolation of the RGB565
// green and blue channels only - red is 0 at both ends.
static void drawHeaderGradient()
{
  for (int y = 0; y < SM_HEADER_H; y++)
  {
    const uint8_t g = SM_GRAD_G0 + (SM_GRAD_G1 - SM_GRAD_G0) * y / (SM_HEADER_H - 1);
    const uint8_t b = SM_GRAD_B0 + (SM_GRAD_B1 - SM_GRAD_B0) * y / (SM_HEADER_H - 1);
    tft.drawFastHLine(0, SM_TOP + y, SM_W, (uint16_t)(((uint16_t)g << 5) | b));
  }
  tft.fillRect(0, SM_UNDERLINE_Y, SM_W, SM_UNDERLINE_H, SM_ACC_INFO);
}

// Live camera / amp / network dots. Only the dots change, so the periodic
// refresh redraws those and leaves the labels alone - a filled circle fully
// covers its predecessor, so nothing needs clearing first.
static void drawStatusStrip(bool withLabels)
{
  const int cy = SM_STRIP_Y + SM_STRIP_H / 2;

  struct Cell
  {
    const char *label;
    uint16_t colour;
  };

  const bool wifiUp = (WiFi.status() == WL_CONNECTED);
  uint16_t netColour = SM_ACC_DANGER;
  if (wifiUp)
    netColour = isDoorbellMQTTConnected() ? SM_ACC_OK : SM_ACC_WARN;

  const Cell cells[3] = {
      {"CAM", (uint16_t)(slave_status >= 0 ? SM_ACC_OK : SM_ACC_DANGER)},
      {"AMP", (uint16_t)(amp_status >= 0 ? SM_ACC_OK : SM_ACC_DANGER)},
      {"NET", netColour},
  };

  if (withLabels)
  {
    tft.setTextFont(1);
    tft.setTextPadding(0);
    tft.setTextDatum(ML_DATUM);
    tft.setTextColor(SM_COL_LABEL, TFT_BLACK);
  }

  for (int i = 0; i < 3; i++)
  {
    const int cx = 40 + i * 80;
    tft.fillCircle(cx - 18, cy, 3, cells[i].colour);
    if (withLabels)
      tft.drawString(cells[i].label, cx - 10, cy);
  }

  if (withLabels)
    tft.setTextDatum(TL_DATUM);
}

static void drawInfoValues()
{
  const uint8_t count = buildInfoLines();
  if (count == 0)
    return;

  tft.setTextFont(2);
  for (uint8_t i = 0; i < count; i++)
  {
    const int y = SM_INFO_Y + i * SM_INFO_LINE_H;

    tft.setTextDatum(TL_DATUM);
    tft.setTextPadding(0);
    tft.setTextColor(SM_COL_LABEL, TFT_BLACK);
    tft.drawString(infoLines[i].label, 10, y);

    // Right-aligned and padded so a shorter value erases the longer one it
    // replaces without clearing (and re-flashing) the whole line.
    tft.setTextDatum(TR_DATUM);
    tft.setTextPadding(150);
    tft.setTextColor(SM_COL_VALUE, TFT_BLACK);
    tft.drawString(infoLines[i].value, SM_W - 10, y);
  }
  tft.setTextPadding(0);
  tft.setTextDatum(TL_DATUM);
}

static void drawItem(uint8_t index)
{
  const ScreenDef &s = SCREENS[screen];
  if (index >= s.itemCount)
    return;

  const int y = listTop() + index * SM_ROW_H;
  const bool selected = (index == cursor);
  const bool awaitingConfirm = (confirmIndex == (int8_t)index);

  uint16_t bg = TFT_BLACK;
  uint16_t fg = SM_COL_ITEM;
  if (awaitingConfirm)
  {
    bg = TFT_MAROON;
    fg = TFT_WHITE;
  }
  else if (selected)
  {
    bg = SM_COL_SELECT;
    fg = TFT_WHITE;
  }

  tft.fillRect(4, y, SM_W - 8, SM_ROW_H - 2, bg);

  // Left accent bar. An armed confirm forces it red so the whole row reads as
  // dangerous, not just its background.
  const uint16_t accent = awaitingConfirm ? SM_ACC_DANGER : resolveAccent(s.items[index]);
  tft.fillRect(4, y, SM_ACCENT_W, SM_ROW_H - 2, accent);

  tft.setTextFont(2);
  tft.setTextDatum(TL_DATUM);
  tft.setTextPadding(0);
  tft.setTextColor(fg, bg);

  if (selected)
    tft.drawString(">", 12, y + SM_ROW_TEXT_DY);

  if (awaitingConfirm)
  {
    char buf[40];
    snprintf(buf, sizeof(buf), "%s? press again", s.items[index].label);
    tft.drawString(buf, 26, y + SM_ROW_TEXT_DY);
  }
  else
  {
    tft.drawString(s.items[index].label, 26, y + SM_ROW_TEXT_DY);
  }
}

static void drawToast()
{
  tft.fillRect(0, SM_TOAST_Y, SM_W, 18, TFT_BLACK);
  if (toastMsg[0] == '\0')
    return;

  tft.setTextFont(2);
  tft.setTextDatum(TC_DATUM);
  tft.setTextPadding(0);
  tft.setTextColor(TFT_GREENYELLOW, TFT_BLACK);
  tft.drawString(toastMsg, SM_W / 2, SM_TOAST_Y);
  tft.setTextDatum(TL_DATUM);
}

static void drawScreen()
{
  const ScreenDef &s = SCREENS[screen];

  tft.fillScreen(TFT_BLACK);

  // Header. The title is drawn with a transparent background (single-argument
  // setTextColor) so the gradient shows through behind it.
  drawHeaderGradient();
  tft.setTextFont(2);
  tft.setTextDatum(MC_DATUM);
  tft.setTextPadding(0);
  tft.setTextColor(TFT_WHITE);
  tft.drawString(s.title, SM_W / 2, SM_TOP + SM_HEADER_H / 2);

  drawStatusStrip(true);
  drawInfoValues();

  for (uint8_t i = 0; i < s.itemCount; i++)
    drawItem(i);

  drawToast();

  // Footer hints
  tft.drawFastHLine(0, SM_FRULE_Y, SM_W, SM_COL_HEADER);
  tft.setTextFont(1);
  tft.setTextDatum(TC_DATUM);
  tft.setTextColor(SM_COL_LABEL, TFT_BLACK);
  tft.drawString("CALL: down    DOORBELL: select", SM_W / 2, SM_FOOTER_Y);
  tft.drawString("select Back / Exit to leave", SM_W / 2, SM_FOOTER_Y2);
  tft.setTextDatum(TL_DATUM);
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

static void gotoScreen(uint8_t next)
{
  screen = next;
  cursor = 0;
  prevCursor = 0;
  clearConfirm();
  needFullRedraw = true;
}

static void runAction(uint8_t action)
{
  switch (action)
  {
  case ACT_GOTO_INFO:
    gotoScreen(SCR_INFO);
    break;

  case ACT_GOTO_MODULES:
    gotoScreen(SCR_MODULES);
    break;

  case ACT_GOTO_SYSTEM:
    gotoScreen(SCR_SYSTEM);
    break;

  case ACT_BACK:
    gotoScreen(SCR_MAIN);
    break;

  case ACT_EXIT:
    closeSettingsMenu();
    break;

  case ACT_PING_MODULES:
    sendUARTPing();
    sendUART2Ping();
    sendUARTCommand("get_status");
    showToast("Ping sent");
    break;

  case ACT_TEST_SOUND:
    sendUART2Command("play", "success");
    showToast("Playing test sound");
    break;

  case ACT_REBOOT_CAMERA:
    sendUARTCommand("reboot");
    showToast("Camera reboot sent");
    break;

  case ACT_REBOOT_AMP:
    sendUART2Command("restart", "");
    showToast("Amp reboot sent");
    break;

  case ACT_WIFI_RECONNECT:
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    showToast("Reconnecting WiFi...");
    break;

  case ACT_MQTT_RECONNECT:
    showToast(connectDoorbellMQTT() ? "MQTT connected" : "MQTT failed");
    break;

  case ACT_WEATHER_REFRESH:
    fetchWeatherTask();
    showToast("Weather refreshed");
    break;

  case ACT_REBOOT_DEVICE:
  {
    StaticJsonDocument<256> meta;
    JsonObject metadata = meta.to<JsonObject>();
    metadata["reason"] = "settings_menu";
    metadata["uptime_ms"] = millis();
    metadata["free_heap"] = ESP.getFreeHeap();
    logCritical("system", "Device restart from settings menu", metadata);

    if (xSemaphoreTake(tftMutex, pdMS_TO_TICKS(100)) == pdTRUE)
    {
      tft.fillScreen(TFT_BLACK);
      tft.setTextFont(4);
      tft.setTextDatum(MC_DATUM);
      tft.setTextColor(TFT_WHITE, TFT_BLACK);
      tft.drawString("Rebooting...", SM_W / 2, SM_H / 2);
      tft.setTextDatum(TL_DATUM);
      xSemaphoreGive(tftMutex);
    }
    delay(600);
    ESP.restart();
    break;
  }

  default:
    break;
  }
}

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

bool isSettingsMenuActive()
{
  return menuActive;
}

void openSettingsMenu()
{
  if (menuActive)
    return;

  menuActive = true;
  screen = SCR_MAIN;
  cursor = 0;
  prevCursor = 0;
  clearConfirm();
  toastMsg[0] = '\0';
  toastDirty = false;
  needFullRedraw = true;
  needCursorRedraw = false;
  lastValueRefresh = 0;
  markActivity();

  Serial.println("[SETTINGS] Menu opened");
}

void closeSettingsMenu()
{
  if (!menuActive)
    return;

  menuActive = false;
  clearConfirm();
  toastMsg[0] = '\0';

  // Hand the panel back. The UI sprites repaint themselves on the next
  // drawUIOverlay() pass; videoBandDirty forces the clock screen to clear and
  // redraw immediately instead of waiting for its next one-second tick.
  if (xSemaphoreTake(tftMutex, pdMS_TO_TICKS(100)) == pdTRUE)
  {
    tft.fillScreen(TFT_BLACK);
    xSemaphoreGive(tftMutex);
  }
  videoBandDirty = true;
  uiNeedsUpdate = true;

  Serial.println("[SETTINGS] Menu closed");
}

void settingsMenuNext()
{
  if (!menuActive)
    return;

  const ScreenDef &s = SCREENS[screen];
  prevCursor = cursor;
  cursor = (cursor + 1) % s.itemCount;
  clearConfirm();
  needCursorRedraw = true;
  markActivity();
}

void settingsMenuSelect()
{
  if (!menuActive)
    return;

  const ScreenDef &s = SCREENS[screen];
  const MenuItem &item = s.items[cursor];
  markActivity();

  // Destructive items arm on the first press and fire on the second, so a
  // mis-press cannot reboot a module.
  if (item.confirm && confirmIndex != (int8_t)cursor)
  {
    confirmIndex = (int8_t)cursor;
    confirmTime = millis();
    needCursorRedraw = true;
    prevCursor = cursor;
    return;
  }

  clearConfirm();
  needCursorRedraw = true;
  prevCursor = cursor;
  runAction(item.action);
}

void settingsMenuTick()
{
  if (!menuActive)
    return;

  const unsigned long now = millis();

  if (now - lastActivity > SM_INACTIVITY_TIMEOUT_MS)
  {
    Serial.println("[SETTINGS] Inactivity timeout");
    closeSettingsMenu();
    return;
  }

  if (toastMsg[0] != '\0' && now - toastTime > SM_TOAST_DURATION_MS)
  {
    toastMsg[0] = '\0';
    toastDirty = true;
  }

  bool confirmExpired = false;
  if (confirmIndex >= 0 && now - confirmTime > SM_CONFIRM_WINDOW_MS)
  {
    prevCursor = (uint8_t)confirmIndex;
    clearConfirm();
    confirmExpired = true;
    needCursorRedraw = true;
  }

  // The status strip and the live Module Status accent exist on every screen,
  // so this refresh is unconditional - not gated on the screen having an info
  // block the way it used to be.
  const bool refreshValues = (now - lastValueRefresh >= SM_VALUE_REFRESH_MS);

  if (!needFullRedraw && !needCursorRedraw && !refreshValues && !toastDirty && !confirmExpired)
    return;

  if (xSemaphoreTake(tftMutex, pdMS_TO_TICKS(20)) != pdTRUE)
    return; // try again on the next tick, flags are still set

  if (needFullRedraw)
  {
    drawScreen();
    needFullRedraw = false;
    needCursorRedraw = false;
    toastDirty = false;
    lastLiveAccent = moduleHealthColour(); // drawScreen already used this value
    lastValueRefresh = now;
  }
  else
  {
    if (needCursorRedraw)
    {
      drawItem(prevCursor);
      drawItem(cursor);
      needCursorRedraw = false;
    }
    if (refreshValues)
    {
      drawStatusStrip(false);
      drawInfoValues();

      // Repaint the live-accent rows only when the health colour actually
      // changed, so a steady system does no row drawing at all.
      const uint16_t live = moduleHealthColour();
      if (live != lastLiveAccent)
      {
        lastLiveAccent = live;
        const ScreenDef &s = SCREENS[screen];
        for (uint8_t i = 0; i < s.itemCount; i++)
        {
          if (s.items[i].accent == SM_ACC_LIVE)
            drawItem(i);
        }
      }

      lastValueRefresh = now;
    }
    if (toastDirty)
    {
      drawToast();
      toastDirty = false;
    }
  }

  xSemaphoreGive(tftMutex);
}
