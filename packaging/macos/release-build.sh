#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/release-common.sh"

VERSION=""
PASS_THROUGH_ARGS=()

usage() {
    cat <<EOF
Usage: $0 [options]

Builds release artifacts by delegating to build-installer.sh.
Installer-only builds can continue using packaging/macos/build-installer.sh directly.

Options:
  --version VERSION   Override version (defaults to VERSION file)
  --                  Pass remaining args directly to build-installer.sh
  -h, --help          Show this help

Examples:
  $0
  $0 --version 0.1.9 -- --skip-notarize
  $0 -- --skip-build --skip-notarize
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --version)
            VERSION="${2:-}"
            shift 2
            ;;
        --)
            shift
            PASS_THROUGH_ARGS=("$@")
            break
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            die "Unknown option: $1"
            ;;
    esac
done

if [ -n "$VERSION" ]; then
    validate_version "$VERSION"
else
    VERSION="$(read_version)"
fi

info "Building artifacts for v$VERSION"
"$SCRIPT_DIR/build-installer.sh" --version "$VERSION" "${PASS_THROUGH_ARGS[@]}"

info "Build completed for v$VERSION"
