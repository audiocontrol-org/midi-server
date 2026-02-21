#!/bin/bash
# Docker-based Linux build for MIDI Server
# Enables building Linux packages from macOS

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

IMAGE_NAME="midi-server-linux-builder"
IMAGE_TAG="ubuntu22.04-amd64"
CONTAINER_NAME="midi-server-build-$$"

# Output directory for Linux artifacts
DIST_LINUX_DIR="$PROJECT_ROOT/build/dist-linux"

# Flags
DEB_ONLY=false
APPIMAGE_ONLY=false
SKIP_BUILD=false
REBUILD_IMAGE=false
VERSION=""

usage() {
    cat <<EOF
Usage: $0 [options]

Build Linux packages using Docker (works on macOS).

Options:
    --deb-only          Build only DEB package (skip AppImage)
    --appimage-only     Build only AppImage (skip DEB)
    --skip-build        Skip C++ and Electron build (use existing artifacts)
    --rebuild-image     Force rebuild of Docker image
    --version VERSION   Override version (defaults to VERSION file)
    -h, --help          Show this help

Examples:
    $0                  # Build DEB and AppImage
    $0 --deb-only       # Build only DEB package
    $0 --rebuild-image  # Rebuild Docker image and packages
EOF
    exit 0
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --deb-only)
            DEB_ONLY=true
            shift
            ;;
        --appimage-only)
            APPIMAGE_ONLY=true
            shift
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --rebuild-image)
            REBUILD_IMAGE=true
            shift
            ;;
        --version)
            VERSION="${2:-}"
            shift 2
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo "Error: Unknown option: $1" >&2
            exit 1
            ;;
    esac
done

# Read version from VERSION file if not specified
if [ -z "$VERSION" ]; then
    VERSION_FILE="$PROJECT_ROOT/VERSION"
    if [ -f "$VERSION_FILE" ]; then
        VERSION=$(tr -d '[:space:]' < "$VERSION_FILE")
    else
        echo "Error: VERSION file not found and --version not specified" >&2
        exit 1
    fi
fi

echo "=== Building MIDI Server Linux packages v$VERSION ==="
echo "Project root: $PROJECT_ROOT"
echo "Output directory: $DIST_LINUX_DIR"

# Check Docker is available
if ! command -v docker >/dev/null 2>&1; then
    echo "Error: Docker is not installed or not in PATH" >&2
    exit 1
fi

# Check Docker daemon is running
if ! docker info >/dev/null 2>&1; then
    echo "Error: Docker daemon is not running" >&2
    exit 1
fi

# Force x86_64 platform (even on Apple Silicon Macs)
DOCKER_PLATFORM="linux/amd64"

# Build Docker image if needed
FULL_IMAGE="$IMAGE_NAME:$IMAGE_TAG"
if [ "$REBUILD_IMAGE" = true ] || ! docker image inspect "$FULL_IMAGE" >/dev/null 2>&1; then
    echo ""
    echo "=== Building Docker image (platform: $DOCKER_PLATFORM) ==="
    docker build --platform "$DOCKER_PLATFORM" -t "$FULL_IMAGE" "$SCRIPT_DIR"
else
    echo "Using existing Docker image: $FULL_IMAGE"
fi

# Create output directory
mkdir -p "$DIST_LINUX_DIR"

# Build arguments for the inner build script
BUILD_ARGS=""
if [ "$DEB_ONLY" = true ]; then
    BUILD_ARGS="--deb-only"
elif [ "$APPIMAGE_ONLY" = true ]; then
    BUILD_ARGS="--appimage-only"
fi
if [ "$SKIP_BUILD" = true ]; then
    BUILD_ARGS="$BUILD_ARGS --skip-build"
fi

echo ""
echo "=== Running Linux build in Docker ==="

# Run build inside container
# Mount project as /project, run build-installer.sh
docker run --rm \
    --platform "$DOCKER_PLATFORM" \
    --name "$CONTAINER_NAME" \
    -v "$PROJECT_ROOT:/project:delegated" \
    -w /project \
    -e HOME=/tmp \
    "$FULL_IMAGE" \
    bash -c "
        set -e

        # Install npm dependencies (as builder user can't write to node_modules mounted from host)
        # So we copy dashboard to temp and build there
        echo '=== Setting up build environment ==='
        BUILD_TEMP=/tmp/midi-server-build
        rm -rf \$BUILD_TEMP
        mkdir -p \$BUILD_TEMP

        # Copy source files (exclude build and node_modules to avoid cache/platform conflicts)
        rsync -a --exclude='build/' --exclude='node_modules/' --exclude='.git/' /project/ \$BUILD_TEMP/
        cd \$BUILD_TEMP

        # Ensure no stale artifacts from macOS builds
        rm -rf \$BUILD_TEMP/dashboard/node_modules
        rm -rf \$BUILD_TEMP/dashboard/dist
        rm -f \$BUILD_TEMP/dashboard/package-lock.json

        # Run the Linux build script
        echo '=== Running build-installer.sh ==='
        ./packaging/linux/build-installer.sh --version $VERSION $BUILD_ARGS

        # Copy artifacts back to mounted volume
        echo '=== Copying artifacts ==='
        mkdir -p /project/build/dist-linux
        cp -v \$BUILD_TEMP/dashboard/dist/*.deb /project/build/dist-linux/ 2>/dev/null || true
        cp -v \$BUILD_TEMP/dashboard/dist/*.AppImage /project/build/dist-linux/ 2>/dev/null || true

        echo '=== Build complete ==='
    "

# Verify artifacts
echo ""
echo "=== Build artifacts ==="
if ls "$DIST_LINUX_DIR"/*.deb 1>/dev/null 2>&1; then
    echo "DEB packages:"
    ls -la "$DIST_LINUX_DIR"/*.deb
fi
if ls "$DIST_LINUX_DIR"/*.AppImage 1>/dev/null 2>&1; then
    echo "AppImage packages:"
    ls -la "$DIST_LINUX_DIR"/*.AppImage
fi

# Generate checksums
echo ""
echo "=== Generating checksums ==="
cd "$DIST_LINUX_DIR"
rm -f checksums-linux.sha256
for file in *.deb *.AppImage; do
    if [ -f "$file" ]; then
        shasum -a 256 "$file" >> checksums-linux.sha256
    fi
done

if [ -f checksums-linux.sha256 ]; then
    echo "Checksums:"
    cat checksums-linux.sha256
fi

echo ""
echo "=== Linux build complete ==="
echo "Artifacts in: $DIST_LINUX_DIR"
