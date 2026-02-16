#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELEASE_SECRETS_DIR_DEFAULT="$HOME/.config/audiocontrol.org/midi-server"
RELEASE_SECRETS_FILE_DEFAULT="$RELEASE_SECRETS_DIR_DEFAULT/release.secrets.enc"
RELEASE_SECRETS_FILE="${RELEASE_SECRETS_FILE:-$RELEASE_SECRETS_FILE_DEFAULT}"

release_secrets_info() {
    echo "==> $*"
}

load_release_secrets() {
    if [ -n "${APPLE_ID:-}" ] && [ -n "${APPLE_APP_SPECIFIC_PASSWORD:-}" ]; then
        return 0
    fi

    if [ ! -f "$RELEASE_SECRETS_FILE" ]; then
        return 0
    fi

    if [ -z "${RELEASE_SECRETS_PASSWORD:-}" ]; then
        release_secrets_info "Encrypted secrets present at $RELEASE_SECRETS_FILE but RELEASE_SECRETS_PASSWORD is not set."
        return 0
    fi

    command -v openssl >/dev/null 2>&1 || {
        echo "Error: openssl is required to decrypt $RELEASE_SECRETS_FILE" >&2
        return 1
    }

    local decrypted
    if ! decrypted="$(openssl enc -aes-256-cbc -pbkdf2 -md sha256 -d -a \
        -in "$RELEASE_SECRETS_FILE" -pass env:RELEASE_SECRETS_PASSWORD 2>/dev/null)"; then
        echo "Error: failed to decrypt $RELEASE_SECRETS_FILE (check RELEASE_SECRETS_PASSWORD)" >&2
        return 1
    fi

    while IFS= read -r line; do
        [ -z "$line" ] && continue
        case "$line" in
            \#*) continue ;;
            APPLE_ID=*)
                export APPLE_ID="${line#APPLE_ID=}"
                ;;
            APPLE_APP_SPECIFIC_PASSWORD=*)
                export APPLE_APP_SPECIFIC_PASSWORD="${line#APPLE_APP_SPECIFIC_PASSWORD=}"
                ;;
            APPLE_TEAM_ID=*)
                export APPLE_TEAM_ID="${line#APPLE_TEAM_ID=}"
                ;;
        esac
    done <<< "$decrypted"

    release_secrets_info "Loaded Apple notarization credentials from encrypted local store."
}
