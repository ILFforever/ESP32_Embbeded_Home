#include "JpegEncoder.hpp"

RawJpegEncoder::RawJpegEncoder(int quality) : quality_(quality), encoder_handle_(nullptr) {
    ESP_LOGI(TAG, "JPEG encoder ready (quality=%d, HW for YUV/GRAY, SW for RGB565)", quality);
}

jpeg_pixel_format_t RawJpegEncoder::toJpegPixFormat(PixelFormat fmt) const {
    switch(fmt) {
        case PixelFormat::RGB565:   return JPEG_PIXEL_FORMAT_RGB565_LE;
        case PixelFormat::RGB888:   return JPEG_PIXEL_FORMAT_BGR888;  // fmt2rgb888 outputs BGR
        case PixelFormat::GRAYSCALE:return JPEG_PIXEL_FORMAT_GRAY;
        case PixelFormat::YUV422:   return JPEG_PIXEL_FORMAT_YCbYCr;
        default:                    return JPEG_PIXEL_FORMAT_BGR888;
    }
}

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

    // Convert RGB565 to RGB888 for hardware encoder
    uint8_t* rgb888_buf = nullptr;
    if (fmt == PixelFormat::RGB565) {
        // Allocate RGB888 buffer (3 bytes per pixel)
        size_t rgb888_size = width * height * 3;
        rgb888_buf = (uint8_t*)malloc(rgb888_size);
        if (!rgb888_buf) {
            ESP_LOGE(TAG, "Failed to allocate RGB888 buffer");
            return false;
        }

        // Convert RGB565 to RGB888
        bool conv_ok = fmt2rgb888(const_cast<uint8_t*>(src), src_len, PIXFORMAT_RGB565,
                                   rgb888_buf);
        if (!conv_ok) {
            ESP_LOGE(TAG, "RGB565->RGB888 conversion failed");
            free(rgb888_buf);
            return false;
        }

        // Update pointers for hardware encoder
        // fmt2rgb888 outputs BGR888, so we keep it as-is
        src = rgb888_buf;
        src_len = rgb888_size;
        fmt = PixelFormat::RGB888;  // Will use BGR888 encoder format
    }

    // Use hardware encoder for YUV422 and GRAYSCALE
    jpeg_enc_config_t enc_config = DEFAULT_JPEG_ENC_CONFIG();
    enc_config.width = width;
    enc_config.height = height;
    enc_config.src_type = toJpegPixFormat(fmt);
    enc_config.subsampling = JPEG_SUBSAMPLE_420;
    enc_config.quality = quality_;
    enc_config.rotate = JPEG_ROTATE_0D;
    enc_config.task_enable = false;

    jpeg_enc_handle_t encoder = nullptr;
    jpeg_error_t ret = jpeg_enc_open(&enc_config, &encoder);
    if (ret != JPEG_ERR_OK) {
        ESP_LOGE(TAG, "Failed to open HW JPEG encoder: %d", ret);
        return false;
    }

    int max_output_size = width * height * 2;
    buffer_.resize(max_output_size);

    int output_size = 0;
    ret = jpeg_enc_process(encoder, src, src_len, buffer_.data(), max_output_size, &output_size);
    jpeg_enc_close(encoder);

    if (ret != JPEG_ERR_OK) {
        ESP_LOGE(TAG, "Hardware JPEG encode failed: %d", ret);
        buffer_.clear();
        return false;
    }

    buffer_.resize(output_size);
    ESP_LOGD(TAG, "Hardware JPEG encoded: %d bytes", output_size);

    // Free temporary RGB888 buffer if we allocated it
    if (rgb888_buf) {
        free(rgb888_buf);
    }

    return true;
}
