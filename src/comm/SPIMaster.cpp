// SPIMaster.cpp - SPI Master implementation for TaskScheduler
#include "SPIMaster.h"
#include "esp_heap_caps.h"

SPIMaster::SPIMaster()
    : _spi(HSPI),
      _state(SPI_IDLE),
      _frameBuffer(nullptr),
      _bufferCapacity(0),
      _frameSize(0),
      _lastFrameSize(0),
      _frameId(0),
      _frameTimestamp(0),
      _bytesReceived(0),
      _chunkSize(4096), // Match slave DMA buffer size
      _framesReceived(0),
      _framesDropped(0),
      _lastTransferTime(0),
      _taskHandle(nullptr)
{
}

bool SPIMaster::begin()
{
    Serial.println("[SPI] Initializing Master...");

    // Configure CS pin
    pinMode(SPI_CS, OUTPUT);
    digitalWrite(SPI_CS, HIGH);

    // Initialize SPI bus
    _spi.begin(SPI_SCK, SPI_MISO, SPI_MOSI, SPI_CS);

    // Reserve the largest reusable buffer that still fits in contiguous DRAM.
    // Anything we get here is kept for the lifetime of the program, which is
    // what keeps the heap from fragmenting during streaming.
    uint32_t largest = heap_caps_get_largest_free_block(MALLOC_CAP_8BIT | MALLOC_CAP_INTERNAL);
    Serial.printf("[SPI] Free heap: %u, largest 8-bit block: %u\n", ESP.getFreeHeap(), largest);

    // Leave a little slack so we do not consume the very last usable block.
    uint32_t target = (largest > 8192) ? (largest - 8192) : 0;
    if (target > SPI_MAX_FRAME_SIZE)
    {
        target = SPI_MAX_FRAME_SIZE;
    }

    if (target >= SPI_MIN_FRAME_SIZE && _ensureCapacity(target))
    {
        Serial.printf("[SPI] Reusable frame buffer reserved (%u bytes)\n", _bufferCapacity);
    }
    else
    {
        Serial.printf("[SPI] ! Could not reserve a frame buffer (wanted %u bytes)\n", target);
        Serial.println("[SPI]   Falling back to per-frame allocation - expect dropped frames");
    }

    Serial.println("[SPI] Master initialized");
    return true;
}

// Make sure _frameBuffer can hold `size` bytes. Grows on demand (never shrinks)
// so the steady state is a single long-lived allocation.
bool SPIMaster::_ensureCapacity(uint32_t size)
{
    if (size == 0 || size > SPI_MAX_FRAME_SIZE)
    {
        return false;
    }

    if (_frameBuffer != nullptr && _bufferCapacity >= size)
    {
        return true;
    }

    // Release the old (too small) buffer first so its memory can be reused;
    // remember its size so we can restore it if the bigger request fails.
    uint32_t previousCapacity = _bufferCapacity;
    if (_frameBuffer != nullptr)
    {
        free(_frameBuffer);
        _frameBuffer = nullptr;
        _bufferCapacity = 0;
    }

    uint8_t *buffer = (uint8_t *)heap_caps_malloc(size, MALLOC_CAP_8BIT | MALLOC_CAP_INTERNAL);
    if (buffer == nullptr)
    {
        buffer = (uint8_t *)malloc(size);
    }

    if (buffer == nullptr)
    {
        // Restore the previous buffer so the steady state does not degrade into
        // a malloc/free cycle on every oversized frame.
        if (previousCapacity > 0)
        {
            _frameBuffer = (uint8_t *)heap_caps_malloc(previousCapacity, MALLOC_CAP_8BIT | MALLOC_CAP_INTERNAL);
            if (_frameBuffer != nullptr)
            {
                _bufferCapacity = previousCapacity;
            }
        }
        return false;
    }

    _frameBuffer = buffer;
    _bufferCapacity = size;
    return true;
}

void SPIMaster::update()
{
    switch (_state)
    {
    case SPI_IDLE:
        // Try to receive header
        if (_receiveHeader())
        {
            _state = SPI_RECEIVING_DATA;
            _bytesReceived = 0;

            // Immediately start receiving data in tight loop
            while (_state == SPI_RECEIVING_DATA)
            {
                _receiveDataChunk();

                if (_bytesReceived >= _frameSize)
                {
                    _state = SPI_COMPLETE;
                    _framesReceived++;
                    _lastFrameSize = _frameSize;
                    _lastTransferTime = millis();

                    // Serial.printf("[SPI] Frame %d complete (%u bytes)\n", _frameId, _frameSize);  // Disabled to reduce spam
                    break;
                }

                // Small yield to watchdog
                yield();
            }
        }
        break;

    case SPI_RECEIVING_DATA:
        // Should not get here anymore (handled in IDLE case)
        // But keep for safety
        _receiveDataChunk();

        if (_bytesReceived >= _frameSize)
        {
            _state = SPI_COMPLETE;
            _framesReceived++;
            _lastFrameSize = _frameSize;
            _lastTransferTime = millis();
        }
        break;

    case SPI_COMPLETE:
        // Waiting for ackFrame()
        break;

    case SPI_ERROR:
        // Reset to idle. Keep the reusable buffer allocated.
        _state = SPI_IDLE;
        _frameSize = 0;
        _bytesReceived = 0;
        break;
    }
}

bool SPIMaster::_receiveHeader()
{
    FrameHeader header;

    _spi.beginTransaction(SPISettings(SPI_SPEED, MSBFIRST, SPI_MODE0));
    _selectSlave();
    delayMicroseconds(10);

    // Read header byte-by-byte
    for (size_t i = 0; i < sizeof(FrameHeader); i++)
    {
        ((uint8_t *)&header)[i] = _spi.transfer(0x00);
    }

    delayMicroseconds(10);
    _deselectSlave();
    _spi.endTransaction();

    // Validate magic bytes
    if (header.magic[0] != 0x55 || header.magic[1] != 0xAA)
    {
        // No valid header, not an error, just no data yet
        return false;
    }

    // Parse header
    _frameId = _parseBE16((uint8_t *)&header.frame_id);
    _frameSize = _parseBE32((uint8_t *)&header.frame_size);
    _frameTimestamp = _parseBE32((uint8_t *)&header.timestamp);

    // Validate frame size against the protocol limit
    if (_frameSize == 0 || _frameSize > SPI_MAX_FRAME_SIZE)
    {
        Serial.printf("[SPI] ERROR: Invalid frame size: %u (max: %u)\n", _frameSize, SPI_MAX_FRAME_SIZE);
        _state = SPI_ERROR;
        return false;
    }

    // Reserved buffer is usually large enough; grow it only if a bigger frame
    // shows up (or if boot-time reservation failed entirely).
    if (!_ensureCapacity(_frameSize))
    {
        Serial.printf("[SPI] Alloc failed for %u bytes (largest block: %u) - dropping frame\n",
                      _frameSize, heap_caps_get_largest_free_block(MALLOC_CAP_8BIT | MALLOC_CAP_INTERNAL));
        _framesDropped++;
        _state = SPI_ERROR;
        return false;
    }

    // Give the slave time to queue the frame data before we start clocking it
    // out. Without this the master reads an idle MISO line and the "JPEG"
    // arrives as zeros/noise.
    delay(SPI_HEADER_TO_DATA_DELAY_MS);

    return true;
}

void SPIMaster::_receiveDataChunk()
{
    if (_frameBuffer == nullptr)
    {
        _state = SPI_ERROR;
        return;
    }

    uint32_t remaining = _frameSize - _bytesReceived;
    uint32_t transferSize = (remaining > _chunkSize) ? _chunkSize : remaining;

    _spi.beginTransaction(SPISettings(SPI_SPEED, MSBFIRST, SPI_MODE0));
    _selectSlave();
    delayMicroseconds(10);

    // Use writeBytes to send dummy data and read response
    // This is much faster than byte-by-byte transfer()
    uint8_t *rxBuf = &_frameBuffer[_bytesReceived];
    memset(rxBuf, 0, transferSize);                 // Initialize with zeros
    _spi.transferBytes(rxBuf, rxBuf, transferSize); // In-place transfer

    delayMicroseconds(10);
    _deselectSlave();
    _spi.endTransaction();

    _bytesReceived += transferSize;

    // Small delay between chunks
    delayMicroseconds(100);

    // Progress indicator every 5KB
    if (_bytesReceived % 5120 == 0)
    {
        Serial.print(".");
    }
}

void SPIMaster::ackFrame()
{
    if (_state == SPI_COMPLETE)
    {
        // Keep the reusable buffer allocated and reset metadata for the next frame.
        _frameSize = 0;
        _bytesReceived = 0;
        _state = SPI_IDLE;
    }
}

uint16_t SPIMaster::_parseBE16(uint8_t *data)
{
    return (data[0] << 8) | data[1];
}

uint32_t SPIMaster::_parseBE32(uint8_t *data)
{
    return (data[0] << 24) | (data[1] << 16) | (data[2] << 8) | data[3];
}

void SPIMaster::_selectSlave()
{
    digitalWrite(SPI_CS, LOW);
}

void SPIMaster::_deselectSlave()
{
    digitalWrite(SPI_CS, HIGH);
}

// Start dedicated SPI task on Core 1
bool SPIMaster::startTask()
{
    if (_taskHandle != nullptr)
    {
        Serial.println("[SPI] Task already running");
        return false;
    }

    BaseType_t result = xTaskCreatePinnedToCore(
        _spiTaskWrapper, // Task function
        "spi_master",    // Task name
        4096,            // Stack size - measured high water use is ~750 bytes
                         // (uxTaskGetStackHighWaterMark reported 7468 free of
                         // 8192 under load), so 4096 keeps >3KB of headroom
        this,            // Task parameter (this pointer)
        5,               // Priority (high priority for real-time SPI)
        &_taskHandle,    // Task handle
        1                // Core 1
    );

    if (result != pdPASS)
    {
        Serial.println("[SPI] Failed to create task");
        return false;
    }

    Serial.println("[SPI] Task started on Core 1");
    return true;
}

// Stop SPI task
void SPIMaster::stopTask()
{
    if (_taskHandle != nullptr)
    {
        vTaskDelete(_taskHandle);
        _taskHandle = nullptr;
        Serial.println("[SPI] Task stopped");
    }
}

// Static wrapper for FreeRTOS task
void SPIMaster::_spiTaskWrapper(void *pvParameters)
{
    SPIMaster *instance = static_cast<SPIMaster *>(pvParameters);
    instance->_spiTask();
}

// SPI task loop running on Core 1
void SPIMaster::_spiTask()
{
    Serial.println("[SPI] Task loop started on Core 1");

    while (true)
    {
        // Continuously call update() which now reads full frames in tight loop
        update();

        // Small delay only when idle to prevent CPU hogging
        if (_state == SPI_IDLE || _state == SPI_COMPLETE)
        {
            vTaskDelay(pdMS_TO_TICKS(1)); // 1ms delay when idle
        }

        // Yield to watchdog
        yield();
    }
}
