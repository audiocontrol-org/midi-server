.PHONY: all build clean rebuild dist-macos dist-debian dist-source release

BUILD_DIR := build
BUILD_TYPE := Release
BINARY := $(BUILD_DIR)/MidiHttpServer_artefacts/$(BUILD_TYPE)/MidiHttpServer

# Package configuration
VERSION := 1.0.0
INSTALL_LOCATION := /usr/local/bin

# macOS installer configuration
MACOS_DIST_DIR := $(BUILD_DIR)/dist-macos
MACOS_PKG_NAME := MidiHttpServer-$(VERSION).pkg

# Debian package configuration
DEB_DIST_DIR := $(BUILD_DIR)/dist-debian
DEB_PKG_NAME := midihttpserver_$(VERSION)_amd64.deb
DEB_ARCH := amd64

# Release configuration
RELEASE_DIR := $(BUILD_DIR)/release
SOURCE_TARBALL := midihttpserver-$(VERSION)-source.tar.gz
CHECKSUMS_FILE := SHA256SUMS

# Signing identities (set via environment or override on command line)
# Example: make dist-macos APP_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAM_ID)"
APP_SIGNING_IDENTITY ?= $(CODESIGN_IDENTITY)
INSTALLER_SIGNING_IDENTITY ?= $(PRODUCTSIGN_IDENTITY)

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
dist-macos: build
	@echo "Creating macOS installer..."
	@mkdir -p $(MACOS_DIST_DIR)/payload$(INSTALL_LOCATION)
	@cp $(BINARY) $(MACOS_DIST_DIR)/payload$(INSTALL_LOCATION)/
	@# Sign the binary if identity is provided
	@if [ -n "$(APP_SIGNING_IDENTITY)" ]; then \
		echo "Signing binary with: $(APP_SIGNING_IDENTITY)"; \
		codesign --force --options runtime --timestamp \
			--sign "$(APP_SIGNING_IDENTITY)" \
			$(MACOS_DIST_DIR)/payload$(INSTALL_LOCATION)/MidiHttpServer; \
	else \
		echo "Warning: APP_SIGNING_IDENTITY not set, skipping binary signing"; \
	fi
	@# Build the package
	@echo "Building package..."
	pkgbuild \
		--root $(MACOS_DIST_DIR)/payload \
		--identifier com.midiserver.httpserver \
		--version $(VERSION) \
		--install-location / \
		$(MACOS_DIST_DIR)/unsigned.pkg
	@# Sign the installer if identity is provided
	@if [ -n "$(INSTALLER_SIGNING_IDENTITY)" ]; then \
		echo "Signing installer with: $(INSTALLER_SIGNING_IDENTITY)"; \
		productsign --timestamp \
			--sign "$(INSTALLER_SIGNING_IDENTITY)" \
			$(MACOS_DIST_DIR)/unsigned.pkg \
			$(MACOS_DIST_DIR)/$(MACOS_PKG_NAME); \
		rm $(MACOS_DIST_DIR)/unsigned.pkg; \
	else \
		echo "Warning: INSTALLER_SIGNING_IDENTITY not set, skipping installer signing"; \
		mv $(MACOS_DIST_DIR)/unsigned.pkg $(MACOS_DIST_DIR)/$(MACOS_PKG_NAME); \
	fi
	@echo "Installer created: $(MACOS_DIST_DIR)/$(MACOS_PKG_NAME)"

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
	@cp $(MACOS_DIST_DIR)/$(MACOS_PKG_NAME) $(RELEASE_DIR)/
	@cp $(DEB_DIST_DIR)/$(DEB_PKG_NAME) $(RELEASE_DIR)/
	@echo "Generating checksums..."
	@cd $(RELEASE_DIR) && shasum -a 256 $(MACOS_PKG_NAME) $(DEB_PKG_NAME) $(SOURCE_TARBALL) > $(CHECKSUMS_FILE)
	@echo ""
	@echo "Release assets in $(RELEASE_DIR):"
	@ls -la $(RELEASE_DIR)
	@echo ""
	@cat $(RELEASE_DIR)/$(CHECKSUMS_FILE)
