#pragma once

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/uart.h"
#include <cJSON.h>
#include <functional>

namespace who {
namespace uart {

/**
 * UART Communication Module for Master/Slave JSON protocol
 *
 * Features:
 * - JSON-based command/response protocol
 * - Ping/pong heartbeat monitoring
 * - Command handler callbacks
 * - Status reporting
 */
class UartComm {
public:
    // Command handler callback type
    using CommandHandler = std::function<void(const char* cmd, cJSON* params)>;

    /**
     * Initialize UART communication
     * @param tx_pin TX GPIO pin (default: 43/D6 on XIAO)
     * @param rx_pin RX GPIO pin (default: 44/D7 on XIAO)
     * @param baud_rate Baud rate (default: 115200)
     */
    UartComm(int tx_pin = 6, int rx_pin = 5, int baud_rate = 115200);
    ~UartComm();

    /**
     * Start UART tasks (RX handler and ping monitor)
     * @return true if started successfully
     */
    bool start();

    /**
     * Stop UART tasks
     */
    void stop();

    /**
     * Register a command handler
     * @param command Command name (e.g., "start_stream")
     * @param handler Callback function
     */
    void register_command(const char* command, CommandHandler handler);

    /**
     * Send status message to master
     * @param status Status string (e.g., "ok", "error")
     * @param message Optional message
     */
    void send_status(const char* status, const char* message = nullptr);

    /**
     * Send status message with free heap information
     * @param status Status string (e.g., "ok", "error")
     * @param message Optional message
     */
    void send_status_with_heap(const char* status, const char* message = nullptr);

    /**
     * Send custom JSON message
     * @param json_str JSON string to send
     */
    void send_json(const char* json_str);

    /**
     * Send pong response to ping
     * @param seq Sequence number from ping
     */
    void send_pong(uint32_t seq);

    /**
     * Check if connection is alive (recent ping received)
     * @return true if connected
     */
    bool is_connected() const;

    /**
     * Get time since last ping (in milliseconds)
     */
    uint32_t get_time_since_ping() const;

private:
    // UART configuration
    uart_port_t m_uart_num;
    int m_tx_pin;
    int m_rx_pin;
    int m_baud_rate;

    // Task handles
    TaskHandle_t m_rx_task_handle;
    TaskHandle_t m_ping_monitor_task_handle;

    // Command handlers
    static const int MAX_HANDLERS = 16;
    struct {
        const char* command;
        CommandHandler handler;
    } m_handlers[MAX_HANDLERS];
    int m_handler_count;

    // Ping monitoring
    TickType_t m_last_ping_time;
    static const TickType_t PING_TIMEOUT_MS = 5000;

    // Internal methods
    void uart_init();
    void handle_message(cJSON* json);
    void handle_ping(uint32_t seq);

    // Task functions (must be static for FreeRTOS)
    static void uart_rx_task_wrapper(void* arg);
    static void ping_monitor_task_wrapper(void* arg);
    void uart_rx_task();
    void ping_monitor_task();
};

} // namespace uart
} // namespace who
