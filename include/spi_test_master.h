// spi_test_master.h - Simple SPI master test header
#ifndef SPI_TEST_MASTER_H
#define SPI_TEST_MASTER_H

#include <cstdint>

/**
 * Verify received data matches expected test pattern
 * Pattern: 0x00, 0x01, 0x02...0xFF, 0x00, 0x01...
 */
void spi_test_verify_pattern(uint8_t* data, uint32_t size);

/**
 * Process and verify SPI test frame (call this in your loop)
 */
void spi_test_process_frame();

#endif // SPI_TEST_MASTER_H
