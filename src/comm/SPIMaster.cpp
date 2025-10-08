// SPIMaster.cpp - SPI Master implementation for image pipeline
#include "SPIMaster.h"

SPIMaster::SPIMaster() : _spi(HSPI), _initialized(false), _handshakeComplete(false) {
}

bool SPIMaster::begin() {
    Serial.println("[SPI] Initializing SPI Master...");
    
    // Configure CS pin
    pinMode(SPI_CS, OUTPUT);
    digitalWrite(SPI_CS, HIGH);
    
    // Initialize SPI bus
    _spi.begin(SPI_SCK, SPI_MISO, SPI_MOSI, SPI_CS);
    
    _initialized = true;
    Serial.println("[SPI] Master initialized");
    return true;
}

bool SPIMaster::performHandshake(uint8_t maxAttempts) {
    if (!_initialized) {
        Serial.println("[SPI] ERROR: Not initialized");
        return false;
    }
    
    Serial.println("[SPI] Starting handshake...");
    
    uint8_t txBuf[4] = {0};
    uint8_t rxBuf[4] = {0};
    
    for (uint8_t attempt = 0; attempt < maxAttempts; attempt++) {
        Serial.print("[SPI] Attempt ");
        Serial.print(attempt + 1);
        Serial.print("/");
        Serial.println(maxAttempts);
        
        // Prepare handshake command
        txBuf[0] = SPI_CMD_HANDSHAKE;
        txBuf[1] = 0x00;
        txBuf[2] = 0x00;
        txBuf[3] = 0x00;
        
        // Send handshake
        _transfer(txBuf, rxBuf, 4, SPI_SPEED_HANDSHAKE);
        
        // Check response - slave should echo back handshake command
        Serial.print("[SPI]   RX: 0x");
        Serial.print(rxBuf[0], HEX);
        Serial.print(" 0x");
        Serial.print(rxBuf[1], HEX);
        Serial.print(" 0x");
        Serial.print(rxBuf[2], HEX);
        Serial.print(" 0x");
        Serial.println(rxBuf[3], HEX);
        
        if (rxBuf[0] == SPI_CMD_HANDSHAKE) {
            Serial.println("[SPI] ✓ Handshake SUCCESS");
            _handshakeComplete = true;
            return true;
        } else {
            Serial.println("[SPI] ✗ Invalid handshake response");
        }
        
        delay(500);
    }
    
    Serial.println("[SPI] ✗ Handshake FAILED");
    return false;
}

uint32_t SPIMaster::requestImageSize() {
    if (!_handshakeComplete) {
        Serial.println("[SPI] ERROR: Handshake not complete");
        return 0;
    }
    
    Serial.println("[SPI] Requesting image size...");
    
    uint8_t txBuf[8] = {0};
    uint8_t rxBuf[8] = {0};
    
    txBuf[0] = SPI_CMD_REQUEST_SIZE;
    
    _transfer(txBuf, rxBuf, 8, SPI_SPEED_TRANSFER);
    
    // Response format: [CMD][size_byte0][size_byte1][size_byte2][size_byte3]
    // Size in little-endian format
    uint32_t size = rxBuf[1] | (rxBuf[2] << 8) | (rxBuf[3] << 16) | (rxBuf[4] << 24);
    
    Serial.print("[SPI] Image size: ");
    Serial.print(size);
    Serial.println(" bytes");
    
    return size;
}

bool SPIMaster::requestImageData(uint8_t* buffer, uint32_t size) {
    if (!_handshakeComplete) {
        Serial.println("[SPI] ERROR: Handshake not complete");
        return false;
    }
    
    if (size == 0 || buffer == nullptr) {
        Serial.println("[SPI] ERROR: Invalid buffer or size");
        return false;
    }
    
    Serial.print("[SPI] Requesting ");
    Serial.print(size);
    Serial.println(" bytes of image data...");
    
    // Send request command
    uint8_t cmdBuf[4] = {SPI_CMD_REQUEST_DATA, 0, 0, 0};
    uint8_t dummyRx[4] = {0};
    _transfer(cmdBuf, dummyRx, 4, SPI_SPEED_TRANSFER);
    
    // Small delay for slave to prepare data
    delayMicroseconds(100);
    
    // Receive image data in chunks
    const uint32_t chunkSize = 1024;
    uint32_t bytesReceived = 0;
    uint8_t dummyTx[chunkSize];
    memset(dummyTx, 0, chunkSize);
    
    while (bytesReceived < size) {
        uint32_t remaining = size - bytesReceived;
        uint32_t transferSize = (remaining > chunkSize) ? chunkSize : remaining;
        
        _transfer(dummyTx, buffer + bytesReceived, transferSize, SPI_SPEED_TRANSFER);
        bytesReceived += transferSize;
        
        if (bytesReceived % 10240 == 0) {
            Serial.print(".");
        }
    }
    
    Serial.println();
    Serial.print("[SPI] Received ");
    Serial.print(bytesReceived);
    Serial.println(" bytes");
    
    // Send transfer end acknowledgment
    cmdBuf[0] = SPI_CMD_TRANSFER_END;
    _transfer(cmdBuf, dummyRx, 4, SPI_SPEED_TRANSFER);
    
    return true;
}

void SPIMaster::_transfer(uint8_t* txBuf, uint8_t* rxBuf, size_t len, uint32_t speed) {
    _spi.beginTransaction(SPISettings(speed, MSBFIRST, SPI_MODE0));
    _selectSlave();
    delayMicroseconds(10);
    
    for (size_t i = 0; i < len; i++) {
        rxBuf[i] = _spi.transfer(txBuf[i]);
    }
    
    delayMicroseconds(10);
    _deselectSlave();
    _spi.endTransaction();
}

void SPIMaster::_selectSlave() {
    digitalWrite(SPI_CS, LOW);
}

void SPIMaster::_deselectSlave() {
    digitalWrite(SPI_CS, HIGH);
}