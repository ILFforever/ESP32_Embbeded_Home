set(src_dirs ./ app control network uart spi jpeg recognition audio backend)

set(include_dirs ./ app control network uart spi jpeg recognition audio backend)

set(requires who_detect_app
             who_detect
             who_recognition_app
             who_spiflash_fatfs
             human_face_recognition
             json
             esp_http_server
             esp_http_client
             nvs_flash
             esp_wifi
             esp_event
             esp_netif
             esp_new_jpeg
             arduino
             ArduinoWebsockets)

idf_component_register(SRC_DIRS ${src_dirs} 
                       INCLUDE_DIRS ${include_dirs} 
                       REQUIRES ${requires})

# Force C++ compilation (C++20 required for esp-dl v3.2.0)
target_compile_options(${COMPONENT_LIB} PRIVATE -std=gnu++20)