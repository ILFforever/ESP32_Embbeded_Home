// app_main.cpp for XIAO ESP32-S3 Sense
#include "frame_cap_pipeline.hpp"
#include "who_recognition_app_term.hpp"
#include "xiao_recognition_button.hpp"
#include "xiao_standby_control.hpp"
#include "who_spiflash_fatfs.hpp"
#include "xiao_recognition_app.hpp"
#include "http_server.h"

using namespace who::frame_cap;
using namespace who::app;
using namespace who::button;
using namespace who::standby;

// ============================================================
// Function Declarations
// ============================================================
void serial_command_task(void *pvParameters);
void example_enrollment_workflow(void *pvParameters);
void example_standby_workflow(void *pvParameters);
void example_power_saving_loop(void *pvParameters);

// ============================================================
// Global Variables
// ============================================================

static XiaoRecognitionButton *g_button_handler = nullptr;
static XiaoStandbyControl *g_standby_control = nullptr;

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
    auto recognition_app = new who::app::XiaoRecognitionAppTerm(frame_cap);

    // Create standby control for power management
    g_standby_control = new XiaoStandbyControl(
        recognition_app->get_recognition(),
        frame_cap);

    // Create button handler with ALL components
    auto recognition_task = recognition_app->get_recognition()->get_recognition_task();
    auto detect_task = recognition_app->get_recognition()->get_detect_task();
    g_button_handler = new XiaoRecognitionButton(
        recognition_task,
        detect_task,
        g_standby_control);

    init_wifi_and_server();
    set_http_server_refs(g_standby_control, recognition_app->get_recognition());
    ESP_LOGI("Main", "HTTP server started. Access at http://<your-ip>/");

    // Optional: Enable serial command interface
    // xTaskCreate(serial_command_task, "serial_cmd", 3072, NULL, 5, NULL);

    // Optional: Enable example workflows
    // xTaskCreate(example_enrollment_workflow, "enrollment", 4096, NULL, 5, NULL);
    // xTaskCreate(example_standby_workflow, "standby_test", 4096, NULL, 5, NULL);
    // xTaskCreate(example_power_saving_loop, "power_save", 4096, NULL, 5, NULL);

    // Start recognition app (blocks here)
    recognition_app->run();

    // Mark recognition system as running (for standby control)
    recognition_app->get_recognition()->mark_running();
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

void serial_command_task(void *pvParameters)
{
    char buffer[64];
    int len = 0;

    ESP_LOGI("SerialCmd", "Serial command interface started");
    ESP_LOGI("SerialCmd", "Commands:");
    ESP_LOGI("SerialCmd", "  R - Recognize next face");
    ESP_LOGI("SerialCmd", "  E - Enroll next face");
    ESP_LOGI("SerialCmd", "  D - Delete last enrolled face");
    ESP_LOGI("SerialCmd", "  P - Pause detection");
    ESP_LOGI("SerialCmd", "  S - Resume (Start) detection");
    ESP_LOGI("SerialCmd", "  Z - Enter standby mode (sleep)");
    ESP_LOGI("SerialCmd", "  W - Wake from standby");
    ESP_LOGI("SerialCmd", "  ? - Show this help");

    while (true)
    {
        int c = getchar();
        if (c != EOF)
        {
            char ch = (char)c;

            if (ch == '\n' || ch == '\r')
            {
                buffer[len] = '\0';
                if (len > 0)
                {
                    switch (buffer[0])
                    {
                    case 'r':
                    case 'R':
                        recognize_face();
                        break;
                    case 'e':
                    case 'E':
                        enroll_new_face();
                        break;
                    case 'd':
                    case 'D':
                        delete_last_face();
                        break;
                    case 'p':
                    case 'P':
                        pause_face_detection();
                        break;
                    case 's':
                    case 'S':
                        resume_face_detection();
                        break;
                    case 'z':
                    case 'Z':
                        enter_standby_mode();
                        break;
                    case 'w':
                    case 'W':
                        exit_standby_mode();
                        break;
                    case '?':
                        ESP_LOGI("SerialCmd", "Commands:");
                        ESP_LOGI("SerialCmd", "  R - Recognize");
                        ESP_LOGI("SerialCmd", "  E - Enroll");
                        ESP_LOGI("SerialCmd", "  D - Delete");
                        ESP_LOGI("SerialCmd", "  P - Pause");
                        ESP_LOGI("SerialCmd", "  S - Start");
                        ESP_LOGI("SerialCmd", "  Z - Enter standby (sleep)");
                        ESP_LOGI("SerialCmd", "  W - Wake from standby");
                        ESP_LOGI("SerialCmd", "  ? - Show help");
                        break;
                    default:
                        ESP_LOGW("SerialCmd", "Unknown command: %c", buffer[0]);
                        ESP_LOGI("SerialCmd", "Type ? for help");
                        break;
                    }
                }
                len = 0;
            }
            else if (len < sizeof(buffer) - 1)
            {
                buffer[len++] = ch;
            }
        }
        vTaskDelay(pdMS_TO_TICKS(10));
    }
}