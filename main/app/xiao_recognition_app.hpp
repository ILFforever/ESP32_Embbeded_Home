#pragma once
#include "who_recognition_app_base.hpp"
#include "driver/gpio.h"
#include "who_recognition_button.hpp"
#include "uart/uart_comm.hpp"

#define LED_PIN GPIO_NUM_21

namespace who {
namespace app {

class XiaoRecognitionAppTerm : public WhoRecognitionAppBase {
public:
    XiaoRecognitionAppTerm(frame_cap::WhoFrameCap *frame_cap);
    ~XiaoRecognitionAppTerm();
    bool run() override;

    // Restore detection callback (public wrapper for fixing detection after enroll/recognize)
    void restore_detection_callback();

    // Reinitialize the recognizer (use after database deletion)
    void reinitialize_recognizer();

    // Set UART comm for sending detection events
    void set_uart_comm(uart::UartComm* uart) { m_uart = uart; }

protected:
    void recognition_result_cb(const std::string &result);
    void detect_result_cb(const detect::WhoDetect::result_t &result);

private:
    void init_led();
    button::WhoRecognitionButton* m_recognition_button;
    uart::UartComm* m_uart;
};

} // namespace app
} // namespace who