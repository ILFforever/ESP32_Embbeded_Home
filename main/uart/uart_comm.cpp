#include "uart_comm.hpp"
#include "driver/uart.h"
#include "driver/gpio.h"
#include "esp_log.h"
#include <string.h>

static const char *TAG = "UartComm";

#define BUF_SIZE 1024

namespace who {
namespace uart {

UartComm::UartComm(int tx_pin, int rx_pin, int baud_rate)
    : m_uart_num(UART_NUM_1),
      m_tx_pin(tx_pin),
      m_rx_pin(rx_pin),
      m_baud_rate(baud_rate),
      m_rx_task_handle(nullptr),
      m_ping_monitor_task_handle(nullptr),
      m_handler_count(0),
      m_last_ping_time(0)
{
    uart_init();
}

UartComm::~UartComm()
{
    stop();
    uart_driver_delete(m_uart_num);
}

void UartComm::uart_init()
{
    const uart_config_t uart_config = {
        .baud_rate = m_baud_rate,
        .data_bits = UART_DATA_8_BITS,
        .parity = UART_PARITY_DISABLE,
        .stop_bits = UART_STOP_BITS_1,
        .flow_ctrl = UART_HW_FLOWCTRL_DISABLE,
        .source_clk = UART_SCLK_DEFAULT,
    };

    ESP_ERROR_CHECK(uart_param_config(m_uart_num, &uart_config));
    ESP_ERROR_CHECK(uart_set_pin(m_uart_num, m_tx_pin, m_rx_pin,
                                  UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE));
    ESP_ERROR_CHECK(uart_driver_install(m_uart_num, BUF_SIZE * 2,
                                        BUF_SIZE * 2, 0, NULL, 0));

    ESP_LOGI(TAG, "UART initialized: TX=GPIO%d, RX=GPIO%d, Baud=%d",
             m_tx_pin, m_rx_pin, m_baud_rate);
}

bool UartComm::start()
{
    if (m_rx_task_handle || m_ping_monitor_task_handle) {
        ESP_LOGW(TAG, "UART tasks already started");
        return false;
    }

    // Start RX task
    if (xTaskCreate(uart_rx_task_wrapper, "uart_rx", 8192, this, 10, &m_rx_task_handle) != pdPASS) {
        ESP_LOGE(TAG, "Failed to create RX task");
        return false;
    }

    // Start ping monitor task
    if (xTaskCreate(ping_monitor_task_wrapper, "ping_monitor", 4096, this, 5, &m_ping_monitor_task_handle) != pdPASS) {
        ESP_LOGE(TAG, "Failed to create ping monitor task");
        vTaskDelete(m_rx_task_handle);
        m_rx_task_handle = nullptr;
        return false;
    }

    m_last_ping_time = xTaskGetTickCount();

    ESP_LOGI(TAG, "UART tasks started");
    send_status("ready", "UART communication initialized");
    return true;
}

void UartComm::stop()
{
    if (m_rx_task_handle) {
        vTaskDelete(m_rx_task_handle);
        m_rx_task_handle = nullptr;
    }

    if (m_ping_monitor_task_handle) {
        vTaskDelete(m_ping_monitor_task_handle);
        m_ping_monitor_task_handle = nullptr;
    }

    ESP_LOGI(TAG, "UART tasks stopped");
}

void UartComm::register_command(const char* command, CommandHandler handler)
{
    if (m_handler_count >= MAX_HANDLERS) {
        ESP_LOGE(TAG, "Maximum command handlers reached (%d)", MAX_HANDLERS);
        return;
    }

    m_handlers[m_handler_count].command = command;
    m_handlers[m_handler_count].handler = handler;
    m_handler_count++;

    ESP_LOGI(TAG, "Registered command: %s", command);
}

void UartComm::send_json(const char* json_str)
{
    int len = strlen(json_str);
    uart_write_bytes(m_uart_num, json_str, len);
    uart_write_bytes(m_uart_num, "\n", 1);

    ESP_LOGD(TAG, "TX→Master: %s", json_str);
}

void UartComm::send_status(const char* status, const char* message)
{
    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "status", status);
    if (message) {
        cJSON_AddStringToObject(root, "msg", message);
    }
    cJSON_AddNumberToObject(root, "timestamp", xTaskGetTickCount());

    char *json_str = cJSON_PrintUnformatted(root);
    send_json(json_str);

    cJSON_Delete(root);
    free(json_str);
}

void UartComm::send_status_with_heap(const char* status, const char* message)
{
    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "status", status);
    if (message) {
        cJSON_AddStringToObject(root, "msg", message);
    }
    cJSON_AddNumberToObject(root, "free_heap", esp_get_free_heap_size());

    char *json_str = cJSON_PrintUnformatted(root);
    send_json(json_str);

    cJSON_Delete(root);
    free(json_str);
}

void UartComm::send_event(const char* event, const char* data)
{
    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "event", event);
    cJSON_AddRawToObject(root, "data", data);  // Add raw JSON data

    char *json_str = cJSON_PrintUnformatted(root);
    send_json(json_str);

    cJSON_Delete(root);
    free(json_str);
}

void UartComm::send_pong(uint32_t seq)
{
    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "type", "pong");
    cJSON_AddNumberToObject(root, "seq", seq);
    cJSON_AddStringToObject(root, "status", "ok");
    cJSON_AddNumberToObject(root, "uptime", xTaskGetTickCount() / 1000);

    char *json_str = cJSON_PrintUnformatted(root);
    send_json(json_str);

    cJSON_Delete(root);
    free(json_str);
}

bool UartComm::is_connected() const
{
    TickType_t now = xTaskGetTickCount();
    return (now - m_last_ping_time) < pdMS_TO_TICKS(PING_TIMEOUT_MS);
}

uint32_t UartComm::get_time_since_ping() const
{
    TickType_t now = xTaskGetTickCount();
    return (now - m_last_ping_time) * portTICK_PERIOD_MS;
}

void UartComm::handle_ping(uint32_t seq)
{
    send_pong(seq);
    m_last_ping_time = xTaskGetTickCount();
}

void UartComm::handle_message(cJSON* json)
{
    // Check for ping
    cJSON *type = cJSON_GetObjectItem(json, "type");
    if (type && cJSON_IsString(type) && strcmp(type->valuestring, "ping") == 0) {
        cJSON *seq = cJSON_GetObjectItem(json, "seq");
        if (seq && cJSON_IsNumber(seq)) {
            handle_ping(seq->valueint);
        }
        return;
    }

    // Check for command
    cJSON *cmd = cJSON_GetObjectItem(json, "cmd");
    if (cmd && cJSON_IsString(cmd)) {
        const char* command = cmd->valuestring;

        // Find and execute handler
        bool handled = false;
        for (int i = 0; i < m_handler_count; i++) {
            if (strcmp(m_handlers[i].command, command) == 0) {
                cJSON *params = cJSON_GetObjectItem(json, "params");
                m_handlers[i].handler(command, params);
                handled = true;
                break;
            }
        }

        if (!handled) {
            ESP_LOGW(TAG, "Unknown command: %s", command);
            send_status("error", "Unknown command");
        }
    }
}

void UartComm::uart_rx_task()
{
    uint8_t data[BUF_SIZE];
    char line_buffer[BUF_SIZE];
    int line_pos = 0;

    while (1) {
        int len = uart_read_bytes(m_uart_num, data, BUF_SIZE - 1,
                                  20 / portTICK_PERIOD_MS);

        if (len > 0) {
            // Process byte by byte to find newline-delimited messages
            for (int i = 0; i < len; i++) {
                if (data[i] == '\n' || data[i] == '\r') {
                    if (line_pos > 0) {
                        line_buffer[line_pos] = '\0';

                        ESP_LOGD(TAG, "RX←Master: %s", line_buffer);

                        // Parse JSON
                        cJSON *json = cJSON_Parse(line_buffer);
                        if (json) {
                            handle_message(json);
                            cJSON_Delete(json);
                        } else {
                            ESP_LOGW(TAG, "Invalid JSON: %s", line_buffer);
                        }

                        line_pos = 0;
                    }
                } else {
                    if (line_pos < BUF_SIZE - 1) {
                        line_buffer[line_pos++] = data[i];
                    }
                }
            }
        }
    }
}

void UartComm::ping_monitor_task()
{
    const TickType_t timeout = pdMS_TO_TICKS(PING_TIMEOUT_MS);

    vTaskDelay(pdMS_TO_TICKS(2000));  // Wait 2s after boot
    m_last_ping_time = xTaskGetTickCount();

    while (1) {
        vTaskDelay(pdMS_TO_TICKS(1000));  // Check every second

        TickType_t now = xTaskGetTickCount();
        if (now - m_last_ping_time > timeout) {
            ESP_LOGW(TAG, "No ping received for %d seconds - connection lost?",
                     PING_TIMEOUT_MS / 1000);
            m_last_ping_time = now;  // Reset to avoid spam
        }
    }
}

// Static wrapper functions for FreeRTOS tasks
void UartComm::uart_rx_task_wrapper(void* arg)
{
    UartComm* uart = static_cast<UartComm*>(arg);
    uart->uart_rx_task();
}

void UartComm::ping_monitor_task_wrapper(void* arg)
{
    UartComm* uart = static_cast<UartComm*>(arg);
    uart->ping_monitor_task();
}

} // namespace uart
} // namespace who
