#!/bin/bash

set -euo pipefail

APP_NAME="MidiServer"
BUNDLE_ID="org.audiocontrol.midi-server.probe"
APP_INSTALL_LOCATION="/Applications/AudioControl"
MIN_MACOS_VERSION="12.0"

DEVELOPER_ID_APP="${DEVELOPER_ID_APP:-}"
DEVELOPER_ID_INSTALLER="${DEVELOPER_ID_INSTALLER:-}"
PRODUCTSIGN_TIMEOUT_SECONDS="${PRODUCTSIGN_TIMEOUT_SECONDS:-180}"
PRODUCTSIGN_USE_TIMESTAMP="${PRODUCTSIGN_USE_TIMESTAMP:-false}"
PROBE_SIGN_TARGET="${PROBE_SIGN_TARGET:-distribution}"
PROBE_USE_COMPONENT_PLIST="${PROBE_USE_COMPONENT_PLIST:-true}"
PROBE_PAYLOAD_TYPE="${PROBE_PAYLOAD_TYPE:-app}"
PROBE_RUN_PRODUCTBUILD="${PROBE_RUN_PRODUCTBUILD:-true}"

if [ -z "$DEVELOPER_ID_INSTALLER" ]; then
    echo "Error: DEVELOPER_ID_INSTALLER is required." >&2
    exit 1
fi
if [ "$PROBE_PAYLOAD_TYPE" = "app" ] && [ -z "$DEVELOPER_ID_APP" ]; then
    echo "Error: DEVELOPER_ID_APP is required when PROBE_PAYLOAD_TYPE=app." >&2
    exit 1
fi

if [ "$PROBE_SIGN_TARGET" != "distribution" ] && [ "$PROBE_SIGN_TARGET" != "component" ]; then
    echo "Error: PROBE_SIGN_TARGET must be 'distribution' or 'component'." >&2
    exit 1
fi
if [ "$PROBE_USE_COMPONENT_PLIST" != "true" ] && [ "$PROBE_USE_COMPONENT_PLIST" != "false" ]; then
    echo "Error: PROBE_USE_COMPONENT_PLIST must be 'true' or 'false'." >&2
    exit 1
fi
if [ "$PROBE_PAYLOAD_TYPE" != "app" ] && [ "$PROBE_PAYLOAD_TYPE" != "flat" ]; then
    echo "Error: PROBE_PAYLOAD_TYPE must be 'app' or 'flat'." >&2
    exit 1
fi
if [ "$PROBE_RUN_PRODUCTBUILD" != "true" ] && [ "$PROBE_RUN_PRODUCTBUILD" != "false" ]; then
    echo "Error: PROBE_RUN_PRODUCTBUILD must be 'true' or 'false'." >&2
    exit 1
fi

run_with_timeout() {
    local timeout_seconds="$1"
    shift
    perl -e 'my $t=shift @ARGV; alarm($t); exec @ARGV or die "exec failed: $!";' \
        "$timeout_seconds" "$@"
}

WORK_DIR="${RUNNER_TEMP:-/tmp}/installer-package-probe"
PKG_DIR="$WORK_DIR/pkg"
STAGING_DIR="$PKG_DIR/staging"
RESOURCES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/resources"

COMPONENT_PLIST="$PKG_DIR/component.plist"
COMPONENT_PKG="$PKG_DIR/$APP_NAME-component.pkg"
DIST_XML="$PKG_DIR/distribution.xml"
UNSIGNED_PKG="$PKG_DIR/$APP_NAME-probe-unsigned.pkg"
FINAL_PKG="$PKG_DIR/$APP_NAME-probe.pkg"

echo "==> Preparing probe payload (type: ${PROBE_PAYLOAD_TYPE})"
rm -rf "$WORK_DIR"
if [ "$PROBE_PAYLOAD_TYPE" = "app" ]; then
    mkdir -p "$STAGING_DIR$APP_INSTALL_LOCATION/$APP_NAME.app/Contents/Resources/bin"
    mkdir -p "$STAGING_DIR$APP_INSTALL_LOCATION/$APP_NAME.app/Contents/MacOS"

    cat > "$STAGING_DIR$APP_INSTALL_LOCATION/$APP_NAME.app/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key>
  <string>org.audiocontrol.midi-server.probe</string>
  <key>CFBundleName</key>
  <string>MidiServer</string>
  <key>CFBundleExecutable</key>
  <string>MidiServer</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleVersion</key>
  <string>0.0.0</string>
  <key>CFBundleShortVersionString</key>
  <string>0.0.0</string>
</dict>
</plist>
EOF

    cat > "$STAGING_DIR$APP_INSTALL_LOCATION/$APP_NAME.app/Contents/MacOS/MidiServer" <<EOF
#!/bin/bash
exit 0
EOF
    chmod +x "$STAGING_DIR$APP_INSTALL_LOCATION/$APP_NAME.app/Contents/MacOS/MidiServer"

    cat > "$STAGING_DIR$APP_INSTALL_LOCATION/$APP_NAME.app/Contents/Resources/bin/midi-http-server" <<EOF
#!/bin/bash
echo "probe"
EOF
    chmod +x "$STAGING_DIR$APP_INSTALL_LOCATION/$APP_NAME.app/Contents/Resources/bin/midi-http-server"
    xattr -cr "$STAGING_DIR$APP_INSTALL_LOCATION/$APP_NAME.app" || true

    echo "==> Signing dummy app payload"
    codesign --sign "$DEVELOPER_ID_APP" \
        --options runtime \
        --timestamp \
        --force \
        "$STAGING_DIR$APP_INSTALL_LOCATION/$APP_NAME.app/Contents/Resources/bin/midi-http-server"
    codesign --sign "$DEVELOPER_ID_APP" \
        --options runtime \
        --timestamp \
        --force \
        --deep \
        "$STAGING_DIR$APP_INSTALL_LOCATION/$APP_NAME.app"
    codesign --verify --verbose=2 "$STAGING_DIR$APP_INSTALL_LOCATION/$APP_NAME.app"
else
    mkdir -p "$STAGING_DIR/usr/local/share/midi-server-probe"
    cat > "$STAGING_DIR/usr/local/share/midi-server-probe/README.txt" <<EOF
MIDI Server probe payload.
EOF
fi

echo "==> Creating component plist"
mkdir -p "$PKG_DIR"
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

echo "==> Running pkgbuild (unsigned component package)"
PKGBUILD_ROOT="$STAGING_DIR$APP_INSTALL_LOCATION"
PKGBUILD_INSTALL_LOCATION="$APP_INSTALL_LOCATION"
if [ "$PROBE_PAYLOAD_TYPE" = "flat" ]; then
    PKGBUILD_ROOT="$STAGING_DIR"
    PKGBUILD_INSTALL_LOCATION="/"
fi

if [ "$PROBE_PAYLOAD_TYPE" = "app" ] && [ "$PROBE_USE_COMPONENT_PLIST" = true ]; then
    pkgbuild \
        --root "$PKGBUILD_ROOT" \
        --identifier "$BUNDLE_ID" \
        --version "0.0.0" \
        --install-location "$PKGBUILD_INSTALL_LOCATION" \
        --component-plist "$COMPONENT_PLIST" \
        "$COMPONENT_PKG"
else
    pkgbuild \
        --root "$PKGBUILD_ROOT" \
        --identifier "$BUNDLE_ID" \
        --version "0.0.0" \
        --install-location "$PKGBUILD_INSTALL_LOCATION" \
        "$COMPONENT_PKG"
fi

echo "==> Running productbuild"
if [ "$PROBE_RUN_PRODUCTBUILD" = true ]; then
cat > "$DIST_XML" <<EOF
<?xml version="1.0" encoding="utf-8"?>
<installer-gui-script minSpecVersion="2">
  <title>MIDI Server Probe</title>
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
  <choice id="$BUNDLE_ID" visible="false" title="MIDI Server Probe">
    <pkg-ref id="$BUNDLE_ID"/>
  </choice>
  <pkg-ref id="$BUNDLE_ID" version="0.0.0" onConclusion="none">$APP_NAME-component.pkg</pkg-ref>
</installer-gui-script>
EOF

    productbuild \
        --distribution "$DIST_XML" \
        --package-path "$PKG_DIR" \
        --resources "$RESOURCES_DIR" \
        "$UNSIGNED_PKG"
else
    echo "==> Skipping productbuild (PROBE_RUN_PRODUCTBUILD=false)"
fi

PRODUCTSIGN_ARGS=(
    --sign "$DEVELOPER_ID_INSTALLER"
)
if [ "$PRODUCTSIGN_USE_TIMESTAMP" = true ]; then
    PRODUCTSIGN_ARGS+=(--timestamp)
fi
PRODUCTSIGN_ARGS+=(
    "$UNSIGNED_PKG"
    "$FINAL_PKG"
)

if [ "$PROBE_SIGN_TARGET" = "component" ]; then
    PRODUCTSIGN_ARGS=(
        --sign "$DEVELOPER_ID_INSTALLER"
    )
    if [ "$PRODUCTSIGN_USE_TIMESTAMP" = true ]; then
        PRODUCTSIGN_ARGS+=(--timestamp)
    fi
    PRODUCTSIGN_ARGS+=(
        "$COMPONENT_PKG"
        "$FINAL_PKG"
    )
fi

echo "==> Running productsign (target: ${PROBE_SIGN_TARGET}, timeout: ${PRODUCTSIGN_TIMEOUT_SECONDS}s, timestamp: ${PRODUCTSIGN_USE_TIMESTAMP})"
if [ "$PROBE_SIGN_TARGET" = "distribution" ] && [ "$PROBE_RUN_PRODUCTBUILD" != true ]; then
    echo "Error: distribution signing requires PROBE_RUN_PRODUCTBUILD=true." >&2
    exit 1
fi
run_with_timeout "$PRODUCTSIGN_TIMEOUT_SECONDS" productsign "${PRODUCTSIGN_ARGS[@]}"

echo "==> Verifying final installer signature"
pkgutil --check-signature "$FINAL_PKG"
ls -lh "$COMPONENT_PKG" "$UNSIGNED_PKG" "$FINAL_PKG"

echo "==> Package probe passed"
