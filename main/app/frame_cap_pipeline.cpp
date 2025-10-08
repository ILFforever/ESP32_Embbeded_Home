#include "frame_cap_pipeline.hpp"
#include "who_cam.hpp"

using namespace who::cam;
using namespace who::frame_cap;

// num of frames the model take to get result
#define MODEL_TIME 3
#define MODEL_INPUT_W 160
#define MODEL_INPUT_H 120


WhoFrameCap *get_dvp_frame_cap_pipeline()
{
    // The ringbuf_len of FetchNode equals cam_fb_count - 2. The WhoFetchNode fb will display on lcd, if you want to
    // make sure the displayed detection result is synced with the frame, the ringbuf size must be big enough to
    // cover the process time from now to the the detection result is ready. If the ring_buf_len is 3, the frame
    // which the disp task will display is 2 frames before than the frame which feeds into detection task. So the
    // detection task must finish within 2 frames, or the detect result will have a delay compared to the displayed
    // frame.
    framesize_t frame_size = FRAMESIZE_QQVGA; // Force 320x240 for Xiao
    //framesize_t frame_size = FRAMESIZE_QQVGA;  // Use 160x120 instead of QVGA (320x240) if camera keeps missing

#ifdef BSP_BOARD_ESP32_S3_KORVO_2
    auto cam = new WhoS3Cam(PIXFORMAT_RGB565, frame_size, MODEL_TIME + 3, true, true);
#else
    auto cam = new WhoS3Cam(PIXFORMAT_RGB565, frame_size, MODEL_TIME + 3);
#endif
    auto frame_cap = new WhoFrameCap();
    frame_cap->add_node<WhoFetchNode>("FrameCapFetch", cam);
    return frame_cap;
}

WhoFrameCap *get_term_dvp_frame_cap_pipeline()
{
    auto cam = new WhoS3Cam(PIXFORMAT_RGB565, FRAMESIZE_240X240, MODEL_TIME + 2);
    auto frame_cap = new WhoFrameCap();
    frame_cap->add_node<WhoFetchNode>("FrameCapFetch", cam);
    return frame_cap;
}
