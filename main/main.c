#include "frame_cap_pipeline.hpp"
#include "human_face_detect.hpp"
#include "who_detect_app_lcd.hpp"
#include "who_detect_app_term.hpp"
#include "driver/gpio.h"

using namespace who::frame_cap;
using namespace who::app;

static const char *TAG = "XIAO_FACE_DETECT";

#define LED_PIN GPIO_NUM_21

// Note: Camera configuration is now in who_s3_cam.cpp

void run_detect_term()
{
    ESP_LOGI(TAG, "Starting terminal face detection...");

#if CONFIG_IDF_TARGET_ESP32S3
    auto frame_cap = get_term_dvp_frame_cap_pipeline();
#elif CONFIG_IDF_TARGET_ESP32P4
    auto frame_cap = get_term_mipi_csi_frame_cap_pipeline();
#endif

    auto detect_app = new WhoDetectAppTerm(frame_cap);
    detect_app->set_model(new HumanFaceDetect());

    ESP_LOGI(TAG, "Face detection initialized, starting...");
    detect_app->run();
}

extern "C" void app_main(void)
{
    ESP_LOGI(TAG, "XIAO ESP32-S3 Sense - Face Detection Starting");
    ESP_LOGI(TAG, "CPU Cores: %d", CONFIG_FREERTOS_NUMBER_OF_CORES);

    gpio_config_t io_conf = {};
    io_conf.mode = GPIO_MODE_OUTPUT;
    io_conf.pin_bit_mask = (1ULL << LED_PIN);
    gpio_config(&io_conf);
    vTaskPrioritySet(xTaskGetCurrentTaskHandle(), 5);

#if CONFIG_HUMAN_FACE_DETECT_MODEL_IN_SDCARD
    ESP_ERROR_CHECK(bsp_sdcard_mount());
#endif

#ifdef BSP_BOARD_ESP32_S3_EYE
    ESP_ERROR_CHECK(bsp_leds_init());
    ESP_ERROR_CHECK(bsp_led_set(BSP_LED_GREEN, false));
#endif
    run_detect_term();
}