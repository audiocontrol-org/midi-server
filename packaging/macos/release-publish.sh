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

Publishes GitHub release vVERSION with all platform artifacts.

Collects artifacts from:
  - macOS: dashboard/dist/ (updater files) + build/pkg/ (.pkg installer)
  - Linux: build/dist-linux/ (.deb packages)
  - Source: build/release/ (source tarball)

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

# Artifact locations
MACOS_DIST_DIR="$DASHBOARD_DIR/dist"
MACOS_PKG_FILE="$PROJECT_ROOT/build/pkg/MidiServer-$VERSION.pkg"
LINUX_DIST_DIR="$PROJECT_ROOT/build/dist-linux"
RELEASE_DIR="$PROJECT_ROOT/build/release"
SOURCE_TARBALL="$RELEASE_DIR/midihttpserver-$VERSION-source.tar.gz"

# Validate macOS artifacts exist
[ -d "$MACOS_DIST_DIR" ] || die "macOS dist directory not found: $MACOS_DIST_DIR"
[ -f "$MACOS_PKG_FILE" ] || die "macOS installer package not found: $MACOS_PKG_FILE"

manifest_count=$(find "$MACOS_DIST_DIR" -maxdepth 1 -type f -name "latest-mac*.yml" | wc -l | tr -d ' ')
zip_count=$(find "$MACOS_DIST_DIR" -maxdepth 1 -type f -name "*-$VERSION*-mac.zip" | wc -l | tr -d ' ')

[ "$manifest_count" -gt 0 ] || die "No latest-mac*.yml found in $MACOS_DIST_DIR"
[ "$zip_count" -gt 0 ] || die "No version-matched zip artifacts found in $MACOS_DIST_DIR"

# Collect all assets
ASSETS=()

# macOS updater manifests
info "Collecting macOS updater manifests..."
while IFS= read -r file; do
    ASSETS+=("$file")
done < <(find "$MACOS_DIST_DIR" -maxdepth 1 -type f -name "latest-mac*.yml" | sort)

# macOS updater zips and blockmaps
info "Collecting macOS updater archives..."
while IFS= read -r file; do
    ASSETS+=("$file")
done < <(find "$MACOS_DIST_DIR" -maxdepth 1 -type f \( -name "*-$VERSION*-mac.zip" -o -name "*-$VERSION*-mac.zip.blockmap" \) | sort)

# macOS DMG files
while IFS= read -r file; do
    ASSETS+=("$file")
done < <(find "$MACOS_DIST_DIR" -maxdepth 1 -type f \( -name "*-$VERSION*.dmg" -o -name "*-$VERSION*.dmg.blockmap" \) | sort)

# macOS PKG installer
info "Adding macOS installer: $MACOS_PKG_FILE"
ASSETS+=("$MACOS_PKG_FILE")

# Linux DEB packages
if [ -d "$LINUX_DIST_DIR" ]; then
    info "Collecting Linux packages..."
    while IFS= read -r file; do
        ASSETS+=("$file")
    done < <(find "$LINUX_DIST_DIR" -maxdepth 1 -type f -name "*.deb" | sort)

    # Linux AppImage (if present)
    while IFS= read -r file; do
        ASSETS+=("$file")
    done < <(find "$LINUX_DIST_DIR" -maxdepth 1 -type f -name "*.AppImage" | sort)
else
    info "No Linux artifacts found (skipping)"
fi

# Source tarball
if [ -f "$SOURCE_TARBALL" ]; then
    info "Adding source tarball: $SOURCE_TARBALL"
    ASSETS+=("$SOURCE_TARBALL")
else
    info "No source tarball found (skipping)"
fi

# Generate combined SHA256SUMS
info "Generating combined checksums..."
CHECKSUMS_FILE="$RELEASE_DIR/SHA256SUMS"
mkdir -p "$RELEASE_DIR"
rm -f "$CHECKSUMS_FILE"

for asset in "${ASSETS[@]}"; do
    filename=$(basename "$asset")
    checksum=$(shasum -a 256 "$asset" | cut -d' ' -f1)
    echo "$checksum  $filename" >> "$CHECKSUMS_FILE"
done

ASSETS+=("$CHECKSUMS_FILE")

# Build gh release command
TAG="v$VERSION"
CMD=(gh release create "$TAG")
if [ -n "${RELEASE_GH_REPO:-}" ]; then
    CMD+=(-R "$RELEASE_GH_REPO")
fi
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
echo ""
echo "Assets to upload:"
for asset in "${ASSETS[@]}"; do
    echo "  - $(basename "$asset")"
done
echo ""

"${CMD[@]}"
info "Release published: $TAG"
