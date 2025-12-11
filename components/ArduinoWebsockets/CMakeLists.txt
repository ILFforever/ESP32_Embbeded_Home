# Collect all source files
file(GLOB_RECURSE srcs "src/*.cpp" "src/*.c")

idf_component_register(
    SRCS ${srcs}
    INCLUDE_DIRS "src"
    REQUIRES arduino
)
