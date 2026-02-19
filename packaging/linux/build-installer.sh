#!/bin/bash
# Build script for Linux MIDI Server installer
# Creates DEB package and AppImage

set -e

# =============================================================================
# Configuration
# =============================================================================
APP_NAME="MidiServer"

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BUILD_DIR="$PROJECT_ROOT/build"
DASHBOARD_DIR="$PROJECT_ROOT/dashboard"
DIST_DIR="$DASHBOARD_DIR/dist"

# Flags
SKIP_BUILD=false
DEB_ONLY=false
APPIMAGE_ONLY=false
VERSION=""

# =============================================================================
# Usage
# =============================================================================
usage() {
    cat <<EOF
Usage: $0 [options]

Options:
    --version VERSION   Set package version (reads from VERSION file if not specified)
    --skip-build        Skip CMake and Electron build steps
    --deb-only          Build only DEB package (skip AppImage)
    --appimage-only     Build only AppImage (skip DEB)
    -h, --help          Show this help

Examples:
    $0                          # Build DEB and AppImage
    $0 --version 1.0.0          # Build specific version
    $0 --deb-only               # Build only DEB package
    $0 --skip-build             # Use existing build artifacts
EOF
    exit 1
}

# =============================================================================
# Parse Arguments
# =============================================================================
while [[ $# -gt 0 ]]; do
    case $1 in
        --version)
            VERSION="$2"
            shift 2
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --deb-only)
            DEB_ONLY=true
            shift
            ;;
        --appimage-only)
            APPIMAGE_ONLY=true
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo "Unknown option: $1"
            usage
            ;;
    esac
done

# =============================================================================
# Version Handling
# =============================================================================
if [ -z "$VERSION" ]; then
    VERSION_FILE="$PROJECT_ROOT/VERSION"
    if [ -f "$VERSION_FILE" ]; then
        VERSION=$(tr -d '[:space:]' < "$VERSION_FILE")
        echo "Using version from VERSION file: $VERSION"
    else
        echo "Error: --version is required or VERSION file must exist"
        usage
    fi
fi

echo "=== Building MIDI Server Linux Installer v$VERSION ==="
echo "Project root: $PROJECT_ROOT"

# Sync version to package.json
echo ""
echo "Syncing version $VERSION to dashboard/package.json..."
cd "$DASHBOARD_DIR"
npm pkg set version="$VERSION"

# =============================================================================
# Step 1: Build C++ CLI Binary
# =============================================================================
if [ "$SKIP_BUILD" = false ]; then
    echo ""
    echo "=== Step 1: Building MIDI HTTP Server (C++) ==="
    cd "$PROJECT_ROOT"
    cmake -B build -DCMAKE_BUILD_TYPE=Release
    cmake --build build --config Release
else
    echo ""
    echo "=== Step 1: Skipping C++ build (--skip-build) ==="
fi

# Verify CLI binary exists
CLI_BINARY="$BUILD_DIR/MidiHttpServer_artefacts/Release/MidiHttpServer"
if [ ! -f "$CLI_BINARY" ]; then
    echo "Error: CLI binary not found at $CLI_BINARY"
    echo "Run without --skip-build to build the CLI first."
    exit 1
fi
echo "Found CLI binary: $CLI_BINARY"

# =============================================================================
# Step 2: Build Electron App and Linux Packages
# =============================================================================
if [ "$SKIP_BUILD" = false ]; then
    echo ""
    echo "=== Step 2: Building Electron App + Linux packages ==="
    cd "$DASHBOARD_DIR"
    npm install

    # Determine which targets to build
    if [ "$DEB_ONLY" = true ]; then
        echo "Building DEB package only..."
        npm run build && npx electron-builder --linux deb
    elif [ "$APPIMAGE_ONLY" = true ]; then
        echo "Building AppImage only..."
        npm run build && npx electron-builder --linux AppImage
    else
        echo "Building DEB and AppImage..."
        npm run build:linux
    fi
else
    echo ""
    echo "=== Step 2: Skipping Electron build (--skip-build) ==="
fi

# =============================================================================
# Step 3: Verify Build Artifacts
# =============================================================================
echo ""
echo "=== Step 3: Verifying build artifacts ==="

# Find DEB package
if [ "$APPIMAGE_ONLY" = false ]; then
    DEB_FILE=$(find "$DIST_DIR" -name "*.deb" -type f 2>/dev/null | head -1)
    if [ -n "$DEB_FILE" ] && [ -f "$DEB_FILE" ]; then
        echo "Found DEB: $DEB_FILE"
        echo "  Size: $(ls -lh "$DEB_FILE" | awk '{print $5}')"

        # Show package info
        if command -v dpkg-deb >/dev/null 2>&1; then
            echo "  Package info:"
            dpkg-deb --info "$DEB_FILE" 2>/dev/null | grep -E "Package|Version|Architecture|Installed-Size" | sed 's/^/    /'
        fi
    else
        echo "Warning: DEB package not found in $DIST_DIR"
    fi
fi

# Find AppImage
if [ "$DEB_ONLY" = false ]; then
    APPIMAGE_FILE=$(find "$DIST_DIR" -name "*.AppImage" -type f 2>/dev/null | head -1)
    if [ -n "$APPIMAGE_FILE" ] && [ -f "$APPIMAGE_FILE" ]; then
        echo "Found AppImage: $APPIMAGE_FILE"
        echo "  Size: $(ls -lh "$APPIMAGE_FILE" | awk '{print $5}')"
    else
        echo "Warning: AppImage not found in $DIST_DIR"
    fi
fi

# =============================================================================
# Step 4: Generate Checksums
# =============================================================================
echo ""
echo "=== Step 4: Generating checksums ==="
cd "$DIST_DIR"

CHECKSUM_FILE="checksums-linux.sha256"
rm -f "$CHECKSUM_FILE"

for file in *.deb *.AppImage; do
    if [ -f "$file" ]; then
        sha256sum "$file" >> "$CHECKSUM_FILE"
        echo "  $file"
    fi
done

if [ -f "$CHECKSUM_FILE" ]; then
    echo "Checksums written to: $DIST_DIR/$CHECKSUM_FILE"
    cat "$CHECKSUM_FILE"
else
    echo "No artifacts found for checksums"
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "=== Build Complete ==="
echo "Artifacts location: $DIST_DIR"
echo ""
echo "To install DEB package:"
echo "  sudo apt install $DEB_FILE"
echo ""
echo "To run AppImage:"
echo "  chmod +x $APPIMAGE_FILE && $APPIMAGE_FILE"
