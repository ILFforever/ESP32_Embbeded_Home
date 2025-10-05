#include "xiao_recognition_app.hpp"
#include "esp_log.h"

static const char *TAG = "XiaoRecognition";

namespace who {
namespace app {

XiaoRecognitionAppTerm::XiaoRecognitionAppTerm(frame_cap::WhoFrameCap *frame_cap) 
    : WhoRecognitionAppTerm(frame_cap)
{
    init_led();
    
    // Override detection callback to add LED control
    auto detect_task = m_recognition->get_detect_task();
    detect_task->set_detect_result_cb(
        std::bind(&XiaoRecognitionAppTerm::detect_result_cb, this, std::placeholders::_1)
    );
}

void XiaoRecognitionAppTerm::init_led()
{
    gpio_config_t io_conf = {
        .pin_bit_mask = (1ULL << LED_PIN),
        .mode = GPIO_MODE_OUTPUT,
    };
    gpio_config(&io_conf);
    gpio_set_level(LED_PIN, 1);  // LED off (inverted)
    ESP_LOGI(TAG, "LED initialized on GPIO %d", LED_PIN);
}

void XiaoRecognitionAppTerm::detect_result_cb(const detect::WhoDetect::result_t &result)
{
    // Print detection details
    int i = 0;
    for (const auto &r : result.det_res) {
        ESP_LOGI(TAG, "Face %d: bbox[%.2f, %d, %d, %d, %d]", 
                 i, r.score, r.box[0], r.box[1], r.box[2], r.box[3]);
        
        if (!r.keypoint.empty()) {
            ESP_LOGI(TAG, "  Keypoints: left_eye[%d,%d] right_eye[%d,%d] nose[%d,%d]",
                     r.keypoint[0], r.keypoint[1],
                     r.keypoint[2], r.keypoint[3],
                     r.keypoint[4], r.keypoint[5]);
        }
        i++;
    }
    
    if (!result.det_res.empty()) {
        gpio_set_level(LED_PIN, 0);  // LED ON
    } else {
        gpio_set_level(LED_PIN, 1);  // LED OFF
    }
}

void XiaoRecognitionAppTerm::recognition_result_cb(const std::string &result)
{
    ESP_LOGI(TAG, "Recognition: %s", result.c_str());
}

} // namespace app
} // namespace who