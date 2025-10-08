// spi_test.hpp - Simple SPI test functions
#pragma once
#include <cstdint>
#include "esp_err.h"

/**
 * Run simple SPI slave test - sends small test messages repeatedly
 * Call this instead of starting camera to test SPI connection
 */
void spi_test_slave_send();

/**
 * Send a single test packet over SPI
 * @param test_num Test packet number
 * @param size Size of test data (default 1024 bytes)
 */
esp_err_t spi_send_test_packet(uint16_t test_num, uint32_t size = 1024);
