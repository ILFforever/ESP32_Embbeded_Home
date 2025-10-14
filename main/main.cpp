// app_main.cpp for XIAO ESP32-S3 Sense
#include "app/frame_cap_pipeline.hpp"
#include "who_recognition_app_term.hpp"
#include "control/xiao_recognition_button.hpp"
#include "control/xiao_standby_control.hpp"
#include "who_spiflash_fatfs.hpp"
#include "app/xiao_recognition_app.hpp"
#include "network/http_server.h"
#include "uart/uart_comm.hpp"
#include "recognition/face_db_reader.hpp"
#include <cstdio>
#include <sys/stat.h>
#include "spi/slave_spi.hpp"
#include "jpeg/JpegEncoder.hpp"
#include "esp_camera.h" // defines PIXFORMAT_JPEG and pixformat_t

using namespace who::frame_cap;
using namespace who::app;
using namespace who::button;
using namespace who::standby;
using namespace who::recognition;

static const char *TAG = "Main";

// ============================================================
// Function Declarations
// ============================================================
void create_uart_commands();
void exit_standby_mode();
void enter_standby_mode();
void start_camera_task(void *pvParameters);
// static void stats_task(void *pvParameters);
static void spi_frame_sender_task(void *pvParameters);

// ============================================================
// Global Variables
// ============================================================
static XiaoRecognitionButton *g_button_handler = nullptr;
static XiaoStandbyControl *g_standby_control = nullptr;
who::uart::UartComm *g_uart = nullptr;
static who::app::XiaoRecognitionAppTerm *g_recognition_app = nullptr;
static who::frame_cap::WhoFrameCap *g_frame_cap = nullptr;
static FaceDbReader *g_face_db_reader = nullptr;
static bool g_camera_running = false;
static TaskHandle_t g_spi_sender_task_handle = nullptr;
static uint16_t g_frame_id = 0;

// ============================================================
// Main Entry Point
// ============================================================
extern "C" void app_main(void)
{
    vTaskPrioritySet(xTaskGetCurrentTaskHandle(), 5);

    // Mount storage for face database
#if CONFIG_DB_FATFS_FLASH
    ESP_ERROR_CHECK(fatfs_flash_mount());
    g_face_db_reader = new FaceDbReader("/spiflash/face.db");
#elif CONFIG_DB_SPIFFS
    ESP_ERROR_CHECK(bsp_spiffs_mount());
    g_face_db_reader = new FaceDbReader("/spiffs/face.db");
#elif CONFIG_DB_FATFS_SDCARD
    ESP_ERROR_CHECK(bsp_sdcard_mount());
    g_face_db_reader = new FaceDbReader("/sdcard/face.db");
#endif

    // Get camera pipeline for ESP32-S3
    g_frame_cap = get_term_dvp_frame_cap_pipeline();

    // Create terminal-based recognition app (no LCD)
    g_recognition_app = new who::app::XiaoRecognitionAppTerm(g_frame_cap);

    // Create standby control for power management
    g_standby_control = new XiaoStandbyControl(
        g_recognition_app->get_recognition(),
        g_frame_cap);

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

    // Connect UART to recognition app for sending detection events
    g_recognition_app->set_uart_comm(g_uart);

    create_uart_commands();

    // Send immediate status to master on startup
    vTaskDelay(pdMS_TO_TICKS(500)); // Small delay to ensure UART is ready
    g_uart->send_status("ready", "Camera system initialized. Ready for commands.");

    ESP_LOGI("Main", "System ready. Camera is OFF. Send UART command to start.");

    // Initialize SPI slave (creates task on Core 1)
    esp_err_t ret = slave_spi_init();
    if (ret != ESP_OK)
    {
        ESP_LOGE(TAG, "SPI init failed");
        return;
    }

    // // Create statistics task on Core 0 (low priority, won't interfere)
    // xTaskCreatePinnedToCore(
    //     stats_task,
    //     "stats",
    //     2048,
    //     nullptr,
    //     1, // Low priority
    //     nullptr,
    //     0 // Core 0
    // );
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

            // Start SPI frame sender task on Core 0
            xTaskCreatePinnedToCore(
                spi_frame_sender_task,
                "spi_sender",
                4096,
                NULL,
                4,  // Priority 4 (below camera/recognition tasks)
                &g_spi_sender_task_handle,
                0   // Core 0
            );

            g_camera_running = true;
            
            g_uart->send_status("ok", "Camera and SPI sender started");

        } else if (strcmp(action_str, "camera_stop") == 0) {
            if (!g_camera_running) {
                g_uart->send_status("error", "Camera not running");
                return;
            }

            // Stop SPI sender task first
            if (g_spi_sender_task_handle != nullptr) {
                vTaskDelete(g_spi_sender_task_handle);
                g_spi_sender_task_handle = nullptr;
            }

            // Stop camera
            enter_standby_mode();
            g_camera_running = false;
            g_uart->send_status("ok", "Camera and SPI sender stopped");

        } else {
            g_uart->send_status("error", "Unknown camera action");
        } });

    // get status command
    g_uart->register_command("get_status", [](const char *cmd, cJSON *params)
                             {
        const char *msg = g_camera_running ? "1" : "0";
        g_uart->send_status_with_heap("ok", msg); });

    // spi stats command
    g_uart->register_command("spi_stats", [](const char *cmd, cJSON *params)
                             {
        char stats_msg[200];
        snprintf(stats_msg, sizeof(stats_msg),
                 "Sent:%lu Failed:%lu Dropped:%lu Heap:%lu",
                 slave_spi_get_frames_sent(),
                 slave_spi_get_frames_failed(),
                 slave_spi_get_frames_dropped(),
                 esp_get_free_heap_size());
        g_uart->send_status("ok", stats_msg); });

    // test command
    g_uart->register_command("test", [](const char *cmd, cJSON *params)
                             { g_uart->send_status("ok", "UART test successful!"); });

    // ============================================================
    // Face Management Commands
    // ============================================================

    // Enroll face with optional name (auto-renames after enrollment if name provided)
    // Enroll face (native ESP-WHO - no name support)
    g_uart->register_command("enroll_face", [](const char *cmd, cJSON *params)
                             {
        if (g_button_handler) {
            g_button_handler->trigger_enroll();
            g_uart->send_status("ok", "Enrollment mode activated. Present face within 10 seconds.");
        } else {
            g_uart->send_status("error", "Button handler not available");
        } });

    // Delete last enrolled face (native ESP-WHO only supports delete_last)
    g_uart->register_command("delete_last", [](const char *cmd, cJSON *params)
                             {
        if (g_button_handler && g_face_db_reader) {
            // Delete the face from ESP-WHO database
            g_button_handler->trigger_delete();

            // Also delete the name mapping for the deleted face
            g_face_db_reader->delete_last_name();

            g_uart->send_status("ok", "Deleted last enrolled face and its name");
        } else {
            g_uart->send_status("error", "Button handler not available");
        } });

    // Force reset database (delete database file)
    g_uart->register_command("reset_database", [](const char *cmd, cJSON *params)
                             {
        ESP_LOGI(TAG, "=== Database Reset Started ===");

        // Delete database file directly
        int ret1 = remove("/spiflash/face.db");
        int ret2 = remove("/spiffs/face.db");
        ESP_LOGI(TAG, "Delete /spiflash/face.db: %s", ret1 == 0 ? "success" : "file not found");
        ESP_LOGI(TAG, "Delete /spiffs/face.db: %s", ret2 == 0 ? "success" : "file not found");

        // Check if storage directory exists and is writable
        struct stat st;
        if (stat("/spiflash", &st) == 0) {
            ESP_LOGI(TAG, "/spiflash directory exists and is mounted");
        } else {
            ESP_LOGW(TAG, "/spiflash directory NOT FOUND - this will cause problems!");
        }

        // **CRITICAL**: Clear all name mappings first
        if (g_face_db_reader) {
            ESP_LOGI(TAG, "Clearing all name mappings...");
            g_face_db_reader->clear_all_names();
        }

        // **CRITICAL**: Reinitialize the recognition system's recognizer
        // This creates a fresh HumanFaceRecognizer instance with clean state
        if (g_recognition_app) {
            ESP_LOGI(TAG, "Reinitializing recognition app recognizer...");
            g_recognition_app->reinitialize_recognizer();
        }

        // Also reinitialize the FaceDbReader for reading
        if (g_face_db_reader) {
            ESP_LOGI(TAG, "Resetting FaceDbReader...");
            g_face_db_reader->reinitialize();
        }

        ESP_LOGI(TAG, "=== Database Reset Complete ===");
        g_uart->send_status("ok", "Database and names reset complete. System ready for fresh enrollments."); });

    // Resume detection callback (workaround for detection stopping after enroll/recognize)
    g_uart->register_command("resume_detection", [](const char *cmd, cJSON *params)
                             {
        if (!g_recognition_app) {
            g_uart->send_status("error", "Recognition app not initialized");
            return;
        }

        g_recognition_app->restore_detection_callback();
        g_uart->send_status("ok", "Detection callback restored"); });

    // ============================================================
    // Face Database Reader Commands
    // ============================================================

    // Get face count from database
    g_uart->register_command("get_face_count", [](const char *cmd, cJSON *params)
                             {
        if (!g_face_db_reader) {
            g_uart->send_status("error", "Face database reader not initialized");
            return;
        }

        int face_count = g_face_db_reader->get_face_count();
        char msg[64];
        snprintf(msg, sizeof(msg), "Face count: %d", face_count);
        g_uart->send_status("ok", msg); });

    // Print all faces in database (detailed info to serial console)
    g_uart->register_command("print_faces", [](const char *cmd, cJSON *params)
                             {
        if (!g_face_db_reader) {
            g_uart->send_status("error", "Face database reader not initialized");
            return;
        }

        g_face_db_reader->print_all_faces();
        g_uart->send_status("ok", "Face list printed to console (see serial monitor)"); });

    // Check if database is valid and accessible
    g_uart->register_command("check_db", [](const char *cmd, cJSON *params)
                             {
        if (!g_face_db_reader) {
            g_uart->send_status("error", "Face database reader not initialized");
            return;
        }

        bool is_valid = g_face_db_reader->is_database_valid();
        const char *status = is_valid ? "valid" : "invalid";
        char msg[64];
        snprintf(msg, sizeof(msg), "Database status: %s", status);
        g_uart->send_status("ok", msg); });

    // ============================================================
    // Name Management Commands
    // ============================================================

    // Set name for a face ID
    g_uart->register_command("set_name", [](const char *cmd, cJSON *params)
                             {
        if (!g_face_db_reader) {
            g_uart->send_status("error", "Face database reader not initialized");
            return;
        }

        if (!params) {
            g_uart->send_status("error", "Missing parameters");
            return;
        }

        cJSON* id_obj = cJSON_GetObjectItem(params, "id");
        cJSON* name_obj = cJSON_GetObjectItem(params, "name");

        if (!cJSON_IsNumber(id_obj)) {
            g_uart->send_status("error", "Missing or invalid 'id' parameter");
            return;
        }

        int id = id_obj->valueint;
        const char* name = cJSON_IsString(name_obj) ? name_obj->valuestring : nullptr;

        esp_err_t ret = g_face_db_reader->set_name(id, name);
        if (ret == ESP_OK) {
            char msg[128];
            snprintf(msg, sizeof(msg), "Set name for ID %d: %s", id, name ? name : "(removed)");
            g_uart->send_status("ok", msg);
        } else {
            g_uart->send_status("error", "Failed to set name");
        } });

    // Get name for a face ID
    g_uart->register_command("get_name", [](const char *cmd, cJSON *params)
                             {
        if (!g_face_db_reader) {
            g_uart->send_status("error", "Face database reader not initialized");
            return;
        }

        if (!params) {
            g_uart->send_status("error", "Missing parameters");
            return;
        }

        cJSON* id_obj = cJSON_GetObjectItem(params, "id");
        if (!cJSON_IsNumber(id_obj)) {
            g_uart->send_status("error", "Missing or invalid 'id' parameter");
            return;
        }

        int id = id_obj->valueint;
        std::string name = g_face_db_reader->get_name(id);

        char msg[128];
        snprintf(msg, sizeof(msg), "ID %d: %s", id, name.c_str());
        g_uart->send_status("ok", msg); });

    // Enroll face with optional name
    g_uart->register_command("enroll_with_name", [](const char *cmd, cJSON *params)
                             {
        if (!g_button_handler) {
            g_uart->send_status("error", "Button handler not available");
            return;
        }

        // Trigger enrollment
        g_button_handler->trigger_enroll();

        // If name provided, we'll set it after enrollment completes
        // For now, user must call set_name separately after enrollment
        g_uart->send_status("ok", "Enrollment triggered. Use set_name command after enrollment completes."); });

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

    // Also delete the name mapping
    if (g_face_db_reader)
    {
        g_face_db_reader->delete_last_name();
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

// Task that continuously grabs camera frames, encodes to JPEG, and sends over SPI
static void spi_frame_sender_task(void *pvParameters)
{
    ESP_LOGI(TAG, "SPI frame sender task started on Core %d", xPortGetCoreID());

    auto frame_cap_node = g_frame_cap->get_last_node();
    RawJpegEncoder encoder(50); // JPEG quality 0 - Lower quality for better FPS

    uint32_t frame_start_time = 0;
    uint32_t encode_time = 0;
    uint32_t spi_time = 0;

    while (true)
    {
        frame_start_time = esp_timer_get_time() / 1000; // Convert to ms

        // Peek at the latest frame
        who::cam::cam_fb_t *frame = frame_cap_node->cam_fb_peek(-1);

        if (frame != nullptr && frame->buf != nullptr && frame->len > 0)
        {
            bool encoded = false;
            uint32_t encode_start = esp_timer_get_time() / 1000;

            // Encode to JPEG if not already JPEG
            if (static_cast<pixformat_t>(frame->format) != PIXFORMAT_JPEG)
            {
                // Determine pixel format from camera frame
                RawJpegEncoder::PixelFormat fmt = RawJpegEncoder::PixelFormat::RGB565;
                if (static_cast<pixformat_t>(frame->format) == PIXFORMAT_RGB888) {
                    fmt = RawJpegEncoder::PixelFormat::RGB888;
                } else if (static_cast<pixformat_t>(frame->format) == PIXFORMAT_YUV422) {
                    fmt = RawJpegEncoder::PixelFormat::YUV422;
                } else if (static_cast<pixformat_t>(frame->format) == PIXFORMAT_GRAYSCALE) {
                    fmt = RawJpegEncoder::PixelFormat::GRAYSCALE;
                }

                encoded = encoder.encode(
                    static_cast<const uint8_t *>(frame->buf),
                    frame->len,
                    frame->width,
                    frame->height,
                    fmt);

                if (!encoded)
                {
                    ESP_LOGW(TAG, "JPEG encoding failed, skipping frame");
                    // frame_cap_node->cam_fb_skip(1); // mark frame consumed
                    continue;
                }
            }
            else
            {
                // Frame is already JPEG, just copy
                encoded = encoder.encode(
                    static_cast<const uint8_t *>(frame->buf),
                    frame->len,
                    frame->width,
                    frame->height,
                    RawJpegEncoder::PixelFormat::RGB565);

                if (!encoded)
                {
                    ESP_LOGW(TAG, "Copying JPEG frame failed, skipping");
                    // frame_cap_node->cam_fb_skip(1);
                    continue;
                }
            }

            // Validate JPEG before sending
            const uint8_t *jpeg_data = encoder.data();
            size_t jpeg_size = encoder.size();

            if (jpeg_size < 10)
            {
                ESP_LOGW(TAG, "JPEG too small: %zu bytes", jpeg_size);
                continue;
            }

            // Check JPEG markers
            bool has_start = (jpeg_data[0] == 0xFF && jpeg_data[1] == 0xD8);
            bool has_end = (jpeg_data[jpeg_size - 2] == 0xFF && jpeg_data[jpeg_size - 1] == 0xD9);

            // Validate but don't log every frame (logging is slow)
            ESP_LOGD(TAG, "JPEG validation: Start=%s End=%s Size=%zu",
                     has_start ? "OK" : "BAD",
                     has_end ? "OK" : "BAD",
                     jpeg_size);

            encode_time = (esp_timer_get_time() / 1000) - encode_start;

            if (!has_start || !has_end)
            {
                ESP_LOGW(TAG, "JPEG validation failed, skipping frame");
                continue;
            }

            // Send JPEG over SPI
            uint32_t spi_start = esp_timer_get_time() / 1000;
            esp_err_t ret = slave_spi_queue_frame(
                g_frame_id++,
                jpeg_data,
                jpeg_size);
            spi_time = (esp_timer_get_time() / 1000) - spi_start;

            uint32_t total_time = (esp_timer_get_time() / 1000) - frame_start_time;

            // Log performance every 30 frames
            if (g_frame_id % 30 == 0) {
                ESP_LOGI(TAG, "Performance: Encode=%lums, SPI=%lums, Total=%lums, Target FPS=%.1f",
                         encode_time, spi_time, total_time, 1000.0f / total_time);
            }

            if (ret != ESP_OK)
            {
                ESP_LOGW(TAG, "Failed to queue frame %d", g_frame_id - 1);
            }
        }
        else
        {
            ESP_LOGD(TAG, "No valid frame available");
        }

        // Remove artificial delay - run as fast as possible
        vTaskDelay(pdMS_TO_TICKS(33)); 
    }
}