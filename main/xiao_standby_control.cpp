// xiao_standby_control.cpp
#include "xiao_standby_control.hpp"
#include "esp_log.h"
#include "who_yield2idle.hpp"

static const char *TAG = "StandbyCtrl";

namespace who
{
    namespace standby
    {

        XiaoStandbyControl::XiaoStandbyControl(recognition::WhoRecognition *recognition,
                                               frame_cap::WhoFrameCap *frame_cap)
            : m_recognition(recognition), m_frame_cap(frame_cap), m_is_standby(false)
        {
            ESP_LOGI(TAG, "Standby control initialized");
        }

        XiaoStandbyControl::~XiaoStandbyControl()
        {
        }

        bool XiaoStandbyControl::enter_standby()
        {
            if (m_is_standby)
            {
                ESP_LOGW(TAG, "Already in standby mode");
                return true;
            }

            ESP_LOGI(TAG, "=== Entering Standby Mode ===");

            // Step 1: Pause frame capture pipeline FIRST (stops feeding frames to detection)
            ESP_LOGI(TAG, "Pausing frame capture pipeline...");
            for (const auto &frame_cap_node : m_frame_cap->get_all_nodes())
            {
                if (frame_cap_node->pause())
                {
                    ESP_LOGI(TAG, "  ✓ %s paused", frame_cap_node->get_name().c_str());
                }
                else
                {
                    ESP_LOGW(TAG, "  ✗ Failed to pause %s", frame_cap_node->get_name().c_str());
                }
            }

            // Step 2: Stop WhoYield2Idle monitor (required before shutting down tasks)
            ESP_LOGI(TAG, "Stopping WhoYield2Idle monitor...");
            who::WhoYield2Idle::get_instance()->stop();
            ESP_LOGI(TAG, "  ✓ WhoYield2Idle stopped");

            // Step 3: Shutdown recognition system (clean API)
            ESP_LOGI(TAG, "Shutting down recognition system...");
            m_recognition->shutdown();
            ESP_LOGI(TAG, "  ✓ Recognition system shut down");

            // Step 4: Stop frame capture nodes (this will trigger camera deinit in WhoS3Cam destructor when stopped)
            ESP_LOGI(TAG, "Stopping frame capture nodes...");
            for (const auto &frame_cap_node : m_frame_cap->get_all_nodes())
            {
                if (frame_cap_node->stop())
                {
                    ESP_LOGI(TAG, "  ✓ %s stopped", frame_cap_node->get_name().c_str());
                }
                else
                {
                    ESP_LOGW(TAG, "  ✗ Failed to stop %s", frame_cap_node->get_name().c_str());
                }
            }

            m_is_standby = true;
            ESP_LOGI(TAG, "=== Standby Mode Active ===");
            ESP_LOGI(TAG, "All systems shut down - maximum power savings");

            return true;
        }

        bool XiaoStandbyControl::exit_standby()
        {
            if (!m_is_standby)
            {
                ESP_LOGW(TAG, "Not in standby mode");
                return true;
            }

            ESP_LOGI(TAG, "=== Exiting Standby Mode ===");

            // Step 1: Restart WhoYield2Idle monitor
            ESP_LOGI(TAG, "Restarting WhoYield2Idle monitor...");
            if (who::WhoYield2Idle::get_instance()->run())
            {
                ESP_LOGI(TAG, "  ✓ WhoYield2Idle restarted");
            }
            else
            {
                ESP_LOGE(TAG, "  ✗ Failed to restart WhoYield2Idle");
                return false;
            }

            // Step 2: Restart frame capture nodes (this will trigger camera re-init)
            ESP_LOGI(TAG, "Restarting frame capture nodes...");
            for (const auto &frame_cap_node : m_frame_cap->get_all_nodes())
            {
                // Frame capture nodes need same parameters as initial start
                if (frame_cap_node->run(4096, 2, 0))
                {
                    ESP_LOGI(TAG, "  ✓ %s restarted", frame_cap_node->get_name().c_str());
                }
                else
                {
                    ESP_LOGE(TAG, "  ✗ Failed to restart %s", frame_cap_node->get_name().c_str());
                    return false;
                }
            }

            // Small delay for camera to stabilize after reinit
            vTaskDelay(pdMS_TO_TICKS(300));

            // Step 3: Restart recognition system (clean API)
            ESP_LOGI(TAG, "Restarting recognition system...");
            if (!m_recognition->restart())
            { 
                ESP_LOGE(TAG, "  ✗ Failed to restart recognition system");
                return false;
            }
            ESP_LOGI(TAG, "  ✓ Recognition system restarted");

            m_is_standby = false;
            ESP_LOGI(TAG, "=== System Active ===");

            return true;
        }

        const char *XiaoStandbyControl::get_power_state()
        {
            return m_is_standby ? "STANDBY" : "ACTIVE";
        }

        void XiaoStandbyControl::print_power_stats()
        {
            ESP_LOGI(TAG, "=== Power Statistics ===");
            ESP_LOGI(TAG, "State: %s", get_power_state());
            ESP_LOGI(TAG, "Active Tasks: %d", uxTaskGetNumberOfTasks());
            ESP_LOGI(TAG, "Free Heap: %d bytes (%.1f%%)",
                     esp_get_free_heap_size(),
                     (float)esp_get_free_heap_size() / esp_get_minimum_free_heap_size() * 100);
            ESP_LOGI(TAG, "Free PSRAM: %d bytes",
                     heap_caps_get_free_size(MALLOC_CAP_SPIRAM));
        }

    } // namespace standby
} // namespace who
