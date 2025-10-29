// slave_spi.hpp - SPI Slave for ESP-IDF (XIAO ESP32S3) with dedicated core
#ifndef SLAVE_SPI_HPP
#define SLAVE_SPI_HPP

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"
#include "driver/spi_slave.h"
#include "esp_log.h"
#include <cstdint>

// SPI pins (XIAO ESP32S3)
#define GPIO_MOSI 9   // D10
#define GPIO_MISO 8   // D9
#define GPIO_SCLK 7   // D8
#define GPIO_CS   2   // D1

// Frame header structure (12 bytes)
struct __attribute__((packed)) frame_header_t {
    uint8_t  magic[2];      // 0x55, 0xAA
    uint16_t frame_id;      // Big-endian
    uint32_t frame_size;    // Big-endian, JPEG bytes
    uint32_t timestamp;     // Big-endian, millis()
};

// Frame queue item
struct frame_queue_item_t {
    uint16_t frame_id;
    uint8_t* jpeg_data;
    uint32_t jpeg_size;
};

/**
 * Initialize SPI slave with background task on Core 1
 * @return ESP_OK on success
 */
esp_err_t slave_spi_init();

/**
 * Queue frame for sending (non-blocking)
 * @param frame_id Frame ID counter
 * @param jpeg_data Pointer to JPEG data (will be copied)
 * @param jpeg_size Size of JPEG data in bytes
 * @return ESP_OK on success, ESP_ERR_NO_MEM if queue full
 */
esp_err_t slave_spi_queue_frame(uint16_t frame_id, const uint8_t* jpeg_data, uint32_t jpeg_size);

/**
 * Get frames sent count
 * @return Number of frames successfully sent
 */
uint32_t slave_spi_get_frames_sent();

/**
 * Get frames failed count
 * @return Number of frames that failed to send
 */
uint32_t slave_spi_get_frames_failed();

/**
 * Get frames dropped count (queue full)
 * @return Number of frames dropped
 */
uint32_t slave_spi_get_frames_dropped();

/**
 * Stop SPI task
 */
void slave_spi_stop();

#endif // SLAVE_SPI_HPP
