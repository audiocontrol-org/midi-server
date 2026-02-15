#!/bin/bash
# Build script for macOS MIDI HTTP Server installer
# Creates a signed and optionally notarized .pkg installer

set -e

# Configuration
APP_NAME="midi-http-server"
BUNDLE_ID="com.audiocontrol.midi-http-server"
INSTALL_LOCATION="/usr/local/bin"
MIN_MACOS_VERSION="12.0"

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BUILD_DIR="$PROJECT_ROOT/build"
PKG_DIR="$PROJECT_ROOT/build/pkg"
STAGING_DIR="$PKG_DIR/staging"
RESOURCES_DIR="$SCRIPT_DIR/resources"
SCRIPTS_DIR="$SCRIPT_DIR/scripts"

# Signing identities (set via environment or arguments)
DEVELOPER_ID_APP="${DEVELOPER_ID_APP:-}"
DEVELOPER_ID_INSTALLER="${DEVELOPER_ID_INSTALLER:-}"

# Notarization credentials (optional)
APPLE_ID="${APPLE_ID:-}"
APPLE_TEAM_ID="${APPLE_TEAM_ID:-}"
APPLE_APP_SPECIFIC_PASSWORD="${APPLE_APP_SPECIFIC_PASSWORD:-}"

# Flags
SKIP_BUILD=false
SKIP_SIGN=false
SKIP_NOTARIZE=false
VERSION=""

usage() {
    cat <<EOF
Usage: $0 [options]

Options:
    --version VERSION       Set package version (required)
    --skip-build            Skip CMake build step
    --skip-sign             Skip code signing (for testing)
    --skip-notarize         Skip notarization step
    --app-identity ID       Developer ID Application identity
    --installer-identity ID Developer ID Installer identity
    -h, --help              Show this help

Environment variables:
    DEVELOPER_ID_APP              Developer ID Application identity
    DEVELOPER_ID_INSTALLER        Developer ID Installer identity
    APPLE_ID                      Apple ID for notarization
    APPLE_TEAM_ID                 Team ID for notarization
    APPLE_APP_SPECIFIC_PASSWORD   App-specific password for notarization
EOF
    exit 1
}

# Parse arguments
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
        --skip-sign)
            SKIP_SIGN=true
            shift
            ;;
        --skip-notarize)
            SKIP_NOTARIZE=true
            shift
            ;;
        --app-identity)
            DEVELOPER_ID_APP="$2"
            shift 2
            ;;
        --installer-identity)
            DEVELOPER_ID_INSTALLER="$2"
            shift 2
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

# Validate required arguments
if [ -z "$VERSION" ]; then
    echo "Error: --version is required"
    usage
fi

if [ "$SKIP_SIGN" = false ]; then
    if [ -z "$DEVELOPER_ID_APP" ]; then
        echo "Error: DEVELOPER_ID_APP or --app-identity is required for signing"
        exit 1
    fi
    if [ -z "$DEVELOPER_ID_INSTALLER" ]; then
        echo "Error: DEVELOPER_ID_INSTALLER or --installer-identity is required for signing"
        exit 1
    fi
fi

echo "=== Building MIDI HTTP Server Installer v$VERSION ==="
echo "Project root: $PROJECT_ROOT"

# Step 1: Build the project
if [ "$SKIP_BUILD" = false ]; then
    echo ""
    echo "=== Step 1: Building project ==="
    cd "$PROJECT_ROOT"
    cmake -B build -DCMAKE_BUILD_TYPE=Release -DCMAKE_OSX_DEPLOYMENT_TARGET="$MIN_MACOS_VERSION"
    cmake --build build --config Release
else
    echo ""
    echo "=== Step 1: Skipping build (--skip-build) ==="
fi

# Find the built binary
BINARY_PATH=$(find "$BUILD_DIR" -name "MidiHttpServer" -type f -perm +111 | head -1)
if [ -z "$BINARY_PATH" ] || [ ! -f "$BINARY_PATH" ]; then
    echo "Error: Built binary not found in $BUILD_DIR"
    exit 1
fi
echo "Found binary: $BINARY_PATH"

# Step 2: Create staging directory
echo ""
echo "=== Step 2: Creating staging directory ==="
rm -rf "$PKG_DIR"
mkdir -p "$STAGING_DIR$INSTALL_LOCATION"

# Copy and rename binary
cp "$BINARY_PATH" "$STAGING_DIR$INSTALL_LOCATION/$APP_NAME"
chmod +x "$STAGING_DIR$INSTALL_LOCATION/$APP_NAME"

echo "Staged: $STAGING_DIR$INSTALL_LOCATION/$APP_NAME"

# Step 3: Sign the binary
if [ "$SKIP_SIGN" = false ]; then
    echo ""
    echo "=== Step 3: Signing binary ==="
    codesign --sign "$DEVELOPER_ID_APP" \
        --options runtime \
        --entitlements "$SCRIPT_DIR/entitlements.plist" \
        --timestamp \
        --force \
        "$STAGING_DIR$INSTALL_LOCATION/$APP_NAME"

    echo "Verifying signature..."
    codesign --verify --verbose=2 "$STAGING_DIR$INSTALL_LOCATION/$APP_NAME"
else
    echo ""
    echo "=== Step 3: Skipping signing (--skip-sign) ==="
fi

# Step 4: Create component package
echo ""
echo "=== Step 4: Creating component package ==="
COMPONENT_PKG="$PKG_DIR/$APP_NAME.pkg"

pkgbuild \
    --root "$STAGING_DIR" \
    --identifier "$BUNDLE_ID" \
    --version "$VERSION" \
    --install-location "/" \
    --scripts "$SCRIPTS_DIR" \
    "$COMPONENT_PKG"

echo "Created: $COMPONENT_PKG"

# Step 5: Create distribution package
echo ""
echo "=== Step 5: Creating distribution package ==="

# Update version in distribution.xml
DIST_XML="$PKG_DIR/distribution.xml"
sed "s/version=\"0.0.0\"/version=\"$VERSION\"/" "$SCRIPT_DIR/distribution.xml" > "$DIST_XML"

UNSIGNED_PKG="$PKG_DIR/$APP_NAME-$VERSION-unsigned.pkg"
FINAL_PKG="$PKG_DIR/$APP_NAME-$VERSION.pkg"

productbuild \
    --distribution "$DIST_XML" \
    --package-path "$PKG_DIR" \
    --resources "$RESOURCES_DIR" \
    "$UNSIGNED_PKG"

echo "Created: $UNSIGNED_PKG"

# Step 6: Sign the installer
if [ "$SKIP_SIGN" = false ]; then
    echo ""
    echo "=== Step 6: Signing installer ==="
    productsign \
        --sign "$DEVELOPER_ID_INSTALLER" \
        --timestamp \
        "$UNSIGNED_PKG" \
        "$FINAL_PKG"

    rm "$UNSIGNED_PKG"

    echo "Verifying installer signature..."
    pkgutil --check-signature "$FINAL_PKG"
else
    echo ""
    echo "=== Step 6: Skipping installer signing (--skip-sign) ==="
    mv "$UNSIGNED_PKG" "$FINAL_PKG"
fi

# Step 7: Notarize
if [ "$SKIP_SIGN" = false ] && [ "$SKIP_NOTARIZE" = false ]; then
    if [ -n "$APPLE_ID" ] && [ -n "$APPLE_TEAM_ID" ] && [ -n "$APPLE_APP_SPECIFIC_PASSWORD" ]; then
        echo ""
        echo "=== Step 7: Notarizing installer ==="
        xcrun notarytool submit "$FINAL_PKG" \
            --apple-id "$APPLE_ID" \
            --team-id "$APPLE_TEAM_ID" \
            --password "$APPLE_APP_SPECIFIC_PASSWORD" \
            --wait

        echo "Stapling notarization ticket..."
        xcrun stapler staple "$FINAL_PKG"

        echo "Verifying notarization..."
        spctl --assess -vv --type install "$FINAL_PKG"
    else
        echo ""
        echo "=== Step 7: Skipping notarization (credentials not provided) ==="
    fi
else
    echo ""
    echo "=== Step 7: Skipping notarization ==="
fi

echo ""
echo "=== Build complete ==="
echo "Installer: $FINAL_PKG"
ls -lh "$FINAL_PKG"
