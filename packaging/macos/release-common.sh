#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DASHBOARD_DIR="$PROJECT_ROOT/dashboard"
VERSION_FILE="$PROJECT_ROOT/VERSION"
RELEASE_CONFIG_FILE="$SCRIPT_DIR/release.config.sh"

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

load_release_config() {
    if [ -f "$RELEASE_CONFIG_FILE" ]; then
        # shellcheck disable=SC1090
        source "$RELEASE_CONFIG_FILE"
    fi

    : "${DEVELOPER_ID_APP:=${DEVELOPER_ID_APP_DEFAULT:-}}"
    : "${DEVELOPER_ID_INSTALLER:=${DEVELOPER_ID_INSTALLER_DEFAULT:-}}"
    : "${CSC_NAME:=${CSC_NAME_DEFAULT:-}}"
    : "${CSC_IDENTITY_AUTO_DISCOVERY:=${CSC_IDENTITY_AUTO_DISCOVERY_DEFAULT:-}}"
    : "${APPLE_TEAM_ID:=${APPLE_TEAM_ID_DEFAULT:-}}"
    : "${RELEASE_GH_REPO:=${RELEASE_GH_REPO_DEFAULT:-${RELEASE_GH_REPO:-}}}"

    export DEVELOPER_ID_APP
    export DEVELOPER_ID_INSTALLER
    export CSC_NAME
    export CSC_IDENTITY_AUTO_DISCOVERY
    export APPLE_TEAM_ID
    export RELEASE_GH_REPO
}

load_release_config
