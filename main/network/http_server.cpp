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
#include "JpegEncoder.hpp"
#include "backend/backend_stream.hpp"
#include <cstring>

static const char *TAG = "HTTP_SERVER";

#define WIFI_SSID "ILFforever2"
#define WIFI_PASS "19283746"

// Static IP configuration for camera
#define CAMERA_STATIC_IP      "192.168.1.50"
#define CAMERA_GATEWAY        "192.168.1.1"
#define CAMERA_SUBNET         "255.255.255.0"
#define CAMERA_DNS            "192.168.1.1"

// Global references
static who::standby::XiaoStandbyControl *g_standby_ctrl = nullptr;
static who::recognition::WhoRecognition *g_recognition = nullptr;
static who::recognition::FaceDbReader *g_face_db_reader = nullptr;
static who::audio::I2SMicrophone *g_microphone = nullptr;
static who::frame_cap::WhoFrameCap *g_frame_cap = nullptr;

// Track server and WiFi state
static httpd_handle_t g_server = nullptr;
static bool g_wifi_initialized = false;
static esp_netif_t *g_sta_netif = nullptr;  // Track network interface for cleanup

// Simple status page
static esp_err_t status_handler(httpd_req_t *req)
{
    httpd_resp_set_type(req, "text/plain");
    return httpd_resp_sendstr(req, "Webpage running");
}

// Audio streaming status endpoint - returns backend streaming status
static esp_err_t audio_stream_handler(httpd_req_t *req)
{
    // This endpoint returns the status of backend audio streaming
    // Streaming must be manually started/stopped via UART command

    if (!g_microphone || !g_microphone->is_running()) {
        httpd_resp_set_type(req, "application/json");
        httpd_resp_sendstr(req, "{\"status\":\"error\",\"message\":\"Microphone not running\"}");
        return ESP_OK;
    }

    // Get backend streaming status
    bool audio_active = backend_stream::is_audio_streaming();
    backend_stream::StreamStats stats = backend_stream::get_stats();

    char response[256];
    snprintf(response, sizeof(response),
             "{\"status\":\"%s\",\"target\":\"backend\",\"endpoint\":\"/api/v1/devices/doorbell/mic-stream\",\"chunks_sent\":%lu,\"chunks_failed\":%lu}",
             audio_active ? "streaming" : "inactive",
             stats.audio_chunks_sent,
             stats.audio_chunks_failed);

    httpd_resp_set_type(req, "application/json");
    httpd_resp_sendstr(req, response);

    return ESP_OK;
}

// Camera streaming status endpoint - returns backend streaming status
static esp_err_t camera_stream_handler(httpd_req_t *req)
{
    // This endpoint returns the status of backend camera streaming
    // Streaming must be manually started/stopped via UART command

    if (!g_frame_cap || !g_standby_ctrl) {
        httpd_resp_set_type(req, "application/json");
        httpd_resp_sendstr(req, "{\"status\":\"error\",\"message\":\"Camera not available\"}");
        return ESP_OK;
    }

    // Check if camera is in standby (powered off)
    if (strcmp(g_standby_ctrl->get_power_state(), "STANDBY") == 0) {
        httpd_resp_set_type(req, "application/json");
        httpd_resp_sendstr(req, "{\"status\":\"error\",\"message\":\"Camera in standby mode\"}");
        return ESP_OK;
    }

    // Get backend streaming status
    bool cam_active = backend_stream::is_camera_streaming();
    backend_stream::StreamStats stats = backend_stream::get_stats();

    char response[256];
    snprintf(response, sizeof(response),
             "{\"status\":\"%s\",\"target\":\"backend\",\"endpoint\":\"/api/v1/devices/doorbell/camera-stream\",\"frames_sent\":%lu,\"frames_failed\":%lu}",
             cam_active ? "streaming" : "inactive",
             stats.camera_frames_sent,
             stats.camera_frames_failed);

    httpd_resp_set_type(req, "application/json");
    httpd_resp_sendstr(req, response);

    return ESP_OK;
}

static httpd_handle_t start_webserver(void)
{
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.lru_purge_enable = true;
    config.max_uri_handlers = 4;   // 3 handlers: /, /audio/stream, /camera/stream
    config.stack_size = 8192;      // Increased for JPEG encoding
    config.send_wait_timeout = 3;  // Reduce send timeout to 3 seconds (from 5)
    config.recv_wait_timeout = 3;  // Reduce receive timeout to 3 seconds

    httpd_handle_t server = NULL;

    if (httpd_start(&server, &config) == ESP_OK) {
        // Root endpoint - simple status
        httpd_uri_t status_uri = {
            .uri = "/",
            .method = HTTP_GET,
            .handler = status_handler,
            .user_ctx = NULL
        };
        httpd_register_uri_handler(server, &status_uri);

        // Audio streaming endpoint
        httpd_uri_t audio_stream_uri = {
            .uri = "/audio/stream",
            .method = HTTP_GET,
            .handler = audio_stream_handler,
            .user_ctx = NULL
        };
        httpd_register_uri_handler(server, &audio_stream_uri);

        // Camera MJPEG streaming endpoint
        httpd_uri_t camera_stream_uri = {
            .uri = "/camera/stream",
            .method = HTTP_GET,
            .handler = camera_stream_handler,
            .user_ctx = NULL
        };
        httpd_register_uri_handler(server, &camera_stream_uri);

        return server;
    }

    return NULL;
}

static void wifi_event_handler(void* arg, esp_event_base_t event_base,
                                int32_t event_id, void* event_data)
{
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        ESP_LOGI(TAG, "WiFi started, connecting...");
        esp_wifi_connect();
    } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        wifi_event_sta_disconnected_t* disconnected = (wifi_event_sta_disconnected_t*) event_data;
        ESP_LOGW(TAG, "Disconnected (reason: %d), retrying...", disconnected->reason);
        vTaskDelay(pdMS_TO_TICKS(1000));  // Wait 1 second before retry
        esp_wifi_connect();
    } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_CONNECTED) {
        ESP_LOGI(TAG, "WiFi connected to AP");
    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t* event = (ip_event_got_ip_t*) event_data;
        ESP_LOGI(TAG, "Got IP: " IPSTR, IP2STR(&event->ip_info.ip));

        // Initialize backend streaming (must have network connectivity)
        esp_err_t ret = backend_stream::init();
        if (ret == ESP_OK) {
            ESP_LOGI(TAG, "Backend streaming module initialized");
        } else {
            ESP_LOGE(TAG, "Failed to initialize backend streaming: %d", ret);
        }

        g_server = start_webserver();
    }
}

void init_wifi_and_server()
{
    if (g_wifi_initialized) {
        ESP_LOGW(TAG, "WiFi already initialized");
        return;
    }

    ESP_LOGI(TAG, "Initializing WiFi and HTTP server...");
    ESP_LOGI(TAG, "Free heap: %lu bytes | PSRAM: %zu bytes",
             esp_get_free_heap_size(),
             heap_caps_get_free_size(MALLOC_CAP_SPIRAM));

    // NVS might already be initialized - handle gracefully
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_LOGE(TAG, "NVS corrupted, erasing...");
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    if (ret != ESP_OK) {
        ESP_LOGW(TAG, "NVS init returned: %s (continuing anyway)", esp_err_to_name(ret));
    }

    // Netif might already be initialized
    ret = esp_netif_init();
    if (ret != ESP_OK && ret != ESP_ERR_INVALID_STATE) {
        ESP_LOGE(TAG, "Netif init failed: %s", esp_err_to_name(ret));
        return;
    }

    // Event loop might already exist
    ret = esp_event_loop_create_default();
    if (ret != ESP_OK && ret != ESP_ERR_INVALID_STATE) {
        ESP_LOGE(TAG, "Event loop create failed: %s", esp_err_to_name(ret));
        return;
    }

    // Create default WiFi station (only if not already created)
    if (!g_sta_netif) {
        g_sta_netif = esp_netif_create_default_wifi_sta();
        if (!g_sta_netif) {
            ESP_LOGE(TAG, "Failed to create default WiFi STA interface");
            return;
        }
    }

    // Configure static IP
    esp_netif_dhcpc_stop(g_sta_netif);  // Stop DHCP client

    esp_netif_ip_info_t ip_info;
    ip_info.ip.addr = esp_ip4addr_aton(CAMERA_STATIC_IP);
    ip_info.gw.addr = esp_ip4addr_aton(CAMERA_GATEWAY);
    ip_info.netmask.addr = esp_ip4addr_aton(CAMERA_SUBNET);

    ESP_ERROR_CHECK(esp_netif_set_ip_info(g_sta_netif, &ip_info));

    // Set DNS server
    esp_netif_dns_info_t dns_info;
    dns_info.ip.u_addr.ip4.addr = esp_ip4addr_aton(CAMERA_DNS);
    dns_info.ip.type = ESP_IPADDR_TYPE_V4;
    ESP_ERROR_CHECK(esp_netif_set_dns_info(g_sta_netif, ESP_NETIF_DNS_MAIN, &dns_info));

    ESP_LOGI(TAG, "Static IP configured: %s", CAMERA_STATIC_IP);

    // Use minimal WiFi config to reduce memory usage (audio streaming only)
    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    cfg.static_rx_buf_num = 4;      // Reduce from 10 to 4 (minimum for audio streaming)
    cfg.dynamic_rx_buf_num = 16;    // Reduce from 32 to 16
    // Keep default tx_buf_type (1 = dynamic) and cache settings from WIFI_INIT_CONFIG_DEFAULT()

    ESP_LOGI(TAG, "Free heap before WiFi init: %lu bytes", esp_get_free_heap_size());
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));
    ESP_LOGI(TAG, "Free heap after WiFi init: %lu bytes", esp_get_free_heap_size());

    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, &wifi_event_handler, NULL));
    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, &wifi_event_handler, NULL));

    wifi_config_t wifi_config = {};
    strcpy((char*)wifi_config.sta.ssid, WIFI_SSID);
    strcpy((char*)wifi_config.sta.password, WIFI_PASS);
    wifi_config.sta.threshold.authmode = WIFI_AUTH_WPA_WPA2_PSK;  // Accept both WPA and WPA2
    wifi_config.sta.pmf_cfg.capable = true;
    wifi_config.sta.pmf_cfg.required = false;
    wifi_config.sta.scan_method = WIFI_FAST_SCAN;  // Fast scan mode
    wifi_config.sta.sort_method = WIFI_CONNECT_AP_BY_SIGNAL;  // Connect to strongest signal
    wifi_config.sta.threshold.rssi = -127;  // Accept any signal strength
    wifi_config.sta.channel = 0;  // Auto channel

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config));
    ESP_ERROR_CHECK(esp_wifi_start());

    g_wifi_initialized = true;

    ESP_LOGI(TAG, "WiFi initialized. Connecting to %s with static IP %s...", WIFI_SSID, CAMERA_STATIC_IP);
}

// Stop webserver and deinit WiFi (called when mic stops)
void stop_webserver_and_wifi()
{
    ESP_LOGI(TAG, "Stopping HTTP server and WiFi...");

    // Stop HTTP server
    if (g_server) {
        httpd_stop(g_server);
        g_server = nullptr;
        ESP_LOGI(TAG, "HTTP server stopped");
    }

    // Stop WiFi if initialized
    if (g_wifi_initialized) {
        esp_event_handler_unregister(WIFI_EVENT, ESP_EVENT_ANY_ID, &wifi_event_handler);
        esp_event_handler_unregister(IP_EVENT, IP_EVENT_STA_GOT_IP, &wifi_event_handler);

        esp_wifi_stop();
        esp_wifi_deinit();

        g_wifi_initialized = false;
        ESP_LOGI(TAG, "WiFi deinitialized");
    }

    // Destroy network interface to allow clean restart
    if (g_sta_netif) {
        esp_netif_destroy_default_wifi(g_sta_netif);
        g_sta_netif = nullptr;
        ESP_LOGI(TAG, "Network interface destroyed");
    }
}

// Call this from your main app to set references
void set_http_server_refs(who::standby::XiaoStandbyControl *standby,
                          who::recognition::WhoRecognition *recognition,
                          who::recognition::FaceDbReader *face_db_reader,
                          who::audio::I2SMicrophone *microphone,
                          who::frame_cap::WhoFrameCap *frame_cap)
{
    g_standby_ctrl = standby;
    g_recognition = recognition;
    g_face_db_reader = face_db_reader;
    g_microphone = microphone;
    g_frame_cap = frame_cap;
}