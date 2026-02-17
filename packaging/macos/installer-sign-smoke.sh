#!/bin/bash

set -euo pipefail

DEVELOPER_ID_INSTALLER="${DEVELOPER_ID_INSTALLER:-}"
PRODUCTSIGN_TIMEOUT_SECONDS="${PRODUCTSIGN_TIMEOUT_SECONDS:-180}"
PRODUCTSIGN_USE_TIMESTAMP="${PRODUCTSIGN_USE_TIMESTAMP:-false}"

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

WORK_DIR="${RUNNER_TEMP:-/tmp}/installer-sign-smoke"
PAYLOAD_DIR="$WORK_DIR/payload"
UNSIGNED_PKG="$WORK_DIR/MidiServerSmoke-unsigned.pkg"
SIGNED_PKG="$WORK_DIR/MidiServerSmoke-signed.pkg"

echo "==> Preparing smoke-test payload"
rm -rf "$WORK_DIR"
mkdir -p "$PAYLOAD_DIR/usr/local/share/midi-server-smoke"
cat > "$PAYLOAD_DIR/usr/local/share/midi-server-smoke/README.txt" <<EOF
MIDI Server installer signing smoke test.
EOF

echo "==> Building unsigned smoke pkg"
pkgbuild \
    --root "$PAYLOAD_DIR" \
    --identifier "org.audiocontrol.midi-server.smoke" \
    --version "0.0.0" \
    --install-location "/" \
    "$UNSIGNED_PKG"

PRODUCTSIGN_ARGS=(
    --sign "$DEVELOPER_ID_INSTALLER"
)
if [ "$PRODUCTSIGN_USE_TIMESTAMP" = true ]; then
    PRODUCTSIGN_ARGS+=(--timestamp)
fi
PRODUCTSIGN_ARGS+=(
    "$UNSIGNED_PKG"
    "$SIGNED_PKG"
)

echo "==> Running productsign (timeout: ${PRODUCTSIGN_TIMEOUT_SECONDS}s, timestamp: ${PRODUCTSIGN_USE_TIMESTAMP})"
run_with_timeout "$PRODUCTSIGN_TIMEOUT_SECONDS" productsign "${PRODUCTSIGN_ARGS[@]}"

echo "==> Verifying signed smoke pkg"
pkgutil --check-signature "$SIGNED_PKG"

echo "==> Smoke test passed"
ls -lh "$UNSIGNED_PKG" "$SIGNED_PKG"
