// spi_test.cpp - Simple SPI test implementation
#include "spi_test.hpp"
#include "slave_spi.hpp"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include <cstring>

static const char *TAG = "SPI_TEST";

esp_err_t spi_send_test_packet(uint16_t test_num, uint32_t size)
{
    // Create test data with pattern
    uint8_t *test_data = new uint8_t[size];

    // Fill with repeating pattern: 0x00, 0x01, 0x02...0xFF, 0x00, 0x01...
    for (uint32_t i = 0; i < size; i++) {
        test_data[i] = i % 256;
    }

    ESP_LOGI(TAG, "Sending test packet %d (%lu bytes)", test_num, size);

    // Send via SPI
    esp_err_t ret = slave_spi_queue_frame(test_num, test_data, size);

    delete[] test_data;

    if (ret == ESP_OK) {
        ESP_LOGI(TAG, "Test packet %d queued successfully", test_num);
    } else {
        ESP_LOGE(TAG, "Failed to queue test packet %d", test_num);
    }

    return ret;
}

void spi_test_slave_send()
{
    ESP_LOGI(TAG, "Starting SPI slave test...");
    ESP_LOGI(TAG, "Sending 1KB test packets every 2 seconds");

    uint16_t packet_num = 0;

    while (true) {
        // Send 1KB test packet
        spi_send_test_packet(packet_num++, 1024);

        // Wait 2 seconds
        vTaskDelay(pdMS_TO_TICKS(2000));

        // Print stats every 10 packets
        if (packet_num % 10 == 0) {
            ESP_LOGI(TAG, "");
            ESP_LOGI(TAG, "=== SPI Test Stats ===");
            ESP_LOGI(TAG, "Packets sent:    %lu", slave_spi_get_frames_sent());
            ESP_LOGI(TAG, "Packets failed:  %lu", slave_spi_get_frames_failed());
            ESP_LOGI(TAG, "Packets dropped: %lu", slave_spi_get_frames_dropped());
            ESP_LOGI(TAG, "Free heap:       %lu bytes", esp_get_free_heap_size());
            ESP_LOGI(TAG, "");
        }
    }
}
