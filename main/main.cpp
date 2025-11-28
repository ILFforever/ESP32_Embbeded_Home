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
#include "audio/i2s_microphone.hpp"
#include "backend/backend_stream.hpp"
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
using namespace who::audio;

static const char *TAG = "Main";

// ============================================================
// Function Declarations
// ============================================================
void create_uart_commands();
bool exit_standby_mode();
bool enter_standby_mode();
void start_camera_task(void *pvParameters);
void pause_face_detection();
// static void stats_task(void *pvParameters);
static void spi_frame_sender_task(void *pvParameters);
static void audio_streamer_task(void *pvParameters);

// ============================================================
// Global Variables
// ============================================================
static XiaoRecognitionButton *g_button_handler = nullptr;
static XiaoStandbyControl *g_standby_control = nullptr;
who::uart::UartComm *g_uart = nullptr;
static who::app::XiaoRecognitionAppTerm *g_recognition_app = nullptr;
static who::frame_cap::WhoFrameCap *g_frame_cap = nullptr;
static FaceDbReader *g_face_db_reader = nullptr;
static I2SMicrophone *g_microphone = nullptr;
static bool g_camera_running = false;
static TaskHandle_t g_spi_sender_task_handle = nullptr;
static TaskHandle_t g_audio_streamer_task_handle = nullptr;
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

    // Enter standby mode immediately to power OFF camera hardware (prevents heating)
    ESP_LOGI("Main", "Entering standby mode to power down camera...");
    if (enter_standby_mode())
    {
        ESP_LOGI("Main", "Camera hardware powered OFF - no heat generation");
    }
    else
    {
        ESP_LOGW("Main", "Failed to enter standby - camera may be running!");
    }

    g_uart = new who::uart::UartComm();
    if (!g_uart->start())
    { // Start UART tasks
        ESP_LOGE("Main", "Failed to start UART");
    }

    // Connect UART to recognition app for sending detection events
    g_recognition_app->set_uart_comm(g_uart);

    // Connect face DB reader for getting names during recognition
    g_recognition_app->set_face_db_reader(g_face_db_reader);

    create_uart_commands();

    // Initialize backend streaming module
    esp_err_t stream_ret = backend_stream::init();
    if (stream_ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to initialize backend streaming");
    } else {
        ESP_LOGI(TAG, "Backend streaming initialized");
    }

    // WiFi and HTTP server will be initialized when mic_start is called
    // Set HTTP server references now (will be used when server starts)
    set_http_server_refs(g_standby_control,
                         g_recognition_app->get_recognition(),
                         g_face_db_reader,
                         g_microphone,
                         g_frame_cap);

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
            // Check standby state instead of g_camera_running
            if (!g_standby_control->is_standby()) {
                g_uart->send_status("error", "Camera already running");
                return;
            }

            // Exit standby mode first (this handles camera restart)
            if (!exit_standby_mode()) {
                g_uart->send_status("error", "Failed to exit standby mode");
                return;
            }

            // Start SPI frame sender task on Core 0 with larger stack for audio buffers
            xTaskCreatePinnedToCore(
                spi_frame_sender_task,
                "spi_sender",
                8192,  // Increased from 4096 to 8192 for audio buffers
                NULL,
                4,  // Priority 4 (below camera/recognition tasks)
                &g_spi_sender_task_handle,
                0   // Core 0
            );

            g_camera_running = true;

            g_uart->send_status("ok", "Camera and SPI sender started");

        } else if (strcmp(action_str, "camera_stop") == 0) {
            // Check standby state instead of g_camera_running
            if (g_standby_control->is_standby()) {
                g_uart->send_status("error", "Camera already stopped");
                return;
            }

            // Stop SPI sender task first
            if (g_spi_sender_task_handle != nullptr) {
                vTaskDelete(g_spi_sender_task_handle);
                g_spi_sender_task_handle = nullptr;
            }

            // Enter standby mode (this handles camera shutdown)
            if (!enter_standby_mode()) {
                g_uart->send_status("error", "Failed to enter standby mode");
                return;
            }

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

    g_uart->register_command("reboot", [](const char *cmd, cJSON *params)
                             {
        ESP_LOGI(TAG, "UART reboot command received. Restarting...");
        
        // Send the confirmation message first
        g_uart->send_status("ok", "Rebooting device now...");
        
        // Short delay to ensure the UART message has time to send
        vTaskDelay(pdMS_TO_TICKS(100)); 
        
        // Call the ESP-IDF restart function
        esp_restart(); });

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

    // Recognize face (one-shot recognition)
    g_uart->register_command("recognize_face", [](const char *cmd, cJSON *params)
                             {
        if (g_button_handler) {
            g_button_handler->trigger_recognize();
            g_uart->send_status("ok", "Recognition triggered. Present face now.");
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

    g_uart->register_command("pause_detection", [](const char *cmd, cJSON *params)
                             {
        if (!g_recognition_app) {
            g_uart->send_status("error", "Recognition app not initialized");
            return;
        }

        pause_face_detection();
        g_uart->send_status("ok", "Pause detection success "); });

    // ============================================================
    // Face Database Reader Commands
    // ============================================================

    // Get face count from database
    g_uart->register_command("face_count", [](const char *cmd, cJSON *params)
                             {
        if (!g_face_db_reader) {
            g_uart->send_status("error", "Face database reader not initialized");
            return;
        }

        int face_count = g_face_db_reader->get_face_count();
        char msg[64];
        snprintf(msg, sizeof(msg), "Face count: %d", face_count);
        g_uart->send_status("face_count", msg); });

    // Get all faces in database and send as JSON array
    g_uart->register_command("list_faces", [](const char *cmd, cJSON *params)
                             {
        if (!g_face_db_reader) {
            g_uart->send_status("error", "Face database reader not initialized");
            return;
        }

        int face_count = g_face_db_reader->get_face_count();

        if (face_count == 0) {
            g_uart->send_status("list_faces", "[]");  // Empty JSON array
            return;
        }

        // Create JSON array of face objects
        cJSON *faces_array = cJSON_CreateArray();

        for (int i = 1; i <= face_count; i++) {
            std::string name = g_face_db_reader->get_name(i);

            cJSON *face_obj = cJSON_CreateObject();
            cJSON_AddNumberToObject(face_obj, "id", i);
            cJSON_AddStringToObject(face_obj, "name", name.c_str());

            cJSON_AddItemToArray(faces_array, face_obj);
        }

        // Convert to JSON string and send
        char *json_str = cJSON_PrintUnformatted(faces_array);
        if (json_str) {
            g_uart->send_status("list_faces", json_str);
            free(json_str);
        }

        cJSON_Delete(faces_array);

        // Also print detailed info to serial console
        g_face_db_reader->print_all_faces(); });

    // Check if database is valid and accessible
    g_uart->register_command("check_face_db", [](const char *cmd, cJSON *params)
                             {
        if (!g_face_db_reader) {
            g_uart->send_status("error", "Face database reader not initialized");
            return;
        }

        bool is_valid = g_face_db_reader->is_database_valid();
        const char *status = is_valid ? "valid" : "invalid";
        char msg[64];
        snprintf(msg, sizeof(msg), "Database status: %s", status);
        g_uart->send_status("face_db", msg); });

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

    // Enroll face with optional name TODO
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

    // ============================================================
    // Microphone Control Commands
    // ============================================================

    // Unified microphone control command with action parameter
    // Usage: {"cmd": "mic_control", "params": {"action": "mic_start"}}
    //        {"cmd": "mic_control", "params": {"action": "mic_stop"}}
    //        {"cmd": "mic_control", "params": {"action": "mic_status"}}
    g_uart->register_command("mic_control", [](const char *cmd, cJSON *params)
                             {
        if (!params) {
            g_uart->send_status("error", "Missing parameters");
            return;
        }

        cJSON* action = cJSON_GetObjectItem(params, "action");
        if (!action || !cJSON_IsString(action)) {
            g_uart->send_status("error", "Missing or invalid 'action' parameter");
            return;
        }

        const char* action_str = action->valuestring;

        if (strcmp(action_str, "mic_start") == 0) {
            // Start microphone (also starts WiFi and HTTP server)
            if (!g_microphone) {
                // Create microphone instance
                g_microphone = new I2SMicrophone();
                esp_err_t ret = g_microphone->init();
                if (ret != ESP_OK) {
                    delete g_microphone;
                    g_microphone = nullptr;
                    g_uart->send_status("error", "Failed to initialize microphone");
                    return;
                }

                // Update HTTP server reference after creating microphone
                set_http_server_refs(g_standby_control,
                                   g_recognition_app->get_recognition(),
                                   g_face_db_reader,
                                   g_microphone,
                                   g_frame_cap);
            }

            if (g_microphone->is_running()) {
                g_uart->send_status("error", "Microphone already running");
                return;
            }

            // Start WiFi and HTTP server first
            init_wifi_and_server();

            // Wait a bit for WiFi to connect
            vTaskDelay(pdMS_TO_TICKS(2000));

            // Start microphone
            if (g_microphone->start()) {
                // Create audio streamer task on Core 0
                if (g_audio_streamer_task_handle == nullptr) {
                    xTaskCreatePinnedToCore(
                        audio_streamer_task,
                        "audio_stream",
                        4096,  // 4KB stack
                        nullptr,
                        3,  // Priority 3
                        &g_audio_streamer_task_handle,
                        0   // Core 0
                    );
                }
                g_uart->send_status("microphone_event", "Microphone and WiFi started");
            } else {
                // If mic fails to start, stop WiFi
                stop_webserver_and_wifi();
                g_uart->send_status("error", "Failed to start microphone");
            }

        } else if (strcmp(action_str, "mic_stop") == 0) {
            // Stop microphone (also stops WiFi and HTTP server)
            if (!g_microphone) {
                g_uart->send_status("error", "Microphone not initialized");
                return;
            }

            if (!g_microphone->is_running()) {
                g_uart->send_status("error", "Microphone not running");
                return;
            }

            // Stop backend audio streaming first
            if (backend_stream::is_audio_streaming()) {
                backend_stream::stop_audio_streaming();
            }

            // Stop microphone
            g_microphone->stop();

            // Delete audio streamer task if it exists
            if (g_audio_streamer_task_handle != nullptr) {
                vTaskDelete(g_audio_streamer_task_handle);
                g_audio_streamer_task_handle = nullptr;
            }

            // Then stop WiFi and HTTP server
            stop_webserver_and_wifi();

            g_uart->send_status("microphone_event", "Microphone, WiFi, and HTTP server stopped");

        } else if (strcmp(action_str, "mic_status") == 0) {
            // Get microphone status
            if (!g_microphone) {
                g_uart->send_status("microphone_event", "Microphone: Not initialized");
                return;
            }

            if (g_microphone->is_running()) {
                char msg[128];
                snprintf(msg, sizeof(msg), "Running - RMS:%lu Peak:%lu",
                         g_microphone->get_rms_level(),
                         g_microphone->get_peak_level());
                g_uart->send_status("microphone_event", msg);
            } else {
                g_uart->send_status("microphone_event", "Microphone: Initialized but not running");
            }

        } else {
            g_uart->send_status("error", "Unknown microphone action");
        } });

    // ============================================================
    // Backend Streaming Control Commands
    // ============================================================

    // Backend streaming control command with params.name structure
    // Usage: {"cmd": "stream_control", "params": {"name": "camera_start"}}
    //        {"cmd": "stream_control", "params": {"name": "mic_start"}}
    //        {"cmd": "stream_control", "params": {"name": "both_start"}}
    //        {"cmd": "stream_control", "params": {"name": "camera_stop"}}
    //        {"cmd": "stream_control", "params": {"name": "mic_stop"}}
    //        {"cmd": "stream_control", "params": {"name": "stop_stream"}}
    //        {"cmd": "stream_control", "params": {"name": "stream_status"}}
    g_uart->register_command("stream_control", [](const char *cmd, cJSON *params)
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
            // Auto-start WiFi if not already running (needed for backend streaming)
            // WiFi is started with microphone, but camera streaming also needs it
            if (!g_microphone || !g_microphone->is_running()) {
                ESP_LOGI(TAG, "WiFi not running, starting WiFi for camera streaming...");
                init_wifi_and_server();
                vTaskDelay(pdMS_TO_TICKS(2000)); // Wait for WiFi to connect
            }

            // Auto-start camera if not running
            if (g_standby_control->is_standby()) {
                ESP_LOGI(TAG, "Camera not running, starting camera first...");

                if (!exit_standby_mode()) {
                    g_uart->send_status("error", "Failed to start camera");
                    return;
                }

                // Create SPI frame sender task
                if (g_spi_sender_task_handle == nullptr) {
                    xTaskCreatePinnedToCore(
                        spi_frame_sender_task,
                        "spi_sender",
                        8192,
                        NULL,
                        4,
                        &g_spi_sender_task_handle,
                        0
                    );
                }
                g_camera_running = true;

                // Wait for camera to stabilize
                vTaskDelay(pdMS_TO_TICKS(500));
            }

            backend_stream::start_camera_streaming();
            g_uart->send_status("stream_event", "Camera streaming started (WiFi + Camera)");

        } else if (strcmp(action_str, "mic_start") == 0) {
            // Auto-start microphone if not running
            if (!g_microphone || !g_microphone->is_running()) {
                ESP_LOGI(TAG, "Microphone not running, starting microphone first...");

                // Create microphone if needed
                if (!g_microphone) {
                    g_microphone = new I2SMicrophone();
                    esp_err_t ret = g_microphone->init();
                    if (ret != ESP_OK) {
                        delete g_microphone;
                        g_microphone = nullptr;
                        g_uart->send_status("error", "Failed to initialize microphone");
                        return;
                    }

                    set_http_server_refs(g_standby_control,
                                       g_recognition_app->get_recognition(),
                                       g_face_db_reader,
                                       g_microphone,
                                       g_frame_cap);
                }

                // Start WiFi and HTTP server
                init_wifi_and_server();
                vTaskDelay(pdMS_TO_TICKS(2000));

                // Start microphone
                if (!g_microphone->start()) {
                    stop_webserver_and_wifi();
                    g_uart->send_status("error", "Failed to start microphone");
                    return;
                }

                // Create audio streamer task
                if (g_audio_streamer_task_handle == nullptr) {
                    xTaskCreatePinnedToCore(
                        audio_streamer_task,
                        "audio_stream",
                        4096,
                        nullptr,
                        3,
                        &g_audio_streamer_task_handle,
                        0
                    );
                }

                // Wait for mic to stabilize
                vTaskDelay(pdMS_TO_TICKS(500));
            }

            backend_stream::start_audio_streaming();
            g_uart->send_status("stream_event", "Audio streaming started");

        } else if (strcmp(action_str, "both_start") == 0) {
            // Auto-start camera if not running
            if (g_standby_control->is_standby()) {
                ESP_LOGI(TAG, "Camera not running, starting camera first...");

                if (!exit_standby_mode()) {
                    g_uart->send_status("error", "Failed to start camera");
                    return;
                }

                if (g_spi_sender_task_handle == nullptr) {
                    xTaskCreatePinnedToCore(
                        spi_frame_sender_task,
                        "spi_sender",
                        8192,
                        NULL,
                        4,
                        &g_spi_sender_task_handle,
                        0
                    );
                }
                g_camera_running = true;
                vTaskDelay(pdMS_TO_TICKS(500));
            }

            // Auto-start microphone if not running
            if (!g_microphone || !g_microphone->is_running()) {
                ESP_LOGI(TAG, "Microphone not running, starting microphone first...");

                if (!g_microphone) {
                    g_microphone = new I2SMicrophone();
                    esp_err_t ret = g_microphone->init();
                    if (ret != ESP_OK) {
                        delete g_microphone;
                        g_microphone = nullptr;
                        g_uart->send_status("error", "Failed to initialize microphone");
                        return;
                    }

                    set_http_server_refs(g_standby_control,
                                       g_recognition_app->get_recognition(),
                                       g_face_db_reader,
                                       g_microphone,
                                       g_frame_cap);
                }

                init_wifi_and_server();
                vTaskDelay(pdMS_TO_TICKS(2000));

                if (!g_microphone->start()) {
                    stop_webserver_and_wifi();
                    g_uart->send_status("error", "Failed to start microphone");
                    return;
                }

                if (g_audio_streamer_task_handle == nullptr) {
                    xTaskCreatePinnedToCore(
                        audio_streamer_task,
                        "audio_stream",
                        4096,
                        nullptr,
                        3,
                        &g_audio_streamer_task_handle,
                        0
                    );
                }
                vTaskDelay(pdMS_TO_TICKS(500));
            }

            backend_stream::start_camera_streaming();
            backend_stream::start_audio_streaming();
            g_uart->send_status("stream_event", "Camera and audio streaming started");

        } else if (strcmp(action_str, "camera_stop") == 0) {
            backend_stream::stop_camera_streaming();
            g_uart->send_status("stream_event", "Camera streaming stopped");

        } else if (strcmp(action_str, "mic_stop") == 0) {
            backend_stream::stop_audio_streaming();
            g_uart->send_status("stream_event", "Audio streaming stopped");

        } else if (strcmp(action_str, "stop_stream") == 0) {
            backend_stream::stop_camera_streaming();
            backend_stream::stop_audio_streaming();
            g_uart->send_status("stream_event", "All streaming stopped");

        } else if (strcmp(action_str, "stream_status") == 0) {
            // Get streaming status and statistics
            bool cam_active = backend_stream::is_camera_streaming();
            bool audio_active = backend_stream::is_audio_streaming();
            backend_stream::StreamStats stats = backend_stream::get_stats();

            char msg[256];
            snprintf(msg, sizeof(msg),
                     "Camera:%s Audio:%s | Cam(sent:%lu fail:%lu) Audio(sent:%lu fail:%lu)",
                     cam_active ? "ON" : "OFF",
                     audio_active ? "ON" : "OFF",
                     stats.camera_frames_sent,
                     stats.camera_frames_failed,
                     stats.audio_chunks_sent,
                     stats.audio_chunks_failed);
            g_uart->send_status("stream_event", msg);

        } else {
            g_uart->send_status("error", "Unknown stream action");
        }
    });
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

bool enter_standby_mode()
{
    if (g_button_handler)
    {
        return g_button_handler->enter_standby();
    }
    ESP_LOGE(TAG, "Button handler not initialized");
    return false;
}

bool exit_standby_mode()
{
    if (g_button_handler)
    {
        return g_button_handler->exit_standby();
    }
    ESP_LOGE(TAG, "Button handler not initialized");
    return false;
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
                if (static_cast<pixformat_t>(frame->format) == PIXFORMAT_RGB888)
                {
                    fmt = RawJpegEncoder::PixelFormat::RGB888;
                }
                else if (static_cast<pixformat_t>(frame->format) == PIXFORMAT_YUV422)
                {
                    fmt = RawJpegEncoder::PixelFormat::YUV422;
                }
                else if (static_cast<pixformat_t>(frame->format) == PIXFORMAT_GRAYSCALE)
                {
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
                g_frame_id,
                jpeg_data,
                jpeg_size);
            spi_time = (esp_timer_get_time() / 1000) - spi_start;

            // Also queue to backend if streaming is active
            if (backend_stream::is_camera_streaming()) {
                backend_stream::queue_camera_frame(jpeg_data, jpeg_size, g_frame_id);
            }

            g_frame_id++;

            uint32_t total_time = (esp_timer_get_time() / 1000) - frame_start_time;

            // Log performance every 30 frames
            if (g_frame_id % 30 == 0)
            {
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

// Task that continuously reads audio from microphone and queues to backend
static void audio_streamer_task(void *pvParameters)
{
    ESP_LOGI(TAG, "Audio streamer task started on Core %d", xPortGetCoreID());

    const size_t chunk_size = 1024;  // 1024 samples = 64ms @ 16kHz
    int16_t* audio_buffer = (int16_t*)malloc(chunk_size * sizeof(int16_t));

    if (!audio_buffer) {
        ESP_LOGE(TAG, "Failed to allocate audio buffer");
        vTaskDelete(NULL);
        return;
    }

    uint32_t sequence = 0;
    const int16_t gain = 4;  // Audio gain multiplier

    while (true) {
        // Only stream if microphone is running AND backend streaming is active
        if (g_microphone && g_microphone->is_running() && backend_stream::is_audio_streaming()) {
            size_t bytes_read = 0;
            esp_err_t ret = g_microphone->read_audio(audio_buffer, chunk_size * sizeof(int16_t),
                                                       &bytes_read, 100);

            if (ret == ESP_OK && bytes_read > 0) {
                size_t samples_read = bytes_read / sizeof(int16_t);

                // Apply gain to boost volume
                for (size_t i = 0; i < samples_read; i++) {
                    int32_t sample = audio_buffer[i] * gain;
                    if (sample > 32767) sample = 32767;
                    if (sample < -32768) sample = -32768;
                    audio_buffer[i] = (int16_t)sample;
                }

                // Queue audio chunk to backend
                backend_stream::queue_audio_chunk(
                    (const uint8_t*)audio_buffer,
                    samples_read * sizeof(int16_t),
                    sequence++
                );
            } else if (ret == ESP_ERR_TIMEOUT) {
                // Timeout is normal, just wait a bit
                vTaskDelay(pdMS_TO_TICKS(5));
            } else if (ret != ESP_OK) {
                ESP_LOGW(TAG, "Failed to read audio: %s", esp_err_to_name(ret));
                vTaskDelay(pdMS_TO_TICKS(10));
            }
        } else {
            // Not streaming, sleep longer to avoid busy waiting
            vTaskDelay(pdMS_TO_TICKS(100));
        }
    }

    free(audio_buffer);
    vTaskDelete(NULL);
}