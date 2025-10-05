// xiao_standby_control.hpp
#pragma once
#include "who_recognition.hpp"
#include "who_frame_cap.hpp"

namespace who
{
    namespace standby
    {

        // Complete standby/sleep control for XIAO ESP32-S3 Sense
        // Properly stops camera and all processing tasks to save power
        class XiaoStandbyControl
        {
        public:
            XiaoStandbyControl(recognition::WhoRecognition *recognition,
                               frame_cap::WhoFrameCap *frame_cap);
            ~XiaoStandbyControl();

            // ===== System Power State Control =====

            // Enter standby mode (stop camera, pause all tasks)
            bool enter_standby();

            // Exit standby mode (resume camera, resume all tasks)
            bool exit_standby();

            // Check if system is in standby
            bool is_standby() { return m_is_standby; }

            // ===== Status Queries =====

            // Get current power state as string
            const char *get_power_state();

        private:
            recognition::WhoRecognition *m_recognition;
            frame_cap::WhoFrameCap *m_frame_cap;
            bool m_is_standby;
            i2c_master_bus_handle_t m_i2c_bus_handle;
        };
    } // namespace standby
} // namespace who