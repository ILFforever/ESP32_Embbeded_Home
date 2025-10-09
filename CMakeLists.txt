# The following lines of boilerplate have to be in your project's
# CMakeLists in this exact order for cmake to work correctly
cmake_minimum_required(VERSION 3.5)

set(ESP_WHO_PATH C:/Users/Asus/esp/v5.5.1/esp-idf/components/esp-who)

set(EXTRA_COMPONENT_DIRS ${ESP_WHO_PATH}/components/who_task
                         ${ESP_WHO_PATH}/components/who_peripherals/who_usb
                         ${ESP_WHO_PATH}/components/who_peripherals/who_cam
                         ${ESP_WHO_PATH}/components/who_peripherals/who_lcd
                         ${ESP_WHO_PATH}/components/who_frame_cap
                         ${ESP_WHO_PATH}/components/who_frame_lcd_disp
                         ${ESP_WHO_PATH}/components/who_detect
                         ${ESP_WHO_PATH}/components/who_app/who_detect_app
                         ${ESP_WHO_PATH}/components/who_recognition
                         ${ESP_WHO_PATH}/components/who_app/who_recognition_app
                         ${ESP_WHO_PATH}/components/who_peripherals/who_spiflash_fatfs)

 set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_compile_options(-fdiagnostics-color=always)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
idf_build_set_property(DEPENDENCIES_LOCK dependencies.lock.${IDF_TARGET})
idf_build_set_property(COMPILE_OPTIONS "-O0" APPEND)
project(doorbell_camera)
