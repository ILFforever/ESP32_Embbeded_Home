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

// Audio streaming handler - streams PCM audio data
static esp_err_t audio_stream_handler(httpd_req_t *req)
{
    // Try buffered microphone first, fall back to legacy
    if (!g_microphone || !g_microphone->is_running()) {
        httpd_resp_set_status(req, "503 Service Unavailable");
        httpd_resp_sendstr(req, "Microphone not running");
        return ESP_OK;
    }

    // Set headers for streaming audio with minimal buffering
    httpd_resp_set_type(req, "audio/pcm");
    httpd_resp_set_hdr(req, "Cache-Control", "no-cache, no-store, must-revalidate");
    httpd_resp_set_hdr(req, "Pragma", "no-cache");
    httpd_resp_set_hdr(req, "Expires", "0");
    httpd_resp_set_hdr(req, "Connection", "keep-alive");
    httpd_resp_set_hdr(req, "X-Accel-Buffering", "no");  // Disable nginx buffering if present

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
    uint32_t total_samples = 0;

    // Audio gain multiplier (2 = 2x volume, 4 = 4x volume, etc.)
    const int16_t gain = 4;  // Start with 4x gain

    // Stream audio chunks until client disconnects
    uint32_t read_attempts = 0;
    while (true) {
        // Check if microphone is still running before reading
        if (!g_microphone || !g_microphone->is_running()) {
            ESP_LOGI(TAG, "Microphone stopped, ending audio stream");
            break;
        }

        size_t bytes_read = 0;
        esp_err_t ret = g_microphone->read_audio(audio_buffer, chunk_size * sizeof(int16_t),
                                                   &bytes_read, 100);

        read_attempts++;

        // Debug logging for first few attempts
        if (read_attempts <= 10) {
            ESP_LOGI(TAG, "Read #%lu: ret=%s bytes=%zu", read_attempts,
                     esp_err_to_name(ret), bytes_read);
        }

        // Accept data even if we got a timeout, as long as we have some bytes
        // This handles the case where I2S returns partial data with ESP_ERR_TIMEOUT
        if (bytes_read > 0) {
            size_t samples_read = bytes_read / sizeof(int16_t);

            // Apply gain to boost volume
            for (size_t i = 0; i < samples_read; i++) {
                int32_t sample = audio_buffer[i] * gain;
                // Clamp to prevent overflow/distortion
                if (sample > 32767) sample = 32767;
                if (sample < -32768) sample = -32768;
                audio_buffer[i] = (int16_t)sample;
            }

            // Send audio chunk to client
            esp_err_t send_ret = httpd_resp_send_chunk(req, (const char*)audio_buffer,
                                                        samples_read * sizeof(int16_t));

            if (send_ret != ESP_OK) {
                ESP_LOGW(TAG, "Audio stream client disconnected or send failed");
                break;
            }

            sent_chunks++;
            total_samples += samples_read;

            // Log stats every 5 seconds (~78 chunks @ 1024 samples, 64ms each)
            if (sent_chunks % 78 == 0) {
                ESP_LOGI(TAG, "Audio stream stats: sent=%lu samples=%lu",
                         sent_chunks, total_samples);
            }

            // Yield periodically
            if (sent_chunks % 10 == 0) {
                vTaskDelay(pdMS_TO_TICKS(1));
            }
        } else if (ret == ESP_ERR_TIMEOUT) {
            // No data ready - wait a short time and retry
            vTaskDelay(pdMS_TO_TICKS(5));
            continue;
        } else if (ret != ESP_OK) {
            ESP_LOGW(TAG, "Failed to read audio: %s", esp_err_to_name(ret));
            vTaskDelay(pdMS_TO_TICKS(10));
            continue;
        }
    }

    ESP_LOGI(TAG, "Audio stream ended: sent=%lu chunks, %lu total samples, dropped=%lu",
             sent_chunks, total_samples, dropped_chunks);

    free(audio_buffer);

    // End chunked response
    httpd_resp_send_chunk(req, NULL, 0);

    return ESP_OK;
}

static httpd_handle_t start_webserver(void)
{
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.lru_purge_enable = true;
    config.max_uri_handlers = 3;   // Only need 2 handlers (/, /audio/stream) + margin
    config.stack_size = 6144;      // Reduced from 8192 (audio streaming uses less)
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

        // Audio streaming endpoint - the main feature
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
                          who::audio::I2SMicrophone *microphone)
{
    g_standby_ctrl = standby;
    g_recognition = recognition;
    g_face_db_reader = face_db_reader;
    g_microphone = microphone;
}