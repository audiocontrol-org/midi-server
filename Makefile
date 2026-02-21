.PHONY: all build clean rebuild dist-macos dist-debian dist-source release release-commit publish docker-build

BUILD_DIR := build
BUILD_TYPE := Release
BINARY := $(BUILD_DIR)/MidiHttpServer_artefacts/$(BUILD_TYPE)/MidiHttpServer

# Package configuration - read version from VERSION file
VERSION_FILE := VERSION
ifeq ($(wildcard $(VERSION_FILE)),)
  $(error VERSION file not found. Create a VERSION file with a valid version number.)
endif
VERSION := $(shell cat $(VERSION_FILE) | tr -d '[:space:]')
ifeq ($(VERSION),)
  $(error VERSION file is empty. It must contain a valid version number.)
endif

# macOS installer (output from packaging/macos/build-installer.sh)
MACOS_PKG_DIR := $(BUILD_DIR)/pkg
MACOS_PKG_NAME := MidiServer-$(VERSION).pkg

# Linux distribution (output from Docker build)
LINUX_DIST_DIR := $(BUILD_DIR)/dist-linux

# Release configuration
RELEASE_DIR := $(BUILD_DIR)/release
SOURCE_TARBALL := midihttpserver-$(VERSION)-source.tar.gz
CHECKSUMS_FILE := SHA256SUMS

# Detect CPU count for parallel builds
NPROC := $(shell nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)

all: build

build: $(BUILD_DIR)/Makefile
	cmake --build $(BUILD_DIR) -j$(NPROC)

$(BUILD_DIR)/Makefile:
	cmake -B $(BUILD_DIR) -DCMAKE_BUILD_TYPE=$(BUILD_TYPE)

clean:
	rm -rf $(BUILD_DIR)

rebuild: clean build

# Build the Linux Docker image (x86_64)
docker-build:
	docker build --platform linux/amd64 -t midi-server-linux-builder:ubuntu22.04-amd64 packaging/linux/

# macOS distribution package (.pkg)
dist-macos:
	@if [ -z "$(RELEASE_SECRETS_PASSWORD)" ]; then \
		echo "Error: RELEASE_SECRETS_PASSWORD must be set for macOS signing"; \
		echo "This password decrypts the signing credentials in packaging/macos/"; \
		exit 1; \
	fi
	cd dashboard && npm run build:mac:installer

# Debian/Ubuntu distribution package (.deb) via Docker
# Works on macOS by building inside a Linux container
dist-debian:
	./packaging/linux/docker-build.sh --deb-only

# Source tarball
dist-source:
	@echo "Creating source tarball..."
	@mkdir -p $(RELEASE_DIR)
	git archive --format=tar.gz --prefix=midihttpserver-$(VERSION)/ HEAD > $(RELEASE_DIR)/$(SOURCE_TARBALL)
	@echo "Source tarball created: $(RELEASE_DIR)/$(SOURCE_TARBALL)"

# Create release commit and tag (assumes VERSION already updated)
release-commit:
	./packaging/macos/release-prepare.sh --version $(VERSION) --commit --tag

# Release target - builds all platform packages, then commits and tags
# Does NOT push or publish (use 'make publish' for that)
release: dist-macos dist-debian dist-source release-commit
	@echo ""
	@echo "=== Release $(VERSION) built and tagged ==="
	@echo ""
	@echo "Artifacts:"
	@echo "  macOS:  $(MACOS_PKG_DIR)/$(MACOS_PKG_NAME)"
	@echo "  Linux:  $(LINUX_DIST_DIR)/*.deb"
	@echo "  Source: $(RELEASE_DIR)/$(SOURCE_TARBALL)"
	@echo ""
	@echo "Run 'make publish' to push and publish to GitHub"

# Push and publish release to GitHub
publish:
	@echo "Pushing commits and tags..."
	git push && git push --tags
	@echo ""
	@echo "Publishing release to GitHub..."
	./packaging/macos/release-publish.sh --version $(VERSION)
