#pragma once
#include "who_recognition_app_base.hpp"
#include "driver/gpio.h"
#include "who_recognition_button.hpp"
#include "uart/uart_comm.hpp"
#include "recognition/face_db_reader.hpp"

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

    // Set face DB reader for getting names
    void set_face_db_reader(recognition::FaceDbReader* reader) { m_face_db_reader = reader; }

protected:
    void recognition_result_cb(const std::string &result);
    void detect_result_cb(const detect::WhoDetect::result_t &result);

private:
    void init_led();
    button::WhoRecognitionButton* m_recognition_button;
    uart::UartComm* m_uart;
    recognition::FaceDbReader* m_face_db_reader;
};

} // namespace app
} // namespace who