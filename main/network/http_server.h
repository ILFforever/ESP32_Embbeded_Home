// http_server.h
#pragma once

#include "xiao_standby_control.hpp"
#include "who_recognition.hpp"
#include "recognition/face_db_reader.hpp"

#ifdef __cplusplus
extern "C" {
#endif

void init_wifi_and_server(void);

#ifdef __cplusplus
}
#endif

void set_http_server_refs(who::standby::XiaoStandbyControl *standby,
                          who::recognition::WhoRecognition *recognition,
                          who::recognition::FaceDbReader *face_db_reader);