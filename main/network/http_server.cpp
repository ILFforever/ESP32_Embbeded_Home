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
#include <cstring>

static const char *TAG = "HTTP_SERVER";

#define WIFI_SSID "ILFforever2"
#define WIFI_PASS "19283746"

// Global references
static who::standby::XiaoStandbyControl *g_standby_ctrl = nullptr;
static who::recognition::WhoRecognition *g_recognition = nullptr;
static who::recognition::FaceDbReader *g_face_db_reader = nullptr;

// Status page
static esp_err_t status_handler(httpd_req_t *req)
{
    int face_count = g_face_db_reader ? g_face_db_reader->get_face_count() : 0;

    char resp[1024];
    snprintf(resp, sizeof(resp),
        "<!DOCTYPE html><html><head><title>Doorbell Camera</title>"
        "<meta http-equiv='refresh' content='5'>"
        "<style>body{font-family:Arial;margin:20px;} .status{padding:10px;margin:10px;border:1px solid #ccc;} button{padding:10px;margin:5px;}</style>"
        "</head><body>"
        "<h1>Doorbell Camera Status</h1>"
        "<div class='status'><b>Power State:</b> %s</div>"
        "<div class='status'><b>Active Tasks:</b> %u</div>"
        "<div class='status'><b>Free Heap:</b> %lu bytes</div>"
        "<div class='status'><b>PSRAM Free:</b> %zu bytes</div>"
        "<div class='status'><b>Enrolled Faces:</b> %d</div>"
        "<h2>Controls</h2>"
        "<a href='/standby'><button>Enter Standby</button></a> "
        "<a href='/wake'><button>Wake Up</button></a> "
        "<a href='/enroll'><button>Enroll Face</button></a> "
        "<a href='/recognize'><button>Recognize</button></a>"
        "<h2>Face Database</h2>"
        "<a href='/face_count'><button>View Face Count</button></a> "
        "<a href='/face_list'><button>View Face List</button></a> "
        "<a href='/db_status'><button>Database Status</button></a>"
        "</body></html>",
        g_standby_ctrl ? g_standby_ctrl->get_power_state() : "UNKNOWN",
        uxTaskGetNumberOfTasks(),
        esp_get_free_heap_size(),
        heap_caps_get_free_size(MALLOC_CAP_SPIRAM),
        face_count
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

static httpd_handle_t start_webserver(void)
{
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.lru_purge_enable = true;
    
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
    esp_netif_create_default_wifi_sta();
    
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
    
    ESP_LOGI(TAG, "WiFi initialized. Connecting to %s...", WIFI_SSID);
}

// Call this from your main app to set references
void set_http_server_refs(who::standby::XiaoStandbyControl *standby,
                          who::recognition::WhoRecognition *recognition,
                          who::recognition::FaceDbReader *face_db_reader)
{
    g_standby_ctrl = standby;
    g_recognition = recognition;
    g_face_db_reader = face_db_reader;
}