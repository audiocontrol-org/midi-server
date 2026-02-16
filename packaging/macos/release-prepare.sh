#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/release-common.sh"

VERSION=""
CREATE_COMMIT=false
CREATE_TAG=false

usage() {
    cat <<EOF
Usage: $0 --version <semver> [options]

Options:
  --version VERSION   Version to set (required)
  --commit            Create a release commit
  --tag               Create annotated tag vVERSION (requires --commit)
  -h, --help          Show this help
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

[ -n "$VERSION" ] || die "--version is required"
validate_version "$VERSION"

if [ "$CREATE_TAG" = true ] && [ "$CREATE_COMMIT" = false ]; then
    die "--tag requires --commit"
fi

require_cmd git
require_cmd npm

ensure_clean_git
if [ "$CREATE_TAG" = true ]; then
    ensure_tag_absent "v$VERSION"
fi

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
