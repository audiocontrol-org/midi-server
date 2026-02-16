#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DASHBOARD_DIR="$PROJECT_ROOT/dashboard"
RELEASE_WORKFLOW="$PROJECT_ROOT/.github/workflows/release-macos.yml"
ELECTRON_BUILDER_CONFIG="$DASHBOARD_DIR/electron-builder.yml"

SKIP_INSTALL=false
SKIP_TYPECHECK=false

usage() {
    cat <<EOF
Usage: $0 [options]

Fast validation for macOS release automation.

Options:
  --skip-install      Skip npm install/ci in dashboard
  --skip-typecheck    Skip dashboard typecheck
  -h, --help          Show this help
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --skip-install)
            SKIP_INSTALL=true
            shift
            ;;
        --skip-typecheck)
            SKIP_TYPECHECK=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            usage
            exit 1
            ;;
    esac
done

require_file() {
    local path="$1"
    if [ ! -f "$path" ]; then
        echo "Missing required file: $path" >&2
        exit 1
    fi
}

echo "==> Release preflight: validating config and scripts"

require_file "$DASHBOARD_DIR/package.json"
require_file "$ELECTRON_BUILDER_CONFIG"
require_file "$RELEASE_WORKFLOW"
require_file "$SCRIPT_DIR/entitlements.plist"
require_file "$SCRIPT_DIR/build-installer.sh"
require_file "$SCRIPT_DIR/release-build.sh"

BUILD_MAC_CMD="$(
    node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));console.log(p.scripts?.['build:mac']||'');" \
        "$DASHBOARD_DIR/package.json"
)"
if [ -z "$BUILD_MAC_CMD" ]; then
    echo "dashboard/package.json is missing scripts.build:mac" >&2
    exit 1
fi

if [[ "$BUILD_MAC_CMD" != *"--publish never"* ]]; then
    echo "scripts.build:mac must include '--publish never' to avoid implicit tag publishing." >&2
    echo "Current value: $BUILD_MAC_CMD" >&2
    exit 1
fi

ENTITLEMENTS_RELATIVE_PATH="$(awk -F': ' '/^[[:space:]]*entitlementsInherit:/ {print $2; exit}' "$ELECTRON_BUILDER_CONFIG" | tr -d '"' | tr -d "'" | tr -d '[:space:]')"
if [ -z "$ENTITLEMENTS_RELATIVE_PATH" ]; then
    echo "dashboard/electron-builder.yml is missing mac.entitlementsInherit." >&2
    exit 1
fi

if [ ! -f "$DASHBOARD_DIR/$ENTITLEMENTS_RELATIVE_PATH" ]; then
    echo "entitlementsInherit points to a missing file: $DASHBOARD_DIR/$ENTITLEMENTS_RELATIVE_PATH" >&2
    exit 1
fi

if ! rg -q 'release-build\.sh --version' "$RELEASE_WORKFLOW"; then
    echo "release workflow must invoke release-build.sh with an explicit --version argument." >&2
    exit 1
fi

if ! rg -q 'Publish GitHub release assets' "$RELEASE_WORKFLOW"; then
    echo "release workflow is missing the dedicated GitHub release publish step." >&2
    exit 1
fi

echo "==> Static preflight checks passed"

if [ "$SKIP_INSTALL" = true ]; then
    echo "==> Skipping dependency install (--skip-install)"
else
    echo "==> Installing dashboard dependencies"
    npm --prefix "$DASHBOARD_DIR" ci
fi

if [ "$SKIP_TYPECHECK" = true ]; then
    echo "==> Skipping typecheck (--skip-typecheck)"
else
    echo "==> Running dashboard typecheck"
    npm --prefix "$DASHBOARD_DIR" run typecheck
fi

echo "==> Release preflight completed successfully"
