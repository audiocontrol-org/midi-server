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
REMOTE="origin"
PUSH=true
BUILD_ARGS=()

usage() {
    cat <<EOF
Usage: $0 --version <semver> [options] [-- <build-installer args>]

One-click release flow:
  1) prepare version + commit + tag
  2) build signed artifacts
  3) push commit/tag
  4) publish GitHub release with assets

Options:
  --version VERSION      Release version (required)
  --notes TEXT           Release notes body
  --notes-file FILE      Release notes file
  --draft                Publish as draft release
  --prerelease           Publish as prerelease
  --target REF           Release target (passed to publish step)
  --remote NAME          Git remote for push (default: origin)
  --no-push              Skip git push step
  --                     Pass remaining args to build-installer.sh via release-build.sh
  -h, --help             Show help
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
        --remote)
            REMOTE="${2:-}"
            shift 2
            ;;
        --no-push)
            PUSH=false
            shift
            ;;
        --)
            shift
            BUILD_ARGS=("$@")
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

[ -n "$VERSION" ] || die "--version is required"
validate_version "$VERSION"

if [ -n "$NOTES" ] && [ -n "$NOTES_FILE" ]; then
    die "Use either --notes or --notes-file, not both"
fi

require_cmd git

info "Preparing release v$VERSION"
"$SCRIPT_DIR/release-prepare.sh" --version "$VERSION" --commit --tag

info "Building artifacts for v$VERSION"
if [ ${#BUILD_ARGS[@]} -gt 0 ]; then
    "$SCRIPT_DIR/release-build.sh" --version "$VERSION" -- "${BUILD_ARGS[@]}"
else
    "$SCRIPT_DIR/release-build.sh" --version "$VERSION"
fi

if [ "$PUSH" = true ]; then
    info "Pushing commit and tag to $REMOTE"
    git -C "$PROJECT_ROOT" push "$REMOTE" HEAD
    git -C "$PROJECT_ROOT" push "$REMOTE" "v$VERSION"
fi

PUBLISH_ARGS=(--version "$VERSION")
[ "$DRAFT" = true ] && PUBLISH_ARGS+=(--draft)
[ "$PRERELEASE" = true ] && PUBLISH_ARGS+=(--prerelease)
[ -n "$NOTES" ] && PUBLISH_ARGS+=(--notes "$NOTES")
[ -n "$NOTES_FILE" ] && PUBLISH_ARGS+=(--notes-file "$NOTES_FILE")
[ -n "$TARGET" ] && PUBLISH_ARGS+=(--target "$TARGET")

info "Publishing GitHub release v$VERSION"
"$SCRIPT_DIR/release-publish.sh" "${PUBLISH_ARGS[@]}"

info "Release flow complete for v$VERSION"
