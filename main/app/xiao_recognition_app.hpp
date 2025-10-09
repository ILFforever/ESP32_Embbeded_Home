#pragma once
#include "who_recognition_app_base.hpp"
#include "driver/gpio.h"
#include "recognition/face_manager.hpp"
#include "who_recognition_button.hpp"

#define LED_PIN GPIO_NUM_21

namespace who {
namespace app {

class XiaoRecognitionAppTerm : public WhoRecognitionAppBase {
public:
    XiaoRecognitionAppTerm(frame_cap::WhoFrameCap *frame_cap);
    ~XiaoRecognitionAppTerm();
    bool run() override;

    // Get the face manager instance
    recognition::FaceManager* get_face_manager() { return m_face_manager; }

    // Enroll a face with a custom name (wrapper that enrolls then renames)
    uint16_t enroll_face_with_name(const dl::image::img_t& img,
                                    const std::list<dl::detect::result_t>& detect_res,
                                    const std::string& name);

    // Set pending enrollment name (will auto-rename after next enrollment)
    void set_pending_enrollment_name(const std::string& name) { m_pending_enrollment_name = name; }

    // Clear pending enrollment name
    void clear_pending_enrollment_name() { m_pending_enrollment_name.clear(); }

protected:
    void recognition_result_cb(const std::string &result);
    void detect_result_cb(const detect::WhoDetect::result_t &result);

private:
    void init_led();
    recognition::FaceManager* m_face_manager;
    button::WhoRecognitionButton* m_recognition_button;
    std::string m_pending_enrollment_name;  // Name to auto-apply after enrollment
};

} // namespace app
} // namespace who