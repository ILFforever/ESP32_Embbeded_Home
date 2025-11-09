// http_server.h
#pragma once

#include "xiao_standby_control.hpp"
#include "who_recognition.hpp"
#include "recognition/face_db_reader.hpp"
#include "i2s_microphone.hpp"
#include "who_frame_cap.hpp"

#ifdef __cplusplus
extern "C" {
#endif

void init_wifi_and_server(void);
void stop_webserver_and_wifi(void);

#ifdef __cplusplus
}
#endif

void set_http_server_refs(who::standby::XiaoStandbyControl *standby,
                          who::recognition::WhoRecognition *recognition,
                          who::recognition::FaceDbReader *face_db_reader,
                          who::audio::I2SMicrophone *microphone,
                          who::frame_cap::WhoFrameCap *frame_cap);