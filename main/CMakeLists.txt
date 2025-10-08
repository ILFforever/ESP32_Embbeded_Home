set(src_dirs ./ app control network uart spi)

set(include_dirs ./ app control network uart spi)

set(requires who_detect_app
             who_detect
             who_recognition_app
             who_spiflash_fatfs
             json
             esp_http_server
             nvs_flash
             esp_wifi
             esp_event
             esp_netif)

idf_component_register(SRC_DIRS ${src_dirs} 
                       INCLUDE_DIRS ${include_dirs} 
                       REQUIRES ${requires})

# Force C++ compilation
target_compile_options(${COMPONENT_LIB} PRIVATE -std=gnu++17)