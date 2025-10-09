// slave_spi.cpp - SPI Slave with dedicated FreeRTOS task on Core 1
#include "slave_spi.hpp"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include <cstring>
#include <cstdlib>

static const char *TAG = "SPI_SLAVE";

// Statistics
static uint32_t frames_sent = 0;
static uint32_t frames_failed = 0;
static uint32_t frames_dropped = 0;

// FreeRTOS queue and task
#define FRAME_QUEUE_SIZE 5  // Increased to buffer more frames
static QueueHandle_t frame_queue = nullptr;
static TaskHandle_t spi_task_handle = nullptr;

// DMA-capable buffers (must be word-aligned)
#define DMA_BUFFER_SIZE 4096
WORD_ALIGNED_ATTR static uint8_t spi_tx_buf[DMA_BUFFER_SIZE];
WORD_ALIGNED_ATTR static uint8_t spi_rx_buf[DMA_BUFFER_SIZE];

// Helper: Convert uint16 to big-endian
static void write_be16(uint8_t* buf, uint16_t val)
{
    buf[0] = (val >> 8) & 0xFF;
    buf[1] = val & 0xFF;
}

// Helper: Convert uint32 to big-endian
static void write_be32(uint8_t* buf, uint32_t val)
{
    buf[0] = (val >> 24) & 0xFF;
    buf[1] = (val >> 16) & 0xFF;
    buf[2] = (val >> 8) & 0xFF;
    buf[3] = val & 0xFF;
}

// Helper: Build frame header
static void build_frame_header(frame_header_t* header, uint16_t frame_id, uint32_t frame_size)
{
    header->magic[0] = 0x55;
    header->magic[1] = 0xAA;
    write_be16(reinterpret_cast<uint8_t*>(&header->frame_id), frame_id);
    write_be32(reinterpret_cast<uint8_t*>(&header->frame_size), frame_size);
    write_be32(reinterpret_cast<uint8_t*>(&header->timestamp), xTaskGetTickCount() * portTICK_PERIOD_MS);
}

// Helper: Send data via SPI (blocking)
static esp_err_t spi_send_data(const uint8_t* data, size_t len)
{
    spi_slave_transaction_t trans;
    size_t offset = 0;

    while (offset < len) {
        size_t chunk_size = (len - offset > DMA_BUFFER_SIZE) ? DMA_BUFFER_SIZE : (len - offset);

        // Copy data to DMA buffer
        std::memcpy(spi_tx_buf, data + offset, chunk_size);

        // Prepare transaction
        std::memset(&trans, 0, sizeof(trans));
        trans.length = chunk_size * 8;  // Length in bits
        trans.tx_buffer = spi_tx_buf;
        trans.rx_buffer = spi_rx_buf;

        // Execute transaction (blocks until master reads)
        esp_err_t ret = spi_slave_transmit(SPI2_HOST, &trans, portMAX_DELAY);
        if (ret != ESP_OK) {
            ESP_LOGE(TAG, "SPI transmit failed: %s", esp_err_to_name(ret));
            return ret;
        }

        offset += chunk_size;
    }

    return ESP_OK;
}

// Helper: Send frame via SPI
static esp_err_t send_frame_internal(uint16_t frame_id, const uint8_t* jpeg_data, uint32_t jpeg_size)
{
    //ESP_LOGI(TAG, "Sending frame %d (%lu bytes)...", frame_id, jpeg_size);
    uint32_t start_time = xTaskGetTickCount();

    // Build header
    frame_header_t header;
    build_frame_header(&header, frame_id, jpeg_size);

    // Send header
    esp_err_t ret = spi_send_data(reinterpret_cast<uint8_t*>(&header), sizeof(frame_header_t));
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to send header");
        return ret;
    }

    // Send JPEG data
    ret = spi_send_data(jpeg_data, jpeg_size);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to send JPEG data");
        return ret;
    }

    uint32_t duration = (xTaskGetTickCount() - start_time) * portTICK_PERIOD_MS;
   // ESP_LOGI(TAG, "Frame %d sent in %lu ms", frame_id, duration);

    return ESP_OK;
}

// SPI task running on Core 1
static void spi_task(void* arg)
{
    ESP_LOGI(TAG, "SPI task started on Core %d", xPortGetCoreID());

    frame_queue_item_t frame_item;

    while (true) {
        // Wait for frame in queue
        if (xQueueReceive(frame_queue, &frame_item, portMAX_DELAY) == pdTRUE) {

            //ESP_LOGD(TAG, "Processing frame %d (%lu bytes)", frame_item.frame_id, frame_item.jpeg_size);

            // Send frame via SPI
            esp_err_t ret = send_frame_internal(frame_item.frame_id, frame_item.jpeg_data, frame_item.jpeg_size);

            if (ret == ESP_OK) {
                frames_sent++;
                //ESP_LOGI(TAG, "Frame %d sent successfully", frame_item.frame_id);
            } else {
                frames_failed++;
                ESP_LOGE(TAG, "Frame %d failed to send", frame_item.frame_id);
            }

            // Free allocated JPEG buffer
            free(frame_item.jpeg_data);
        }
    }
}

esp_err_t slave_spi_init()
{
    ESP_LOGI(TAG, "Initializing SPI slave...");

    // SPI bus configuration
    spi_bus_config_t buscfg = {
        .mosi_io_num = GPIO_MOSI,
        .miso_io_num = GPIO_MISO,
        .sclk_io_num = GPIO_SCLK,
        .quadwp_io_num = -1,
        .quadhd_io_num = -1,
        .max_transfer_sz = DMA_BUFFER_SIZE,
    };

    // SPI slave interface configuration
    spi_slave_interface_config_t slvcfg = {
        .spics_io_num = GPIO_CS,
        .flags = 0,
        .queue_size = 3,
        .mode = 0,                    // SPI_MODE0
    };

    // Initialize SPI slave interface
    esp_err_t ret = spi_slave_initialize(SPI2_HOST, &buscfg, &slvcfg, SPI_DMA_CH_AUTO);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to initialize SPI slave: %s", esp_err_to_name(ret));
        return ret;
    }

    ESP_LOGI(TAG, "SPI slave initialized on pins: MOSI=%d, MISO=%d, SCLK=%d, CS=%d",
             GPIO_MOSI, GPIO_MISO, GPIO_SCLK, GPIO_CS);

    // Create frame queue
    frame_queue = xQueueCreate(FRAME_QUEUE_SIZE, sizeof(frame_queue_item_t));
    if (frame_queue == nullptr) {
        ESP_LOGE(TAG, "Failed to create frame queue");
        return ESP_ERR_NO_MEM;
    }

    // Create SPI task on Core 1
    BaseType_t task_ret = xTaskCreatePinnedToCore(
        spi_task,
        "spi_task",
        4096,           // Stack size
        nullptr,
        5,              // Priority (higher than camera task)
        &spi_task_handle,
        1               // Core 1 so we do not interfere with camera and AI
    );

    if (task_ret != pdPASS) {
        ESP_LOGE(TAG, "Failed to create SPI task");
        vQueueDelete(frame_queue);
        return ESP_FAIL;
    }

    ESP_LOGI(TAG, "SPI task created on Core 1");

    return ESP_OK;
}

esp_err_t slave_spi_queue_frame(uint16_t frame_id, const uint8_t* jpeg_data, uint32_t jpeg_size)
{
    if (jpeg_data == nullptr || jpeg_size == 0) {
        ESP_LOGE(TAG, "Invalid JPEG data");
        return ESP_ERR_INVALID_ARG;
    }

    if (frame_queue == nullptr) {
        ESP_LOGE(TAG, "SPI not initialized");
        return ESP_ERR_INVALID_STATE;
    }

    // Allocate buffer and copy JPEG data
    uint8_t* jpeg_copy = static_cast<uint8_t*>(malloc(jpeg_size));
    if (jpeg_copy == nullptr) {
        ESP_LOGE(TAG, "Failed to allocate JPEG buffer");
        frames_dropped++;
        return ESP_ERR_NO_MEM;
    }

    std::memcpy(jpeg_copy, jpeg_data, jpeg_size);

    // Create queue item
    frame_queue_item_t frame_item = {
        .frame_id = frame_id,
        .jpeg_data = jpeg_copy,
        .jpeg_size = jpeg_size
    };

    // Try to queue (non-blocking)
    if (xQueueSend(frame_queue, &frame_item, 0) != pdTRUE) {
        ESP_LOGW(TAG, "Frame queue full, dropping frame %d", frame_id);
        free(jpeg_copy);
        frames_dropped++;
        return ESP_ERR_NO_MEM;
    }

    ESP_LOGD(TAG, "Frame %d queued for sending", frame_id);
    return ESP_OK;
}

void slave_spi_stop()
{
    if (spi_task_handle != nullptr) {
        vTaskDelete(spi_task_handle);
        spi_task_handle = nullptr;
    }

    if (frame_queue != nullptr) {
        // Clear queue
        frame_queue_item_t frame_item;
        while (xQueueReceive(frame_queue, &frame_item, 0) == pdTRUE) {
            free(frame_item.jpeg_data);
        }
        vQueueDelete(frame_queue);
        frame_queue = nullptr;
    }

    ESP_LOGI(TAG, "SPI stopped");
}

uint32_t slave_spi_get_frames_sent()
{
    return frames_sent;
}

uint32_t slave_spi_get_frames_failed()
{
    return frames_failed;
}

uint32_t slave_spi_get_frames_dropped()
{
    return frames_dropped;
}
