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

// Max frame size, which is also the size of the buffer reserved at boot.
// Measured frames from this camera run ~6KB (5811 bytes observed), so 32KB is
// a >5x headroom for a complex scene while returning ~28KB of contiguous DRAM
// versus the old 60KB. If frames ever exceed this they are rejected and
// counted - watch "dropped" in the [MEM] report before lowering it further.
#define SPI_MAX_FRAME_SIZE 32768

// Gap between reading a frame header and clocking out the first data chunk.
// The slave needs this long to queue the JPEG into its SPI transaction; clock
// it too early and the master reads an idle MISO line (zeros/noise) instead of
// JPEG data. This matches the timing of the previous per-frame-malloc code,
// which spent ~7ms here (free + delay(5) + malloc + delay(2)). Lower it to
// trade latency for FPS only if frames still decode cleanly.
#define SPI_HEADER_TO_DATA_DELAY_MS 7

// Smallest buffer worth keeping. If we cannot reserve at least this much
// contiguous DRAM at boot we fall back to per-frame allocation instead of
// failing init (DRAM is tight once the sprites are allocated).
#define SPI_MIN_FRAME_SIZE 24000

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
    uint32_t getBufferCapacity() { return _bufferCapacity; }
    bool hasReservedBuffer() { return _frameBuffer != nullptr; }

    // Size of the most recently completed frame. Unlike getFrameSize() this is
    // NOT cleared by ackFrame(), so it stays valid after the frame has been
    // displayed. The buffer is reused, so this only describes intact data while
    // no new frame is arriving - stop the camera before relying on it.
    uint32_t getLastFrameSize() { return _lastFrameSize; }

private:
    SPIClass _spi;
    SPITransferState _state;

    // Frame data - allocated once at startup to avoid per-frame heap fragmentation
    uint8_t* _frameBuffer;
    uint32_t _bufferCapacity;
    uint32_t _frameSize;
    uint32_t _lastFrameSize;
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
    bool _ensureCapacity(uint32_t size);
    bool _receiveHeader();
    void _receiveDataChunk();
    uint16_t _parseBE16(uint8_t* data);
    uint32_t _parseBE32(uint8_t* data);
    void _selectSlave();
    void _deselectSlave();
};

#endif // MASTER_SPI_H
