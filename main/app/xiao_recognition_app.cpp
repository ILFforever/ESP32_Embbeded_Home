#include "xiao_recognition_app.hpp"
#include "human_face_detect.hpp"
#include "who_yield2idle.hpp"
#include "esp_log.h"

static const char *TAG = "XiaoRecognition";

namespace who {
namespace app {

XiaoRecognitionAppTerm::XiaoRecognitionAppTerm(frame_cap::WhoFrameCap *frame_cap)
    : WhoRecognitionAppBase(frame_cap), m_uart(nullptr)
{
    init_led();

    // Use native ESP-WHO HumanFaceRecognizer
    char db_path[64];
#if CONFIG_DB_FATFS_FLASH
    snprintf(db_path, sizeof(db_path), "/spiflash/face.db");
#elif CONFIG_DB_SPIFFS
    snprintf(db_path, sizeof(db_path), "%s/face.db", CONFIG_BSP_SPIFFS_MOUNT_POINT);
#else
    snprintf(db_path, sizeof(db_path), "/spiffs/face.db");
#endif

    // Create native ESP-WHO recognizer
    auto recognizer = new HumanFaceRecognizer(db_path);

    // Set recognizer and model
    m_recognition->set_recognizer(recognizer);
    m_recognition->set_detect_model(new HumanFaceDetect());

    // Set recognition result callback
    auto recognition_task = m_recognition->get_recognition_task();
    recognition_task->set_recognition_result_cb(
        std::bind(&XiaoRecognitionAppTerm::recognition_result_cb, this, std::placeholders::_1));

    // Set detection callback to add LED control
    auto detect_task = m_recognition->get_detect_task();
    detect_task->set_detect_result_cb(
        std::bind(&XiaoRecognitionAppTerm::detect_result_cb, this, std::placeholders::_1)
    );

    // DON'T create ESP-WHO physical button handler - XIAO doesn't have these buttons
    // and floating GPIO pins cause spurious ENROLL/DELETE events
    // Use UART commands or XiaoRecognitionButton instead
    m_recognition_button = nullptr;
}

XiaoRecognitionAppTerm::~XiaoRecognitionAppTerm()
{
    if (m_recognition_button) {
        delete m_recognition_button;
    }
}

bool XiaoRecognitionAppTerm::run()
{
    bool ret = WhoYield2Idle::get_instance()->run();
    for (const auto &frame_cap_node : m_frame_cap->get_all_nodes()) {
        ret &= frame_cap_node->run(4096, 2, 0);
    }
    ret &= m_recognition->get_detect_task()->run(3584, 2, 1);
    ret &= m_recognition->get_recognition_task()->run(3584, 2, 1);
    return ret;
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
        // ESP_LOGI(TAG, "Face %d: bbox[%.2f, %d, %d, %d, %d]",
        //          i, r.score, r.box[0], r.box[1], r.box[2], r.box[3]);

        // if (!r.keypoint.empty()) {
        //     ESP_LOGI(TAG, "  Keypoints: left_eye[%d,%d] right_eye[%d,%d] nose[%d,%d]",
        //              r.keypoint[0], r.keypoint[1],
        //              r.keypoint[2], r.keypoint[3],
        //              r.keypoint[4], r.keypoint[5]);
        // }

        // Send detection metadata to LCD via UART
        if (m_uart && i == 0) {  // Only send first face to avoid spam
            cJSON* det_data = cJSON_CreateObject();
            cJSON_AddNumberToObject(det_data, "face_count", (int)result.det_res.size());
            cJSON_AddNumberToObject(det_data, "score", r.score);
            cJSON_AddNumberToObject(det_data, "bbox_x", r.box[0]);
            cJSON_AddNumberToObject(det_data, "bbox_y", r.box[1]);
            cJSON_AddNumberToObject(det_data, "bbox_w", r.box[2]);
            cJSON_AddNumberToObject(det_data, "bbox_h", r.box[3]);

            if (!r.keypoint.empty()) {
                cJSON* keypoints = cJSON_CreateObject();
                cJSON_AddNumberToObject(keypoints, "left_eye_x", r.keypoint[0]);
                cJSON_AddNumberToObject(keypoints, "left_eye_y", r.keypoint[1]);
                cJSON_AddNumberToObject(keypoints, "right_eye_x", r.keypoint[2]);
                cJSON_AddNumberToObject(keypoints, "right_eye_y", r.keypoint[3]);
                cJSON_AddNumberToObject(keypoints, "nose_x", r.keypoint[4]);
                cJSON_AddNumberToObject(keypoints, "nose_y", r.keypoint[5]);
                cJSON_AddItemToObject(det_data, "keypoints", keypoints);
            }

            char* json_str = cJSON_PrintUnformatted(det_data);
            if (json_str) {
                m_uart->send_event("face_detected", json_str);
                free(json_str);
            }
            cJSON_Delete(det_data);
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

void XiaoRecognitionAppTerm::restore_detection_callback()
{
    auto detect_task = m_recognition->get_detect_task();
    detect_task->set_detect_result_cb(
        std::bind(&XiaoRecognitionAppTerm::detect_result_cb, this, std::placeholders::_1)
    );
    ESP_LOGI(TAG, "Detection callback restored");
}

void XiaoRecognitionAppTerm::reinitialize_recognizer()
{
    ESP_LOGI(TAG, "Reinitializing recognizer after database reset");

    // Determine database path based on configuration
    char db_path[64];
#if CONFIG_DB_FATFS_FLASH
    snprintf(db_path, sizeof(db_path), "/spiflash/face.db");
#elif CONFIG_DB_SPIFFS
    snprintf(db_path, sizeof(db_path), "%s/face.db", CONFIG_BSP_SPIFFS_MOUNT_POINT);
#else
    snprintf(db_path, sizeof(db_path), "/spiffs/face.db");
#endif

    // Create fresh recognizer instance
    // This will create a new database file on first enrollment
    auto recognizer = new HumanFaceRecognizer(db_path);

    // Set the new recognizer (this replaces the old one)
    m_recognition->set_recognizer(recognizer);

    ESP_LOGI(TAG, "Recognizer reinitialized successfully");
}

} // namespace app
} // namespace who