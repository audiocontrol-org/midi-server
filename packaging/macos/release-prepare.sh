#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/release-common.sh"

VERSION=""
CREATE_COMMIT=false
CREATE_TAG=false

usage() {
    cat <<EOF
Usage: $0 [options]

Prepares a release by syncing version from VERSION file to package.json.

Options:
  --version VERSION   Override version (defaults to VERSION file)
  --commit            Create a release commit
  --tag               Create annotated tag vVERSION (requires --commit)
  -h, --help          Show this help

Workflow:
  1. Edit VERSION file with new version
  2. Run: $0 --commit --tag
  3. Script syncs package.json, commits, and tags
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --version)
            VERSION="${2:-}"
            shift 2
            ;;
        --commit)
            CREATE_COMMIT=true
            shift
            ;;
        --tag)
            CREATE_TAG=true
            shift
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

# Read version from VERSION file if not specified
if [ -n "$VERSION" ]; then
    validate_version "$VERSION"
else
    VERSION="$(read_version)"
fi

if [ "$CREATE_TAG" = true ] && [ "$CREATE_COMMIT" = false ]; then
    die "--tag requires --commit"
fi

require_cmd git
require_cmd npm

# Check for unexpected changes (allow VERSION and dashboard/package*.json)
if [ "$CREATE_COMMIT" = true ]; then
    unexpected_changes=$(git -C "$PROJECT_ROOT" status --porcelain | grep -v "^.. VERSION$" | grep -v "^.. dashboard/package.json$" | grep -v "^.. dashboard/package-lock.json$" || true)
    if [ -n "$unexpected_changes" ]; then
        echo "Unexpected uncommitted changes:" >&2
        echo "$unexpected_changes" >&2
        die "Commit or stash unrelated changes first"
    fi
fi

if [ "$CREATE_TAG" = true ]; then
    ensure_tag_absent "v$VERSION"
fi

# Sync version to package.json (VERSION file is source of truth)
set_project_version "$VERSION"

if [ "$CREATE_COMMIT" = true ]; then
    info "Creating release commit"
    git -C "$PROJECT_ROOT" add VERSION dashboard/package.json dashboard/package-lock.json
    git -C "$PROJECT_ROOT" commit -m "release: v$VERSION"
fi

if [ "$CREATE_TAG" = true ]; then
    info "Creating tag v$VERSION"
    git -C "$PROJECT_ROOT" tag -a "v$VERSION" -m "Release v$VERSION"
fi

info "Prepared release version $VERSION"
