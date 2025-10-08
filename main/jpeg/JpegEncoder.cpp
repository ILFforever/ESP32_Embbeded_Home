#include "JpegEncoder.hpp"

RawJpegEncoder::RawJpegEncoder(int quality) : quality_(quality) {}

pixformat_t RawJpegEncoder::toPixFormat(PixelFormat fmt) const {
    switch(fmt) {
        case PixelFormat::RGB565:   return PIXFORMAT_RGB565;
        case PixelFormat::GRAYSCALE:return PIXFORMAT_GRAYSCALE;
        case PixelFormat::YUV422:   return PIXFORMAT_YUV422;
        default:                    return PIXFORMAT_RGB565;
    }
}

unsigned int RawJpegEncoder::encodeCallback(void *arg, size_t index, const void *data, size_t len) {
    auto *self = reinterpret_cast<RawJpegEncoder *>(arg);
    if (!data || len == 0) return 0;

    size_t old_size = self->buffer_.size();
    self->buffer_.resize(old_size + len);
    memcpy(self->buffer_.data() + old_size, data, len);

    return len;
}

bool RawJpegEncoder::encode(const uint8_t *src, size_t src_len, int width, int height, PixelFormat fmt) {
    if (!src || width <= 0 || height <= 0) return false;
    buffer_.clear();

    bool res = fmt2jpg_cb(
        const_cast<uint8_t*>(src),           // cast away const
        src_len,
        static_cast<uint16_t>(width),
        static_cast<uint16_t>(height),
        toPixFormat(fmt),
        static_cast<uint8_t>(quality_),
        &RawJpegEncoder::encodeCallback,     // static callback
        this
    );

    if (!res || buffer_.empty()) {
        ESP_LOGE(TAG, "JPEG encode failed");
        return false;
    }

    ESP_LOGD(TAG, "JPEG encoded: %zu bytes", buffer_.size());
    return true;
}
