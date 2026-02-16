#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DASHBOARD_DIR="$PROJECT_ROOT/dashboard"
VERSION_FILE="$PROJECT_ROOT/VERSION"

die() {
    echo "Error: $*" >&2
    exit 1
}

info() {
    echo "==> $*"
}

require_cmd() {
    command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

read_version() {
    if [ ! -f "$VERSION_FILE" ]; then
        die "VERSION file not found: $VERSION_FILE"
    fi
    tr -d '[:space:]' < "$VERSION_FILE"
}

validate_version() {
    local version="$1"
    if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]]; then
        die "Invalid version '$version' (expected semver-like format)"
    fi
}

set_project_version() {
    local version="$1"
    validate_version "$version"
    info "Setting VERSION -> $version"
    printf "%s\n" "$version" > "$VERSION_FILE"
    info "Setting dashboard/package.json version -> $version"
    (
        cd "$DASHBOARD_DIR"
        npm pkg set version="$version" >/dev/null
    )
}

ensure_clean_git() {
    local status
    status="$(git -C "$PROJECT_ROOT" status --porcelain)"
    if [ -n "$status" ]; then
        die "Git tree is not clean. Commit/stash changes first."
    fi
}

ensure_tag_absent() {
    local tag="$1"
    if git -C "$PROJECT_ROOT" rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
        die "Tag already exists locally: $tag"
    fi
}
