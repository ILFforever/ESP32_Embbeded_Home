#ifndef NFC_SCAN_STATE_H
#define NFC_SCAN_STATE_H

#include <Arduino.h>

struct NFCScanState {
  bool active = false;
  String sessionId = "";
  unsigned long activatedTime = 0;
};

extern NFCScanState nfcScanState;

enum NFCCardScanStatus {
  NFC_SCAN_IDLE = 0,
  NFC_SCAN_SUCCESS = 1,
  NFC_SCAN_DENIED = 2
};

extern NFCCardScanStatus cardScanStatus;

#endif
