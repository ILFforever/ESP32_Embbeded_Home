// app_main.cpp for XIAO ESP32-S3 Sense
#include "app/frame_cap_pipeline.hpp"
#include "who_recognition_app_term.hpp"
#include "control/xiao_recognition_button.hpp"
#include "control/xiao_standby_control.hpp"
#include "who_spiflash_fatfs.hpp"
#include "app/xiao_recognition_app.hpp"
#include "network/http_server.h"
#include "uart/uart_comm.hpp"
#include <cstdio>
#include "spi/slave_spi.hpp"
#include <idf_additions.h>

using namespace who::frame_cap;
using namespace who::app;
using namespace who::button;
using namespace who::standby;

static const char *TAG = "Main";

// ============================================================
// Function Declarations
// ============================================================
void example_enrollment_workflow(void *pvParameters);
void example_standby_workflow(void *pvParameters);
void example_power_saving_loop(void *pvParameters);
void create_uart_commands();
void exit_standby_mode();
void enter_standby_mode();
void start_camera_task(void *pvParameters);
static void stats_task(void *pvParameters);
// ============================================================
// Global Variables
// ============================================================

static XiaoRecognitionButton *g_button_handler = nullptr;
static XiaoStandbyControl *g_standby_control = nullptr;
who::uart::UartComm *g_uart = nullptr;
static who::app::XiaoRecognitionAppTerm *g_recognition_app = nullptr;
static bool g_camera_running = false;

// ============================================================
// Main Entry Point
// ============================================================

extern "C" void app_main(void)
{
    vTaskPrioritySet(xTaskGetCurrentTaskHandle(), 5);

    // Mount storage for face database
#if CONFIG_DB_FATFS_FLASH
    ESP_ERROR_CHECK(fatfs_flash_mount());
#elif CONFIG_DB_SPIFFS
    ESP_ERROR_CHECK(bsp_spiffs_mount());
#elif CONFIG_DB_FATFS_SDCARD
    ESP_ERROR_CHECK(bsp_sdcard_mount());
#endif

    // Get camera pipeline for ESP32-S3
    auto frame_cap = get_term_dvp_frame_cap_pipeline();

    // Create terminal-based recognition app (no LCD)
    g_recognition_app = new who::app::XiaoRecognitionAppTerm(frame_cap);

    // Create standby control for power management
    g_standby_control = new XiaoStandbyControl(
        g_recognition_app->get_recognition(),
        frame_cap);

    // Create button handler with ALL components
    auto recognition_task = g_recognition_app->get_recognition()->get_recognition_task();
    auto detect_task = g_recognition_app->get_recognition()->get_detect_task();
    g_button_handler = new XiaoRecognitionButton(
        recognition_task,
        detect_task,
        g_standby_control);

    g_uart = new who::uart::UartComm();
    if (!g_uart->start())
    { // Start UART tasks
        ESP_LOGE("Main", "Failed to start UART");
    }
    create_uart_commands();
    ESP_LOGI("Main", "System ready. Camera is OFF. Send UART command to start.");

    // Initialize SPI slave (creates task on Core 1)
    esp_err_t ret = slave_spi_init();
    if (ret != ESP_OK)
    {
        ESP_LOGE(TAG, "SPI init failed");
        return;
    }

    // Create statistics task on Core 0 (low priority, won't interfere)
    xTaskCreatePinnedToCore(
        stats_task,
        "stats",
        2048,
        nullptr,
        1, // Low priority
        nullptr,
        0 // Core 0
    );
}

// Task to run recognition app (blocks forever)
void start_camera_task(void *pvParameters)
{
    g_recognition_app->run();
    vTaskDelete(NULL); // Never reached
}

void create_uart_commands()
{

    // Camera Start/Stop UART Commands ect...
    g_uart->register_command("camera_control", [](const char *cmd, cJSON *params)
                             {
        if (!params) {
            g_uart->send_status("error", "Missing parameters");
            return;
        }

        cJSON* name = cJSON_GetObjectItem(params, "name");
        if (!name || !cJSON_IsString(name)) {
            g_uart->send_status("error", "Missing or invalid 'name' parameter");
            return;
        }

        const char* action_str = name->valuestring;

        if (strcmp(action_str, "camera_start") == 0) {
            if (g_camera_running) {
                g_uart->send_status("error", "Camera already running");
                return;
            }
            // Start camera in separate task
            xTaskCreate(start_camera_task, "camera_task", 4096, NULL, 5, NULL);
            g_camera_running = true;
            g_uart->send_status("ok", "Camera started");
        } else if (strcmp(action_str, "camera_stop") == 0) {
            if (!g_camera_running) {
                g_uart->send_status("error", "Camera not running");
                return;
            }
            // Stop camera
            enter_standby_mode();
            g_camera_running = false;
            g_uart->send_status("ok", "Camera stopped");
        } else {
            g_uart->send_status("error", "Unknown camera action");
        } });

    // get status command
    g_uart->register_command("get_status", [](const char *cmd, cJSON *params)
                             {
        const char *msg = g_camera_running ? "1" : "0";
        g_uart->send_status_with_heap("ok", msg); });
}

// ============================================================
// API Function Implementations
// ============================================================

void enroll_new_face()
{
    if (g_button_handler)
    {
        g_button_handler->trigger_enroll();
    }
}

void recognize_face()
{
    if (g_button_handler)
    {
        g_button_handler->trigger_recognize();
    }
}

void delete_last_face()
{
    if (g_button_handler)
    {
        g_button_handler->trigger_delete();
    }
}

void pause_face_detection()
{
    if (g_button_handler)
    {
        g_button_handler->pause_detection();
    }
}

void resume_face_detection()
{
    if (g_button_handler)
    {
        g_button_handler->resume_detection();
    }
}

void enter_standby_mode()
{
    if (g_button_handler)
    {
        g_button_handler->enter_standby();
    }
}

void exit_standby_mode()
{
    if (g_button_handler)
    {
        g_button_handler->exit_standby();
    }
}

bool is_in_standby()
{
    if (g_button_handler)
    {
        return g_button_handler->is_standby();
    }
    return false;
}

static void stats_task(void *pvParameters)
{
    ESP_LOGI(TAG, "Statistics task started on Core %d", xPortGetCoreID());
    
    while (true) {
        vTaskDelay(pdMS_TO_TICKS(5000));
        
        ESP_LOGI(TAG, "");
        ESP_LOGI(TAG, "=== Statistics ===");
        ESP_LOGI(TAG, "SPI Frames sent:    %lu", slave_spi_get_frames_sent());
        ESP_LOGI(TAG, "SPI Frames failed:  %lu", slave_spi_get_frames_failed());
        ESP_LOGI(TAG, "SPI Frames dropped: %lu", slave_spi_get_frames_dropped());
        ESP_LOGI(TAG, "Free heap:          %lu bytes", esp_get_free_heap_size());
        ESP_LOGI(TAG, "Min free heap:      %lu bytes", esp_get_minimum_free_heap_size());
        ESP_LOGI(TAG, "");
    }
}

// ============================================================
// Example Workflows
// ============================================================

void example_enrollment_workflow(void *pvParameters)
{
    vTaskDelay(pdMS_TO_TICKS(3000));

    ESP_LOGI("Example", "=== Enrollment Workflow ===");

    ESP_LOGI("Example", "Enrolling first person...");
    enroll_new_face();
    vTaskDelay(pdMS_TO_TICKS(3000));

    ESP_LOGI("Example", "Enrolling second person...");
    enroll_new_face();
    vTaskDelay(pdMS_TO_TICKS(3000));

    ESP_LOGI("Example", "Starting continuous recognition...");
    while (true)
    {
        recognize_face();
        vTaskDelay(pdMS_TO_TICKS(2000));
    }
}

void example_detection_control(void *pvParameters)
{
    vTaskDelay(pdMS_TO_TICKS(5000));

    ESP_LOGI("Example", "=== Detection Control Example ===");

    ESP_LOGI("Example", "Pausing detection for 5 seconds...");
    pause_face_detection();
    vTaskDelay(pdMS_TO_TICKS(5000));

    ESP_LOGI("Example", "Resuming detection...");
    resume_face_detection();

    vTaskDelay(pdMS_TO_TICKS(1000));
    recognize_face();

    vTaskDelete(NULL);
}

void example_enrollment_session(void *pvParameters)
{
    vTaskDelay(pdMS_TO_TICKS(3000));

    ESP_LOGI("Example", "=== Enrollment Session ===");
    ESP_LOGI("Example", "Enrolling 5 faces, 5 seconds apart...");

    for (int i = 1; i <= 5; i++)
    {
        ESP_LOGI("Example", "Enrolling person %d...", i);
        enroll_new_face();
        vTaskDelay(pdMS_TO_TICKS(5000));
    }

    ESP_LOGI("Example", "Enrollment complete!");
    ESP_LOGI("Example", "Deleting last enrollment...");
    delete_last_face();
    ESP_LOGI("Example", "Final count: 4 faces enrolled");

    vTaskDelete(NULL);
}

void example_standby_workflow(void *pvParameters)
{
    vTaskDelay(pdMS_TO_TICKS(5000));

    ESP_LOGI("Example", "=== Standby Workflow ===");

    ESP_LOGI("Example", "Enrolling face while active...");
    enroll_new_face();
    vTaskDelay(pdMS_TO_TICKS(3000));

    ESP_LOGI("Example", "Testing recognition...");
    recognize_face();
    vTaskDelay(pdMS_TO_TICKS(3000));

    ESP_LOGI("Example", "Entering standby for 10 seconds...");
    enter_standby_mode();
    vTaskDelay(pdMS_TO_TICKS(10000));

    ESP_LOGI("Example", "Waking up from standby...");
    exit_standby_mode();
    vTaskDelay(pdMS_TO_TICKS(2000));

    ESP_LOGI("Example", "Recognition after wake-up...");
    recognize_face();

    ESP_LOGI("Example", "Workflow complete!");
    vTaskDelete(NULL);
}

void example_power_saving_loop(void *pvParameters)
{
    vTaskDelay(pdMS_TO_TICKS(3000));

    ESP_LOGI("Example", "=== Power Saving Loop ===");
    ESP_LOGI("Example", "Active for 5s, Standby for 30s, repeat...");

    while (true)
    {
        ESP_LOGI("Example", "ACTIVE: Performing recognitions...");
        exit_standby_mode();

        for (int i = 0; i < 3; i++)
        {
            recognize_face();
            vTaskDelay(pdMS_TO_TICKS(1500));
        }

        ESP_LOGI("Example", "STANDBY: Sleeping for 30 seconds...");
        enter_standby_mode();
        vTaskDelay(pdMS_TO_TICKS(30000));
    }
}