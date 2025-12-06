// SPIMaster.h - SPI Master for TaskScheduler (non-blocking)
#ifndef MASTER_SPI_H
#define MASTER_SPI_H

#include <Arduino.h>
#include <SPI.h>

// SPI pins
#define SPI_SCK  25
#define SPI_MISO 26
#define SPI_MOSI 27
#define SPI_CS   14

#define SPI_SPEED 20000000  // 20 MHz

// Memory optimization: Reduced max frame size to prevent fragmentation
// Typical JPEG frames are 30-60KB, so 60KB limit should be sufficient
#define SPI_MAX_FRAME_SIZE 60000  // 60KB max per frame

// Transfer states
enum SPITransferState {
    SPI_IDLE,
    SPI_RECEIVING_HEADER,
    SPI_RECEIVING_DATA,
    SPI_COMPLETE,
    SPI_ERROR
};

// Frame header (12 bytes)
typedef struct __attribute__((packed)) {
    uint8_t  magic[2];      // 0x55, 0xAA
    uint16_t frame_id;      // Big-endian
    uint32_t frame_size;    // Big-endian, JPEG bytes
    uint32_t timestamp;     // Big-endian, millis()
} FrameHeader;

class SPIMaster {
public:
    SPIMaster();

    // Initialize SPI
    bool begin();

    // Start dedicated SPI task on Core 1 (recommended for high FPS)
    bool startTask();

    // Stop SPI task
    void stopTask();

    // Non-blocking update (call from TaskScheduler task OR automatic in task mode)
    void update();

    // Get current state
    SPITransferState getState() { return _state; }
    
    // Check if frame ready
    bool isFrameReady() { return _state == SPI_COMPLETE; }
    
    // Get frame data (returns pointer to internal buffer)
    uint8_t* getFrameData() { return _frameBuffer; }
    uint32_t getFrameSize() { return _frameSize; }
    uint16_t getFrameId() { return _frameId; }

    // Acknowledge frame received (frees for next)
    void ackFrame();

    // Statistics
    uint32_t getFramesReceived() { return _framesReceived; }
    uint32_t getFramesDropped() { return _framesDropped; }
    
private:
    SPIClass _spi;
    SPITransferState _state;

    // Frame data - dynamic allocation (static would overflow DRAM)
    uint8_t* _frameBuffer;
    uint32_t _frameSize;
    uint16_t _frameId;
    uint32_t _frameTimestamp;

    // Transfer management
    uint32_t _bytesReceived;
    uint32_t _chunkSize;

    // Statistics
    uint32_t _framesReceived;
    uint32_t _framesDropped;
    unsigned long _lastTransferTime;

    // Task management
    TaskHandle_t _taskHandle;
    static void _spiTaskWrapper(void* pvParameters);
    void _spiTask();

    // Helper functions
    bool _receiveHeader();
    void _receiveDataChunk();
    uint16_t _parseBE16(uint8_t* data);
    uint32_t _parseBE32(uint8_t* data);
    void _selectSlave();
    void _deselectSlave();
};

#endif // MASTER_SPI_H