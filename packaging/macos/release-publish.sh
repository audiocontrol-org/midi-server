#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/release-common.sh"

VERSION=""
NOTES=""
NOTES_FILE=""
DRAFT=false
PRERELEASE=false
TARGET=""

usage() {
    cat <<EOF
Usage: $0 [options]

Publishes GitHub release vVERSION with updater artifacts and signed installer.

Options:
  --version VERSION      Override version (defaults to VERSION file)
  --notes TEXT           Release notes body
  --notes-file FILE      Release notes file
  --draft                Create draft release
  --prerelease           Mark as prerelease
  --target REF           Target branch/SHA for tag if it does not exist remotely
  -h, --help             Show this help
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --version)
            VERSION="${2:-}"
            shift 2
            ;;
        --notes)
            NOTES="${2:-}"
            shift 2
            ;;
        --notes-file)
            NOTES_FILE="${2:-}"
            shift 2
            ;;
        --draft)
            DRAFT=true
            shift
            ;;
        --prerelease)
            PRERELEASE=true
            shift
            ;;
        --target)
            TARGET="${2:-}"
            shift 2
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

if [ -n "$NOTES" ] && [ -n "$NOTES_FILE" ]; then
    die "Use either --notes or --notes-file, not both"
fi
if [ -n "$NOTES_FILE" ] && [ ! -f "$NOTES_FILE" ]; then
    die "Notes file not found: $NOTES_FILE"
fi

require_cmd gh
require_cmd find

DIST_DIR="$DASHBOARD_DIR/dist"
PKG_FILE="$PROJECT_ROOT/build/pkg/MidiServer-$VERSION.pkg"

[ -d "$DIST_DIR" ] || die "Dist directory not found: $DIST_DIR"
[ -f "$PKG_FILE" ] || die "Installer package not found: $PKG_FILE"

manifest_count=$(find "$DIST_DIR" -maxdepth 1 -type f -name "latest-mac*.yml" | wc -l | tr -d ' ')
zip_count=$(find "$DIST_DIR" -maxdepth 1 -type f -name "*.zip" | wc -l | tr -d ' ')

[ "$manifest_count" -gt 0 ] || die "No latest-mac*.yml found in $DIST_DIR"
[ "$zip_count" -gt 0 ] || die "No zip artifacts found in $DIST_DIR"

ASSETS=()
while IFS= read -r file; do
    ASSETS+=("$file")
done < <(find "$DIST_DIR" -maxdepth 1 -type f \( -name "latest-mac*.yml" -o -name "*.zip" -o -name "*.blockmap" -o -name "*.dmg" \) | sort)
ASSETS+=("$PKG_FILE")

TAG="v$VERSION"
CMD=(gh release create "$TAG")
CMD+=("${ASSETS[@]}")
CMD+=(--title "$TAG")

if [ "$DRAFT" = true ]; then
    CMD+=(--draft)
fi
if [ "$PRERELEASE" = true ]; then
    CMD+=(--prerelease)
fi
if [ -n "$TARGET" ]; then
    CMD+=(--target "$TARGET")
fi
if [ -n "$NOTES_FILE" ]; then
    CMD+=(--notes-file "$NOTES_FILE")
elif [ -n "$NOTES" ]; then
    CMD+=(--notes "$NOTES")
else
    CMD+=(--generate-notes)
fi

info "Publishing $TAG with ${#ASSETS[@]} assets"
"${CMD[@]}"
info "Release published: $TAG"
