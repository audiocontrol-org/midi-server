#!/bin/bash

set -euo pipefail

usage() {
    cat <<EOF
Usage: $0 --key <path> --cert <path> --out <path> [options]

Generate a password-protected PKCS#12 bundle (.p12) from a private key and certificate.

Required:
  --key PATH            Private key file (PEM), e.g. developer_id_installer_v2.key
  --cert PATH           Certificate file (.cer DER or .pem)
  --out PATH            Output .p12 path

Optional:
  --name NAME           Friendly name in the bundle
  --password PASS       Export password (if omitted, prompt securely)
  --legacy              Use OpenSSL -legacy mode (recommended for macOS keychain compatibility)
  -h, --help            Show this help

Examples:
  $0 \\
    --key ~/tmp/developer_id_installer_v2.key \\
    --cert ~/tmp/developerID_installer_v2.cer \\
    --out ~/tmp/developer_id_installer_v2.p12 \\
    --name "Developer ID Installer: Orion Letizi (ES3R29MZ5A)" \\
    --legacy

  $0 \\
    --key ~/tmp/developer_id_installer_v2.key \\
    --cert ~/tmp/developerID_installer_v2.cer \\
    --out ~/tmp/developer_id_installer_v2.p12 \\
    --password 'TEST' \\
    --legacy
EOF
}

KEY_FILE=""
CERT_FILE=""
OUT_FILE=""
FRIENDLY_NAME=""
EXPORT_PASSWORD=""
USE_LEGACY=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --key)
            KEY_FILE="${2:-}"
            shift 2
            ;;
        --cert)
            CERT_FILE="${2:-}"
            shift 2
            ;;
        --out)
            OUT_FILE="${2:-}"
            shift 2
            ;;
        --name)
            FRIENDLY_NAME="${2:-}"
            shift 2
            ;;
        --password)
            EXPORT_PASSWORD="${2:-}"
            shift 2
            ;;
        --legacy)
            USE_LEGACY=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Error: unknown option $1" >&2
            usage
            exit 1
            ;;
    esac
done

if [ -z "$KEY_FILE" ] || [ -z "$CERT_FILE" ] || [ -z "$OUT_FILE" ]; then
    echo "Error: --key, --cert, and --out are required." >&2
    usage
    exit 1
fi

[ -f "$KEY_FILE" ] || { echo "Error: key file not found: $KEY_FILE" >&2; exit 1; }
[ -f "$CERT_FILE" ] || { echo "Error: cert file not found: $CERT_FILE" >&2; exit 1; }

if [ -z "$EXPORT_PASSWORD" ]; then
    read -r -s -p "P12 export password: " EXPORT_PASSWORD
    echo
    read -r -s -p "Confirm password: " EXPORT_PASSWORD_CONFIRM
    echo
    [ "$EXPORT_PASSWORD" = "$EXPORT_PASSWORD_CONFIRM" ] || {
        echo "Error: passwords do not match." >&2
        exit 1
    }
fi

if [ -z "$FRIENDLY_NAME" ]; then
    FRIENDLY_NAME="$(basename "$OUT_FILE" .p12)"
fi

CERT_PEM="$CERT_FILE"
TMP_PEM=""

cleanup() {
    if [ -n "$TMP_PEM" ] && [ -f "$TMP_PEM" ]; then
        rm -f "$TMP_PEM"
    fi
}
trap cleanup EXIT

# Convert DER .cer inputs to PEM for openssl pkcs12.
if [[ "$CERT_FILE" == *.cer ]]; then
    TMP_PEM="$(mktemp "${TMPDIR:-/tmp}/p12-cert.XXXXXX.pem")"
    openssl x509 -in "$CERT_FILE" -inform DER -out "$TMP_PEM" -outform PEM
    CERT_PEM="$TMP_PEM"
fi

mkdir -p "$(dirname "$OUT_FILE")"

PKCS12_ARGS=(
    pkcs12 -export
    -inkey "$KEY_FILE"
    -in "$CERT_PEM"
    -out "$OUT_FILE"
    -name "$FRIENDLY_NAME"
    -passout "pass:$EXPORT_PASSWORD"
)

if [ "$USE_LEGACY" = true ]; then
    PKCS12_ARGS=(pkcs12 -export -legacy "${PKCS12_ARGS[@]:2}")
fi

openssl "${PKCS12_ARGS[@]}"

chmod 600 "$OUT_FILE" || true
echo "Wrote: $OUT_FILE"
echo "Friendly name: $FRIENDLY_NAME"
