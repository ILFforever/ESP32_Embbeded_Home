// who_spi_send_node.hpp - Custom frame capture node for SPI transmission
#pragma once
#include "who_frame_cap_node.hpp"
#include "spi/slave_spi.hpp"
#include "esp_jpeg_enc.h"
#include "esp_log.h"

namespace who {
namespace frame_cap {

/**
 * Custom frame capture node that intercepts camera frames and sends them via SPI
 * This node sits in the pipeline and passes frames through while also sending to SPI
 */
class WhoSpiSendNode : public WhoFrameCapNode {
public:
    WhoSpiSendNode(const std::string &name,
                   uint8_t ringbuf_len = 2,
                   uint8_t jpeg_quality = 80,
                   bool out_queue_overwrite = true);
    ~WhoSpiSendNode();

    uint16_t get_fb_width() override;
    uint16_t get_fb_height() override;
    std::string get_type() override { return "SpiSendNode"; }

    void set_enabled(bool enabled) { m_enabled = enabled; }
    bool is_enabled() const { return m_enabled; }

private:
    void cleanup() override;
    who::cam::cam_fb_t *process(who::cam::cam_fb_t *fb) override;
    void update_ringbuf(who::cam::cam_fb_t *fb) override;

    bool encode_and_send_frame(who::cam::cam_fb_t *fb);

    jpeg_enc_handle_t m_jpeg_encoder;
    uint8_t m_jpeg_quality;
    uint16_t m_frame_counter;
    bool m_enabled;
    static const char *TAG;
};

} // namespace frame_cap
} // namespace who
