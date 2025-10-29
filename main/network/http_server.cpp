// http_server.cpp
#include "http_server.h"
#include "esp_http_server.h"
#include "esp_log.h"
#include "esp_wifi.h"
#include "nvs_flash.h"
#include "esp_event.h"
#include "esp_heap_caps.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "i2s_microphone.hpp"
#include <cstring>

static const char *TAG = "HTTP_SERVER";

#define WIFI_SSID "ILFforever2"
#define WIFI_PASS "19283746"

// Static IP configuration for camera
#define CAMERA_STATIC_IP      "192.168.1.100"
#define CAMERA_GATEWAY        "192.168.1.1"
#define CAMERA_SUBNET         "255.255.255.0"
#define CAMERA_DNS            "192.168.1.1"

// Global references
static who::standby::XiaoStandbyControl *g_standby_ctrl = nullptr;
static who::recognition::WhoRecognition *g_recognition = nullptr;
static who::recognition::FaceDbReader *g_face_db_reader = nullptr;
static who::audio::I2SMicrophone *g_microphone = nullptr;

// Status page
static esp_err_t status_handler(httpd_req_t *req)
{
    const char* power_state = "UNKNOWN";
    if (g_standby_ctrl) {
        power_state = g_standby_ctrl->get_power_state();
    }

    char mic_info[128] = "Not Initialized";
    if (g_microphone) {
        if (g_microphone->is_running()) {
            snprintf(mic_info, sizeof(mic_info), "Running | RMS: %lu | Peak: %lu",
                     g_microphone->get_rms_level(),
                     g_microphone->get_peak_level());
        } else {
            snprintf(mic_info, sizeof(mic_info), "Stopped");
        }
    }

    char resp[2048];
    snprintf(resp, sizeof(resp),
        "<!DOCTYPE html><html><head><title>Doorbell Camera</title>"
        "<meta http-equiv='refresh' content='5'>"
        "<style>body{font-family:Arial;margin:20px;} .status{padding:10px;margin:10px;border:1px solid #ccc;} "
        "button{padding:10px;margin:5px;} .audio{background:#e8f4f8;}</style>"
        "</head><body>"
        "<h1>Doorbell Camera Status</h1>"
        "<div class='status'><b>Power State:</b> %s</div>"
        "<div class='status'><b>Active Tasks:</b> %u</div>"
        "<div class='status'><b>Free Heap:</b> %lu bytes</div>"
        "<div class='status'><b>PSRAM Free:</b> %zu bytes</div>"
        "<div class='status audio'><b>Microphone:</b> %s</div>"
        "<h2>Controls</h2>"
        "<a href='/standby'><button>Enter Standby</button></a> "
        "<a href='/wake'><button>Wake Up</button></a> "
        "<a href='/enroll'><button>Enroll Face</button></a> "
        "<a href='/recognize'><button>Recognize</button></a>"
        "<h2>Audio Streaming</h2>"
        "<p><b>Stream URL:</b> <a href='/audio/stream'>/audio/stream</a></p>"
        "<p>Connect LCD or browser to this endpoint for PCM audio (16kHz, 16-bit mono)</p>"
        "<p><i>Note: Start microphone via UART command 'mic_start' first</i></p>"
        "<h2>Face Database</h2>"
        "<a href='/face_count'><button>View Face Count</button></a> "
        "<a href='/face_list'><button>View Face List</button></a> "
        "<a href='/db_status'><button>Database Status</button></a>"
        "</body></html>",
        power_state,
        uxTaskGetNumberOfTasks(),
        esp_get_free_heap_size(),
        heap_caps_get_free_size(MALLOC_CAP_SPIRAM),
        mic_info
    );

    httpd_resp_set_type(req, "text/html");
    return httpd_resp_send(req, resp, HTTPD_RESP_USE_STRLEN);
}

// Enter standby mode
static esp_err_t standby_handler(httpd_req_t *req)
{
    if (g_standby_ctrl && g_standby_ctrl->enter_standby()) {
        httpd_resp_sendstr(req, "<html><body>Entered standby mode. <a href='/'>Back</a></body></html>");
    } else {
        httpd_resp_sendstr(req, "<html><body>Failed to enter standby. <a href='/'>Back</a></body></html>");
    }
    return ESP_OK;
}

// Wake from standby
static esp_err_t wake_handler(httpd_req_t *req)
{
    if (g_standby_ctrl && g_standby_ctrl->exit_standby()) {
        httpd_resp_sendstr(req, "<html><body>Woke from standby. <a href='/'>Back</a></body></html>");
    } else {
        httpd_resp_sendstr(req, "<html><body>Failed to wake. <a href='/'>Back</a></body></html>");
    }
    return ESP_OK;
}

// Enroll face
static esp_err_t enroll_handler(httpd_req_t *req)
{
    if (g_recognition) {
        xEventGroupSetBits(g_recognition->get_recognition_task()->get_event_group(), 
                          who::recognition::WhoRecognitionCore::ENROLL);
        httpd_resp_sendstr(req, "<html><body>Enrolling face... Look at camera. <a href='/'>Back</a></body></html>");
    } else {
        httpd_resp_sendstr(req, "<html><body>Recognition not available. <a href='/'>Back</a></body></html>");
    }
    return ESP_OK;
}

// Recognize face
static esp_err_t recognize_handler(httpd_req_t *req)
{
    if (g_recognition) {
        xEventGroupSetBits(g_recognition->get_recognition_task()->get_event_group(),
                          who::recognition::WhoRecognitionCore::RECOGNIZE);
        httpd_resp_sendstr(req, "<html><body>Recognizing... Look at camera. <a href='/'>Back</a></body></html>");
    } else {
        httpd_resp_sendstr(req, "<html><body>Recognition not available. <a href='/'>Back</a></body></html>");
    }
    return ESP_OK;
}

// Get face count from database
static esp_err_t face_count_handler(httpd_req_t *req)
{
    if (!g_face_db_reader) {
        httpd_resp_sendstr(req, "<html><body>Face DB reader not available. <a href='/'>Back</a></body></html>");
        return ESP_OK;
    }

    int face_count = g_face_db_reader->get_face_count();
    char resp[256];
    snprintf(resp, sizeof(resp),
        "<html><body>"
        "<h2>Face Database Count</h2>"
        "<p>Total enrolled faces: <b>%d</b></p>"
        "<a href='/'>Back to Home</a>"
        "</body></html>",
        face_count);

    httpd_resp_sendstr(req, resp);
    return ESP_OK;
}

// Display all faces in database
static esp_err_t face_list_handler(httpd_req_t *req)
{
    if (!g_face_db_reader) {
        httpd_resp_sendstr(req, "<html><body>Face DB reader not available. <a href='/'>Back</a></body></html>");
        return ESP_OK;
    }

    int face_count = g_face_db_reader->get_face_count();

    char resp[1024];
    int offset = snprintf(resp, sizeof(resp),
        "<html><head><title>Face Database</title>"
        "<style>body{font-family:Arial;margin:20px;} .face-item{padding:10px;margin:5px;border:1px solid #ccc;}</style>"
        "</head><body>"
        "<h1>Face Database</h1>"
        "<p>Total enrolled faces: <b>%d</b></p>",
        face_count);

    if (face_count > 0) {
        offset += snprintf(resp + offset, sizeof(resp) - offset, "<h2>Enrolled Face IDs:</h2>");
        for (int i = 1; i <= face_count && offset < sizeof(resp) - 100; i++) {
            offset += snprintf(resp + offset, sizeof(resp) - offset,
                "<div class='face-item'>Face ID: %d</div>", i);
        }
    } else {
        offset += snprintf(resp + offset, sizeof(resp) - offset, "<p>No faces enrolled yet.</p>");
    }

    snprintf(resp + offset, sizeof(resp) - offset,
        "<br><a href='/'>Back to Home</a>"
        "</body></html>");

    httpd_resp_sendstr(req, resp);
    return ESP_OK;
}

// Check database status
static esp_err_t db_status_handler(httpd_req_t *req)
{
    if (!g_face_db_reader) {
        httpd_resp_sendstr(req, "<html><body>Face DB reader not available. <a href='/'>Back</a></body></html>");
        return ESP_OK;
    }

    bool is_valid = g_face_db_reader->is_database_valid();
    int face_count = g_face_db_reader->get_face_count();

    char resp[512];
    snprintf(resp, sizeof(resp),
        "<html><head><title>Database Status</title>"
        "<style>body{font-family:Arial;margin:20px;} .status{padding:10px;margin:10px;border:1px solid #ccc;}</style>"
        "</head><body>"
        "<h1>Face Database Status</h1>"
        "<div class='status'><b>Database Valid:</b> %s</div>"
        "<div class='status'><b>Face Count:</b> %d</div>"
        "<br><a href='/'>Back to Home</a>"
        "</body></html>",
        is_valid ? "Yes" : "No",
        face_count);

    httpd_resp_sendstr(req, resp);
    return ESP_OK;
}

// Audio streaming handler - streams PCM audio data
static esp_err_t audio_stream_handler(httpd_req_t *req)
{
    if (!g_microphone || !g_microphone->is_running()) {
        httpd_resp_set_status(req, "503 Service Unavailable");
        httpd_resp_sendstr(req, "Microphone not running");
        return ESP_OK;
    }

    // Set headers for streaming audio
    httpd_resp_set_type(req, "audio/pcm");
    httpd_resp_set_hdr(req, "Cache-Control", "no-cache");
    httpd_resp_set_hdr(req, "Connection", "keep-alive");

    // Audio buffer (1024 samples = 64ms @ 16kHz)
    const size_t chunk_size = 1024;
    int16_t* audio_buffer = (int16_t*)malloc(chunk_size * sizeof(int16_t));

    if (!audio_buffer) {
        ESP_LOGE(TAG, "Failed to allocate audio buffer for streaming");
        httpd_resp_set_status(req, "500 Internal Server Error");
        httpd_resp_sendstr(req, "Out of memory");
        return ESP_OK;
    }

    ESP_LOGI(TAG, "Audio stream started with gain boost");

    uint32_t dropped_chunks = 0;
    uint32_t sent_chunks = 0;

    // Audio gain multiplier (2 = 2x volume, 4 = 4x volume, etc.)
    const int16_t gain = 4;  // Start with 4x gain

    // Stream audio chunks until client disconnects
    while (true) {
        size_t bytes_read = 0;
        esp_err_t ret = g_microphone->read_audio(audio_buffer, chunk_size * sizeof(int16_t),
                                                   &bytes_read, 100);

        if (ret == ESP_OK && bytes_read > 0) {
            // Apply gain to boost volume
            size_t num_samples = bytes_read / sizeof(int16_t);
            for (size_t i = 0; i < num_samples; i++) {
                int32_t sample = audio_buffer[i] * gain;
                // Clamp to prevent overflow/distortion
                if (sample > 32767) sample = 32767;
                if (sample < -32768) sample = -32768;
                audio_buffer[i] = (int16_t)sample;
            }

            // Send audio chunk to client with error handling
            esp_err_t send_ret = httpd_resp_send_chunk(req, (const char*)audio_buffer, bytes_read);

            if (send_ret != ESP_OK) {
                ESP_LOGW(TAG, "Audio stream client disconnected or send failed");
                break;
            }

            sent_chunks++;

            // Yield to prevent watchdog and allow other tasks to run
            if (sent_chunks % 10 == 0) {
                vTaskDelay(pdMS_TO_TICKS(1));
            }
        } else if (ret == ESP_ERR_TIMEOUT) {
            // Timeout is normal - just means no audio data ready yet
            vTaskDelay(pdMS_TO_TICKS(10));
        } else if (ret != ESP_OK) {
            ESP_LOGW(TAG, "Failed to read audio: %s", esp_err_to_name(ret));
            vTaskDelay(pdMS_TO_TICKS(10));
        }

        // Check if microphone stopped
        if (!g_microphone->is_running()) {
            ESP_LOGI(TAG, "Microphone stopped, ending stream");
            break;
        }
    }

    ESP_LOGI(TAG, "Audio stream stats: sent=%lu dropped=%lu", sent_chunks, dropped_chunks);

    free(audio_buffer);

    // End chunked response
    httpd_resp_send_chunk(req, NULL, 0);

    ESP_LOGI(TAG, "Audio stream ended");
    return ESP_OK;
}

static httpd_handle_t start_webserver(void)
{
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.lru_purge_enable = true;
    config.max_uri_handlers = 12;  // Increase from default 8 to support all endpoints
    config.stack_size = 8192;      // Increase from default 4096 to prevent stack overflow
    config.send_wait_timeout = 3;  // Reduce send timeout to 3 seconds (from 5)
    config.recv_wait_timeout = 3;  // Reduce receive timeout to 3 seconds

    httpd_handle_t server = NULL;
    
    if (httpd_start(&server, &config) == ESP_OK) {
        httpd_uri_t status_uri = {
            .uri = "/",
            .method = HTTP_GET,
            .handler = status_handler,
            .user_ctx = NULL
        };
        httpd_register_uri_handler(server, &status_uri);

        httpd_uri_t standby_uri = {
            .uri = "/standby",
            .method = HTTP_GET,
            .handler = standby_handler,
            .user_ctx = NULL
        };
        httpd_register_uri_handler(server, &standby_uri);

        httpd_uri_t wake_uri = {
            .uri = "/wake",
            .method = HTTP_GET,
            .handler = wake_handler,
            .user_ctx = NULL
        };
        httpd_register_uri_handler(server, &wake_uri);

        httpd_uri_t enroll_uri = {
            .uri = "/enroll",
            .method = HTTP_GET,
            .handler = enroll_handler,
            .user_ctx = NULL
        };
        httpd_register_uri_handler(server, &enroll_uri);

        httpd_uri_t recognize_uri = {
            .uri = "/recognize",
            .method = HTTP_GET,
            .handler = recognize_handler,
            .user_ctx = NULL
        };
        httpd_register_uri_handler(server, &recognize_uri);

        httpd_uri_t face_count_uri = {
            .uri = "/face_count",
            .method = HTTP_GET,
            .handler = face_count_handler,
            .user_ctx = NULL
        };
        httpd_register_uri_handler(server, &face_count_uri);

        httpd_uri_t face_list_uri = {
            .uri = "/face_list",
            .method = HTTP_GET,
            .handler = face_list_handler,
            .user_ctx = NULL
        };
        httpd_register_uri_handler(server, &face_list_uri);

        httpd_uri_t db_status_uri = {
            .uri = "/db_status",
            .method = HTTP_GET,
            .handler = db_status_handler,
            .user_ctx = NULL
        };
        httpd_register_uri_handler(server, &db_status_uri);

        httpd_uri_t audio_stream_uri = {
            .uri = "/audio/stream",
            .method = HTTP_GET,
            .handler = audio_stream_handler,
            .user_ctx = NULL
        };
        httpd_register_uri_handler(server, &audio_stream_uri);

        return server;
    }

    return NULL;
}

static void wifi_event_handler(void* arg, esp_event_base_t event_base,
                                int32_t event_id, void* event_data)
{
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
    } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        ESP_LOGI(TAG, "Disconnected, retrying...");
        esp_wifi_connect();
    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t* event = (ip_event_got_ip_t*) event_data;
        ESP_LOGI(TAG, "Got IP: " IPSTR, IP2STR(&event->ip_info.ip));
        start_webserver();
    }
}

//call this from main to start server
void init_wifi_and_server()
{
    ESP_ERROR_CHECK(nvs_flash_init());
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());

    // Create default WiFi station
    esp_netif_t *sta_netif = esp_netif_create_default_wifi_sta();

    // Configure static IP
    esp_netif_dhcpc_stop(sta_netif);  // Stop DHCP client

    esp_netif_ip_info_t ip_info;
    ip_info.ip.addr = esp_ip4addr_aton(CAMERA_STATIC_IP);
    ip_info.gw.addr = esp_ip4addr_aton(CAMERA_GATEWAY);
    ip_info.netmask.addr = esp_ip4addr_aton(CAMERA_SUBNET);

    ESP_ERROR_CHECK(esp_netif_set_ip_info(sta_netif, &ip_info));

    // Set DNS server
    esp_netif_dns_info_t dns_info;
    dns_info.ip.u_addr.ip4.addr = esp_ip4addr_aton(CAMERA_DNS);
    dns_info.ip.type = ESP_IPADDR_TYPE_V4;
    ESP_ERROR_CHECK(esp_netif_set_dns_info(sta_netif, ESP_NETIF_DNS_MAIN, &dns_info));

    ESP_LOGI(TAG, "Static IP configured: %s", CAMERA_STATIC_IP);

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));

    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, &wifi_event_handler, NULL));
    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, &wifi_event_handler, NULL));

    wifi_config_t wifi_config = {};
    strcpy((char*)wifi_config.sta.ssid, WIFI_SSID);
    strcpy((char*)wifi_config.sta.password, WIFI_PASS);

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config));
    ESP_ERROR_CHECK(esp_wifi_start());

    ESP_LOGI(TAG, "WiFi initialized. Connecting to %s with static IP %s...", WIFI_SSID, CAMERA_STATIC_IP);
}

// Call this from your main app to set references
void set_http_server_refs(who::standby::XiaoStandbyControl *standby,
                          who::recognition::WhoRecognition *recognition,
                          who::recognition::FaceDbReader *face_db_reader,
                          who::audio::I2SMicrophone *microphone)
{
    g_standby_ctrl = standby;
    g_recognition = recognition;
    g_face_db_reader = face_db_reader;
    g_microphone = microphone;
}