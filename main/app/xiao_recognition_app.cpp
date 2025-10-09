#include "xiao_recognition_app.hpp"
#include "human_face_detect.hpp"
#include "who_yield2idle.hpp"
#include "esp_log.h"

static const char *TAG = "XiaoRecognition";

namespace who {
namespace app {

XiaoRecognitionAppTerm::XiaoRecognitionAppTerm(frame_cap::WhoFrameCap *frame_cap)
    : WhoRecognitionAppBase(frame_cap)
{
    init_led();

    // Create FaceManager with SPIFFS paths (XIAO ESP32-S3 Sense uses SPIFFS only)
    char db_path[64];
    char names_path[64];
#if CONFIG_DB_SPIFFS
    snprintf(db_path, sizeof(db_path), "%s/face.db", CONFIG_BSP_SPIFFS_MOUNT_POINT);
    snprintf(names_path, sizeof(names_path), "%s/face_names.json", CONFIG_BSP_SPIFFS_MOUNT_POINT);
#else
    // Default to /spiffs if config not set
    snprintf(db_path, sizeof(db_path), "/spiffs/face.db");
    snprintf(names_path, sizeof(names_path), "/spiffs/face_names.json");
#endif

    m_face_manager = new recognition::FaceManager(db_path, names_path);

    // Set recognizer and model
    m_recognition->set_recognizer(m_face_manager->get_recognizer());
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

    // Create button handler
    m_recognition_button = button::get_recognition_button(
        button::recognition_button_type_t::PHYSICAL, recognition_task);
}

XiaoRecognitionAppTerm::~XiaoRecognitionAppTerm()
{
    delete m_recognition_button;
    delete m_face_manager;
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

uint16_t XiaoRecognitionAppTerm::enroll_face_with_name(const dl::image::img_t& img,
                                                       const std::list<dl::detect::result_t>& detect_res,
                                                       const std::string& name)
{
    // Use FaceManager's enroll_face which handles naming
    return m_face_manager->enroll_face(img, detect_res, name);
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

    // Check if this is an enrollment result and we have a pending name
    if (!m_pending_enrollment_name.empty() && result.find("enrolled") != std::string::npos) {
        // Extract the ID from the result string (format: "id: X enrolled.")
        size_t id_pos = result.find("id: ");
        if (id_pos != std::string::npos) {
            size_t num_start = id_pos + 4;
            size_t num_end = result.find(" ", num_start);
            if (num_end != std::string::npos) {
                std::string id_str = result.substr(num_start, num_end - num_start);
                uint16_t face_id = (uint16_t)std::stoi(id_str);

                // Auto-rename the face
                esp_err_t ret = m_face_manager->rename_face(face_id, m_pending_enrollment_name);
                if (ret == ESP_OK) {
                    ESP_LOGI(TAG, "Auto-renamed face ID %d to '%s'", face_id, m_pending_enrollment_name.c_str());
                } else {
                    ESP_LOGW(TAG, "Failed to auto-rename face ID %d", face_id);
                }

                // Clear the pending name
                m_pending_enrollment_name.clear();
            }
        }
    }
}

} // namespace app
} // namespace who