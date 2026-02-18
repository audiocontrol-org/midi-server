#!/bin/bash
# Build script for macOS MIDI Server installer
# Creates a signed and optionally notarized .pkg installer
# Bundles the CLI binary inside the Electron app

set -e

# Configuration
APP_NAME="MidiServer"
BUNDLE_ID="org.audiocontrol.midi-server"
APP_INSTALL_LOCATION="/Applications/AudioControl"
MIN_MACOS_VERSION="12.0"

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BUILD_DIR="$PROJECT_ROOT/build"
DASHBOARD_DIR="$PROJECT_ROOT/dashboard"
PKG_DIR="$PROJECT_ROOT/build/pkg"
STAGING_DIR="$PKG_DIR/staging"
RESOURCES_DIR="$SCRIPT_DIR/resources"
RELEASE_CONFIG_FILE="$SCRIPT_DIR/release.config.sh"
RELEASE_SECRETS_HELPER="$SCRIPT_DIR/release-secrets.sh"

if [ -f "$RELEASE_CONFIG_FILE" ]; then
    # shellcheck disable=SC1090
    source "$RELEASE_CONFIG_FILE"
fi
if [ -f "$RELEASE_SECRETS_HELPER" ]; then
    # shellcheck disable=SC1090
    source "$RELEASE_SECRETS_HELPER"
    load_release_secrets
fi

# Signing identities (set via environment or arguments)
DEVELOPER_ID_APP="${DEVELOPER_ID_APP:-}"
DEVELOPER_ID_INSTALLER="${DEVELOPER_ID_INSTALLER:-}"

# Notarization credentials (optional)
APPLE_ID="${APPLE_ID:-}"
APPLE_TEAM_ID="${APPLE_TEAM_ID:-}"
APPLE_APP_SPECIFIC_PASSWORD="${APPLE_APP_SPECIFIC_PASSWORD:-}"
NOTARY_WAIT_TIMEOUT="${NOTARY_WAIT_TIMEOUT:-20m}"
PRODUCTSIGN_TIMEOUT_SECONDS="${PRODUCTSIGN_TIMEOUT_SECONDS:-120}"
PRODUCTSIGN_USE_TIMESTAMP="${PRODUCTSIGN_USE_TIMESTAMP:-false}"
CODESIGN_USE_TIMESTAMP="${CODESIGN_USE_TIMESTAMP:-${PRODUCTSIGN_USE_TIMESTAMP:-false}}"
SIGN_KEYCHAIN="${SIGN_KEYCHAIN:-${KEYCHAIN_NAME:-}}"
CSC_NAME="${CSC_NAME:-}"
CSC_IDENTITY_AUTO_DISCOVERY="${CSC_IDENTITY_AUTO_DISCOVERY:-}"

if [ -z "$DEVELOPER_ID_APP" ] && [ -n "${DEVELOPER_ID_APP_DEFAULT:-}" ]; then
    DEVELOPER_ID_APP="$DEVELOPER_ID_APP_DEFAULT"
fi
if [ -z "$DEVELOPER_ID_INSTALLER" ] && [ -n "${DEVELOPER_ID_INSTALLER_DEFAULT:-}" ]; then
    DEVELOPER_ID_INSTALLER="$DEVELOPER_ID_INSTALLER_DEFAULT"
fi
if [ -z "$CSC_NAME" ] && [ -n "${CSC_NAME_DEFAULT:-}" ]; then
    CSC_NAME="$CSC_NAME_DEFAULT"
fi
if [ -z "$CSC_IDENTITY_AUTO_DISCOVERY" ] && [ -n "${CSC_IDENTITY_AUTO_DISCOVERY_DEFAULT:-}" ]; then
    CSC_IDENTITY_AUTO_DISCOVERY="$CSC_IDENTITY_AUTO_DISCOVERY_DEFAULT"
fi
if [ -z "$APPLE_TEAM_ID" ] && [ -n "${APPLE_TEAM_ID_DEFAULT:-}" ]; then
    APPLE_TEAM_ID="$APPLE_TEAM_ID_DEFAULT"
fi

export CSC_NAME
export CSC_IDENTITY_AUTO_DISCOVERY
export APPLE_TEAM_ID

# Flags
SKIP_BUILD=false
SKIP_SIGN=false
SKIP_NOTARIZE=false
VERSION=""

usage() {
    cat <<EOF
Usage: $0 [options]

Options:
    --version VERSION       Set package version (reads from VERSION file if not specified)
    --skip-build            Skip CMake and Electron build steps
    --skip-sign             Skip code signing (for testing)
    --skip-notarize         Skip notarization step
    --app-identity ID       Developer ID Application identity
    --installer-identity ID Developer ID Installer identity
    -h, --help              Show this help

Environment variables:
    DEVELOPER_ID_APP              Developer ID Application identity
    DEVELOPER_ID_INSTALLER        Developer ID Installer identity
    CSC_NAME                      electron-builder signing identity (short name)
    CSC_IDENTITY_AUTO_DISCOVERY   Set to false to force CSC_NAME usage
    APPLE_ID                      Apple ID for notarization
    APPLE_TEAM_ID                 Team ID for notarization
    APPLE_APP_SPECIFIC_PASSWORD   App-specific password for notarization
    NOTARY_WAIT_TIMEOUT           Timeout for notarytool --wait (default: 20m)
    PRODUCTSIGN_TIMEOUT_SECONDS   Timeout in seconds for productsign (default: 120)
    PRODUCTSIGN_USE_TIMESTAMP     Set to true to add --timestamp when running productsign
    CODESIGN_USE_TIMESTAMP        Set to true to add --timestamp when running codesign (defaults to PRODUCTSIGN_USE_TIMESTAMP)
    SIGN_KEYCHAIN                 Optional keychain name/path for codesign/productsign lookup
    
Defaults are loaded from packaging/macos/release.config.sh when present.
Encrypted notarization secrets are loaded from ~/.config/audiocontrol.org/midi-server/release.secrets.enc
when RELEASE_SECRETS_PASSWORD is set.
EOF
    exit 1
}

run_with_timeout() {
    local timeout_seconds="$1"
    shift
    perl -e 'my $t=shift @ARGV; alarm($t); exec @ARGV or die "exec failed: $!";' \
        "$timeout_seconds" "$@"
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

# Read version from VERSION file if not provided via argument
if [ -z "$VERSION" ]; then
    VERSION_FILE="$PROJECT_ROOT/VERSION"
    if [ -f "$VERSION_FILE" ]; then
        VERSION=$(cat "$VERSION_FILE" | tr -d '[:space:]')
        echo "Using version from VERSION file: $VERSION"
    else
        echo "Error: --version is required or VERSION file must exist"
        usage
    fi
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

echo "=== Building MIDI Server Installer v$VERSION ==="
echo "Project root: $PROJECT_ROOT"

# Sync version to package.json (single source of truth is VERSION file)
echo ""
echo "Syncing version $VERSION to dashboard/package.json..."
cd "$DASHBOARD_DIR"
npm pkg set version="$VERSION"

# Step 1: Build the CLI binary (needed before Electron build for bundling)
if [ "$SKIP_BUILD" = false ]; then
    echo ""
    echo "=== Step 1: Building MIDI HTTP Server (C++) ==="
    cd "$PROJECT_ROOT"
    cmake -B build -DCMAKE_BUILD_TYPE=Release -DCMAKE_OSX_DEPLOYMENT_TARGET="$MIN_MACOS_VERSION"
    cmake --build build --config Release
else
    echo ""
    echo "=== Step 1: Skipping C++ build (--skip-build) ==="
fi

# Verify CLI binary exists (electron-builder will bundle it)
CLI_BINARY="$BUILD_DIR/MidiHttpServer_artefacts/Release/MidiHttpServer"
if [ ! -f "$CLI_BINARY" ]; then
    echo "Error: CLI binary not found at $CLI_BINARY"
    exit 1
fi
echo "Found CLI binary: $CLI_BINARY"

# Step 2: Build the Electron app and update artifacts (dmg, zip, latest-mac.yml)
if [ "$SKIP_BUILD" = false ]; then
    echo ""
    echo "=== Step 2: Building Electron App + update artifacts ==="
    cd "$DASHBOARD_DIR"
    npm install
    npm run build:mac
else
    echo ""
    echo "=== Step 2: Skipping Electron build (--skip-build) ==="
fi

# Find the built Electron app
ELECTRON_APP_PATH=$(find "$DASHBOARD_DIR/dist" -name "*.app" -type d 2>/dev/null | head -1)
if [ -z "$ELECTRON_APP_PATH" ] || [ ! -d "$ELECTRON_APP_PATH" ]; then
    echo "Error: Electron app not found in $DASHBOARD_DIR/dist"
    exit 1
fi
echo "Found Electron app: $ELECTRON_APP_PATH"

# Verify CLI was bundled
BUNDLED_CLI="$ELECTRON_APP_PATH/Contents/Resources/bin/midi-http-server"
if [ ! -f "$BUNDLED_CLI" ]; then
    echo "Error: CLI binary not bundled in app at $BUNDLED_CLI"
    exit 1
fi
echo "CLI bundled at: $BUNDLED_CLI"

# Verify update artifacts for electron-updater
LATEST_MANIFEST=$(find "$DASHBOARD_DIR/dist" -name "latest-mac*.yml" -type f 2>/dev/null | head -1)
ZIP_ARTIFACT=$(find "$DASHBOARD_DIR/dist" -name "*-$VERSION*-mac.zip" -type f 2>/dev/null | head -1)
if [ -z "$ZIP_ARTIFACT" ]; then
    ZIP_ARTIFACT=$(find "$DASHBOARD_DIR/dist" -name "*-mac.zip" -type f 2>/dev/null | head -1)
fi
DMG_ARTIFACT=$(find "$DASHBOARD_DIR/dist" -name "*-$VERSION*.dmg" -type f 2>/dev/null | head -1)
if [ -z "$DMG_ARTIFACT" ]; then
    DMG_ARTIFACT=$(find "$DASHBOARD_DIR/dist" -name "*.dmg" -type f 2>/dev/null | head -1)
fi

if [ -z "$LATEST_MANIFEST" ] || [ ! -f "$LATEST_MANIFEST" ]; then
    echo "Error: latest-mac manifest not found in $DASHBOARD_DIR/dist"
    exit 1
fi
if [ -z "$ZIP_ARTIFACT" ] || [ ! -f "$ZIP_ARTIFACT" ]; then
    echo "Error: macOS zip update artifact not found in $DASHBOARD_DIR/dist"
    exit 1
fi
if [ -z "$DMG_ARTIFACT" ] || [ ! -f "$DMG_ARTIFACT" ]; then
    echo "Error: macOS dmg installer artifact not found in $DASHBOARD_DIR/dist"
    exit 1
fi

echo "Found update manifest: $LATEST_MANIFEST"
echo "Found update zip: $ZIP_ARTIFACT"
echo "Found installer dmg: $DMG_ARTIFACT"

# Step 3: Create staging directory
echo ""
echo "=== Step 3: Creating staging directory ==="
rm -rf "$PKG_DIR"
mkdir -p "$STAGING_DIR$APP_INSTALL_LOCATION"

# Copy Electron app (with bundled CLI)
cp -R "$ELECTRON_APP_PATH" "$STAGING_DIR$APP_INSTALL_LOCATION/"
STAGED_APP="$STAGING_DIR$APP_INSTALL_LOCATION/$(basename "$ELECTRON_APP_PATH")"
echo "Staged App: $STAGED_APP"

# Avoid AppleDouble metadata files (._*) in package payload; these can break
# code signature validation during notarization.
xattr -cr "$STAGED_APP" || true

# Step 4: Sign the app
if [ "$SKIP_SIGN" = false ]; then
    echo ""
    echo "=== Step 4: Signing App ==="

    CODESIGN_ARGS=(
        --sign "$DEVELOPER_ID_APP"
        --options runtime
        --entitlements "$SCRIPT_DIR/entitlements.plist"
        --force
    )
    if [ -n "$SIGN_KEYCHAIN" ]; then
        CODESIGN_ARGS+=(--keychain "$SIGN_KEYCHAIN")
    fi
    if [ "$CODESIGN_USE_TIMESTAMP" = true ]; then
        CODESIGN_ARGS+=(--timestamp)
    fi

    echo "Signing (keychain: ${SIGN_KEYCHAIN:-default}, timestamp: $CODESIGN_USE_TIMESTAMP)..."

    # Sign the bundled CLI binary
    echo "Signing bundled CLI..."
    codesign "${CODESIGN_ARGS[@]}" \
        "$STAGED_APP/Contents/Resources/bin/midi-http-server"

    # Sign the main app bundle (deep signs all nested components)
    echo "Signing app bundle..."
    codesign "${CODESIGN_ARGS[@]}" --deep \
        "$STAGED_APP"

    echo "Verifying signature..."
    codesign --verify --verbose=2 "$STAGED_APP"
else
    echo ""
    echo "=== Step 4: Skipping signing (--skip-sign) ==="
fi

# Step 5: Create installer package
echo ""
echo "=== Step 5: Creating installer package ==="

COMPONENT_PKG="$PKG_DIR/$APP_NAME-component.pkg"
COMPONENT_PLIST="$PKG_DIR/component.plist"

# Prevent AppleDouble files from being generated in package archives.
export COPYFILE_DISABLE=1

# Generate component plist directly so CI does not depend on pkgbuild --analyze.
cat > "$COMPONENT_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<array>
  <dict>
    <key>RootRelativeBundlePath</key>
    <string>$APP_NAME.app</string>
    <key>BundleIsRelocatable</key>
    <false/>
    <key>BundleIsVersionChecked</key>
    <true/>
    <key>BundleHasStrictIdentifier</key>
    <false/>
    <key>BundleOverwriteAction</key>
    <string>upgrade</string>
  </dict>
</array>
</plist>
EOF

echo "Running pkgbuild (unsigned component package)..."
pkgbuild \
    --root "$STAGING_DIR$APP_INSTALL_LOCATION" \
    --identifier "$BUNDLE_ID" \
    --version "$VERSION" \
    --install-location "$APP_INSTALL_LOCATION" \
    --component-plist "$COMPONENT_PLIST" \
    --scripts "$SCRIPT_DIR/scripts" \
    "$COMPONENT_PKG"
echo "Created: $COMPONENT_PKG"

# Step 6: Create distribution package
echo ""
echo "=== Step 6: Creating distribution package ==="

# Create simplified distribution.xml for single-app install
DIST_XML="$PKG_DIR/distribution.xml"
cat > "$DIST_XML" <<EOF
<?xml version="1.0" encoding="utf-8"?>
<installer-gui-script minSpecVersion="2">
    <title>MIDI Server</title>
    <organization>org.audiocontrol</organization>
    <domains enable_localSystem="true" enable_currentUserHome="false"/>
    <options customize="never" require-scripts="false" rootVolumeOnly="true"/>
    <volume-check>
        <allowed-os-versions>
            <os-version min="$MIN_MACOS_VERSION"/>
        </allowed-os-versions>
    </volume-check>
    <welcome file="welcome.html" mime-type="text/html"/>
    <conclusion file="conclusion.html" mime-type="text/html"/>
    <choices-outline>
        <line choice="default">
            <line choice="$BUNDLE_ID"/>
        </line>
    </choices-outline>
    <choice id="default"/>
    <choice id="$BUNDLE_ID" visible="false" title="MIDI Server">
        <pkg-ref id="$BUNDLE_ID"/>
    </choice>
    <pkg-ref id="$BUNDLE_ID" version="$VERSION" onConclusion="none">$APP_NAME-component.pkg</pkg-ref>
</installer-gui-script>
EOF

UNSIGNED_PKG="$PKG_DIR/$APP_NAME-$VERSION-unsigned.pkg"
FINAL_PKG="$PKG_DIR/$APP_NAME-$VERSION.pkg"

productbuild \
    --distribution "$DIST_XML" \
    --package-path "$PKG_DIR" \
    --resources "$RESOURCES_DIR" \
    "$UNSIGNED_PKG"

echo "Created: $UNSIGNED_PKG"

# Step 7: Sign the installer
if [ "$SKIP_SIGN" = false ]; then
    echo ""
    echo "=== Step 7: Signing installer ==="
    PRODUCTSIGN_ARGS=(
        --sign "$DEVELOPER_ID_INSTALLER"
    )
    if [ -n "$SIGN_KEYCHAIN" ]; then
        PRODUCTSIGN_ARGS+=(--keychain "$SIGN_KEYCHAIN")
    fi
    if [ "$PRODUCTSIGN_USE_TIMESTAMP" = true ]; then
        PRODUCTSIGN_ARGS+=(--timestamp)
    else
        PRODUCTSIGN_ARGS+=(--timestamp=none)
    fi
    PRODUCTSIGN_ARGS+=(
        "$UNSIGNED_PKG"
        "$FINAL_PKG"
    )

    echo "Running productsign (timeout: ${PRODUCTSIGN_TIMEOUT_SECONDS}s, timestamp: ${PRODUCTSIGN_USE_TIMESTAMP}, keychain: ${SIGN_KEYCHAIN:-default})..."
    echo "Package size: $(du -h "$UNSIGNED_PKG" | cut -f1)"
    echo "Command: productsign ${PRODUCTSIGN_ARGS[*]}"

    # Ensure keychain is unlocked and set as default for signing
    # Resolve to full path if needed
    if [ -n "$SIGN_KEYCHAIN" ]; then
        if [[ "$SIGN_KEYCHAIN" != /* ]]; then
            SIGN_KEYCHAIN_FULL="$HOME/Library/Keychains/$SIGN_KEYCHAIN"
            echo "Resolving keychain to full path: $SIGN_KEYCHAIN_FULL"
        else
            SIGN_KEYCHAIN_FULL="$SIGN_KEYCHAIN"
        fi

        echo "Unlocking keychain $SIGN_KEYCHAIN_FULL..."
        if [ -z "${KEYCHAIN_PASSWORD:-}" ]; then
            echo "WARNING: KEYCHAIN_PASSWORD is not set!"
        fi
        if security unlock-keychain -p "${KEYCHAIN_PASSWORD:-}" "$SIGN_KEYCHAIN_FULL"; then
            echo "Keychain unlocked successfully"
        else
            echo "ERROR: Failed to unlock keychain (exit code: $?)"
        fi
        security set-keychain-settings -t 3600 -u "$SIGN_KEYCHAIN_FULL" || echo "WARNING: set-keychain-settings failed"

        # Re-apply partition list to ensure productsign has access
        echo "Re-applying partition list..."
        if [ -n "${KEYCHAIN_PASSWORD:-}" ]; then
            security set-key-partition-list \
                -S apple-tool:,apple: \
                -s \
                -k "${KEYCHAIN_PASSWORD}" \
                "$SIGN_KEYCHAIN_FULL" 2>&1 || echo "WARNING: set-key-partition-list failed"
        else
            echo "WARNING: KEYCHAIN_PASSWORD not set, skipping partition list"
        fi

        echo "Keychain info:"
        security show-keychain-info "$SIGN_KEYCHAIN_FULL" 2>&1 || true

        # Update PRODUCTSIGN_ARGS to use full path
        PRODUCTSIGN_ARGS=()
        PRODUCTSIGN_ARGS+=(--sign "$DEVELOPER_ID_INSTALLER")
        PRODUCTSIGN_ARGS+=(--keychain "$SIGN_KEYCHAIN_FULL")
        if [ "$PRODUCTSIGN_USE_TIMESTAMP" = true ]; then
            PRODUCTSIGN_ARGS+=(--timestamp)
        else
            PRODUCTSIGN_ARGS+=(--timestamp=none)
        fi
        PRODUCTSIGN_ARGS+=("$UNSIGNED_PKG" "$FINAL_PKG")
    fi

    echo "Current keychain search list:"
    security list-keychains -d user
    echo "Default keychain:"
    security default-keychain
    echo "Listing signing identities..."
    security find-identity -v -p basic "$SIGN_KEYCHAIN" 2>/dev/null || security find-identity -v -p basic
    # Test key access before productsign
    echo "Testing private key access..."
    if security find-key -l "Developer ID Installer" "$SIGN_KEYCHAIN" 2>&1; then
        echo "Key found and accessible"
    else
        echo "WARNING: Could not find/access installer key"
    fi

    echo "Starting productsign at $(date)..."

    # Run productsign in background and monitor what it's doing
    productsign "${PRODUCTSIGN_ARGS[@]}" &
    PRODUCTSIGN_PID=$!
    echo "productsign started with PID: $PRODUCTSIGN_PID"

    MONITOR_INTERVAL=10
    ELAPSED=0
    while kill -0 "$PRODUCTSIGN_PID" 2>/dev/null; do
        if [ "$ELAPSED" -ge "$PRODUCTSIGN_TIMEOUT_SECONDS" ]; then
            echo "TIMEOUT: productsign exceeded ${PRODUCTSIGN_TIMEOUT_SECONDS}s, killing..."
            kill -9 "$PRODUCTSIGN_PID" 2>/dev/null || true
            exit 142
        fi

        sleep "$MONITOR_INTERVAL"
        ELAPSED=$((ELAPSED + MONITOR_INTERVAL))

        echo ""
        echo "=== productsign monitor (${ELAPSED}s elapsed) ==="
        echo "Process state:"
        ps -p "$PRODUCTSIGN_PID" -o pid,state,%cpu,%mem,etime,command 2>/dev/null || echo "  Process not found"

        echo "Network connections:"
        lsof -p "$PRODUCTSIGN_PID" -i 2>/dev/null | head -10 || echo "  None or not accessible"

        echo "Open files (sample):"
        lsof -p "$PRODUCTSIGN_PID" 2>/dev/null | grep -E "(REG|DIR)" | tail -5 || echo "  None or not accessible"

        echo "Child processes:"
        pgrep -P "$PRODUCTSIGN_PID" 2>/dev/null | while read cpid; do
            ps -p "$cpid" -o pid,state,%cpu,command 2>/dev/null
        done || echo "  None"

        # Check if output file is growing
        if [ -f "$FINAL_PKG" ]; then
            echo "Output file size: $(du -h "$FINAL_PKG" | cut -f1)"
        else
            echo "Output file not yet created"
        fi
    done

    # Check exit status
    wait "$PRODUCTSIGN_PID"
    PRODUCTSIGN_EXIT=$?
    echo "productsign completed at $(date) with exit code: $PRODUCTSIGN_EXIT"
    if [ "$PRODUCTSIGN_EXIT" -ne 0 ]; then
        echo "ERROR: productsign failed with exit code $PRODUCTSIGN_EXIT"
        exit "$PRODUCTSIGN_EXIT"
    fi

    rm "$UNSIGNED_PKG"

    echo "Verifying installer signature..."
    pkgutil --check-signature "$FINAL_PKG"
else
    echo ""
    echo "=== Step 7: Skipping installer signing (--skip-sign) ==="
    mv "$UNSIGNED_PKG" "$FINAL_PKG"
fi

# Step 8: Notarize
if [ "$SKIP_SIGN" = false ] && [ "$SKIP_NOTARIZE" = false ]; then
    if [ -n "$APPLE_ID" ] && [ -n "$APPLE_TEAM_ID" ] && [ -n "$APPLE_APP_SPECIFIC_PASSWORD" ]; then
        echo ""
        echo "=== Step 8: Notarizing installer ==="
        xcrun notarytool submit "$FINAL_PKG" \
            --apple-id "$APPLE_ID" \
            --team-id "$APPLE_TEAM_ID" \
            --password "$APPLE_APP_SPECIFIC_PASSWORD" \
            --timeout "$NOTARY_WAIT_TIMEOUT" \
            --wait

        echo "Stapling notarization ticket..."
        xcrun stapler staple "$FINAL_PKG"

        echo "Verifying notarization..."
        spctl --assess -vv --type install "$FINAL_PKG"
    else
        echo ""
        echo "=== Step 8: Skipping notarization (credentials not provided) ==="
    fi
else
    echo ""
    echo "=== Step 8: Skipping notarization ==="
fi

echo ""
echo "=== Build complete ==="
echo "Installer: $FINAL_PKG"
echo "Installs to: $APP_INSTALL_LOCATION/$APP_NAME.app"
echo "CLI available at: $APP_INSTALL_LOCATION/$APP_NAME.app/Contents/Resources/bin/midi-http-server"
ls -lh "$FINAL_PKG"
