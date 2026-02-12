cmake_minimum_required(VERSION 3.22)

project(MidiServer VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Fetch JUCE
include(FetchContent)

FetchContent_Declare(
    JUCE
    GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
    GIT_TAG 8.0.0
    GIT_SHALLOW TRUE
)

FetchContent_MakeAvailable(JUCE)

# MidiHttpServer executable
juce_add_console_app(MidiHttpServer
    PRODUCT_NAME "MIDI HTTP Server"
)

target_sources(MidiHttpServer PRIVATE
    src/MidiHttpServer.cpp
)

target_include_directories(MidiHttpServer PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/deps
    ${CMAKE_CURRENT_SOURCE_DIR}/src
)

target_compile_definitions(MidiHttpServer PRIVATE
    JUCE_USE_CURL=0
    JUCE_WEB_BROWSER=0
)

target_link_libraries(MidiHttpServer PRIVATE
    juce::juce_core
    juce::juce_audio_devices
    juce::juce_events
    juce::juce_recommended_config_flags
    juce::juce_recommended_warning_flags
)

# Platform-specific linking
if(APPLE)
    target_link_libraries(MidiHttpServer PRIVATE
        "-framework CoreMIDI"
        "-framework CoreAudio"
        "-framework CoreFoundation"
    )
elseif(UNIX)
    find_package(ALSA REQUIRED)
    target_link_libraries(MidiHttpServer PRIVATE
        ALSA::ALSA
        pthread
    )
elseif(WIN32)
    target_link_libraries(MidiHttpServer PRIVATE
        winmm
    )
endif()
