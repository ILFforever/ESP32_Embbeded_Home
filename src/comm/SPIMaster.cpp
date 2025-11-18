// SPIMaster.cpp - SPI Master implementation for TaskScheduler
#include "SPIMaster.h"

SPIMaster::SPIMaster()
    : _spi(HSPI),
      _state(SPI_IDLE),
      _frameBuffer(nullptr),
      _frameSize(0),
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

    // Pre-allocate frame buffer to prevent heap fragmentation
    _frameBuffer = new (std::nothrow) uint8_t[MAX_FRAME_SIZE];
    if (_frameBuffer == nullptr)
    {
        Serial.printf("[SPI] ✗ FATAL: Failed to allocate %u bytes for frame buffer (free: %u, largest: %u)\n",
                     MAX_FRAME_SIZE, ESP.getFreeHeap(), ESP.getMaxAllocHeap());
        return false;
    }
    Serial.printf("[SPI] ✓ Pre-allocated %u bytes for frame buffer (free heap: %u)\n",
                 MAX_FRAME_SIZE, ESP.getFreeHeap());

    Serial.println("[SPI] Master initialized");
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
            _lastTransferTime = millis();
        }
        break;

    case SPI_COMPLETE:
        // Waiting for ackFrame()
        break;

    case SPI_ERROR:
        // Reset to idle
        _state = SPI_IDLE;
        if (_frameBuffer != nullptr)
        {
            delete[] _frameBuffer;
            _frameBuffer = nullptr;
        }
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

    // Validate frame size (pre-allocated buffer is MAX_FRAME_SIZE)
    if (_frameSize == 0 || _frameSize > MAX_FRAME_SIZE)
    {
        Serial.printf("[SPI] ERROR: Invalid frame size: %u (max: %u)\n", _frameSize, MAX_FRAME_SIZE);
        _state = SPI_ERROR;
        return false;
    }

    // Reuse pre-allocated buffer (no delete/new = no fragmentation!)
    if (_frameBuffer == nullptr)
    {
        Serial.println("[SPI] ERROR: Frame buffer not allocated!");
        _state = SPI_ERROR;
        return false;
    }

    delay(2);

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
        // Free buffer
        if (_frameBuffer != nullptr)
        {
            delete[] _frameBuffer;
            _frameBuffer = nullptr;
        }

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
        8192,            // Stack size (larger for SPI operations)
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
