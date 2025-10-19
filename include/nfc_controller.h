// nfc_controller.h - NFC Reader using PN532 with IRQ
//
// Usage Example:
//
//   #include "nfc_controller.h"
//
//   void onCardDetected(NFCCardData card) {
//     Serial.print("Card detected! ID: ");
//     Serial.println(card.cardId);
//     updateStatusMsg("Card Scanned", true);
//   }
//
//   void setup() {
//     // ... other setup ...
//
//     // Initialize NFC (creates RTOS task on Core 0)
//     if (initNFC()) {
//       Serial.println("NFC ready");
//       setNFCCardCallback(onCardDetected);  // Optional callback
//     }
//   }
//
//   void loop() {
//     // NFC runs independently in background
//     // Or manually check:
//     // if (getLastCardData().isValid) { /* do something */ }
//   }
//
#ifndef NFC_CONTROLLER_H
#define NFC_CONTROLLER_H

#include <Arduino.h>

// NFC Pin Configuration
#define NFC_I2C_SDA 21          // TODO: Change pins if needed
#define NFC_I2C_SCL 22          // TODO: Change pins if needed
#define NFC_PN532_IRQ 4         // TODO: Change pins if needed
#define NFC_PN532_RESET -1      // No reset pin

// NFC Configuration
#define NFC_DEBOUNCE_DELAY 500  // ms between card reads

// Card data structure
struct NFCCardData {
    uint8_t uid[7];             // Card UID (up to 7 bytes)
    uint8_t uidLength;          // UID length (typically 4 or 7 bytes)
    uint32_t cardId;            // Decimal card ID (for 4-byte UIDs)
    bool isValid;               // Whether card read was successful
};

// Callback function type for card detection
// Called when a card is successfully read
// Parameters: NFCCardData containing card information
typedef void (*NFCCardCallback)(NFCCardData cardData);

// Initialize NFC reader and start RTOS task
// Returns: true if initialization successful, false otherwise
bool initNFC();

// Set callback function to be called when card is detected
// Parameters:
//   callback - Function to call with card data
void setNFCCardCallback(NFCCardCallback callback);

// Get last read card data
// Returns: NFCCardData structure with last card info
NFCCardData getLastCardData();

// Check if NFC reader is initialized and running
// Returns: true if running, false otherwise
bool isNFCRunning();

void stopNFC();

#endif // NFC_CONTROLLER_H
