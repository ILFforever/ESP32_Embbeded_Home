#pragma once
#include "who_recognition_app_term.hpp"
#include "driver/gpio.h"

#define LED_PIN GPIO_NUM_21

namespace who {
namespace app {

class XiaoRecognitionAppTerm : public WhoRecognitionAppTerm {
public:
    XiaoRecognitionAppTerm(frame_cap::WhoFrameCap *frame_cap);
    
protected:
    void recognition_result_cb(const std::string &result) override;
    void detect_result_cb(const detect::WhoDetect::result_t &result);
    
private:
    void init_led();
};

} // namespace app
} // namespace who