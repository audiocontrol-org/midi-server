#!/bin/bash

set -euo pipefail

DEVELOPER_ID_INSTALLER="${DEVELOPER_ID_INSTALLER:-}"
DEVELOPER_ID_APP="${DEVELOPER_ID_APP:-}"
SIGN_TIMEOUT_SECONDS="${SIGN_TIMEOUT_SECONDS:-60}"
USE_TIMESTAMP="${USE_TIMESTAMP:-false}"

if [ -z "$DEVELOPER_ID_INSTALLER" ]; then
    echo "Error: DEVELOPER_ID_INSTALLER is required." >&2
    exit 1
fi

run_with_timeout() {
    local timeout_seconds="$1"
    shift
    perl -e 'my $t=shift @ARGV; alarm($t); exec @ARGV or die "exec failed: $!";' \
        "$timeout_seconds" "$@"
}

WORK_DIR="${RUNNER_TEMP:-/tmp}/installer-sign-mutation-sweep"
REPORT_FILE="$WORK_DIR/report.tsv"

rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"
printf "case\tresult\tduration_s\tnote\n" > "$REPORT_FILE"

sign_pkg() {
    local input_pkg="$1"
    local output_pkg="$2"
    local args=(--sign "$DEVELOPER_ID_INSTALLER")
    if [ "$USE_TIMESTAMP" = true ]; then
        args+=(--timestamp)
    fi
    args+=("$input_pkg" "$output_pkg")
    run_with_timeout "$SIGN_TIMEOUT_SECONDS" productsign "${args[@]}"
    pkgutil --check-signature "$output_pkg" >/dev/null
}

create_minimal_app() {
    local app_root="$1"
    mkdir -p "$app_root/Contents/Resources/bin"
    mkdir -p "$app_root/Contents/MacOS"

    cat > "$app_root/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key>
  <string>org.audiocontrol.midi-server.sweep</string>
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

    cat > "$app_root/Contents/MacOS/MidiServer" <<EOF
#!/bin/bash
exit 0
EOF
    chmod +x "$app_root/Contents/MacOS/MidiServer"

    cat > "$app_root/Contents/Resources/bin/midi-http-server" <<EOF
#!/bin/bash
echo "sweep"
EOF
    chmod +x "$app_root/Contents/Resources/bin/midi-http-server"
    xattr -cr "$app_root" || true

    if [ -n "$DEVELOPER_ID_APP" ]; then
        codesign --sign "$DEVELOPER_ID_APP" --options runtime --force --timestamp \
            "$app_root/Contents/Resources/bin/midi-http-server"
        codesign --sign "$DEVELOPER_ID_APP" --options runtime --force --timestamp --deep \
            "$app_root"
        codesign --verify --verbose=2 "$app_root"
    fi
}

run_case() {
    local case_name="$1"
    shift
    local start
    local end
    local duration
    local note="ok"
    start="$(date +%s)"
    if "$@"; then
        end="$(date +%s)"
        duration="$((end - start))"
        printf "%s\tPASS\t%s\t%s\n" "$case_name" "$duration" "$note" >> "$REPORT_FILE"
        echo "PASS: $case_name (${duration}s)"
        return 0
    fi
    end="$(date +%s)"
    duration="$((end - start))"
    note="see logs"
    printf "%s\tFAIL\t%s\t%s\n" "$case_name" "$duration" "$note" >> "$REPORT_FILE"
    echo "FAIL: $case_name (${duration}s)"
    return 1
}

case_smoke_flat() {
    local dir="$WORK_DIR/case_smoke_flat"
    mkdir -p "$dir/payload/usr/local/share/midi-server-smoke"
    cat > "$dir/payload/usr/local/share/midi-server-smoke/README.txt" <<EOF
smoke baseline
EOF
    pkgbuild --root "$dir/payload" \
        --identifier "org.audiocontrol.midi-server.smoke" \
        --version "0.0.0" \
        --install-location "/" \
        "$dir/unsigned.pkg"
    sign_pkg "$dir/unsigned.pkg" "$dir/signed.pkg"
}

case_flat_probe_like() {
    local dir="$WORK_DIR/case_flat_probe_like"
    mkdir -p "$dir/staging/usr/local/share/midi-server-probe"
    cat > "$dir/staging/usr/local/share/midi-server-probe/README.txt" <<EOF
probe-like flat payload
EOF
    pkgbuild --root "$dir/staging" \
        --identifier "org.audiocontrol.midi-server.probe" \
        --version "0.0.0" \
        --install-location "/" \
        "$dir/unsigned.pkg"
    sign_pkg "$dir/unsigned.pkg" "$dir/signed.pkg"
}

case_app_payload_no_component() {
    local dir="$WORK_DIR/case_app_no_component"
    local app_root="$dir/staging/Applications/AudioControl/MidiServer.app"
    create_minimal_app "$app_root"
    pkgbuild --root "$dir/staging/Applications/AudioControl" \
        --identifier "org.audiocontrol.midi-server.probe" \
        --version "0.0.0" \
        --install-location "/Applications/AudioControl" \
        "$dir/unsigned.pkg"
    sign_pkg "$dir/unsigned.pkg" "$dir/signed.pkg"
}

case_app_payload_component_plist() {
    local dir="$WORK_DIR/case_app_component_plist"
    local app_root="$dir/staging/Applications/AudioControl/MidiServer.app"
    create_minimal_app "$app_root"
    cat > "$dir/component.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<array>
  <dict>
    <key>RootRelativeBundlePath</key>
    <string>MidiServer.app</string>
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
    pkgbuild --root "$dir/staging/Applications/AudioControl" \
        --identifier "org.audiocontrol.midi-server.probe" \
        --version "0.0.0" \
        --install-location "/Applications/AudioControl" \
        --component-plist "$dir/component.plist" \
        "$dir/unsigned.pkg"
    sign_pkg "$dir/unsigned.pkg" "$dir/signed.pkg"
}

case_distribution_productbuild_then_sign() {
    local dir="$WORK_DIR/case_distribution"
    local app_root="$dir/staging/Applications/AudioControl/MidiServer.app"
    create_minimal_app "$app_root"
    pkgbuild --root "$dir/staging/Applications/AudioControl" \
        --identifier "org.audiocontrol.midi-server.probe" \
        --version "0.0.0" \
        --install-location "/Applications/AudioControl" \
        "$dir/component.pkg"
    cat > "$dir/distribution.xml" <<EOF
<?xml version="1.0" encoding="utf-8"?>
<installer-gui-script minSpecVersion="2">
  <title>MIDI Server Probe</title>
  <organization>org.audiocontrol</organization>
  <domains enable_localSystem="true" enable_currentUserHome="false"/>
  <options customize="never" require-scripts="false" rootVolumeOnly="true"/>
  <choices-outline>
    <line choice="default">
      <line choice="org.audiocontrol.midi-server.probe"/>
    </line>
  </choices-outline>
  <choice id="default"/>
  <choice id="org.audiocontrol.midi-server.probe" visible="false" title="MIDI Server Probe">
    <pkg-ref id="org.audiocontrol.midi-server.probe"/>
  </choice>
  <pkg-ref id="org.audiocontrol.midi-server.probe" version="0.0.0" onConclusion="none">component.pkg</pkg-ref>
</installer-gui-script>
EOF
    productbuild \
        --distribution "$dir/distribution.xml" \
        --package-path "$dir" \
        "$dir/unsigned_dist.pkg"
    sign_pkg "$dir/unsigned_dist.pkg" "$dir/signed_dist.pkg"
}

FAIL_CASE=""
for c in \
    case_smoke_flat \
    case_flat_probe_like \
    case_app_payload_no_component \
    case_app_payload_component_plist \
    case_distribution_productbuild_then_sign
do
    if ! run_case "$c" "$c"; then
        if [ -z "$FAIL_CASE" ]; then
            FAIL_CASE="$c"
        fi
    fi
done

echo ""
echo "=== Mutation Sweep Report ==="
cat "$REPORT_FILE"

if [ -n "$FAIL_CASE" ]; then
    echo "First failing case: $FAIL_CASE" >&2
    exit 1
fi

echo "All mutation sweep cases passed."
