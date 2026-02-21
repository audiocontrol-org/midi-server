.PHONY: all build clean rebuild

BUILD_DIR := build
BUILD_TYPE := Release
BINARY := $(BUILD_DIR)/MidiHttpServer_artefacts/$(BUILD_TYPE)/MidiHttpServer

all: build

build: $(BUILD_DIR)/Makefile
	cmake --build $(BUILD_DIR) -j$$(sysctl -n hw.ncpu)

$(BUILD_DIR)/Makefile:
	cmake -B $(BUILD_DIR) -DCMAKE_BUILD_TYPE=$(BUILD_TYPE)

clean:
	rm -rf $(BUILD_DIR)

rebuild: clean build
