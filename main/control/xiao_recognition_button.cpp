// xiao_recognition_button.cpp
#include "xiao_recognition_button.hpp"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"

static const char *TAG = "XiaoButton";

namespace who {
namespace button {

XiaoRecognitionButton::XiaoRecognitionButton(recognition::WhoRecognitionCore *recognition,
                                             detect::WhoDetect *detect,
                                             standby::XiaoStandbyControl *standby)
    : m_recognition_task(recognition), m_detect_task(detect), m_standby_control(standby)
{
    ESP_LOGI(TAG, "XIAO Recognition Control initialized");
    ESP_LOGI(TAG, "Available actions:");
    ESP_LOGI(TAG, "  - trigger_recognize() : Recognize next face");
    ESP_LOGI(TAG, "  - trigger_enroll()    : Enroll next face");
    ESP_LOGI(TAG, "  - trigger_delete()    : Delete last enrolled face");
    ESP_LOGI(TAG, "  - pause_detection()   : Pause continuous detection");
    ESP_LOGI(TAG, "  - resume_detection()  : Resume continuous detection");
}

XiaoRecognitionButton::~XiaoRecognitionButton()
{
    // Nothing to clean up
}

bool XiaoRecognitionButton::is_ready()
{
    return m_recognition_task && m_recognition_task->is_active();
}

bool XiaoRecognitionButton::is_detection_active()
{
    return m_detect_task && m_detect_task->is_active();
}

void XiaoRecognitionButton::trigger_recognize()
{
    if (!is_ready()) {
        ESP_LOGW(TAG, "Recognition task not active");
        return;
    }
    
    xEventGroupSetBits(m_recognition_task->get_event_group(), 
                      recognition::WhoRecognitionCore::RECOGNIZE);
    ESP_LOGI(TAG, "Triggered: RECOGNIZE (will process next detected face)");
}

void XiaoRecognitionButton::trigger_enroll()
{
    if (!is_ready()) {
        ESP_LOGW(TAG, "Recognition task not active");
        return;
    }
    
    xEventGroupSetBits(m_recognition_task->get_event_group(), 
                      recognition::WhoRecognitionCore::ENROLL);
    ESP_LOGI(TAG, "Triggered: ENROLL (will enroll next detected face)");
}

void XiaoRecognitionButton::trigger_delete()
{
    if (!is_ready()) {
        ESP_LOGW(TAG, "Recognition task not active");
        return;
    }
    
    xEventGroupSetBits(m_recognition_task->get_event_group(), 
                      recognition::WhoRecognitionCore::DELETE);
    ESP_LOGI(TAG, "Triggered: DELETE (deleted last enrolled face)");
}

bool XiaoRecognitionButton::pause_detection()
{
    if (!m_detect_task) {
        ESP_LOGW(TAG, "Detect task not available");
        return false;
    }
    
    bool success = m_detect_task->pause();
    if (success) {
        ESP_LOGI(TAG, "Face detection PAUSED");
    } else {
        ESP_LOGW(TAG, "Failed to pause detection");
    }
    return success;
}

bool XiaoRecognitionButton::resume_detection()
{
    if (!m_detect_task) {
        ESP_LOGW(TAG, "Detect task not available");
        return false;
    }
    
    bool success = m_detect_task->resume();
    if (success) {
        ESP_LOGI(TAG, "Face detection RESUMED");
    } else {
        ESP_LOGW(TAG, "Failed to resume detection");
    }
    return success;
}

bool XiaoRecognitionButton::enter_standby()
{
    if (!m_standby_control) {
        ESP_LOGW(TAG, "Standby control not available");
        return false;
    }
    
    return m_standby_control->enter_standby();
}

bool XiaoRecognitionButton::exit_standby()
{
    if (!m_standby_control) {
        ESP_LOGW(TAG, "Standby control not available");
        return false;
    }
    
    return m_standby_control->exit_standby();
}

bool XiaoRecognitionButton::is_standby()
{
    if (!m_standby_control) {
        return false;
    }
    
    return m_standby_control->is_standby();
}

} // namespace button
} // namespace who