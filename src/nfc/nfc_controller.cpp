#include "nfc_controller.h"
#include <Wire.h>
#include <Adafruit_PN532.h>

// PN532 instance for I2C with IRQ
static Adafruit_PN532 nfc(NFC_PN532_IRQ, NFC_PN532_RESET);

// Task variables
static volatile bool cardDetected = false;
static TaskHandle_t nfcTaskHandle = nullptr;
static NFCCardCallback cardCallback = nullptr;
static NFCCardData lastCardData = {0};
static bool nfcRunning = false;

// ISR - must be in IRAM for ESP32
void IRAM_ATTR nfcIrqHandler() {
  cardDetected = true;
}

// Internal NFC reading task
static void nfcTask(void *parameter) {
  Serial.println("[NFC] Task started");
  
  // Initialize NFC
  nfc.begin();
  
  uint32_t versiondata = nfc.getFirmwareVersion();
  if (!versiondata) {
    Serial.println("[NFC] ERROR: Didn't find PN532 board!");
    vTaskDelete(NULL);
    return;
  }
  
  Serial.print("[NFC] Found chip PN5");
  Serial.println((versiondata >> 24) & 0xFF, HEX);
  Serial.print("[NFC] Firmware ver. ");
  Serial.print((versiondata >> 16) & 0xFF, DEC);
  Serial.print(".");
  Serial.println((versiondata >> 8) & 0xFF, DEC);
  
  // Setup IRQ pin and interrupt
  pinMode(NFC_PN532_IRQ, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(NFC_PN532_IRQ), nfcIrqHandler, FALLING);

  nfcRunning = true;
  
  // Start listening for cards
  Serial.println("[NFC] Waiting for cards...");
  nfc.startPassiveTargetIDDetection(PN532_MIFARE_ISO14443A);
  
  while (1) {
    if (cardDetected) {
      cardDetected = false;
      
      Serial.println("\n[NFC] Card detected via IRQ!");
      
      uint8_t uid[7] = {0};
      uint8_t uidLength;
      
      if (nfc.readDetectedPassiveTargetID(uid, &uidLength)) {
        Serial.println("[NFC] ✓ Read successful");
        Serial.print("[NFC] UID Length: ");
        Serial.print(uidLength);
        Serial.println(" bytes");
        Serial.print("[NFC] UID: ");

        // Store card data
        lastCardData.uidLength = uidLength;
        memcpy(lastCardData.uid, uid, uidLength);
        lastCardData.isValid = true;

        for (uint8_t i = 0; i < uidLength; i++) {
          if (uid[i] < 0x10) Serial.print("0");
          Serial.print(uid[i], HEX);
          if (i < uidLength - 1) Serial.print(" ");
        }
        Serial.println();

        // Convert to decimal ID for 4-byte cards
        if (uidLength == 4) {
          lastCardData.cardId = ((uint32_t)uid[0] << 24) |
                                ((uint32_t)uid[1] << 16) |
                                ((uint32_t)uid[2] << 8) |
                                uid[3];
          Serial.print("[NFC] Card ID (decimal): ");
          Serial.println(lastCardData.cardId);
        } else {
          lastCardData.cardId = 0;
        }

        Serial.println("[NFC] ---");

        // Call callback if registered
        if (cardCallback != nullptr) {
          cardCallback(lastCardData);
        }

      } else {
        Serial.println("[NFC] ✗ Read failed");
        lastCardData.isValid = false;
      }

      // Debounce - wait before listening again
      vTaskDelay(pdMS_TO_TICKS(NFC_DEBOUNCE_DELAY));
      
      // Start listening for next card
      Serial.println("[NFC] Ready for next card...");
      nfc.startPassiveTargetIDDetection(PN532_MIFARE_ISO14443A);
    }
    
    // Short delay to prevent task hogging CPU
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}

// Public API implementation

bool initNFC() {
  if (nfcRunning) {
    Serial.println("[NFC] Already running");
    return false;
  }

  Serial.println("\n=== NFC Initialization ===");
  Serial.println("PN532 NFC Reader with IRQ");

  // Initialize I2C with custom pins
  Wire.begin(NFC_I2C_SDA, NFC_I2C_SCL);

  // Create NFC task on Core 0 (default core for peripherals)
  BaseType_t result = xTaskCreatePinnedToCore(
    nfcTask,           // Task function
    "NFC_Reader",      // Task name
    4096,              // Stack size (bytes)
    NULL,              // Parameters
    3,                 // Priority (lower than SPI, higher than TaskScheduler)
    &nfcTaskHandle,    // Task handle
    0                  // Core 0
  );

  if (result != pdPASS) {
    Serial.println("[NFC] Failed to create task");
    return false;
  }

  Serial.println("[NFC] Task created on Core 0");
  return true;
}

void setNFCCardCallback(NFCCardCallback callback) {
  cardCallback = callback;
}

NFCCardData getLastCardData() {
  return lastCardData;
}

bool isNFCRunning() {
  return nfcRunning;
}

void stopNFC() {
  if (nfcTaskHandle != nullptr) {
    nfcRunning = false;
    vTaskDelete(nfcTaskHandle);
    nfcTaskHandle = nullptr;
    Serial.println("[NFC] Task stopped");
  }
}