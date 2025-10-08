#pragma once
#include "esp_camera.h"       // PIXFORMAT_*, pixformat_t
#include "img_converters.h"   // fmt2jpg_cb
#include "esp_log.h"
#include <vector>
#include <cstdint>
#include <cstring>

class RawJpegEncoder {
public:
    enum class PixelFormat {
        RGB565,
        GRAYSCALE,
        YUV422,
    };

    explicit RawJpegEncoder(int quality = 80);

    // Encode raw frame data to JPEG
    // Returns true on success
    bool encode(const uint8_t *src, size_t src_len, int width, int height, PixelFormat fmt);

    const uint8_t* data() const { return buffer_.data(); }
    size_t size() const { return buffer_.size(); }

private:
    int quality_;
    std::vector<uint8_t> buffer_;
    static constexpr const char *TAG = "RawJpegEncoder";

    // Convert PixelFormat to ESP-WHO pixformat_t
    pixformat_t toPixFormat(PixelFormat fmt) const;

    // Static callback matching fmt2jpg_cb signature
    static unsigned int encodeCallback(void *arg, size_t index, const void *data, size_t len);
};
