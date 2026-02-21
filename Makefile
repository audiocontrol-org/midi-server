.PHONY: all build clean rebuild dist-macos dist-debian dist-source release

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
INSTALL_LOCATION := /usr/local/bin

# macOS installer (output from packaging/macos/build-installer.sh)
MACOS_PKG_DIR := $(BUILD_DIR)/pkg
MACOS_PKG_NAME := MidiServer-$(VERSION).pkg

# Debian package configuration
DEB_DIST_DIR := $(BUILD_DIR)/dist-debian
DEB_PKG_NAME := midihttpserver_$(VERSION)_amd64.deb
DEB_ARCH := amd64

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

# macOS distribution package (.pkg)
dist-macos:
	@if [ -z "$(RELEASE_SECRETS_PASSWORD)" ]; then \
		echo "Error: RELEASE_SECRETS_PASSWORD must be set for macOS signing"; \
		echo "This password decrypts the signing credentials in packaging/macos/"; \
		exit 1; \
	fi
	cd dashboard && npm run build:mac:installer

# Debian/Ubuntu distribution package (.deb)
dist-debian: build
	@echo "Creating Debian package..."
	@rm -rf $(DEB_DIST_DIR)
	@mkdir -p $(DEB_DIST_DIR)/package$(INSTALL_LOCATION)
	@mkdir -p $(DEB_DIST_DIR)/package/DEBIAN
	@cp $(BINARY) $(DEB_DIST_DIR)/package$(INSTALL_LOCATION)/
	@chmod 755 $(DEB_DIST_DIR)/package$(INSTALL_LOCATION)/MidiHttpServer
	@# Create control file
	@echo "Package: midihttpserver" > $(DEB_DIST_DIR)/package/DEBIAN/control
	@echo "Version: $(VERSION)" >> $(DEB_DIST_DIR)/package/DEBIAN/control
	@echo "Section: sound" >> $(DEB_DIST_DIR)/package/DEBIAN/control
	@echo "Priority: optional" >> $(DEB_DIST_DIR)/package/DEBIAN/control
	@echo "Architecture: $(DEB_ARCH)" >> $(DEB_DIST_DIR)/package/DEBIAN/control
	@echo "Depends: libasound2" >> $(DEB_DIST_DIR)/package/DEBIAN/control
	@echo "Maintainer: MIDI Server Team <support@example.com>" >> $(DEB_DIST_DIR)/package/DEBIAN/control
	@echo "Description: HTTP-to-MIDI bridge server" >> $(DEB_DIST_DIR)/package/DEBIAN/control
	@echo " A JUCE-based server that enables MIDI communication" >> $(DEB_DIST_DIR)/package/DEBIAN/control
	@echo " (especially SysEx) from HTTP clients." >> $(DEB_DIST_DIR)/package/DEBIAN/control
	@# Build the .deb package
	@echo "Building .deb package..."
	dpkg-deb --build --root-owner-group $(DEB_DIST_DIR)/package $(DEB_DIST_DIR)/$(DEB_PKG_NAME)
	@echo "Debian package created: $(DEB_DIST_DIR)/$(DEB_PKG_NAME)"

# Source tarball
dist-source:
	@echo "Creating source tarball..."
	@mkdir -p $(RELEASE_DIR)
	git archive --format=tar.gz --prefix=midihttpserver-$(VERSION)/ HEAD > $(RELEASE_DIR)/$(SOURCE_TARBALL)
	@echo "Source tarball created: $(RELEASE_DIR)/$(SOURCE_TARBALL)"

# Release target - builds all distribution assets
release: dist-macos dist-debian dist-source
	@echo "Assembling release assets..."
	@mkdir -p $(RELEASE_DIR)
	@cp $(MACOS_PKG_DIR)/$(MACOS_PKG_NAME) $(RELEASE_DIR)/
	@cp $(DEB_DIST_DIR)/$(DEB_PKG_NAME) $(RELEASE_DIR)/
	@echo "Generating checksums..."
	@cd $(RELEASE_DIR) && shasum -a 256 $(MACOS_PKG_NAME) $(DEB_PKG_NAME) $(SOURCE_TARBALL) > $(CHECKSUMS_FILE)
	@echo ""
	@echo "Release assets in $(RELEASE_DIR):"
	@ls -la $(RELEASE_DIR)
	@echo ""
	@cat $(RELEASE_DIR)/$(CHECKSUMS_FILE)
