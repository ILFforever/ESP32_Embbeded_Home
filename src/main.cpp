#include <Arduino.h>
#include <SPI.h>

#define RA8875_MOSI  11
#define RA8875_MISO  14
#define RA8875_SCK   10
#define RA8875_CS    13
#define RA8875_RESET 12

void testMISOConnection() {
  Serial.println("\n=== MISO Connection Test ===\n");
  
  // Test 1: Check if MISO pin can be read
  Serial.println("Test 1: MISO pin read capability");
  pinMode(RA8875_MISO, INPUT);
  delay(10);
  int misoState = digitalRead(RA8875_MISO);
  Serial.printf("  MISO state (floating): %s\n", misoState ? "HIGH" : "LOW");
  
  // Test 2: Check with pullup
  pinMode(RA8875_MISO, INPUT_PULLUP);
  delay(10);
  misoState = digitalRead(RA8875_MISO);
  Serial.printf("  MISO state (pullup):   %s\n", misoState ? "HIGH" : "LOW");
  
  // Test 3: Physical loopback test (temporarily connect MOSI to MISO)
  Serial.println("\nTest 2: Loopback test (MOSI → MISO)");
  Serial.println("  ** Temporarily connect GPIO 11 to GPIO 14 with jumper wire **");
  Serial.println("  Press ENTER when ready...");
  while(!Serial.available()) delay(100);
  while(Serial.available()) Serial.read();
  
  SPI.begin(RA8875_SCK, RA8875_MISO, RA8875_MOSI, RA8875_CS);
  SPI.setFrequency(1000000);  // 1 MHz for testing
  
  pinMode(RA8875_CS, OUTPUT);
  digitalWrite(RA8875_CS, HIGH);
  
  bool loopbackOK = true;
  Serial.println("  Sending test pattern...");
  
  for (uint8_t testByte = 0; testByte < 255; testByte += 17) {
    digitalWrite(RA8875_CS, LOW);
    uint8_t received = SPI.transfer(testByte);
    digitalWrite(RA8875_CS, HIGH);
    delayMicroseconds(10);
    
    Serial.printf("    Sent: 0x%02X  Received: 0x%02X", testByte, received);
    
    if (received == testByte) {
      Serial.println(" ✓");
    } else {
      Serial.println(" ✗ MISMATCH!");
      loopbackOK = false;
    }
  }
  
  if (loopbackOK) {
    Serial.println("\n  ✓ Loopback test PASSED - MISO connection is good!");
  } else {
    Serial.println("\n  ✗ Loopback test FAILED - MISO connection problem!");
  }
  
  Serial.println("\n  ** Remove jumper wire between GPIO 11 and GPIO 14 **");
  Serial.println("  Press ENTER to continue...");
  while(!Serial.available()) delay(100);
  while(Serial.available()) Serial.read();
}

void testRA8875MISO() {
  Serial.println("\n=== RA8875 MISO Test ===\n");
  
  SPI.begin(RA8875_SCK, RA8875_MISO, RA8875_MOSI, RA8875_CS);
  SPI.setFrequency(4000000);
  
  pinMode(RA8875_CS, OUTPUT);
  digitalWrite(RA8875_CS, HIGH);
  
  pinMode(RA8875_RESET, OUTPUT);
  digitalWrite(RA8875_RESET, LOW);
  delay(100);
  digitalWrite(RA8875_RESET, HIGH);
  delay(200);
  
  Serial.println("Test 1: Reading multiple times to verify consistency");
  
  for (int i = 0; i < 10; i++) {
    SPI.beginTransaction(SPISettings(4000000, MSBFIRST, SPI_MODE0));
    
    digitalWrite(RA8875_CS, LOW);
    SPI.transfer(0x80);  // Command write
    SPI.transfer(0x00);  // Register 0
    digitalWrite(RA8875_CS, HIGH);
    delayMicroseconds(50);
    
    digitalWrite(RA8875_CS, LOW);
    SPI.transfer(0x40);  // Data read
    uint8_t chipId = SPI.transfer(0x00);
    digitalWrite(RA8875_CS, HIGH);
    
    SPI.endTransaction();
    
    Serial.printf("  Read %d: 0x%02X", i+1, chipId);
    
    if (chipId == 0x75) {
      Serial.println(" ✓");
    } else if (chipId == 0xFF) {
      Serial.println(" ✗ (MISO not connected or floating high)");
    } else if (chipId == 0x00) {
      Serial.println(" ✗ (MISO shorted to ground)");
    } else {
      Serial.println(" ✗ (Unexpected value)");
    }
    
    delay(100);
  }
  
  Serial.println("\nTest 2: Reading different registers");
  
  uint8_t registers[] = {0x00, 0x01, 0x10, 0x88, 0x89};
  const char* names[] = {"Chip ID", "Power", "SYSR", "PLLC1", "PLLC2"};
  
  for (int i = 0; i < 5; i++) {
    SPI.beginTransaction(SPISettings(4000000, MSBFIRST, SPI_MODE0));
    
    digitalWrite(RA8875_CS, LOW);
    SPI.transfer(0x80);
    SPI.transfer(registers[i]);
    digitalWrite(RA8875_CS, HIGH);
    delayMicroseconds(50);
    
    digitalWrite(RA8875_CS, LOW);
    SPI.transfer(0x40);
    uint8_t value = SPI.transfer(0x00);
    digitalWrite(RA8875_CS, HIGH);
    
    SPI.endTransaction();
    
    Serial.printf("  Reg 0x%02X (%s): 0x%02X\n", registers[i], names[i], value);
    
    delay(100);
  }
  
  Serial.println("\n=========================\n");
}

void testWriteThenRead() {
  Serial.println("=== Write-Then-Read Test ===\n");
  Serial.println("This tests if MISO works after MOSI writes\n");
  
  SPI.begin(RA8875_SCK, RA8875_MISO, RA8875_MOSI, RA8875_CS);
  SPI.setFrequency(4000000);
  
  pinMode(RA8875_CS, OUTPUT);
  digitalWrite(RA8875_CS, HIGH);
  
  pinMode(RA8875_RESET, OUTPUT);
  digitalWrite(RA8875_RESET, LOW);
  delay(100);
  digitalWrite(RA8875_RESET, HIGH);
  delay(200);
  
  // Write to a register, then read it back
  uint8_t testReg = 0x88;  // PLLC1
  uint8_t testValue = 0x0A;
  
  Serial.printf("Step 1: Reading register 0x%02X (before write)\n", testReg);
  SPI.beginTransaction(SPISettings(4000000, MSBFIRST, SPI_MODE0));
  digitalWrite(RA8875_CS, LOW);
  SPI.transfer(0x80);
  SPI.transfer(testReg);
  digitalWrite(RA8875_CS, HIGH);
  delayMicroseconds(50);
  digitalWrite(RA8875_CS, LOW);
  SPI.transfer(0x40);
  uint8_t before = SPI.transfer(0x00);
  digitalWrite(RA8875_CS, HIGH);
  SPI.endTransaction();
  Serial.printf("  Value: 0x%02X\n\n", before);
  
  Serial.printf("Step 2: Writing 0x%02X to register 0x%02X\n", testValue, testReg);
  SPI.beginTransaction(SPISettings(4000000, MSBFIRST, SPI_MODE0));
  digitalWrite(RA8875_CS, LOW);
  SPI.transfer(0x80);
  SPI.transfer(testReg);
  digitalWrite(RA8875_CS, HIGH);
  delayMicroseconds(50);
  digitalWrite(RA8875_CS, LOW);
  SPI.transfer(0x00);
  SPI.transfer(testValue);
  digitalWrite(RA8875_CS, HIGH);
  SPI.endTransaction();
  Serial.println("  Write complete\n");
  
  delay(1);
  
  Serial.printf("Step 3: Reading register 0x%02X (after write)\n", testReg);
  SPI.beginTransaction(SPISettings(4000000, MSBFIRST, SPI_MODE0));
  digitalWrite(RA8875_CS, LOW);
  SPI.transfer(0x80);
  SPI.transfer(testReg);
  digitalWrite(RA8875_CS, HIGH);
  delayMicroseconds(50);
  digitalWrite(RA8875_CS, LOW);
  SPI.transfer(0x40);
  uint8_t after = SPI.transfer(0x00);
  digitalWrite(RA8875_CS, HIGH);
  SPI.endTransaction();
  Serial.printf("  Value: 0x%02X\n\n", after);
  
  if (after == testValue) {
    Serial.println("✓ SUCCESS! Write and read-back working!");
  } else {
    Serial.println("✗ FAIL! Read-back value doesn't match!");
    Serial.println("  Possible causes:");
    Serial.println("    - MISO connection issue");
    Serial.println("    - Timing issue");
    Serial.println("    - Register is read-only");
  }
  
  Serial.println("\n============================\n");
}

void setup() {
  Serial.begin(115200);
  delay(3000);
  
  Serial.println("\n╔════════════════════════════════════╗");
  Serial.println("║    MISO Connection Diagnostic     ║");
  Serial.println("╚════════════════════════════════════╝");
  
  // Test 1: Basic MISO pin test
  testMISOConnection();
  
  // Test 2: RA8875 MISO consistency
  testRA8875MISO();
  
  // Test 3: Write then read
  testWriteThenRead();
  
  Serial.println("╔════════════════════════════════════╗");
  Serial.println("║       All Tests Complete!         ║");
  Serial.println("╚════════════════════════════════════╝\n");
  
  Serial.println("Analysis:");
  Serial.println("  - If loopback test passed: MISO pin works");
  Serial.println("  - If RA8875 reads 0x75: MISO connection good");
  Serial.println("  - If write-then-read passed: Full SPI working");
  Serial.println();
}

void loop() {
  // Empty
}