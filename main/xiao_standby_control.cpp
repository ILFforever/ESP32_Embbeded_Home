// xiao_standby_control.cpp
#include "xiao_standby_control.hpp"
#include "esp_log.h"
#include "esp_camera.h"
#include "driver/i2c_master.h"
#include "driver/gpio.h"

static const char *TAG = "StandbyCtrl";

static camera_config_t camera_config = {
    .pin_pwdn = -1,
    .pin_reset = -1,
    .pin_xclk = 10,
    .pin_sccb_sda = 40,
    .pin_sccb_scl = 39,

    .pin_d7 = 48,
    .pin_d6 = 11,
    .pin_d5 = 12,
    .pin_d4 = 14,
    .pin_d3 = 16,
    .pin_d2 = 18,
    .pin_d1 = 17,
    .pin_d0 = 15,
    .pin_vsync = 38,
    .pin_href = 47,
    .pin_pclk = 13,

    .xclk_freq_hz = 16000000,
    .ledc_timer = LEDC_TIMER_0,
    .ledc_channel = LEDC_CHANNEL_0,

    .pixel_format = PIXFORMAT_RGB565,
    .frame_size = FRAMESIZE_QVGA,
    .jpeg_quality = 12,
    .fb_count = 2,
    .fb_location = CAMERA_FB_IN_PSRAM,
    .grab_mode = CAMERA_GRAB_LATEST,
    .sccb_i2c_port = 1  // Use managed I2C port
};

namespace who
{
    namespace standby
    {

        XiaoStandbyControl::XiaoStandbyControl(recognition::WhoRecognition *recognition,
                                               frame_cap::WhoFrameCap *frame_cap)
            : m_recognition(recognition), m_frame_cap(frame_cap), m_is_standby(false), 
              m_i2c_bus_handle(nullptr)
        {
            ESP_LOGI(TAG, "Standby control initialized");
        }

        XiaoStandbyControl::~XiaoStandbyControl()
        {
            if (m_i2c_bus_handle) {
                i2c_del_master_bus(m_i2c_bus_handle);
            }
        }

        bool XiaoStandbyControl::enter_standby()
        {
            if (m_is_standby)
            {
                ESP_LOGW(TAG, "Already in standby mode");
                return true;
            }

            ESP_LOGI(TAG, "=== Entering Standby Mode ===");

            // Step 1: Pause recognition task
            ESP_LOGI(TAG, "Pausing recognition task...");
            if (m_recognition->get_recognition_task()->pause())
            {
                ESP_LOGI(TAG, "  ✓ Recognition task paused");
            }
            else
            {
                ESP_LOGW(TAG, "  ✗ Failed to pause recognition task");
            }

            // Step 2: Pause detection task
            ESP_LOGI(TAG, "Pausing detection task...");
            if (m_recognition->get_detect_task()->pause())
            {
                ESP_LOGI(TAG, "  ✓ Detection task paused");
            }
            else
            {
                ESP_LOGW(TAG, "  ✗ Failed to pause detection task");
            }

            // Step 3: Pause all frame capture nodes
            ESP_LOGI(TAG, "Pausing frame capture pipeline...");
            for (const auto &frame_cap_node : m_frame_cap->get_all_nodes())
            {
                if (frame_cap_node->pause())
                {
                    ESP_LOGI(TAG, "  ✓ %s paused", frame_cap_node->get_name().c_str());
                }
                else
                {
                    ESP_LOGW(TAG, "  ✗ Failed to pause %s", frame_cap_node->get_name().c_str());
                }
            }

            // Step 4: Deinitialize camera
            ESP_LOGI(TAG, "Shutting down camera...");
            esp_err_t err = esp_camera_deinit();
            if (err == ESP_OK)
            {
                ESP_LOGI(TAG, "  ✓ Camera powered down");
            }
            else
            {
                ESP_LOGE(TAG, "  ✗ Failed to deinit camera: %s", esp_err_to_name(err));
                return false;
            }

            // Step 5: Delete I2C bus
            if (m_i2c_bus_handle) {
                ESP_LOGI(TAG, "Deleting I2C bus...");
                esp_err_t i2c_err = i2c_del_master_bus(m_i2c_bus_handle);
                if (i2c_err == ESP_OK) {
                    ESP_LOGI(TAG, "  ✓ I2C bus deleted");
                    m_i2c_bus_handle = nullptr;
                } else {
                    ESP_LOGW(TAG, "  ✗ Failed to delete I2C bus: %s", esp_err_to_name(i2c_err));
                }
            }

            m_is_standby = true;
            ESP_LOGI(TAG, "=== Standby Mode Active ===");
            ESP_LOGI(TAG, "Power consumption minimized");

            return true;
        }

        bool XiaoStandbyControl::exit_standby()
        {
            if (!m_is_standby)
            {
                ESP_LOGW(TAG, "Not in standby mode");
                return true;
            }

            ESP_LOGI(TAG, "=== Exiting Standby Mode ===");

            // Step 1: Reinitialize I2C bus
            ESP_LOGI(TAG, "Reinitializing I2C bus...");
            i2c_master_bus_config_t i2c_bus_config = {
                .i2c_port = I2C_NUM_1,
                .sda_io_num = (gpio_num_t)40,
                .scl_io_num = (gpio_num_t)39,
                .clk_source = I2C_CLK_SRC_DEFAULT,
                .glitch_ignore_cnt = 7,
                .flags = {
                    .enable_internal_pullup = true,
                },
            };
            
            esp_err_t i2c_err = i2c_new_master_bus(&i2c_bus_config, &m_i2c_bus_handle);
            if (i2c_err != ESP_OK)
            {
                ESP_LOGE(TAG, "  ✗ Failed to create I2C bus: %s", esp_err_to_name(i2c_err));
                return false;
            }
            ESP_LOGI(TAG, "  ✓ I2C bus ready");

            // Step 2: Initialize camera
            ESP_LOGI(TAG, "Starting camera...");
            esp_err_t err = esp_camera_init(&camera_config);
            if (err != ESP_OK)
            {
                ESP_LOGE(TAG, "  ✗ Failed to init camera: %s", esp_err_to_name(err));
                return false;
            }
            ESP_LOGI(TAG, "  ✓ Camera started");

            // Small delay for camera to stabilize
            vTaskDelay(pdMS_TO_TICKS(100));

            // Step 3: Resume frame capture nodes
            ESP_LOGI(TAG, "Resuming frame capture pipeline...");
            for (const auto &frame_cap_node : m_frame_cap->get_all_nodes())
            {
                if (frame_cap_node->resume())
                {
                    ESP_LOGI(TAG, "  ✓ %s resumed", frame_cap_node->get_name().c_str());
                }
                else
                {
                    ESP_LOGW(TAG, "  ✗ Failed to resume %s", frame_cap_node->get_name().c_str());
                }
            }

            // Step 4: Resume detection task
            ESP_LOGI(TAG, "Resuming detection task...");
            if (m_recognition->get_detect_task()->resume())
            {
                ESP_LOGI(TAG, "  ✓ Detection task resumed");
            }
            else
            {
                ESP_LOGW(TAG, "  ✗ Failed to resume detection task");
            }

            // Step 5: Resume recognition task
            ESP_LOGI(TAG, "Resuming recognition task...");
            if (m_recognition->get_recognition_task()->resume())
            {
                ESP_LOGI(TAG, "  ✓ Recognition task resumed");
            }
            else
            {
                ESP_LOGW(TAG, "  ✗ Failed to resume recognition task");
            }

            m_is_standby = false;
            ESP_LOGI(TAG, "=== System Active ===");

            return true;
        }

        const char *XiaoStandbyControl::get_power_state()
        {
            return m_is_standby ? "STANDBY" : "ACTIVE";
        }

    } // namespace standby
} // namespace who