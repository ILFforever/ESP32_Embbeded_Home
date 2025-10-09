#pragma once
#include "esp_camera.h"       // PIXFORMAT_*, pixformat_t
#include "esp_jpeg_enc.h"     // Hardware JPEG encoder from esp_new_jpeg
#include "img_converters.h"   // Software fallback encoder
#include "esp_log.h"
#include <vector>
#include <cstdint>
#include <cstring>

class RawJpegEncoder {
public:
    enum class PixelFormat {
        RGB565,
        RGB888,
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
    jpeg_enc_handle_t encoder_handle_;
    static constexpr const char *TAG = "RawJpegEncoder";

    // Convert PixelFormat to jpeg_pixel_format_t
    jpeg_pixel_format_t toJpegPixFormat(PixelFormat fmt) const;

    // Convert PixelFormat to pixformat_t for software encoder
    pixformat_t toPixFormat(PixelFormat fmt) const;

    // Software encoder callback
    static unsigned int encodeCallback(void *arg, size_t index, const void *data, size_t len);
};
