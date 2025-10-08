// SPIMaster.h - SPI Master for image transfer pipeline
#ifndef SPI_MASTER_H
#define SPI_MASTER_H

#include <Arduino.h>
#include <SPI.h>

// SPI Hardware pins
#define SPI_SCK  18
#define SPI_MISO 19
#define SPI_MOSI 23
#define SPI_CS   5

// SPI Commands
#define SPI_CMD_HANDSHAKE    0x01
#define SPI_CMD_REQUEST_SIZE 0x02
#define SPI_CMD_REQUEST_DATA 0x03
#define SPI_CMD_TRANSFER_END 0x04

// SPI speeds
#define SPI_SPEED_HANDSHAKE 1000000   // 1 MHz for handshake
#define SPI_SPEED_TRANSFER  10000000  // 10 MHz for data transfer

class SPIMaster {
public:
    SPIMaster();
    
    // Initialize SPI master
    bool begin();
    
    // Perform handshake with slave
    bool performHandshake(uint8_t maxAttempts = 5);
    
    // Check if handshake is complete
    bool isReady() { return _handshakeComplete; }
    
    // Request image size from slave
    uint32_t requestImageSize();
    
    // Request image data from slave
    bool requestImageData(uint8_t* buffer, uint32_t size);

private:
    SPIClass _spi;
    bool _initialized;
    bool _handshakeComplete;
    
    // Internal transfer with CS control
    void _transfer(uint8_t* txBuf, uint8_t* rxBuf, size_t len, uint32_t speed);
    
    // CS pin control
    void _selectSlave();
    void _deselectSlave();
};

#endif // SPI_MASTER_H