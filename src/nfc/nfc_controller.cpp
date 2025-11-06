// NFC Controller - Based on Adafruit readMifare.pde example
// Simple blocking approach - proven stable on ESP32
// Uses readPassiveTargetID() in RTOS task for non-blocking main loop

#include "nfc_controller.h"
#include <Wire.h>
#include <Adafruit_PN532.h>

// PN532 instance with IRQ and RESET pins
static Adafruit_PN532 nfc(NFC_PN532_IRQ, NFC_PN532_RESET);

// Task variables
static TaskHandle_t nfcTaskHandle = nullptr;
static NFCCardCallback cardCallback = nullptr;
static NFCCardData lastCardData = {0};
static bool nfcRunning = false;

// Debounce tracking
static unsigned long timeLastCardRead = 0;

// Statistics
static uint32_t successfulReads = 0;
static uint32_t failedReads = 0;

// Internal NFC reading task
static void nfcTask(void *parameter) {
  Serial.println("\n[NFC] Task started on Core 0");

  // Small delay to let system stabilize
  vTaskDelay(pdMS_TO_TICKS(500));

  // Initialize I2C with custom pins
  Wire.begin(NFC_I2C_SDA, NFC_I2C_SCL);
  Serial.printf("[NFC] I2C initialized: SDA=GPIO%d, SCL=GPIO%d\n", NFC_I2C_SDA, NFC_I2C_SCL);

  // Initialize PN532
  nfc.begin();

  // Configure SAM (Secure Access Module) for low power mode
  // Mode 0x01: Normal mode, timeout = 0xFF (no timeout), IRQ enabled
  nfc.SAMConfig();

  // Check for PN532 board
  uint32_t versiondata = nfc.getFirmwareVersion();
  if (!versiondata) {
    Serial.println("[NFC] ERROR: Didn't find PN532 board");
    Serial.println("[NFC] Check wiring and I2C mode (DIP switches)");
    vTaskDelete(NULL);
    return;
  }

  // Found chip - print info (Adafruit format)
  Serial.print("[NFC] Found chip PN5");
  Serial.println((versiondata >> 24) & 0xFF, HEX);
  Serial.print("[NFC] Firmware ver. ");
  Serial.print((versiondata >> 16) & 0xFF, DEC);
  Serial.print('.');
  Serial.println((versiondata >> 8) & 0xFF, DEC);

  nfcRunning = true;
  Serial.println("[NFC] Waiting for ISO14443A card...\n");

  // Main loop - blocking read with debounce
  while (1) {
    uint8_t success;
    uint8_t uid[7] = {0, 0, 0, 0, 0, 0, 0};
    uint8_t uidLength;

    // Wait for an ISO14443A type card (Mifare, etc.)
    // Use short timeout to avoid constant RF field (reduces heat)
    success = nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &uidLength, 100);  // 100ms timeout

    if (success) {
      // Check debounce - prevent duplicate reads
      unsigned long now = millis();
      if (now - timeLastCardRead < NFC_DEBOUNCE_DELAY) {
        Serial.println("[NFC] Debounce - ignoring duplicate read");
        vTaskDelay(pdMS_TO_TICKS(100));
        continue;
      }

      successfulReads++;
      timeLastCardRead = now;

      // Display card info
      Serial.println("\n[NFC] ========== CARD DETECTED ==========");
      Serial.print("[NFC] UID Length: ");
      Serial.print(uidLength, DEC);
      Serial.println(" bytes");
      Serial.print("[NFC] UID Value: ");
      nfc.PrintHex(uid, uidLength);

      // Store card data
      lastCardData.uidLength = uidLength;
      memcpy(lastCardData.uid, uid, uidLength);
      lastCardData.isValid = true;

      // Convert to decimal for 4-byte cards (Mifare Classic)
      if (uidLength == 4) {
        uint32_t cardid = uid[0];
        cardid <<= 8;
        cardid |= uid[1];
        cardid <<= 8;
        cardid |= uid[2];
        cardid <<= 8;
        cardid |= uid[3];

        lastCardData.cardId = cardid;
        Serial.print("[NFC] Mifare Classic card #");
        Serial.println(cardid);
      } else {
        lastCardData.cardId = 0;
        Serial.println("[NFC] 7-byte UID (Mifare Ultralight or other)");
      }

      Serial.printf("[NFC] Stats: %lu successful, %lu failed\n", successfulReads, failedReads);
      Serial.println("[NFC] ====================================\n");

      // Call user callback
      if (cardCallback != nullptr) {
        cardCallback(lastCardData);
      }

      // Brief delay before next read
      vTaskDelay(pdMS_TO_TICKS(500));  // Wait before next scan
    } else {
      // No card found - use delay to reduce heat while maintaining responsiveness
      // The RF field automatically turns off after timeout, so we just need to wait longer
      failedReads++;
      vTaskDelay(pdMS_TO_TICKS(300));  // 300ms delay = 100ms on / 400ms total = ~25% duty cycle
    }
  }
}

// Public API implementation

bool initNFC() {
  if (nfcRunning) {
    Serial.println("[NFC] Already running");
    return false;
  }

  Serial.println("\n=== NFC Initialization ===");
  Serial.println("PN532 NFC Reader - I2C Mode");
  Serial.printf("SDA=GPIO%d, SCL=GPIO%d, IRQ=GPIO%d, RST=GPIO%d\n",
                NFC_I2C_SDA, NFC_I2C_SCL, NFC_PN532_IRQ, NFC_PN532_RESET);
  Serial.println("IMPORTANT: Add 2kΩ pull-up resistors (SDA→3.3V, SCL→3.3V) per Adafruit spec");

  // Create NFC task on Core 0 (keeps main loop free)
  BaseType_t result = xTaskCreatePinnedToCore(
    nfcTask,
    "NFC_Reader",
    4096,           // Stack size
    NULL,
    3,              // Priority
    &nfcTaskHandle,
    0               // Core 0
  );

  if (result != pdPASS) {
    Serial.println("[NFC] Failed to create task");
    return false;
  }

  Serial.println("[NFC] Task created successfully");
  return true;
}

void setNFCCardCallback(NFCCardCallback callback) {
  cardCallback = callback;
  Serial.println("[NFC] Callback registered");
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
