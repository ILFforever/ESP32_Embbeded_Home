// xiao_standby_control.hpp
#pragma once
#include "who_recognition.hpp"
#include "who_frame_cap.hpp"

namespace who
{
    namespace standby
    {

        // Complete standby/power-saving control for XIAO ESP32-S3 Sense
        // Destroys all recognition tasks and shuts down camera hardware
        class XiaoStandbyControl
        {
        public:
            XiaoStandbyControl(recognition::WhoRecognition *recognition,
                               frame_cap::WhoFrameCap *frame_cap);
            ~XiaoStandbyControl();

            // ===== System Power State Control =====

            // Enter standby mode (destroy tasks, shutdown camera)
            bool enter_standby();

            // Exit standby mode (restart camera, recreate tasks)
            bool exit_standby();

            // Check if system is in standby
            bool is_standby() { return m_is_standby; }

            // ===== Status Queries =====

            // Get current power state as string
            const char *get_power_state();

            // Print power consumption statistics
            void print_power_stats();

        private:
            recognition::WhoRecognition *m_recognition;
            frame_cap::WhoFrameCap *m_frame_cap;
            bool m_is_standby;
        };
    } // namespace standby
} // namespace who