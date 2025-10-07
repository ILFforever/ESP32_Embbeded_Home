// xiao_recognition_button.hpp
#pragma once
#include "who_recognition.hpp"
#include "xiao_standby_control.hpp"

namespace who
{
    namespace button
    {

        // Complete control interface for XIAO ESP32-S3 Sense face recognition
        // Provides direct function calls to trigger recognition actions and control detection
        class XiaoRecognitionButton
        {
        public:
            XiaoRecognitionButton(recognition::WhoRecognitionCore *recognition,
                                  detect::WhoDetect *detect,
                                  standby::XiaoStandbyControl *standby = nullptr);
            ~XiaoRecognitionButton();

            // ===== Recognition Actions (one-shot operations) =====
            // These trigger once when next face is detected, then complete automatically

            // Trigger face recognition on next detected face
            void trigger_recognize();

            // Enroll the next detected face into the database
            void trigger_enroll();

            // Delete the last enrolled face from database
            void trigger_delete();

            // ===== Detection Control (continuous operation) =====
            // Control the underlying face detection task

            // Pause face detection (stops processing frames)
            bool pause_detection();

            // Resume face detection (continues processing frames)
            bool resume_detection();

            // ===== Status Checks =====

            // Check if recognition task is ready to accept commands
            bool is_ready();

            // Check if detection is currently running (not paused)
            bool is_detection_active();

            // ===== Standby/Sleep Control =====
            // Full system power management

            // Enter standby mode (camera off, all tasks paused)
            bool enter_standby();

            // Exit standby mode (camera on, all tasks resumed)
            bool exit_standby();

            // Check if system is in standby
            bool is_standby();

        private:
            recognition::WhoRecognitionCore *m_recognition_task;
            detect::WhoDetect *m_detect_task;
            standby::XiaoStandbyControl *m_standby_control;
        };

    } // namespace button
} // namespace who