#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELEASE_CONFIG_FILE="$SCRIPT_DIR/release.config.sh"
RELEASE_SECRETS_DIR_DEFAULT="$HOME/.config/audiocontrol.org/midi-server"
RELEASE_SECRETS_FILE_DEFAULT="$RELEASE_SECRETS_DIR_DEFAULT/release.secrets.enc"
RELEASE_SECRETS_FILE="${RELEASE_SECRETS_FILE:-$RELEASE_SECRETS_FILE_DEFAULT}"

if [ -f "$RELEASE_CONFIG_FILE" ]; then
    # shellcheck disable=SC1090
    source "$RELEASE_CONFIG_FILE"
fi

DEFAULT_TEAM_ID="${APPLE_TEAM_ID_DEFAULT:-}"

usage() {
    cat <<EOF
Usage: $0

Creates/updates encrypted notarization credentials at:
  $RELEASE_SECRETS_FILE

Environment overrides:
  RELEASE_SECRETS_FILE       Target encrypted file path
  RELEASE_SECRETS_PASSWORD   Encryption password (if omitted, prompt securely)
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    usage
    exit 0
fi

read -r -p "Apple ID email: " APPLE_ID_INPUT
read -r -p "Apple Team ID [${DEFAULT_TEAM_ID}]: " APPLE_TEAM_ID_INPUT
APPLE_TEAM_ID_INPUT="${APPLE_TEAM_ID_INPUT:-$DEFAULT_TEAM_ID}"
read -r -s -p "Apple app-specific password: " APPLE_APP_SPECIFIC_PASSWORD_INPUT
echo

if [ -z "${RELEASE_SECRETS_PASSWORD:-}" ]; then
    read -r -s -p "Encryption password: " RELEASE_SECRETS_PASSWORD
    echo
    read -r -s -p "Confirm encryption password: " RELEASE_SECRETS_PASSWORD_CONFIRM
    echo
    if [ "$RELEASE_SECRETS_PASSWORD" != "$RELEASE_SECRETS_PASSWORD_CONFIRM" ]; then
        echo "Error: passwords do not match" >&2
        exit 1
    fi
fi

mkdir -p "$(dirname "$RELEASE_SECRETS_FILE")"
chmod 700 "$(dirname "$RELEASE_SECRETS_FILE")"

TMP_FILE="$(mktemp)"
cleanup() {
    rm -f "$TMP_FILE"
}
trap cleanup EXIT

cat > "$TMP_FILE" <<EOF
APPLE_ID=$APPLE_ID_INPUT
APPLE_TEAM_ID=$APPLE_TEAM_ID_INPUT
APPLE_APP_SPECIFIC_PASSWORD=$APPLE_APP_SPECIFIC_PASSWORD_INPUT
EOF

openssl enc -aes-256-cbc -pbkdf2 -md sha256 -salt -a \
    -in "$TMP_FILE" \
    -out "$RELEASE_SECRETS_FILE" \
    -pass env:RELEASE_SECRETS_PASSWORD

chmod 600 "$RELEASE_SECRETS_FILE"

echo "Wrote encrypted secrets: $RELEASE_SECRETS_FILE"
echo "Set RELEASE_SECRETS_PASSWORD in your shell before running release scripts."
